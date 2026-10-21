import type {
  GoogleRoutePoint,
  GoogleRoutesRequest,
  GoogleRoutesResponse,
} from "../../google-routes-contracts";
export const validGooglePoint = (
  p: GoogleRoutePoint | null,
): p is GoogleRoutePoint =>
  !!p &&
  Number.isFinite(p.lat) &&
  Number.isFinite(p.lon) &&
  Math.abs(p.lat) <= 90 &&
  Math.abs(p.lon) <= 180;
const unavailable =
  "Não foi possível consultar os trajetos Google. Tente novamente.";
export async function fetchGoogleRoutes(
  base: string,
  input: GoogleRoutesRequest,
  signal: AbortSignal,
): Promise<GoogleRoutesResponse> {
  if (!validGooglePoint(input.origin) || !validGooglePoint(input.destination))
    throw new Error("Confirme a origem e o destino antes de calcular.");
  if (!base)
    throw new Error(
      "Google Maps ainda não está configurado. Use os links externos abaixo.",
    );
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const timer = setTimeout(abort, 12000);
  try {
    const r = await fetch(base.replace(/\/$/, "") + "/api/google/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: { lat: input.origin.lat, lon: input.origin.lon },
        destination: { lat: input.destination.lat, lon: input.destination.lon },
        mode: input.mode,
        preference: input.preference,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!r.ok) {
      if (r.status === 503)
        throw new Error(
          "Google Maps indisponível ou ainda não configurado. Use os links externos abaixo.",
        );
      if (r.status === 429)
        throw new Error(
          "Muitas consultas. Aguarde um minuto antes de tentar novamente.",
        );
      throw new Error(unavailable);
    }
    const body = await r.json();
    if (
      body?.source !== "Google Maps" ||
      !Array.isArray(body.routes) ||
      typeof body.fetchedAt !== "string"
    )
      throw new Error(unavailable);
    return body;
  } catch (error) {
    if (signal.aborted)
      throw new DOMException("Consulta cancelada", "AbortError");
    if (controller.signal.aborted)
      throw new Error("A consulta Google demorou demais. Tente novamente.");
    if (
      error instanceof Error &&
      [
        unavailable,
        "Google Maps indisponível ou ainda não configurado. Use os links externos abaixo.",
        "Muitas consultas. Aguarde um minuto antes de tentar novamente.",
      ].includes(error.message)
    )
      throw error;
    throw new Error(unavailable);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
