import type { Stop } from "../../contracts";
import type { PlannerIndex } from "./data";
import { distanceM } from "../stops/network";
import type {
  JourneyLeg,
  JourneyOption,
  PlanInput,
  PlannerResult,
} from "./types";

type Label = {
  key?: string;
  legs: JourneyLeg[];
  accessM: number;
  walks: number[];
  pendingWalk: number;
  stopCount: number;
};
type Board = { label: Label; from: number };
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const walking = (l: Label) => l.accessM + sum(l.walks) + l.pendingWalk;
const signature = (legs: JourneyLeg[]) =>
  legs
    .map((l) => `${l.routeId}|${l.headsign}|${l.from.id}|${l.to.id}`)
    .join(">");
const labelKey = (label: Label) =>
  label.key ?? (label.key = signature(label.legs));
// Keep alternative labels for each stop/boarding frontier to bound citywide work.
const LABELS = 6;
export function findMultiJourneys(
  index: PlannerIndex,
  input: PlanInput,
  active: Set<number>,
): PlannerResult {
  const activeStops = new Set(
    [...active].flatMap((ti) => index.data.trips[ti].stopIds),
  );
  const relevant = (id: string) => activeStops.has(id);
  const nearest = (p: { lat: number; lon: number }) =>
    index.stops
      .nearest(p.lat, p.lon, input.radiusM, index.stops.all.length)
      .filter((s) => relevant(s.id));
  const origins = nearest(input.origin),
    destinations = nearest(input.destination);
  if (!origins.length || !destinations.length)
    return { options: [], radiusM: input.radiusM, reason: "NO_NEARBY_STOPS" };
  const ends = new Map(
    destinations.map((s) => [
      s.id,
      distanceM(input.destination.lat, input.destination.lon, s.lat, s.lon),
    ]),
  );
  const compare = (a: JourneyOption, b: JourneyOption) => {
    const walk =
      a.accessM +
      a.egressM +
      (a.transferWalkM ?? 0) -
      b.accessM -
      b.egressM -
      (b.transferWalkM ?? 0);
    return (
      (input.criterion === "walking"
        ? walk || a.transferCount - b.transferCount
        : a.transferCount - b.transferCount || walk) ||
      a.stopCount - b.stopCount ||
      a.id.localeCompare(b.id)
    );
  };
  const routeStops = new Map<number, Stop[]>();
  function leg(ti: number, from: number, to: number): JourneyLeg {
    const t = index.data.trips[ti],
      route = index.routes.get(t.routeId)!;
    if (!routeStops.has(ti))
      routeStops.set(
        ti,
        t.stopIds.map((id) => {
          const s = index.stops.byId.get(id)!;
          return {
            id,
            name: s.name,
            lat: s.lat,
            lon: s.lon,
            ...(s.ref ? { address: s.ref } : {}),
          };
        }),
      );
    const stops = routeStops.get(ti)!;
    return {
      tripId: t.id,
      routeId: t.routeId,
      lineCode: route.code,
      headsign: t.headsign,
      mode: route.mode ?? "bus",
      ...(route.color ? { color: route.color } : {}),
      from: stops[from],
      to: stops[to],
      fromIndex: from,
      toIndex: to,
      stopCount: to - from,
      routeStops: stops,
      feedHash: index.data.provenance.sha256,
    };
  }
  function insert(map: Map<string, Label[]>, id: string, label: Label) {
    const rows = map.get(id) ?? [],
      key = labelKey(label);
    const old = rows.findIndex((l) => labelKey(l) === key);
    if (old >= 0) {
      if (
        walking(rows[old]) < walking(label) ||
        (walking(rows[old]) === walking(label) &&
          rows[old].stopCount <= label.stopCount)
      )
        return;
      rows.splice(old, 1);
    }
    rows.push(label);
    rows.sort((a, b) => walking(a) - walking(b) || a.stopCount - b.stopCount);
    if (rows.length > LABELS) rows.length = LABELS;
    map.set(id, rows);
  }
  let ready = new Map<string, Label[]>();
  for (const s of origins)
    insert(ready, s.id, {
      legs: [],
      accessM: distanceM(input.origin.lat, input.origin.lon, s.lat, s.lon),
      walks: [],
      pendingWalk: 0,
      stopCount: 0,
    });
  const neighbors = new Map<string, { id: string; distance: number }[]>(),
    best = new Map<string, JourneyOption>();
  for (
    let round = 0;
    round <= (input.maxTransfers ?? 3) && ready.size;
    round++
  ) {
    const arrived = new Map<string, Label[]>();
    for (const ti of active) {
      const t = index.data.trips[ti];
      let boards: Board[] = [];
      for (let at = 0; at < t.stopIds.length; at++) {
        const id = t.stopIds[at];
        for (const board of boards) {
          if (
            board.from >= at ||
            board.label.legs.some((l) => l.from.id === id)
          )
            continue;
          const next = leg(ti, board.from, at),
            previous = board.label;
          insert(arrived, id, {
            legs: [...previous.legs, next],
            accessM: previous.accessM,
            walks: [
              ...previous.walks,
              ...(previous.legs.length ? [previous.pendingWalk] : []),
            ],
            pendingWalk: 0,
            stopCount: previous.stopCount + next.stopCount,
          });
        }
        for (const label of ready.get(id) ?? [])
          if (!label.legs.some((l) => l.routeId === t.routeId))
            boards.push({ label, from: at });
        boards.sort(
          (a, b) =>
            walking(a.label) - walking(b.label) ||
            a.label.stopCount - a.from - b.label.stopCount + b.from,
        );
        boards = boards.slice(0, LABELS);
      }
    }
    for (const [id, labels] of arrived) {
      const egressM = ends.get(id);
      if (egressM === undefined) continue;
      for (const label of labels) {
        const option: JourneyOption = {
          id: labelKey(label),
          legs: label.legs,
          accessM: label.accessM,
          egressM,
          transferCount: (label.legs.length -
            1) as JourneyOption["transferCount"],
          stopCount: label.stopCount,
          transferWalkM: sum(label.walks),
          transferWalksM: label.walks,
        };
        const prev = best.get(option.id);
        if (!prev || compare(option, prev) < 0) best.set(option.id, option);
      }
    }
    if (input.criterion !== "walking" && best.size >= 6) break;
    ready = new Map();
    if (round === input.maxTransfers) break;
    for (const [id, labels] of arrived) {
      if (!neighbors.has(id)) {
        const p = index.stops.byId.get(id)!;
        neighbors.set(
          id,
          index.stops
            .nearest(p.lat, p.lon, 250, index.stops.all.length)
            .filter((s) => relevant(s.id))
            .map((s) => ({
              id: s.id,
              distance: distanceM(p.lat, p.lon, s.lat, s.lon),
            })),
        );
      }
      for (const n of neighbors.get(id)!)
        for (const label of labels)
          insert(ready, n.id, { ...label, pendingWalk: n.distance });
    }
  }
  const options = [...best.values()].sort(compare).slice(0, 6);
  return {
    options,
    radiusM: input.radiusM,
    ...(!options.length ? { reason: "NO_CONNECTION" as const } : {}),
  };
}
