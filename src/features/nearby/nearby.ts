import type { Stop } from "../../contracts";
import type { PlannerIndex } from "../journey/data";
import type { Point } from "../journey/types";
import { activeServices } from "../journey/calendar";
import { distanceM } from "../stops/network";
export function findNearbyTransit(
  index: PlannerIndex,
  point: Point,
  serviceDate: string,
  radiusM: number,
): {
  stops: Stop[];
  lines: { code: string; headsign: string; stop: Stop; distanceM: number }[];
} {
  const services = activeServices(index.data, serviceDate);
  const active = new Set(
    index.data.trips.flatMap((t, i) => (services.has(t.serviceId) ? [i] : [])),
  );
  const stops = index.stops
    .nearest(point.lat, point.lon, radiusM, index.stops.all.length)
    .filter(
      (s) =>
        !s.rail &&
        index.occurrences.get(s.id)?.some((o) => active.has(o.tripIndex)),
    )
    .map((s) => ({
      id: s.id,
      name: s.name,
      lat: s.lat,
      lon: s.lon,
      ...(s.ref ? { address: s.ref } : {}),
    }));
  const lines = new Map<
    string,
    { code: string; headsign: string; stop: Stop; distanceM: number }
  >();
  for (const stop of stops)
    for (const o of index.occurrences.get(stop.id) ?? []) {
      if (!active.has(o.tripIndex)) continue;
      const trip = index.data.trips[o.tripIndex],
        route = index.routes.get(trip.routeId)!;
      const key = route.code + "|" + trip.headsign;
      if (!lines.has(key))
        lines.set(key, {
          code: route.code,
          headsign: trip.headsign,
          stop,
          distanceM: distanceM(point.lat, point.lon, stop.lat, stop.lon),
        });
    }
  return { stops, lines: [...lines.values()] };
}
