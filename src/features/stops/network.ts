/** Paradas estáticas (GTFS da SPTrans) carregadas de public/data/stops.json. */
export interface NetStop {
  id: string;
  name: string;
  ref: string;
  lat: number;
  lon: number;
  rail: boolean;
}
export interface NetStopIndex {
  all: NetStop[];
  byId: Map<string, NetStop>;
  inBounds(
    south: number,
    west: number,
    north: number,
    east: number,
    limit: number,
  ): { stops: NetStop[]; total: number };
  nearest(lat: number, lon: number, radiusM: number, count: number): NetStop[];
}
const CELL = 0.005; // ~550 m
const cell = (v: number) => Math.floor(v / CELL);
const key = (la: number, lo: number) => la + ":" + lo;
export function distanceM(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
) {
  const r = Math.PI / 180,
    dLat = (bLat - aLat) * r,
    dLon = (bLon - aLon) * r,
    h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** Valida o JSON do importador; devolve null se o formato não for o esperado. */
export function parseNetwork(json: unknown): NetStop[] | null {
  const rows = (json as { stops?: unknown })?.stops;
  if (!Array.isArray(rows)) return null;
  const out: NetStop[] = [];
  for (const r of rows) {
    if (!Array.isArray(r)) continue;
    const [id, name, ref, lat, lon, rail] = r;
    if (
      typeof id !== "string" ||
      typeof lat !== "number" ||
      typeof lon !== "number" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    )
      continue;
    out.push({
      id,
      name: typeof name === "string" && name ? name : "Parada " + id,
      ref: typeof ref === "string" ? ref : "",
      lat,
      lon,
      rail: rail === 1,
    });
  }
  return out.length ? out : null;
}
export function createIndex(all: NetStop[]): NetStopIndex {
  const grid = new Map<string, NetStop[]>(),
    byId = new Map<string, NetStop>();
  for (const s of all) {
    byId.set(s.id, s);
    const k = key(cell(s.lat), cell(s.lon));
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(s);
  }
  return {
    all,
    byId,
    inBounds(south, west, north, east, limit) {
      const stops: NetStop[] = [];
      let total = 0;
      for (let la = cell(south); la <= cell(north); la++)
        for (let lo = cell(west); lo <= cell(east); lo++)
          for (const s of grid.get(key(la, lo)) ?? [])
            if (
              s.lat >= south &&
              s.lat <= north &&
              s.lon >= west &&
              s.lon <= east
            ) {
              total++;
              if (stops.length < limit) stops.push(s);
            }
      return { stops, total };
    },
    nearest(lat, lon, radiusM, count) {
      const span = Math.ceil(radiusM / 550) + 1,
        c0 = cell(lat),
        c1 = cell(lon),
        found: { s: NetStop; d: number }[] = [];
      for (let la = c0 - span; la <= c0 + span; la++)
        for (let lo = c1 - span; lo <= c1 + span; lo++)
          for (const s of grid.get(key(la, lo)) ?? []) {
            const d = distanceM(lat, lon, s.lat, s.lon);
            if (d <= radiusM) found.push({ s, d });
          }
      return found
        .sort((a, b) => a.d - b.d)
        .slice(0, count)
        .map((f) => f.s);
    },
  };
}
export async function loadNetwork(
  url: string,
  signal?: AbortSignal,
): Promise<NetStopIndex | null> {
  const r = await fetch(url, { signal });
  if (!r.ok) return null;
  const stops = parseNetwork(await r.json());
  return stops ? createIndex(stops) : null;
}
