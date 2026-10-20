import { expect, it } from "vitest";
import {
  createPlannerIndex,
  parsePlannerData,
} from "../src/features/journey/data";
import { fixture, hash, networkStops } from "./planner-fixtures";
it("valida dados, referências e a versão do mesmo GTFS", () => {
  const data = parsePlannerData(fixture(), hash);
  const idx = createPlannerIndex(data, networkStops);
  expect(idx.stops.all.map((s) => s.id)).toEqual(["A", "X", "D"]);
  expect(idx.occurrences.get("X")).toEqual([{ tripIndex: 0, stopIndex: 1 }]);
  expect(() => parsePlannerData(fixture(), "b".repeat(64))).toThrow(/versões/i);
  expect(() => parsePlannerData({ ...fixture(), version: 2 }, hash)).toThrow();
});
it("recusa referências, coordenadas e calendários inconsistentes", () => {
  const data = fixture();
  data.trips[0].routeId = "missing";
  expect(() => parsePlannerData(data, hash)).toThrow();
  expect(() =>
    createPlannerIndex(
      fixture(),
      networkStops.filter((s) => s.id !== "D"),
    ),
  ).toThrow();
  expect(() =>
    createPlannerIndex(
      fixture(),
      networkStops.map((s) => ({ ...s, lat: 1000 })),
    ),
  ).toThrow();
  const invalid = fixture();
  invalid.calendars[0].start = "20260230";
  expect(() => parsePlannerData(invalid, hash)).toThrow();
});
it("aceita serviço incluído somente por exceção e recusa duplicatas", () => {
  const data = fixture();
  data.trips[0].serviceId = "extra";
  data.exceptions = [{ serviceId: "extra", date: "20261019", added: true }];
  expect(parsePlannerData(data, hash).trips[0].serviceId).toBe("extra");
  data.trips.push(data.trips[0]);
  expect(() => parsePlannerData(data, hash)).toThrow();
});
