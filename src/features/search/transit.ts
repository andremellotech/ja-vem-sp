import { request } from "../../api/client";
import type { Line, Stop } from "../../contracts";
import { parseLineCatalog, searchCatalog } from "../lines/catalog";
import type { NetStopIndex } from "../stops/network";
import { matchesSearch } from "./text";

export interface SearchSnapshot {
  lines: Line[];
  stops: Stop[];
  linesLoading: boolean;
  stopsLoading: boolean;
  incomplete: boolean;
  note: string;
  liveLinesReady: boolean;
}
type Source<T> = { rows: T[]; status: "pending" | "ready" | "failed" };
const merge = <T extends { id: string }>(a: T[], b: T[]): T[] => {
  const rows = new Map(a.map((row) => [row.id, row]));
  for (const row of b) rows.set(row.id, { ...rows.get(row.id), ...row });
  return [...rows.values()];
};

/** Static matches appear immediately; live searches complement them as they finish. */
export async function searchTransit({
  query,
  base,
  apiBase,
  network,
  signal,
  onUpdate,
}: {
  query: string;
  base: string;
  apiBase: string;
  network: Promise<NetStopIndex | null>;
  signal: AbortSignal;
  onUpdate: (snapshot: SearchSnapshot) => void;
}): Promise<void> {
  const localLines: Source<Line> = { rows: [], status: "pending" };
  const liveLines: Source<Line> = { rows: [], status: "pending" };
  const localStops: Source<Stop> = { rows: [], status: "pending" };
  const liveStops: Source<Stop> = { rows: [], status: "pending" };
  function emit() {
    if (signal.aborted) return;
    const sources = [localLines, liveLines, localStops, liveStops];
    const notes = [
      [
        liveLines,
        "Busca de linhas da SPTrans indisponível. Consulte os resultados locais; posições ao vivo podem estar indisponíveis.",
      ],
      [
        liveStops,
        "Busca de paradas da SPTrans indisponível. Consulte as paradas do catálogo local; chegadas podem estar indisponíveis.",
      ],
      [
        localLines,
        "Catálogo local de linhas indisponível. Os resultados da SPTrans podem estar incompletos.",
      ],
      [
        localStops,
        "Catálogo local de paradas indisponível. Os resultados da SPTrans podem estar incompletos.",
      ],
    ] as const;
    onUpdate({
      lines: merge(localLines.rows, liveLines.rows),
      stops: merge(localStops.rows, liveStops.rows),
      linesLoading:
        localLines.status === "pending" || liveLines.status === "pending",
      stopsLoading:
        localStops.status === "pending" || liveStops.status === "pending",
      incomplete: sources.some((s) => s.status === "failed"),
      note: [
        !apiBase
          ? "A conexão com a SPTrans ainda não foi configurada. A busca usa apenas os catálogos locais; chegadas e posições ao vivo estão indisponíveis."
          : "",
        ...notes
          .filter(
            ([s]) =>
              s.status === "failed" &&
              (apiBase || (s !== liveLines && s !== liveStops)),
          )
          .map(([, note]) => note),
      ]
        .filter(Boolean)
        .join(" "),
      liveLinesReady: liveLines.status === "ready",
    });
  }
  async function collect<T>(source: Source<T>, load: () => Promise<T[]>) {
    try {
      source.rows = await load();
      source.status = "ready";
    } catch {
      source.status = "failed";
    }
    emit();
  }
  const code = query.match(/^\s*(\d{3}[a-z0-9])\s*-?\s*(\d{2})\s*$/i);
  const liveQuery = code ? `${code[1].toUpperCase()}-${code[2]}` : query;
  await Promise.all([
    collect(localLines, async () => {
      const r = await fetch(new URL("data/lines.json", base).href, { signal });
      if (!r.ok) throw new Error("catalog");
      return searchCatalog(parseLineCatalog(await r.json()), query);
    }),
    collect(localStops, async () => {
      const index = await network;
      if (!index) throw new Error("network");
      return index.all
        .filter((s) => !s.rail && matchesSearch([s.name, s.ref], query, [s.id]))
        .map((s) => ({
          id: s.id,
          name: s.name,
          address: s.ref,
          lat: s.lat,
          lon: s.lon,
        }));
    }),
    collect(
      liveLines,
      async () =>
        (
          await request<Line[]>(
            apiBase,
            "/api/lines?q=" + encodeURIComponent(liveQuery),
            signal,
          )
        ).data,
    ),
    collect(liveStops, async () =>
      (
        await request<Stop[]>(
          apiBase,
          "/api/stops?q=" + encodeURIComponent(query),
          signal,
        )
      ).data.filter(
        (s) => s && Number.isFinite(s.lat) && Number.isFinite(s.lon),
      ),
    ),
  ]);
}
