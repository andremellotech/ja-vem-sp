import { expect, it } from "vitest";
import { createPlannerIndex } from "../src/features/journey/data";
import { findJourneys } from "../src/features/journey/router";
import { fixture, trip } from "./planner-fixtures";
const stops = [0, 1, 2, 3, 4].map((i) => ({
  id: "s" + i,
  name: "Parada " + i,
  ref: "",
  lat: -23.5 - i * 0.02,
  lon: -46.6,
  rail: i === 1 || i === 2,
}));
const data = fixture([
  trip("bus-a", ["s0", "s1"]),
  trip("metro", ["s1", "s2"]),
  trip("train", ["s2", "s3"]),
  trip("bus-b", ["s3", "s4"]),
]);
Object.assign(data.routes[1], { mode: "metro" });
Object.assign(data.routes[2], { mode: "train" });
const input = {
  origin: stops[0],
  destination: stops[4],
  serviceDate: "20261021",
  radiusM: 800 as const,
  maxTransfers: 3 as const,
};
it("conecta ônibus, metrô, trem e outro ônibus com três baldeações até o destino", () => {
  const result = findJourneys(createPlannerIndex(data, stops), input);
  expect(result.options).toHaveLength(1);
  expect(result.options[0].transferCount).toBe(3);
  expect(result.options[0].legs.map((l) => l.lineCode)).toEqual([
    "bus-a",
    "metro",
    "train",
    "bus-b",
  ]);
  expect(result.options[0].legs.at(-1)?.to.id).toBe("s4");
});
it("respeita o limite escolhido e os modos sem criar uma conexão inexistente", () => {
  const index = createPlannerIndex(data, stops);
  expect(findJourneys(index, { ...input, maxTransfers: 2 }).options).toEqual(
    [],
  );
  expect(findJourneys(index, { ...input, transport: "bus" }).options).toEqual(
    [],
  );
  expect(findJourneys(index, { ...input, transport: "rail" }).options).toEqual(
    [],
  );
});
it("inclui caminhada entre duas paradas de ônibus próximas com IDs diferentes", () => {
  const other = {
    ...stops[1],
    id: "s1b",
    lat: stops[1].lat + 0.001,
    rail: false,
  };
  const f = fixture([
    trip("bus-a", ["s0", "s1"]),
    trip("bus-b", ["s1b", "s4"]),
  ]);
  const result = findJourneys(createPlannerIndex(f, [...stops, other]), input);
  expect(result.options[0].transferWalksM?.[0]).toBeGreaterThan(100);
  expect(result.options[0].transferWalksM?.[0]).toBeLessThan(120);
});
it("prefere a variante com menos paradas quando os mesmos embarques empatam em caminhada", () => {
  const long = trip("long", ["s0", "s1", "s2", "s4"]);
  const short = { ...trip("short", ["s0", "s4"]), routeId: "long" };
  const result = findJourneys(
    createPlannerIndex(fixture([long, short]), stops),
    input,
  );
  expect(result.options).toHaveLength(1);
  expect(result.options[0].stopCount).toBe(1);
  expect(result.options[0].legs[0].tripId).toBe("short");
});
