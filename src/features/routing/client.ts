import type { Point } from "../journey/types";
import type { WalkingRoute, WalkingStep } from "../walking/types";
import { distanceM } from "../stops/network";
const cache = new Map<string, WalkingRoute>();
let tail: Promise<unknown> = Promise.resolve(),
  nextStart = 0;
const aborted = () => new DOMException("Cancelado", "AbortError");
const valid = (p: Point) =>
  Number.isFinite(p?.lat) &&
  Number.isFinite(p?.lon) &&
  Math.abs(p.lat) <= 90 &&
  Math.abs(p.lon) <= 180;
function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(aborted());
    const cancel = () => {
      clearTimeout(timer);
      reject(aborted());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    signal.addEventListener("abort", cancel, { once: true });
  });
}
export async function routeRoad(
  mode: "foot" | "car",
  from: Point,
  to: Point,
  signal: AbortSignal,
): Promise<WalkingRoute> {
  const noun = mode === "car" ? "carro" : "caminhada";
  if (!valid(from) || !valid(to))
    throw new Error(`Confirme os pontos do trajeto de ${noun}.`);
  if (signal.aborted) throw aborted();
  const key =
    mode +
    ":" +
    [from.lon, from.lat, to.lon, to.lat].map((n) => n.toFixed(6)).join(",");
  const existing = cache.get(key);
  if (existing) return existing;
  const work = tail
    .catch(() => {})
    .then(async () => {
      if (signal.aborted) throw aborted();
      const previous = cache.get(key);
      if (previous) return previous;
      const delay = nextStart - Date.now();
      if (delay > 0) await pause(delay, signal);
      if (signal.aborted) throw aborted();
      nextStart = Date.now() + 1100;
      const controller = new AbortController();
      let timedOut = false;
      const cancel = () => controller.abort();
      let rejectAbort = () => {};
      const interrupted = new Promise<never>((_, reject) => {
        rejectAbort = () => reject(aborted());
        controller.signal.addEventListener("abort", rejectAbort, {
          once: true,
        });
      });
      signal.addEventListener("abort", cancel, { once: true });
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 25000);
      try {
        return await Promise.race([
          (async () => {
            const url = `https://routing.openstreetmap.de/routed-${mode}/route/v1/${mode === "car" ? "driving" : "foot"}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson&steps=true`;
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok)
              throw new Error(
                response.status === 429
                  ? `O serviço de ${noun} está ocupado. Tente novamente em instantes.`
                  : `Trajeto de ${noun} indisponível no momento.`,
              );
            const data = await response.json();
            const route = data?.routes?.[0];
            if (data?.code === "NoRoute")
              throw new Error(
                `Não foi encontrado um trajeto de ${noun} entre esses pontos.`,
              );
            if (
              data?.code !== "Ok" ||
              !route ||
              !Number.isFinite(route.distance) ||
              route.distance < 0 ||
              !Number.isFinite(route.duration) ||
              route.duration < 0 ||
              route.geometry?.type !== "LineString" ||
              !Array.isArray(route.geometry.coordinates) ||
              route.geometry.coordinates.length < 2 ||
              route.geometry.coordinates.length > 100000 ||
              !Array.isArray(route.legs)
            )
              throw new Error(
                `O serviço retornou uma rota de ${noun} inválida.`,
              );
            const points: Point[] = route.geometry.coordinates.map(
              (c: unknown) => {
                if (
                  !Array.isArray(c) ||
                  c.length < 2 ||
                  typeof c[0] !== "number" ||
                  typeof c[1] !== "number" ||
                  !valid({ lon: c[0], lat: c[1] })
                )
                  throw new Error(`Coordenada da rota de ${noun} inválida.`);
                return { lon: c[0], lat: c[1] };
              },
            );
            const steps: WalkingStep[] = [];
            for (const leg of route.legs) {
              if (!Array.isArray(leg?.steps) || leg.steps.length > 5000)
                throw new Error(`Instruções da rota de ${noun} inválidas.`);
              for (const step of leg.steps) {
                if (
                  typeof step?.name !== "string" ||
                  !Number.isFinite(step.distance) ||
                  step.distance < 0 ||
                  typeof step.maneuver?.type !== "string"
                )
                  throw new Error(`Instruções da rota de ${noun} inválidas.`);
                steps.push({
                  name: step.name,
                  distanceM: step.distance,
                  type: step.maneuver.type,
                  ...(typeof step.maneuver.modifier === "string"
                    ? { modifier: step.maneuver.modifier }
                    : {}),
                  ...(Number.isSafeInteger(step.maneuver.exit)
                    ? { exit: step.maneuver.exit }
                    : {}),
                });
              }
            }
            if (signal.aborted || controller.signal.aborted) throw aborted();
            const result = {
              distanceM: route.distance,
              durationS: route.duration,
              points,
              steps,
              startGapM: distanceM(
                from.lat,
                from.lon,
                points[0].lat,
                points[0].lon,
              ),
              endGapM: distanceM(
                to.lat,
                to.lon,
                points.at(-1)!.lat,
                points.at(-1)!.lon,
              ),
            };
            cache.set(key, result);
            return result;
          })(),
          interrupted,
        ]);
      } catch (error) {
        if (timedOut)
          throw new Error(
            `O serviço de ${noun} demorou para responder. Tente novamente.`,
          );
        if (signal.aborted) throw aborted();
        throw error;
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", cancel);
        controller.signal.removeEventListener("abort", rejectAbort);
      }
    });
  tail = work.catch(() => {});
  return work;
}
