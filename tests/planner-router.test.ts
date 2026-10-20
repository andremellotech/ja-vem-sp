import { expect, it } from "vitest";
import { createPlannerIndex } from "../src/features/journey/data";
import {
  activeServices,
  serviceDateInSaoPaulo,
} from "../src/features/journey/calendar";
import { findJourneys } from "../src/features/journey/router";
import { fixture, networkStops, trip } from "./planner-fixtures";
import type { PlanInput } from "../src/features/journey/types";
const input: PlanInput = {
  origin: networkStops[0],
  destination: networkStops[2],
  serviceDate: "20261019",
  radiusM: 800,
};
it("encontra diretas e uma troca na ordem, priorizando menos trocas", () => {
  const idx = createPlannerIndex(
    fixture([
      trip("direct", ["A", "X", "D"]),
      trip("first", ["A", "X"]),
      trip("second", ["X", "D"]),
    ]),
    networkStops,
  );
  const result = findJourneys(idx, input);
  expect(result.options[0].legs).toHaveLength(1);
  expect(result.options[0].legs[0].routeStops.map((s) => s.id)).toEqual([
    "A",
    "X",
    "D",
  ]);
  const transfer = result.options.find(
    (o) => o.legs[0].tripId === "first" && o.legs[1]?.tripId === "second",
  )!;
  expect(transfer.legs[0].to.id).toBe("X");
  expect(transfer.legs[1].from.id).toBe("X");
  expect(
    result.options.every((o) => o.legs.every((l) => l.fromIndex < l.toIndex)),
  ).toBe(true);
  expect(
    findJourneys(idx, {
      ...input,
      origin: input.destination,
      destination: input.origin,
    }).options,
  ).toEqual([]);
});
it("encontra conexão quando não há linha direta e não conecta paradas de IDs diferentes", () => {
  const trips = [trip("first", ["A", "X"]), trip("second", ["X", "D"])];
  expect(
    findJourneys(createPlannerIndex(fixture(trips), networkStops), input)
      .options[0].transferCount,
  ).toBe(1);
  trips[1].stopIds = ["X2", "D"];
  const idx = createPlannerIndex(fixture(trips), [
    ...networkStops,
    { ...networkStops[1], id: "X2" },
  ]);
  expect(findJourneys(idx, input).options).toEqual([]);
});
it("preserva ocorrências da linha circular e escolhe menos paradas no desempate", () => {
  const idx = createPlannerIndex(
    fixture([trip("circle", ["A", "X", "A", "D"])]),
    networkStops,
  );
  const toX = findJourneys(idx, { ...input, destination: networkStops[1] })
    .options[0].legs[0];
  expect([toX.fromIndex, toX.toIndex]).toEqual([0, 1]);
  expect(findJourneys(idx, input).options[0].legs[0].fromIndex).toBe(2);
});
it("respeita o raio explícito e retorna razão quando faltam paradas", () => {
  const idx = createPlannerIndex(fixture(), networkStops);
  const moved = { ...input, origin: { lat: -23.541, lon: -46.63 } };
  expect(findJourneys(idx, moved).options).toEqual([]);
  expect(findJourneys(idx, { ...moved, radiusM: 1200 }).options).toHaveLength(
    1,
  );
  expect(
    findJourneys(idx, { ...input, origin: { lat: 0, lon: 0 } }).reason,
  ).toBe("NO_NEARBY_STOPS");
});
it("considera a 13ª parada de origem dentro do raio, sem incluir ponto ferroviário fora das viagens", () => {
  const starts = Array.from({ length: 13 }, (_, i) => ({
    ...networkStops[0],
    id: "B" + i,
    lat: networkStops[0].lat + i * 0.00001,
  }));
  const trips = starts.map((s, i) =>
    trip("t" + i, [s.id, i === 12 ? "D" : "X"]),
  );
  const idx = createPlannerIndex(fixture(trips), [...networkStops, ...starts]);
  expect(idx.stops.byId.has("M")).toBe(false);
  expect(findJourneys(idx, input).options[0].legs[0].tripId).toBe("t12");
});
it("considera a 13ª parada de destino dentro do raio", () => {
  const ends = Array.from({ length: 13 }, (_, i) => ({
    ...networkStops[2],
    id: "E" + i,
    lat: networkStops[2].lat + i * 0.00001,
  }));
  const trips = ends.map((s, i) => trip("t" + i, [i === 12 ? "A" : "X", s.id]));
  const idx = createPlannerIndex(fixture(trips), [...networkStops, ...ends]);
  expect(findJourneys(idx, input).options[0].legs[0].tripId).toBe("t12");
});
it("deduplica e limita as alternativas a seis", () => {
  const idx = createPlannerIndex(
    fixture(Array.from({ length: 8 }, (_, i) => trip("line" + i, ["A", "D"]))),
    networkStops,
  );
  const options = findJourneys(idx, input).options;
  expect(options).toHaveLength(6);
  expect(new Set(options.map((o) => o.id)).size).toBe(6);
});
it("considera calendário, exceções e validade no dia de São Paulo", () => {
  const data = fixture();
  data.calendars[0].weekdays = [true, false, false, false, false, false, false];
  data.exceptions = [
    { serviceId: "daily", date: "20261019", added: false },
    { serviceId: "extra", date: "20261020", added: true },
  ];
  expect(activeServices(data, "20261019").has("daily")).toBe(false);
  expect(activeServices(data, "20261020").has("extra")).toBe(true);
  expect(serviceDateInSaoPaulo(new Date("2026-10-20T01:30:00Z"))).toBe(
    "20261019",
  );
  expect(
    findJourneys(createPlannerIndex(data, networkStops), input).options,
  ).toEqual([]);
  expect(() =>
    findJourneys(createPlannerIndex(data, networkStops), {
      ...input,
      serviceDate: "20270101",
    }),
  ).toThrow(/atualiza/i);
});
it("ordena por caminhada antes de limitar seis, mesmo quando a troca aparece depois das diretas", () => {
  const away = {
    ...networkStops[0],
    id: "B",
    lat: networkStops[0].lat + 0.004,
  };
  const trips = [
    ...Array.from({ length: 7 }, (_, i) => trip("direct" + i, ["B", "D"])),
    trip("first", ["A", "X"]),
    trip("last", ["X", "D"]),
  ];
  const index = createPlannerIndex(fixture(trips), [...networkStops, away]);
  expect(findJourneys(index, input).options[0].transferCount).toBe(0);
  const walked = findJourneys(index, { ...input, criterion: "walking" });
  expect(walked.options).toHaveLength(6);
  expect(walked.options[0].transferCount).toBe(1);
  expect(walked.options[0].accessM).toBe(0);
});
