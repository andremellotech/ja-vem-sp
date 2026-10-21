import { distanceM } from "../stops/network";
import { activeServices } from "./calendar";
import type { PlannerIndex } from "./data";
import type { Stop } from "../../contracts";
import {
  PlannerError,
  type JourneyLeg,
  type JourneyOption,
  type PlanInput,
  type PlannerResult,
  type Point,
} from "./types";
const validPoint = (p: Point) =>
  Number.isFinite(p?.lat) &&
  Number.isFinite(p?.lon) &&
  Math.abs(p.lat) <= 90 &&
  Math.abs(p.lon) <= 180;
const walking = (o: JourneyOption) =>
  o.accessM + o.egressM + (o.transferWalkM ?? 0);
const rank = (a: JourneyOption, b: JourneyOption) =>
  a.transferCount - b.transferCount ||
  walking(a) - walking(b) ||
  a.stopCount - b.stopCount ||
  a.id.localeCompare(b.id);
export function findJourneys(
  index: PlannerIndex,
  input: PlanInput,
): PlannerResult {
  if (
    !validPoint(input.origin) ||
    !validPoint(input.destination) ||
    ![800, 1200].includes(input.radiusM) ||
    (input.transport !== undefined &&
      !["all", "bus", "rail"].includes(input.transport))
  )
    throw new PlannerError(
      "INVALID_DATA",
      "Os pontos do trajeto são inválidos. Confirme os dois endereços.",
    );
  const compare =
    input.criterion === "walking"
      ? (a: JourneyOption, b: JourneyOption) =>
          walking(a) - walking(b) || rank(a, b)
      : rank;
  const services = activeServices(index.data, input.serviceDate);
  const active = new Set(
    index.data.trips.flatMap((t, i) => {
      const mode = index.routes.get(t.routeId)?.mode ?? "bus";
      const allowed =
        !input.transport ||
        input.transport === "all" ||
        (input.transport === "bus" ? mode === "bus" : mode !== "bus");
      return services.has(t.serviceId) && allowed ? [i] : [];
    }),
  );
  const nearest = (p: Point) =>
    index.stops
      .nearest(p.lat, p.lon, input.radiusM, index.stops.all.length)
      .filter((s) =>
        index.occurrences.get(s.id)?.some((o) => active.has(o.tripIndex)),
      );
  const origins = nearest(input.origin),
    destinations = nearest(input.destination);
  if (!origins.length || !destinations.length)
    return { options: [], radiusM: input.radiusM, reason: "NO_NEARBY_STOPS" };
  const endDistance = new Map(
    destinations.map((s) => [
      s.id,
      distanceM(input.destination.lat, input.destination.lon, s.lat, s.lon),
    ]),
  );
  const tripStops = new Map<number, Stop[]>();
  function leg(ti: number, from: number, to: number): JourneyLeg {
    const t = index.data.trips[ti],
      route = index.routes.get(t.routeId)!;
    let routeStops = tripStops.get(ti);
    if (!routeStops) {
      routeStops = t.stopIds.map((id) => {
        const s = index.stops.byId.get(id)!;
        return {
          id: s.id,
          name: s.name,
          lat: s.lat,
          lon: s.lon,
          ...(s.ref ? { address: s.ref } : {}),
        };
      });
      tripStops.set(ti, routeStops);
    }
    return {
      tripId: t.id,
      routeId: t.routeId,
      lineCode: route.code,
      headsign: t.headsign,
      from: routeStops[from],
      to: routeStops[to],
      fromIndex: from,
      toIndex: to,
      stopCount: to - from,
      routeStops,
      mode: route.mode ?? "bus",
      ...(route.color ? { color: route.color } : {}),
      feedHash: index.data.provenance.sha256,
    };
  }
  const toDestination = new Map<
    string,
    { tripIndex: number; leg: JourneyLeg; egressM: number }[]
  >();
  for (const ti of active) {
    const t = index.data.trips[ti];
    for (let end = 1; end < t.stopIds.length; end++) {
      const egressM = endDistance.get(t.stopIds[end]);
      if (egressM === undefined) continue;
      for (let from = 0; from < end; from++) {
        const entry = { tripIndex: ti, leg: leg(ti, from, end), egressM };
        const list = toDestination.get(t.stopIds[from]) ?? [];
        list.push(entry);
        toDestination.set(t.stopIds[from], list);
      }
    }
  }
  const best = new Map<string, JourneyOption>();
  function add(
    legs: JourneyLeg[],
    accessM: number,
    egressM: number,
    transferWalkM = 0,
  ) {
    const id = legs
      .map((l) => [l.routeId, l.headsign, l.from.id, l.to.id].join("|"))
      .join(">");
    const next: JourneyOption = {
      id,
      legs,
      accessM,
      egressM,
      transferCount: legs.length === 1 ? 0 : 1,
      stopCount: legs.reduce((n, l) => n + l.stopCount, 0),
      ...(transferWalkM > 0 ? { transferWalkM } : {}),
    };
    const previous = best.get(id);
    if (!previous || compare(next, previous) < 0) best.set(id, next);
  }
  const connections = new Map<string, { id: string; distance: number }[]>();
  function nearbyConnections(stop: Stop) {
    let found = connections.get(stop.id);
    if (!found) {
      found = index.stops
        .nearest(stop.lat, stop.lon, 250, index.stops.all.length)
        .filter((s) => toDestination.has(s.id))
        .map((s) => ({
          id: s.id,
          distance: distanceM(stop.lat, stop.lon, s.lat, s.lon),
        }));
      connections.set(stop.id, found);
    }
    return found;
  }
  for (const start of origins) {
    const accessM = distanceM(
      input.origin.lat,
      input.origin.lon,
      start.lat,
      start.lon,
    );
    for (const { tripIndex: ti, stopIndex: from } of index.occurrences.get(
      start.id,
    ) ?? []) {
      if (!active.has(ti)) continue;
      const t = index.data.trips[ti];
      for (let to = from + 1; to < t.stopIds.length; to++) {
        const first = leg(ti, from, to),
          egressM = endDistance.get(first.to.id);
        if (egressM !== undefined) add([first], accessM, egressM);
        for (const connection of nearbyConnections(first.to))
          for (const second of toDestination.get(connection.id) ?? []) {
            if (second.tripIndex === ti || second.leg.to.id === start.id)
              continue;
            if (
              connection.id !== first.to.id &&
              first.mode === "bus" &&
              second.leg.mode === "bus"
            )
              continue;
            add(
              [first, second.leg],
              accessM,
              second.egressM,
              connection.distance,
            );
          }
      }
    }
  }
  const options = [...best.values()].sort(compare).slice(0, 6);
  return {
    options,
    radiusM: input.radiusM,
    ...(!options.length ? { reason: "NO_CONNECTION" as const } : {}),
  };
}
