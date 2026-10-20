import type { Line, Stop } from "../../contracts";
import { request } from "../../api/client";
import { parseNetwork } from "../stops/network";
import {
  createPlannerIndex,
  parsePlannerData,
  type PlannerIndex,
} from "./data";
import { PlannerError } from "./types";
export type LineStopResolution = {
  stops: Stop[];
  note: string;
  source: "gtfs" | "api";
  directionMatched: boolean;
};
const code = (s: string) =>
  s
    .toUpperCase()
    .trim()
    .replace(/-(\d)$/, "-0$1");
const aliases: Record<string, string> = {
  terminal: "term",
  praca: "pca",
  jardim: "jd",
  parque: "pq",
  vila: "vl",
  cidade: "cid",
  santo: "sto",
  santa: "sta",
  hospital: "hosp",
  estacao: "est",
};
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !["de", "do", "da", "dos", "das"].includes(w))
    .map((w) => aliases[w] ?? w)
    .join(" ");
const relaxed = (s: string) =>
  normalize(s).replace(/^(?:(?:term|metro|cptm|est)\s+)+/, "");
const match = (a: string, b: string) =>
  normalize(a) === normalize(b) ? 2 : relaxed(a) === relaxed(b) ? 1 : 0;
const usable = (s: Stop) =>
  s &&
  !!s.id &&
  Number.isFinite(s.lat) &&
  Number.isFinite(s.lon) &&
  Math.abs(s.lat) <= 90 &&
  Math.abs(s.lon) <= 180;
export function resolveLineStops(
  line: Line,
  index: PlannerIndex,
  providerStops: Stop[],
): LineStopResolution {
  const routeIds = new Set(
    index.data.routes
      .filter(
        (r) =>
          code(r.code) === code(line.code) || code(r.id) === code(line.code),
      )
      .map((r) => r.id),
  );
  const trips = index.data.trips.filter((t) => routeIds.has(t.routeId));
  const api = providerStops.filter(usable);
  if (!trips.length)
    return {
      stops: api,
      note: "Esta linha não foi encontrada no GTFS. As paradas informadas pela SPTrans podem ser parciais.",
      source: "api",
      directionMatched: false,
    };
  const groups = new Map<string, typeof trips>();
  for (const t of trips) {
    const key = t.direction ?? t.headsign;
    const group = groups.get(key) ?? [];
    group.push(t);
    groups.set(key, group);
  }
  let candidates = [...groups.values()],
    directionMatched = false;
  const bestBy = (score: (group: typeof trips) => number) => {
    const ranked = candidates
      .map((group) => ({ group, score: score(group) }))
      .sort((a, b) => b.score - a.score);
    return ranked[0]?.score > 0 &&
      (!ranked[1] || ranked[0].score > ranked[1].score)
      ? ranked[0].group
      : null;
  };
  let selected = bestBy((group) =>
    Math.max(...group.map((t) => match(t.headsign, line.destination))),
  );
  if (!selected && candidates.length === 2) {
    const opposite = bestBy((group) =>
      Math.max(...group.map((t) => match(t.headsign, line.origin))),
    );
    if (opposite) selected = candidates.find((g) => g !== opposite)!;
  }
  if (!selected && api.length)
    selected = bestBy((group) => {
      const ids = new Set(group.flatMap((t) => t.stopIds));
      return api.filter((s) => ids.has(s.id)).length;
    });
  if (selected) {
    directionMatched = true;
    candidates = [selected];
  }
  const ids = [
    ...new Set(candidates.flatMap((group) => group.flatMap((t) => t.stopIds))),
  ];
  const stops = new Map<string, Stop>();
  for (const id of ids) {
    const s = index.stops.byId.get(id)!;
    stops.set(id, {
      id: s.id,
      name: s.name,
      lat: s.lat,
      lon: s.lon,
      ...(s.ref ? { address: s.ref } : {}),
    });
  }
  for (const s of api) stops.set(s.id, s);
  const note = directionMatched
    ? "Paradas completas do itinerário cadastrado no GTFS para este sentido. Pode haver variantes."
    : groups.size === 1
      ? "Paradas do único itinerário cadastrado desta linha no GTFS. Confirme o sentido na parada."
      : "Paradas desta linha nos sentidos cadastrados no GTFS. A correspondência com o sentido selecionado não foi confirmada.";
  return { stops: [...stops.values()], note, source: "gtfs", directionMatched };
}
const cache = new Map<string, Promise<PlannerIndex>>();
export function loadLineIndex(base: string): Promise<PlannerIndex> {
  const existing = cache.get(base);
  if (existing) return existing;
  const c = new AbortController(),
    timer = setTimeout(() => c.abort(), 12000);
  const pending = (async () => {
    const [sr, pr] = await Promise.all([
      fetch(new URL("data/stops.json", base).href, {
        signal: c.signal,
        cache: "no-cache",
      }),
      fetch(new URL("data/planner.json", base).href, {
        signal: c.signal,
        cache: "no-cache",
      }),
    ]);
    if (!sr.ok || !pr.ok)
      throw new PlannerError(
        "DATA_UNAVAILABLE",
        "A base completa de paradas não carregou.",
      );
    const [network, raw] = await Promise.all([sr.json(), pr.json()]);
    const stops = parseNetwork(network);
    if (!stops)
      throw new PlannerError(
        "INVALID_DATA",
        "A base de paradas está inválida.",
      );
    return createPlannerIndex(
      parsePlannerData(raw, network.provenance?.sha256),
      stops,
    );
  })()
    .catch((e) => {
      cache.delete(base);
      throw e;
    })
    .finally(() => clearTimeout(timer));
  cache.set(base, pending);
  return pending;
}
export async function loadStopsForLine(
  line: Line,
  base: string,
  apiBase: string,
  signal: AbortSignal,
): Promise<LineStopResolution> {
  const [gtfs, api] = await Promise.allSettled([
    loadLineIndex(base),
    request<Stop[]>(apiBase, `/api/lines/${line.id}/stops`, signal),
  ]);
  if (signal.aborted)
    throw new DOMException("Consulta cancelada", "AbortError");
  const providerStops = api.status === "fulfilled" ? api.value.data : [];
  if (gtfs.status === "fulfilled") {
    const result = resolveLineStops(line, gtfs.value, providerStops);
    if (result.stops.length || result.source === "gtfs") return result;
  }
  if (api.status === "fulfilled")
    return {
      stops: providerStops,
      note: "A base GTFS completa está indisponível. As paradas da SPTrans podem ser parciais. Tente atualizar novamente.",
      source: "api",
      directionMatched: false,
    };
  throw new PlannerError(
    "DATA_UNAVAILABLE",
    "Não foi possível carregar as paradas desta linha. Tente atualizar novamente.",
  );
}
