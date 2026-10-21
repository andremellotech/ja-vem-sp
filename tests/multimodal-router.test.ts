import { expect, it } from "vitest";
import {
  createPlannerIndex,
  parsePlannerData,
} from "../src/features/journey/data";
import { findJourneys } from "../src/features/journey/router";
import { fixture, hash, networkStops, trip } from "./planner-fixtures";

const input = {
  origin: networkStops[0],
  destination: networkStops[2],
  serviceDate: "20261021",
  radiusM: 800 as const,
};
it("inclui metrô e trem e filtra o modo sem perder o ônibus legado", () => {
  const data = fixture([trip("bus", ["A", "D"]), trip("rail", ["A", "D"])]);
  Object.assign(data.routes[1], { mode: "metro", color: "0000FF" });
  const index = createPlannerIndex(parsePlannerData(data, hash), networkStops);
  const rail = findJourneys(index, { ...input, transport: "rail" });
  expect(rail.options.map((o) => o.legs[0].lineCode)).toEqual(["rail"]);
  expect(rail.options[0].legs[0]).toMatchObject({
    mode: "metro",
    color: "0000FF",
    feedHash: hash,
  });
  expect(
    findJourneys(index, { ...input, transport: "bus" }).options.map(
      (o) => o.legs[0].lineCode,
    ),
  ).toEqual(["bus"]);
});
it("conecta estações de IDs distintos por caminhada curta e impede conexão acima de 250m", () => {
  const data = fixture([trip("bus", ["A", "X"]), trip("train", ["X2", "D"])]);
  Object.assign(data.routes[1], { mode: "train" });
  const other = { ...networkStops[1], id: "X2", lat: -23.571, rail: true };
  const result = findJourneys(
    createPlannerIndex(data, [...networkStops, other]),
    input,
  );
  expect(result.options).toHaveLength(1);
  expect(result.options[0].transferWalkM).toBeGreaterThan(100);
  expect(result.options[0].transferWalkM).toBeLessThan(120);
  expect(result.options[0].legs.map((l) => l.lineCode)).toEqual([
    "bus",
    "train",
  ]);
  expect(
    findJourneys(
      createPlannerIndex(data, [...networkStops, { ...other, lat: -23.573 }]),
      input,
    ).options,
  ).toEqual([]);
});
it("rejeita metadados de transporte desconhecidos", () => {
  const data = fixture();
  Object.assign(data.routes[0], { mode: "plane" });
  expect(() => parsePlannerData(data, hash)).toThrow();
});
