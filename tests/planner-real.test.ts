// @vitest-environment node
import rawNetwork from "../public/data/stops.json?raw";
import rawPlanner from "../public/data/planner.json?raw";
import { expect, it } from "vitest";
import { parseNetwork } from "../src/features/stops/network";
import {
  createPlannerIndex,
  parsePlannerData,
} from "../src/features/journey/data";
import { findJourneys } from "../src/features/journey/router";
import { resolveLineStops } from "../src/features/journey/line-stops";
it("calcula opções no feed oficial completo com referências consistentes", () => {
  const network = JSON.parse(rawNetwork);
  const data = parsePlannerData(
    JSON.parse(rawPlanner),
    network.provenance.sha256,
  );
  const idx = createPlannerIndex(data, parseNetwork(network)!);
  expect(data.routes).toHaveLength(1349);
  const cases = [
    {
      name: "Paulista — Sé",
      origin: { lat: -23.5648865, lon: -46.651918 },
      destination: { lat: -23.5504, lon: -46.6338 },
    },
    {
      name: "Paulista — Lapa",
      origin: { lat: -23.5648865, lon: -46.651918 },
      destination: { lat: -23.5259, lon: -46.7048 },
    },
    {
      name: "Paulista — Santana",
      origin: { lat: -23.5648865, lon: -46.651918 },
      destination: { lat: -23.5023, lon: -46.6251 },
    },
  ];
  let direct = 0,
    transfer = 0;
  for (const c of cases) {
    const start = performance.now();
    const r = findJourneys(idx, {
      ...c,
      serviceDate: "20261019",
      radiusM: 800,
    });
    console.info(
      c.name,
      Math.round(performance.now() - start) + "ms",
      r.options.map((o) => ({
        changes: o.transferCount,
        lines: o.legs.map((l) => l.lineCode),
        stops: o.legs.map((l) => [l.from.id, l.to.id]),
      })),
    );
    direct += r.options.filter((o) => o.transferCount === 0).length;
    transfer += r.options.filter((o) => o.transferCount === 1).length;
    for (const o of r.options)
      for (const l of o.legs) {
        const t = data.trips.find((t) => t.id === l.tripId)!;
        expect(t.stopIds[l.fromIndex]).toBe(l.from.id);
        expect(t.stopIds[l.toIndex]).toBe(l.to.id);
        expect(l.fromIndex).toBeLessThan(l.toIndex);
      }
  }
  expect(direct).toBeGreaterThan(0);
  expect(transfer).toBeGreaterThan(0);
});
it("inclui 857C-10 direta para Conceição mesmo com seu desembarque depois da 12ª parada próxima", () => {
  const network = JSON.parse(rawNetwork);
  const idx = createPlannerIndex(
    parsePlannerData(JSON.parse(rawPlanner), network.provenance.sha256),
    parseNetwork(network)!,
  );
  const result = findJourneys(idx, {
    origin: idx.stops.byId.get("150015667")!,
    destination: { lat: -23.635039, lon: -46.641239 },
    serviceDate: "20261020",
    radiusM: 800,
  });
  expect(
    result.options.some(
      (o) => o.legs.length === 1 && o.legs[0].lineCode === "857C-10",
    ),
  ).toBe(true);
});
it.each([
  ["857C-10", "Metrô Conceição", "Term. Campo Limpo", 48],
  ["857C-10", "Term. Campo Limpo", "Metrô Conceição", 49],
  ["476A-10", "Term. Sto. Amaro", "Ipiranga", 69],
  ["476A-10", "Ipiranga", "Term. Sto. Amaro", 68],
] as const)(
  "preserva todos os pontos de %s rumo a %s",
  (code, destination, origin, count) => {
    const network = JSON.parse(rawNetwork),
      data = parsePlannerData(
        JSON.parse(rawPlanner),
        network.provenance.sha256,
      );
    const idx = createPlannerIndex(data, parseNetwork(network)!);
    const result = resolveLineStops(
      { id: "audit", code, origin, destination, direction: 1, name: code },
      idx,
      [],
    );
    const trip = data.trips.find(
      (t) => t.routeId === code && t.headsign === destination,
    )!;
    expect(result.directionMatched).toBe(true);
    expect(result.stops.map((s) => s.id)).toEqual(trip.stopIds);
    expect(result.stops).toHaveLength(count);
  },
);
