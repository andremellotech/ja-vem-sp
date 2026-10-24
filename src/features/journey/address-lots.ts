import { parseQuery } from "./geocoder";
import type { Place, Point } from "./types";
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const point = (p: unknown): p is Point & Record<string, unknown> =>
  record(p) &&
  typeof p.lat === "number" &&
  typeof p.lon === "number" &&
  Number.isFinite(p.lat) &&
  Number.isFinite(p.lon) &&
  p.lat >= -24.2 &&
  p.lat <= -23 &&
  p.lon >= -47.3 &&
  p.lon <= -45.9;
export function canSearchAddressLots(query: string) {
  const parsed = parseQuery(query);
  return (
    !!parsed.number &&
    parsed.qualifiers.every(
      (q) =>
        q
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim()
          .toLowerCase() === "sao paulo",
    )
  );
}
export async function searchAddressLots(
  query: string,
  signal: AbortSignal,
  apiBase: string,
): Promise<Place[]> {
  const parsed = parseQuery(query);
  if (!apiBase || !canSearchAddressLots(query)) return [];
  if (signal.aborted) throw new DOMException("Cancelado", "AbortError");
  const url = new URL(apiBase.replace(/\/$/, "") + "/api/addresses");
  url.search = new URLSearchParams({
    street: parsed.street,
    number: parsed.number,
  }).toString();
  const c = new AbortController();
  let timer: ReturnType<typeof setTimeout>,
    abort: () => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    abort = () => {
      c.abort();
      reject(new DOMException("Cancelado", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => {
      c.abort();
      reject(
        new Error(
          "O cadastro municipal demorou para responder. Marque a entrada no mapa.",
        ),
      );
    }, 12000);
  });
  try {
    return await Promise.race([
      interrupted,
      (async () => {
        const response = await fetch(url.href, { signal: c.signal });
        if (!response.ok)
          throw new Error(
            "Cadastro de números indisponível. Marque a entrada no mapa.",
          );
        const raw: unknown = await response.json();
        if (!record(raw) || !Array.isArray(raw.data))
          throw new Error("Cadastro de números indisponível.");
        if (c.signal.aborted) throw new DOMException("Cancelado", "AbortError");
        return raw.data.slice(0, 12).flatMap((p): Place[] => {
          if (
            !point(p) ||
            !record(p) ||
            p.source !== "geosampa" ||
            typeof p.id !== "string" ||
            !p.id.startsWith("geosampa:") ||
            typeof p.label !== "string" ||
            p.label.length > 240 ||
            !Array.isArray(p.boundary) ||
            p.boundary.length < 4 ||
            p.boundary.length > 10000 ||
            !p.boundary.every(point)
          )
            return [];
          const polys = p.lotPolygons;
          if (
            polys !== undefined &&
            (!Array.isArray(polys) ||
              polys.length > 20 ||
              !polys.every(
                (poly) =>
                  Array.isArray(poly) &&
                  poly.length > 0 &&
                  poly.length <= 100 &&
                  poly.every(
                    (ring) =>
                      Array.isArray(ring) &&
                      ring.length >= 4 &&
                      ring.length <= 10000 &&
                      ring.every(point),
                  ),
              ))
          )
            return [];
          return [
            {
              id: p.id,
              label: p.label,
              lat: p.lat,
              lon: p.lon,
              boundary: p.boundary,
              ...(polys ? { lotPolygons: polys as Point[][][] } : {}),
              source: "geosampa",
              approximate: true,
              city: "São Paulo",
              outsideCoverage: false,
            },
          ];
        });
      })(),
    ]);
  } finally {
    clearTimeout(timer!);
    signal.removeEventListener("abort", abort);
  }
}
