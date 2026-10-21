import type { JourneyLeg, MapPath, Point } from "./types";
type Bucket = {
  version: number;
  provenance: { sha256: string };
  paths: Record<string, { polyline: string; stopIndices: (number | null)[] }>;
};
const cache = new Map<string, Bucket>();
export function decodePolyline(encoded: string): Point[] {
  if (typeof encoded !== "string" || encoded.length > 2_000_000)
    throw new Error("Geometria inválida");
  let offset = 0,
    lat = 0,
    lon = 0;
  const number = () => {
    let value = 0,
      shift = 0,
      b: number;
    do {
      if (offset >= encoded.length || shift > 30)
        throw new Error("Geometria truncada");
      b = encoded.charCodeAt(offset++) - 63;
      if (b < 0 || b > 63) throw new Error("Geometria inválida");
      value |= (b & 31) << shift;
      shift += 5;
    } while (b >= 32);
    return value & 1 ? ~(value >>> 1) : value >>> 1;
  };
  const points: Point[] = [];
  while (offset < encoded.length) {
    lat += number();
    lon += number();
    if (Math.abs(lat) > 9_000_000 || Math.abs(lon) > 18_000_000)
      throw new Error("Coordenada inválida");
    points.push({ lat: lat / 100000, lon: lon / 100000 });
  }
  return points;
}
export async function loadLegPath(
  leg: JourneyLeg,
  signal: AbortSignal,
): Promise<MapPath | null> {
  if (signal.aborted) throw new DOMException("Cancelado", "AbortError");
  if (!leg.feedHash) return null;
  const bucket =
    [...new TextEncoder().encode(leg.tripId)].reduce((n, byte) => n + byte, 0) %
    16;
  const name = String(bucket).padStart(2, "0");
  const url = new URL(
    `${import.meta.env.BASE_URL}data/paths/${name}.json`,
    window.location.href,
  ).href;
  const key = `${url}:${leg.feedHash}`;
  try {
    let data = cache.get(key);
    if (!data) {
      const controller = new AbortController();
      const cancel = () => controller.abort();
      signal.addEventListener("abort", cancel, { once: true });
      const timer = setTimeout(cancel, 15000);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) return null;
        data = (await response.json()) as Bucket;
        if (controller.signal.aborted) return null;
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", cancel);
      }
      if (
        data?.version !== 1 ||
        data.provenance?.sha256 !== leg.feedHash ||
        !data.paths ||
        typeof data.paths !== "object"
      )
        return null;
      if (signal.aborted) throw new DOMException("Cancelado", "AbortError");
      cache.set(key, data);
    }
    const path = data.paths[leg.tripId];
    if (
      !path ||
      !Array.isArray(path.stopIndices) ||
      leg.fromIndex < 0 ||
      leg.toIndex <= leg.fromIndex ||
      leg.toIndex >= path.stopIndices.length
    )
      return null;
    const indices = path.stopIndices.slice(leg.fromIndex, leg.toIndex + 1);
    if (
      indices.some(
        (n, i) =>
          !Number.isSafeInteger(n) || n! < 0 || (i > 0 && n! < indices[i - 1]!),
      )
    )
      return null;
    const points = decodePolyline(path.polyline);
    const from = indices[0]!,
      to = indices[indices.length - 1]!;
    if (to >= points.length || from >= to) return null;
    return {
      kind: leg.mode ?? "bus",
      label: leg.lineCode,
      points: points.slice(from, to + 1),
      ...(leg.color ? { color: leg.color } : {}),
    };
  } catch (error) {
    if (signal.aborted) throw new DOMException("Cancelado", "AbortError");
    return null;
  }
}
