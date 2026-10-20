import { expect, it } from "vitest";
import { findNearbyTransit } from "../src/features/nearby/nearby";
import { createPlannerIndex } from "../src/features/journey/data";
import { fixture, networkStops, trip } from "./planner-fixtures";

it("encontra ônibus ativos próximos, escolhe o ponto mais perto e deduplica linha/letreiro", () => {
  const data = fixture([
    trip("one", ["A", "X", "D"]),
    trip("variant", ["A", "D"]),
    trip("weekday", ["A", "X"], "weekdays"),
  ]);
  data.routes[0].code = "857C-10";
  data.routes[1].code = "857C-10";
  data.routes[2].code = "476A-10";
  data.calendars.push({
    id: "weekdays",
    start: "20260101",
    end: "20261231",
    weekdays: [true, true, true, true, true, false, false],
  });
  const index = createPlannerIndex(data, networkStops);
  const result = findNearbyTransit(index, networkStops[0], "20261025", 800);
  expect(result.stops.map((s) => s.id)).toEqual(["A"]);
  expect(result.lines).toHaveLength(1);
  expect(result.lines[0]).toMatchObject({
    code: "857C-10",
    headsign: "Centro",
    stop: { id: "A" },
    distanceM: 0,
  });
  expect(findNearbyTransit(index, { lat: 0, lon: 0 }, "20261025", 800)).toEqual(
    { stops: [], lines: [] },
  );
});

it("não sugere estações sem serviço de ônibus nem serviços inativos", () => {
  const data = fixture([trip("one", ["A", "X"], "weekdays")]);
  data.calendars = [
    {
      id: "weekdays",
      start: "20260101",
      end: "20261231",
      weekdays: [true, true, true, true, true, false, false],
    },
  ];
  const index = createPlannerIndex(data, networkStops);
  expect(findNearbyTransit(index, networkStops[0], "20261025", 1200)).toEqual({
    stops: [],
    lines: [],
  });
});
it("considera linhas além dos primeiros oito pontos e exclui estação ferroviária", () => {
  const extra = Array.from({ length: 10 }, (_, i) => ({
    ...networkStops[0],
    id: "B" + i,
    lat: networkStops[0].lat + i * 0.0001,
  }));
  const data = fixture(extra.map((s, i) => trip("line" + i, [s.id, "D"])));
  const index = createPlannerIndex(data, [...networkStops, ...extra]);
  const found = findNearbyTransit(index, networkStops[0], "20261025", 800);
  expect(found.stops).toHaveLength(10);
  expect(found.lines).toHaveLength(10);
  expect(found.lines.at(-1)?.code).toBe("line9");
  const railData = fixture([trip("rail", ["M", "D"])]);
  expect(
    findNearbyTransit(
      createPlannerIndex(railData, networkStops),
      networkStops[0],
      "20261025",
      800,
    ).stops,
  ).toEqual([]);
});
