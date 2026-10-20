import { expect, it } from "vitest";
import { resolveLineStops } from "../src/features/journey/line-stops";
import { createPlannerIndex } from "../src/features/journey/data";
import { fixture, networkStops, trip } from "./planner-fixtures";
import type { Line } from "../src/contracts";
const line: Line = {
  id: "999",
  code: "8000-10",
  name: "Pirituba",
  direction: 2,
  origin: "PÇA. RAMOS DE AZEVEDO",
  destination: "TERM. PIRITUBA",
};
function index() {
  const data = fixture([
    trip("out", ["A", "X", "D"]),
    trip("back", ["D", "X", "A"]),
  ]);
  data.routes = [{ id: "r", code: "8000-10", name: "Ramos - Pirituba" }];
  data.trips[0] = {
    ...data.trips[0],
    routeId: "r",
    headsign: "Term. Pirituba",
    direction: "0",
  };
  data.trips[1] = {
    ...data.trips[1],
    routeId: "r",
    headsign: "Pça. Ramos de Azevedo",
    direction: "1",
  };
  return createPlannerIndex(data, networkStops);
}
it("retorna todas as paradas GTFS no sentido correto mesmo com API vazia ou parcial", () => {
  const idx = index();
  const result = resolveLineStops(line, idx, []);
  expect(result.stops.map((s) => s.id)).toEqual(["A", "X", "D"]);
  expect(result.directionMatched).toBe(true);
  expect(
    resolveLineStops(line, idx, [networkStops[1]]).stops.map((s) => s.id),
  ).toEqual(["A", "X", "D"]);
  const reverse = resolveLineStops(
    {
      ...line,
      direction: 1,
      origin: line.destination,
      destination: line.origin,
    },
    idx,
    [],
  );
  expect(reverse.stops.map((s) => s.id)).toEqual(["D", "X", "A"]);
});
it("inclui variantes da mesma direção e paradas novas do fornecedor, sem pontos de outra linha", () => {
  const idx = index();
  idx.data.trips.push({
    ...idx.data.trips[0],
    id: "variant",
    stopIds: ["A", "D"],
  });
  const newer = { id: "new", name: "Parada nova", lat: -23.56, lon: -46.64 };
  const result = resolveLineStops(line, idx, [newer]);
  expect(result.stops.map((s) => s.id)).toEqual(["A", "X", "D", "new"]);
  expect(result.stops.some((s) => s.id === "M")).toBe(false);
});
it("não inventa correspondência de sentido quando a base é ambígua", () => {
  const idx = index();
  idx.data.trips[0].headsign = "Ida";
  idx.data.trips[1].headsign = "Volta";
  const result = resolveLineStops(
    { ...line, origin: "Outro", destination: "Outro destino" },
    idx,
    [],
  );
  expect(result.directionMatched).toBe(false);
  expect(result.note).toMatch(/sentidos/i);
  expect(result.stops).toHaveLength(3);
});
it("identifica cobertura parcial quando não existe rota na base GTFS", () => {
  const result = resolveLineStops({ ...line, code: "9999-10" }, index(), [
    networkStops[0],
  ]);
  expect(result.stops).toHaveLength(1);
  expect(result.source).toBe("api");
  expect(result.note).toMatch(/parciais/i);
});
