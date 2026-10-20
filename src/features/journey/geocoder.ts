import type { Place } from "./types";
const DEFAULT_ENDPOINT =
  import.meta.env.VITE_GEOCODER_URL || "https://photon.komoot.io/api/";
export class GeocodeError extends Error {
  constructor(
    public code: "UNAVAILABLE" | "TIMEOUT" | "INVALID_QUERY",
    message: string,
  ) {
    super(message);
    this.name = "GeocodeError";
  }
}
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const unavailable = () =>
  new GeocodeError(
    "UNAVAILABLE",
    "Não foi possível localizar o endereço agora. Tente novamente.",
  );
const streetAliases: Record<string, string> = {
  av: "avenida",
  r: "rua",
  tv: "travessa",
  pca: "praca",
  est: "estrada",
};
const normalizeStreet = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => streetAliases[word] ?? word)
    .join(" ");
function places(raw: unknown, query: string): Place[] {
  if (!object(raw) || !Array.isArray(raw.features)) throw unavailable();
  const requested = (query.match(/,\s*(\d+[a-z]?)(?:\b|$)/i) ??
    query.match(/\b(\d+[a-z]?)\s*$/i))?.[1].toLowerCase();
  const result: Place[] = [],
    ids = new Set<string>(),
    points = new Set<string>();
  for (const feature of raw.features) {
    if (
      !object(feature) ||
      !object(feature.geometry) ||
      feature.geometry.type !== "Point" ||
      !Array.isArray(feature.geometry.coordinates) ||
      !object(feature.properties)
    )
      continue;
    const [lon, lat] = feature.geometry.coordinates,
      p = feature.properties;
    if (
      typeof lat !== "number" ||
      typeof lon !== "number" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    )
      continue;
    if (text(p.countrycode) && text(p.countrycode).toLowerCase() !== "br")
      continue;
    const name = text(p.name);
    const street = text(p.street) || name,
      house = text(p.housenumber);
    const parts = [
      name && normalizeStreet(name) !== normalizeStreet(street) ? name : "",
      street + (house ? ", " + house : ""),
      text(p.district) || text(p.locality),
      text(p.city),
      text(p.state),
    ];
    const label = [...new Set(parts.filter(Boolean))].join(" · ");
    if (!label) continue;
    const osmId =
      typeof p.osm_id === "number" || typeof p.osm_id === "string"
        ? String(p.osm_id)
        : "";
    const id = osmId
      ? `${text(p.osm_type) || "OSM"}:${osmId}`
      : `${lat}:${lon}:${label}`;
    const point = normalizeStreet(label);
    if (ids.has(id) || points.has(point)) continue;
    ids.add(id);
    points.add(point);
    result.push({
      id,
      label,
      lat,
      lon,
      source: "photon",
      approximate:
        !requested ||
        house.toLowerCase() !== requested ||
        normalizeStreet(
          query.split(",")[0].replace(/\s+\d+[a-z]?\s*$/i, ""),
        ) !== normalizeStreet(street),
    });
    if (result.length === 6) break;
  }
  return result;
}
export async function searchAddresses(
  query: string,
  signal?: AbortSignal,
  endpoint = DEFAULT_ENDPOINT,
): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 3 || q.length > 160)
    throw new GeocodeError(
      "INVALID_QUERY",
      "Informe entre 3 e 160 caracteres, incluindo rua, número e bairro.",
    );
  if (signal?.aborted) throw new DOMException("Busca cancelada", "AbortError");
  const url = new URL(endpoint);
  url.searchParams.set(
    "q",
    /s[aã]o paulo/i.test(q) ? q : q + ", São Paulo, SP",
  );
  url.searchParams.set("lat", "-23.5505");
  url.searchParams.set("lon", "-46.6333");
  url.searchParams.set("countrycode", "BR");
  url.searchParams.set("limit", "6");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined,
    abort: () => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    abort = () => {
      controller.abort();
      reject(new DOMException("Busca cancelada", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => {
      reject(
        new GeocodeError(
          "TIMEOUT",
          "A busca de endereço demorou mais que o esperado. Tente novamente.",
        ),
      );
      controller.abort();
    }, 12000);
  });
  const request = (async () => {
    const r = await fetch(url.toString(), { signal: controller.signal });
    if (!r.ok) throw unavailable();
    return places(await r.json(), q);
  })();
  try {
    return await Promise.race([request, interrupted]);
  } catch (e) {
    if (
      e instanceof GeocodeError ||
      (e instanceof DOMException && e.name === "AbortError")
    )
      throw e;
    throw unavailable();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
