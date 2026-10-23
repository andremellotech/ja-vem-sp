import type { Line, Vehicle } from "../../contracts";
import type { PlannerIndex } from "./data";
import type { JourneyBusLeg } from "./types";
import { resolveLineStops } from "./line-stops";
export type VehicleLine = { leg: JourneyBusLeg; line: Line | null };
const code = (s: string) =>
  s
    .trim()
    .toUpperCase()
    .replace(/-(\d)$/, "-0$1");
/** Only use an API direction when it uniquely maps to the chosen GTFS trip. */
export function resolveVehicleLines(
  legs: JourneyBusLeg[],
  catalog: Line[],
  index: PlannerIndex,
): VehicleLine[] {
  return [...new Map(legs.map((l) => [l.tripId, l])).values()].map((leg) => {
    const matches = catalog
      .filter((l) => code(l.code) === code(leg.lineCode))
      .filter((line) => {
        const resolution = resolveLineStops(line, index, []);
        return (
          resolution.directionMatched &&
          resolution.tripIds?.includes(leg.tripId)
        );
      });
    return { leg, line: matches.length === 1 ? matches[0] : null };
  });
}
export function mergeJourneyVehicles(
  rows: { line: Line; vehicles: Vehicle[] }[],
): Vehicle[] {
  const byId = new Map<string, Vehicle>();
  for (const row of rows)
    for (const v of row.vehicles) {
      if (
        !v.id ||
        !Number.isFinite(v.lat) ||
        !Number.isFinite(v.lon) ||
        Math.abs(v.lat) > 90 ||
        Math.abs(v.lon) > 180
      )
        continue;
      const previous = byId.get(v.id),
        stamp = (s: string | null) =>
          s && Number.isFinite(Date.parse(s)) ? Date.parse(s) : 0;
      if (previous && stamp(previous.observedAt) > stamp(v.observedAt))
        continue;
      byId.set(v.id, {
        ...v,
        lineCode: row.line.code,
        lineDestination: row.line.destination,
        lineId: row.line.id,
      });
    }
  return [...byId.values()];
}
