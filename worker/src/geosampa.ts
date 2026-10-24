import type { Place, Point } from "../../src/features/journey/types";
import { ApiError } from "../../src/contracts";
const endpoint =
  "https://wfs.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/wfs";
const aliases: Record<string, string> = {
  r: "rua",
  av: "avenida",
  tv: "travessa",
  trv: "travessa",
  al: "alameda",
  est: "estrada",
  pca: "praca",
  rod: "rodovia",
  lgo: "largo",
};
const normalized = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => aliases[w] ?? w)
    .join(" ");
const streetTypes = new Set(Object.values(aliases));
const streetName = (s: string) => {
  const words = normalized(s).split(" ");
  return (streetTypes.has(words[0]) ? words.slice(1) : words).join(" ");
};
export function validAddressQuery(street: string, number: string) {
  return (
    street.trim().length >= 3 &&
    street.length <= 120 &&
    !!streetName(street) &&
    /^\d{1,6}[a-zA-Z]?$/.test(number)
  );
}
const caches = new WeakMap<
  typeof fetch,
  Map<string, { at: number; data: Place[] }>
>();
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

function lotGeometry(
  raw: unknown,
): { point: Point; boundary: Point[]; lotPolygons: Point[][][] } | null {
  if (!record(raw) || !Array.isArray(raw.coordinates)) return null;
  const polygons =
    raw.type === "Polygon"
      ? [raw.coordinates]
      : raw.type === "MultiPolygon"
        ? raw.coordinates
        : [];
  let best: { point: Point; boundary: Point[]; area: number } | null = null;
  const lotPolygons: Point[][][] = [];
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length) continue;
    const rings: Point[][] = [];
    let valid = true;
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4 || ring.length > 10000) {
        valid = false;
        break;
      }
      const points: Point[] = [];
      for (const p of ring) {
        if (
          !Array.isArray(p) ||
          typeof p[0] !== "number" ||
          typeof p[1] !== "number" ||
          !Number.isFinite(p[0]) ||
          !Number.isFinite(p[1]) ||
          p[0] < -47.3 ||
          p[0] > -45.9 ||
          p[1] < -24.2 ||
          p[1] > -23
        ) {
          valid = false;
          break;
        }
        points.push({ lat: p[1], lon: p[0] });
      }
      if (
        !valid ||
        points[0].lat !== points.at(-1)!.lat ||
        points[0].lon !== points.at(-1)!.lon
      ) {
        valid = false;
        break;
      }
      rings.push(points);
    }
    if (!valid || !rings.length) continue;
    lotPolygons.push(rings);
    const boundary = rings[0],
      ys = boundary.map((p) => p.lat),
      xs = boundary.map((p) => p.lon);
    const south = Math.min(...ys),
      north = Math.max(...ys),
      west = Math.min(...xs),
      east = Math.max(...xs);
    const y = (south + north) / 2,
      crossings: number[] = [];
    for (const ring of rings)
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1],
          b = ring[i];
        if (a.lat > y !== b.lat > y)
          crossings.push(
            a.lon + ((y - a.lat) * (b.lon - a.lon)) / (b.lat - a.lat),
          );
      }
    crossings.sort((a, b) => a - b);
    let width = 0,
      x = 0;
    for (let i = 1; i < crossings.length; i += 2)
      if (crossings[i] - crossings[i - 1] > width) {
        width = crossings[i] - crossings[i - 1];
        x = (crossings[i] + crossings[i - 1]) / 2;
      }
    const area = (north - south) * (east - west);
    if (width > 0 && (!best || area > best.area))
      best = { point: { lat: y, lon: x }, boundary, area };
  }
  return best
    ? { point: best.point, boundary: best.boundary, lotPolygons }
    : null;
}

