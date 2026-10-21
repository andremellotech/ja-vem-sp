import { distanceM } from "../stops/network";
import type { Place } from "./types";
const DEFAULT_ENDPOINT =
  import.meta.env.VITE_GEOCODER_URL || "https://photon.komoot.io/api/";
export type AddressScope = "region" | "all";
// Search window around São Paulo, not an administrative or service boundary.
const REGION = [-47.3, -24.2, -45.9, -23.0] as const;
const MAX_RESULTS = 12;
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
const aliases: Record<string, string> = {
  av: "avenida",
  r: "rua",
  tv: "travessa",
  trv: "travessa",
  pca: "praca",
  est: "estrada",
  al: "alameda",
  rod: "rodovia",
  lgo: "largo",
};
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => aliases[word] ?? word)
    .join(" ");
const houseKey = (value: string) => value.toLowerCase().replace(/[.\s-]/g, "");
function parseQuery(query: string) {
  const parts = query
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  let street = parts[0] ?? query,
    number = "",
    qualifiers = parts.slice(1);
  const housePattern =
    /^(?:n[.º°o]*\s*)?(\d+(?:\.\d{3})*(?:\s*-?\s*[a-z])?)(?=\b|$)/i;
  const postcodePattern = /^\d{5}-?\d{3}$/;
  const firstQualifier = qualifiers[0] ?? "";
  const commaNumber = postcodePattern.test(firstQualifier)
    ? null
    : firstQualifier.match(housePattern);
  if (commaNumber) {
    number = houseKey(commaNumber[1]);
    const remainder = firstQualifier
      .slice(commaNumber[0].length)
      .trim()
      .replace(/^[-–]\s*/, "");
    qualifiers = [...(remainder ? [remainder] : []), ...qualifiers.slice(1)];
  } else {
    const inlinePostcode = street.match(/^(.*?)\s+(\d{5}-?\d{3})$/);
    if (inlinePostcode) {
      street = inlinePostcode[1];
      qualifiers.unshift(inlinePostcode[2]);
    }
    const endNumber = street.match(
      /^(.*?)\s+(?:n[.º°o]*\s*)?(\d+(?:\.\d{3})*(?:\s*-?\s*[a-z])?)$/i,
    );
    if (
      endNumber &&
      !Object.values(aliases).includes(normalize(endNumber[1]))
    ) {
      street = endNumber[1];
      number = houseKey(endNumber[2]);
    }
  }
  return {
    street,
    number,
    qualifiers: qualifiers.filter(
      (q) => !["sp", "br", "brasil", "brazil"].includes(normalize(q)),
    ),
    broad: [street, ...qualifiers].join(", "),
  };
}
function places(raw: unknown[], query: string, scope: AddressScope): Place[] {
  const requested = parseQuery(query),
    candidates: {
      place: Place;
      key: string;
      group: string;
      score: number[];
      streetOnly: boolean;
    }[] = [];
  const ids = new Set<string>();
  for (const feature of raw) {
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
    const inRegion =
      lon >= REGION[0] &&
      lon <= REGION[2] &&
      lat >= REGION[1] &&
      lat <= REGION[3];
    if (scope === "region" && !inRegion) continue;
    const name = text(p.name),
      street = text(p.street) || name,
      house = text(p.housenumber),
      district = text(p.district),
      locality = text(p.locality),
      city = text(p.city),
      state = text(p.state),
      postcode = text(p.postcode);
    if (!street) continue;
    const parts = [
      name && normalize(name) !== normalize(street) ? name : "",
      street + (house ? ", " + house : ""),
      locality,
      district,
      city,
      state,
      postcode ? "CEP " + postcode : "",
    ];
    const label = [...new Set(parts.filter(Boolean))].join(" · ");
    const osmId =
      (typeof p.osm_id === "number" && Number.isSafeInteger(p.osm_id)) ||
      typeof p.osm_id === "string"
        ? String(p.osm_id)
        : "";
    const id = osmId
      ? `${text(p.osm_type) || "OSM"}:${osmId}`
      : `${lat}:${lon}:${label}`;
    const key = normalize(label);
    const streetOnly =
      !house && (text(p.type) === "street" || text(p.osm_key) === "highway");
    const knownArea = !!city && !!(district || locality || postcode);
    if (
      ids.has(id) ||
      candidates.some(
        (c) =>
          c.key === key &&
          distanceM(lat, lon, c.place.lat, c.place.lon) <
            (streetOnly && c.streetOnly && knownArea ? 500 : 50),
      )
    )
      continue;
    ids.add(id);
    const streetMatch = normalize(requested.street) === normalize(street);
    // A state name must not confirm a requested municipality of the same name.
    const context = [locality, district, city].map(normalize);
    const missingContext = requested.qualifiers.filter(
      (q) =>
        !context.includes(normalize(q)) &&
        !(
          postcode &&
          q.replace(/\D/g, "").length === 8 &&
          q.replace(/\D/g, "") === postcode.replace(/\D/g, "")
        ),
    ).length;
    const capital = normalize(city) === "sao paulo";
    const place: Place = {
      id,
      label,
      lat,
      lon,
      source: "photon",
      approximate:
        !requested.number ||
        houseKey(house) !== requested.number ||
        !streetMatch ||
        missingContext > 0 ||
        !city,
      ...(city ? { city, outsideCoverage: !capital } : {}),
      ...(district ? { district } : {}),
      ...(locality ? { locality } : {}),
      ...(postcode ? { postcode } : {}),
    };
    candidates.push({
      place,
      key,
      streetOnly,
      group: [
        normalize(street),
        normalize(city),
        normalize(district),
        normalize(locality),
      ].join("|"),
      score: [
        streetMatch || normalize(name) === normalize(requested.street) ? 0 : 1,
        missingContext,
        capital ? 0 : inRegion ? 1 : 2,
        requested.number
          ? houseKey(house) === requested.number
            ? 0
            : house
              ? 2
              : 1
          : 0,
      ],
    });
  }
  candidates.sort((a, b) => {
    for (let i = 0; i < a.score.length; i++) {
      const delta = a.score[i] - b.score[i];
      if (delta) return delta;
    }
    return 0;
  });
  const chosen: typeof candidates = [],
    groups = new Set<string>();
  for (const c of candidates)
    if (!groups.has(c.group)) {
      groups.add(c.group);
      chosen.push(c);
    }
  for (const c of candidates) if (!chosen.includes(c)) chosen.push(c);
  const result = chosen.slice(0, MAX_RESULTS).map((c) => ({ ...c.place }));
  for (const place of result) {
    const ambiguous = candidates.filter(
      (c) => c.key === normalize(place.label),
    );
    if (ambiguous.length > 1) {
      const km = distanceM(-23.5505, -46.6333, place.lat, place.lon) / 1000;
      const segment = ambiguous.findIndex((c) => c.place.id === place.id) + 1;
      place.label += ` · trecho ${segment} (${km.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km do centro de SP)`;
      place.approximate = true;
    }
  }
  return result;
}
export async function searchAddresses(
  query: string,
  signal?: AbortSignal,
  endpoint = DEFAULT_ENDPOINT,
  scope: AddressScope = "region",
): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 3 || q.length > 160)
    throw new GeocodeError(
      "INVALID_QUERY",
      "Informe entre 3 e 160 caracteres, incluindo rua, número e bairro.",
    );
  if (signal?.aborted) throw new DOMException("Busca cancelada", "AbortError");
  const parsed = parseQuery(q),
    queries = [...new Set([q, ...(parsed.number ? [parsed.broad] : [])])];
  const controller = new AbortController(),
    completed: unknown[] = [];
  let validResponses = 0,
    timer: ReturnType<typeof setTimeout> | undefined,
    abort: () => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    abort = () => {
      controller.abort();
      reject(new DOMException("Busca cancelada", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => {
      controller.abort();
      reject(
        new GeocodeError(
          "TIMEOUT",
          "A busca de endereço demorou mais que o esperado. Tente novamente.",
        ),
      );
    }, 12000);
  });
  try {
    const requests = queries.map(async (term) => {
      const url = new URL(endpoint);
      url.searchParams.set("q", term);
      url.searchParams.set("lat", "-23.5505");
      url.searchParams.set("lon", "-46.6333");
      url.searchParams.set("countrycode", "BR");
      url.searchParams.set("limit", "20");
      url.searchParams.set("dedupe", "0");
      if (scope === "region") url.searchParams.set("bbox", REGION.join(","));
      else url.searchParams.delete("bbox");
      const response = await fetch(url.toString(), {
        signal: controller.signal,
      });
      if (!response.ok) throw unavailable();
      const data: unknown = await response.json();
      if (!object(data) || !Array.isArray(data.features)) throw unavailable();
      if (controller.signal.aborted)
        throw new DOMException("Busca cancelada", "AbortError");
      validResponses++;
      completed.push(...data.features.slice(0, 100));
    });
    const request = Promise.allSettled(requests).then((statuses) => {
      const found = places(completed, q, scope);
      if (
        !validResponses ||
        (!found.length &&
          statuses.some((status) => status.status === "rejected"))
      )
        throw unavailable();
      return found;
    });
    return await Promise.race([request, interrupted]);
  } catch (error) {
    if (
      signal?.aborted ||
      (error instanceof DOMException && error.name === "AbortError")
    )
      throw new DOMException("Busca cancelada", "AbortError");
    if (
      error instanceof GeocodeError &&
      error.code === "TIMEOUT" &&
      validResponses &&
      completed.length
    ) {
      const useful = places(completed, q, scope);
      if (useful.length) return useful;
    }
    if (error instanceof GeocodeError) throw error;
    throw unavailable();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
