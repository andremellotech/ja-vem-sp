import type { NetStop } from "../src/features/stops/network";
import type { PlannerData, Trip } from "../src/features/journey/types";
export const hash = "a".repeat(64);
export const networkStops: NetStop[] = [
  { id: "A", name: "Origem", ref: "", lat: -23.55, lon: -46.63, rail: false },
  { id: "X", name: "Troca", ref: "", lat: -23.57, lon: -46.65, rail: false },
  { id: "D", name: "Destino", ref: "", lat: -23.59, lon: -46.67, rail: false },
  { id: "M", name: "Metrô", ref: "", lat: -23.5501, lon: -46.63, rail: true },
];
export const trip = (
  id: string,
  stopIds: string[],
  serviceId = "daily",
): Trip => ({
  id,
  routeId: id,
  headsign: "Centro",
  direction: "0",
  serviceId,
  stopIds,
});
export function fixture(
  trips: Trip[] = [trip("direct", ["A", "X", "D"])],
): PlannerData {
  return {
    version: 1,
    provenance: {
      source: "official",
      retrievedAt: "2026-10-19",
      license: "portal",
      sha256: hash,
    },
    validFrom: "20260101",
    validTo: "20261231",
    routes: trips.map((t) => ({ id: t.routeId, code: t.id, name: t.id })),
    trips,
    calendars: [
      {
        id: "daily",
        start: "20260101",
        end: "20261231",
        weekdays: Array(7).fill(true),
      },
    ],
    exceptions: [],
  };
}