export async function findAddressLots(
  street: string,
  number: string,
  fetcher: typeof fetch,
): Promise<Place[]> {
  let cache = caches.get(fetcher);
  if (!cache) {
    cache = new Map();
    caches.set(fetcher, cache);
  }
  const key = normalized(street) + "|" + number.toUpperCase(),
    saved = cache.get(key);
  if (saved && Date.now() - saved.at < 21600000) return saved.data;
  const kind = normalized(street).split(" ")[0];
  const prefixes = streetTypes.has(kind)
    ? [kind, ...Object.keys(aliases).filter((k) => aliases[k] === kind)]
    : ["", ...streetTypes, ...Object.keys(aliases)];
  const names = [
    ...new Set(
      prefixes.map((p) =>
        [p, streetName(street)].filter(Boolean).join(" ").toUpperCase(),
      ),
    ),
  ];
  const filter = [
    `cd_numero_porta = '${number.toUpperCase()}'`,
    "(" +
      names
        .map((name) => `nm_logradouro_completo ILIKE '${name}'`)
        .join(" OR ") +
      ")",
  ].join(" AND ");
  const url = new URL(endpoint);
  url.search = new URLSearchParams({
    service: "WFS",
    version: "1.0.0",
    request: "GetFeature",
    typeName: "geoportal:lote_cidadao",
    outputFormat: "application/json",
    srsName: "EPSG:4326",
    maxFeatures: "12",
    propertyName:
      "ge_poligono,nm_logradouro_completo,cd_numero_porta,cd_logradouro",
    CQL_FILTER: filter,
  }).toString();
  const c = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const failure = () =>
    new ApiError(
      "ADDRESS_UNAVAILABLE",
      502,
      "O cadastro municipal de números está indisponível. Você pode marcar a entrada no mapa.",
    );
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      c.abort();
      reject(failure());
    }, 12000);
  });
  try {
    const data = await Promise.race([
      deadline,
      (async () => {
        const response = await fetcher(url.href, {
          signal: c.signal,
          headers: { Accept: "application/json" },
        });
        if (
          !response.ok ||
          Number(response.headers.get("content-length")) > 2000000
        )
          throw failure();
        const text = await response.text();
        if (text.length > 2000000) throw failure();
        const raw: unknown = JSON.parse(text);
        if (!record(raw) || !Array.isArray(raw.features)) throw failure();
        const result: Place[] = [],
          ids = new Set<string>();
        for (const f of raw.features.slice(0, 12)) {
          if (!record(f) || !record(f.properties) || typeof f.id !== "string")
            continue;
          const p = f.properties,
            name = p.nm_logradouro_completo,
            n = p.cd_numero_porta;
          if (
            typeof name !== "string" ||
            name.length > 160 ||
            typeof n !== "string" ||
            n.trim().toUpperCase() !== number.toUpperCase()
          )
            continue;
          const matches = streetTypes.has(normalized(street).split(" ")[0])
            ? normalized(name) === normalized(street)
            : streetName(name) === streetName(street);
          const geom = lotGeometry(f.geometry);
          if (!matches || !geom || ids.has(f.id)) continue;
          ids.add(f.id);
          result.push({
            id: "geosampa:" + f.id,
            label: `${name}, ${n.trim()} · São Paulo · GeoSampa`,
            ...geom.point,
            boundary: geom.boundary,
            lotPolygons: geom.lotPolygons,
            source: "geosampa",
            approximate: true,
            city: "São Paulo",
            outsideCoverage: false,
          });
        }
        const labels = result.map((p) => p.label);
        for (const [i, p] of result.entries())
          if (labels.filter((l) => l === p.label).length > 1)
            p.label += ` · referência ${i + 1} (${p.lat.toFixed(5)}, ${p.lon.toFixed(5)})`;
        return result;
      })(),
    ]);
    cache.set(key, { at: Date.now(), data });
    if (cache.size > 100) cache.delete(cache.keys().next().value!);
    return data;
  } catch {
    throw failure();
  } finally {
    clearTimeout(timer!);
  }
}
