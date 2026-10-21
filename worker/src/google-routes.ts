import { ApiError } from "../../src/contracts";
import type {
  GoogleRoute,
  GoogleRoutePoint,
  GoogleRouteStep,
  GoogleRoutesRequest,
  GoogleRoutesResponse,
  GoogleTransitDetails,
} from "../../src/google-routes-contracts";

export interface GoogleRoutesEnv {
  GOOGLE_ROUTES_API_KEY?: string;
  GOOGLE_RATE_LIMITER?: {
    limit(input: { key: string }): Promise<{ success: boolean }>;
  };
}

const ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";
const FIELD_MASK = [
  "routes.description",
  "routes.distanceMeters",
  "routes.duration",
  "routes.polyline.encodedPolyline",
  "routes.warnings",
  "routes.legs.steps.travelMode",
  "routes.legs.steps.navigationInstruction.instructions",
  "routes.legs.steps.distanceMeters",
  "routes.legs.steps.staticDuration",
  "routes.legs.steps.startLocation.latLng",
  "routes.legs.steps.endLocation.latLng",
  "routes.legs.steps.polyline.encodedPolyline",
  "routes.legs.steps.transitDetails.headsign",
  "routes.legs.steps.transitDetails.stopCount",
  "routes.legs.steps.transitDetails.stopDetails.departureStop.name",
  "routes.legs.steps.transitDetails.stopDetails.arrivalStop.name",
  "routes.legs.steps.transitDetails.stopDetails.departureTime",
  "routes.legs.steps.transitDetails.stopDetails.arrivalTime",
  "routes.legs.steps.transitDetails.transitLine.name",
  "routes.legs.steps.transitDetails.transitLine.nameShort",
  "routes.legs.steps.transitDetails.transitLine.vehicle.type",
  "routes.legs.steps.transitDetails.transitLine.agencies.name",
  "routes.legs.steps.transitDetails.transitLine.agencies.uri",
].join(",");

type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as ObjectValue)
    : {};
}
const text = (value: unknown): string =>
  typeof value === "string" ? value : "";
const nonnegative = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
function seconds(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,9})?s$/.test(value))
    return null;
  return nonnegative(Number(value.slice(0, -1)));
}
function validPoint(value: unknown): value is GoogleRoutePoint {
  const p = object(value);
  return (
    typeof p.lat === "number" &&
    Number.isFinite(p.lat) &&
    Math.abs(p.lat) <= 90 &&
    typeof p.lon === "number" &&
    Number.isFinite(p.lon) &&
    Math.abs(p.lon) <= 180
  );
}
function exactKeys(value: unknown, keys: string[]) {
  const actual = Object.keys(object(value));
  return (
    actual.length === keys.length && actual.every((key) => keys.includes(key))
  );
}
function validate(value: unknown): GoogleRoutesRequest {
  const input = object(value);
  if (
    !exactKeys(input, ["origin", "destination", "mode", "preference"]) ||
    !validPoint(input.origin) ||
    !validPoint(input.destination) ||
    !exactKeys(input.origin, ["lat", "lon"]) ||
    !exactKeys(input.destination, ["lat", "lon"]) ||
    !["walking", "transit"].includes(text(input.mode)) ||
    !["any", "rail", "bus"].includes(text(input.preference))
  ) {
    throw new ApiError("INVALID_REQUEST", 400, "Confira os dados do trajeto.");
  }
  return input as unknown as GoogleRoutesRequest;
}

async function readBounded(
  body: Request | Response,
  limit: number,
  oversized: () => Error,
  signal?: AbortSignal,
) {
  const declared = body.headers.get("Content-Length");
  if (declared && Number(declared) > limit) {
    void body.body?.cancel().catch(() => {});
    throw oversized();
  }
  const reader = body.body?.getReader();
  if (!reader) return "";
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  const decoder = new TextDecoder();
  let size = 0,
    result = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        void reader.cancel().catch(() => {});
        throw oversized();
      }
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    signal?.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

const unavailable = () =>
  new ApiError(
    "PROVIDER_UNAVAILABLE",
    502,
    "Não foi possível consultar os trajetos do Google Maps.",
  );
function location(value: unknown): GoogleRoutePoint | null {
  const latLng = object(object(value).latLng);
  const point = { lat: latLng.latitude, lon: latLng.longitude };
  return validPoint(point) ? point : null;
}
function timestamp(value: unknown): string | null {
  return typeof value === "string" &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/.test(
      value,
    ) &&
    Number.isFinite(Date.parse(value))
    ? value
    : null;
}
function agencyUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function transit(value: unknown): GoogleTransitDetails | null {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return null;
  const details = object(value),
    line = object(details.transitLine),
    stops = object(details.stopDetails);
  return {
    lineName: text(line.name),
    shortName: text(line.nameShort),
    headsign: text(details.headsign),
    vehicleType: text(object(line.vehicle).type),
    departureStop: text(object(stops.departureStop).name),
    arrivalStop: text(object(stops.arrivalStop).name),
    departureTime: timestamp(stops.departureTime),
    arrivalTime: timestamp(stops.arrivalTime),
    stopCount: Number.isInteger(details.stopCount)
      ? nonnegative(details.stopCount)
      : null,
    agencies: Array.isArray(line.agencies)
      ? line.agencies.map((value) => ({
          name: text(object(value).name),
          url: agencyUrl(object(value).uri),
        }))
      : [],
  };
}
function step(value: unknown): GoogleRouteStep {
  const s = object(value);
  if (s.travelMode !== "WALK" && s.travelMode !== "TRANSIT")
    throw unavailable();
  return {
    mode: s.travelMode,
    instruction: text(object(s.navigationInstruction).instructions),
    distanceM: nonnegative(s.distanceMeters),
    durationS: seconds(s.staticDuration),
    from: location(s.startLocation),
    to: location(s.endLocation),
    polyline: text(object(s.polyline).encodedPolyline) || null,
    transit: s.travelMode === "TRANSIT" ? transit(s.transitDetails) : null,
  };
}
function normalize(value: unknown): GoogleRoute[] {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw unavailable();
  const routes = object(value).routes;
  if (routes === undefined) return [];
  if (!Array.isArray(routes)) throw unavailable();
  return routes.slice(0, 4).map((value, index) => {
    const r = object(value),
      distanceM = nonnegative(r.distanceMeters),
      durationS = seconds(r.duration);
    if (distanceM === null || durationS === null) throw unavailable();
    const legs = r.legs === undefined ? [] : r.legs;
    if (!Array.isArray(legs)) throw unavailable();
    const steps = legs.flatMap((leg) => {
      const steps = object(leg).steps;
      if (steps === undefined) return [];
      if (!Array.isArray(steps)) throw unavailable();
      return steps;
    });
    if (steps.length > 500) throw unavailable();
    return {
      id: `google-route-${index}`,
      description: text(r.description),
      distanceM,
      durationS,
      polyline: text(object(r.polyline).encodedPolyline),
      warnings: Array.isArray(r.warnings)
        ? r.warnings.filter((v): v is string => typeof v === "string")
        : [],
      steps: steps.map(step),
    };
  });
}

export function googleRoutesConfigured(env: GoogleRoutesEnv): boolean {
  return !!env.GOOGLE_ROUTES_API_KEY?.trim() && !!env.GOOGLE_RATE_LIMITER;
}

export async function computeGoogleRoutes(
  request: Request,
  env: GoogleRoutesEnv,
  fetcher: typeof fetch,
): Promise<GoogleRoutesResponse> {
  if (!googleRoutesConfigured(env))
    throw new ApiError(
      "NOT_CONFIGURED",
      503,
      "A conexão com o Google Maps ainda não foi configurada.",
    );
  if (
    request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  ) {
    throw new ApiError(
      "INVALID_REQUEST",
      415,
      "Envie os dados do trajeto em JSON.",
    );
  }
  const raw = await readBounded(
    request,
    4096,
    () =>
      new ApiError(
        "INVALID_REQUEST",
        413,
        "A consulta de trajeto é muito grande.",
      ),
  );
  let input: GoogleRoutesRequest;
  try {
    input = validate(JSON.parse(raw));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("INVALID_REQUEST", 400, "Confira os dados do trajeto.");
  }
  const { success } = await env.GOOGLE_RATE_LIMITER!.limit({
    key: request.headers.get("CF-Connecting-IP") || "unknown",
  });
  if (!success)
    throw new ApiError(
      "RATE_LIMITED",
      429,
      "Muitas consultas. Aguarde um instante.",
    );
  const waypoint = (p: GoogleRoutePoint) => ({
    location: { latLng: { latitude: p.lat, longitude: p.lon } },
  });
  const transitOptions =
    input.mode === "transit"
      ? {
          departureTime: new Date().toISOString(),
          transitPreferences:
            input.preference === "any"
              ? {}
              : {
                  allowedTravelModes: [
                    input.preference === "rail" ? "RAIL" : "BUS",
                  ],
                },
        }
      : {};
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(
        new ApiError(
          "PROVIDER_TIMEOUT",
          504,
          "O Google Maps demorou para responder. Tente novamente.",
        ),
      );
    }, 12_000);
  });
  try {
    return await Promise.race([
      timeout,
      (async (): Promise<GoogleRoutesResponse> => {
        const response = await fetcher(ENDPOINT, {
          method: "POST",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": env.GOOGLE_ROUTES_API_KEY!,
            "X-Goog-FieldMask": FIELD_MASK,
          },
          body: JSON.stringify({
            origin: waypoint(input.origin),
            destination: waypoint(input.destination),
            travelMode: input.mode === "walking" ? "WALK" : "TRANSIT",
            languageCode: "pt-BR",
            regionCode: "BR",
            units: "METRIC",
            computeAlternativeRoutes: true,
            polylineEncoding: "ENCODED_POLYLINE",
            ...transitOptions,
          }),
        });
        if (!response.ok) {
          void response.body?.cancel().catch(() => {});
          throw unavailable();
        }
        const body = await readBounded(
          response,
          1_048_576,
          unavailable,
          controller.signal,
        );
        const routes = normalize(JSON.parse(body));
        return {
          source: "Google Maps",
          fetchedAt: new Date().toISOString(),
          routes,
        };
      })(),
    ]);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw unavailable();
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
