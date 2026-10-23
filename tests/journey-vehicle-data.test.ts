import { expect, it } from "vitest";
import {
  resolveVehicleLines,
  mergeJourneyVehicles,
} from "../src/features/journey/journey-vehicles";
import {
  createPlannerIndex,
  parsePlannerData,
} from "../src/features/journey/data";
import { parseNetwork } from "../src/features/stops/network";
import { parseLineCatalog } from "../src/features/lines/catalog";
import rawNetwork from "../public/data/stops.json?raw";
import rawPlanner from "../public/data/planner.json?raw";
import rawLines from "../public/data/lines.json?raw";
it("associa os dois sentidos reais de 857C e 476A aos identificadores corretos de GPS", () => {
  const network = JSON.parse(rawNetwork),
    data = parsePlannerData(JSON.parse(rawPlanner), network.provenance.sha256);
  const index = createPlannerIndex(data, parseNetwork(network)!);
  const legs = ["857C-10-0", "857C-10-1", "476A-10-0", "476A-10-1"].map(
    (id) => {
      const t = data.trips.find((t) => t.id === id)!;
      return {
        routeId: t.routeId,
        tripId: t.id,
        lineCode: t.routeId,
        headsign: t.headsign,
      };
    },
  );
  expect(
    resolveVehicleLines(
      legs,
      parseLineCatalog(JSON.parse(rawLines)),
      index,
    ).map((r) => r.line?.id),
  ).toEqual(["1901", "34669", "304", "33072"]);
});
it("mantém uma posição por veículo, usa o GPS mais recente e descarta coordenadas inválidas", () => {
  const line = {
    id: "1901",
    code: "857C-10",
    name: "Linha",
    origin: "Campo Limpo",
    destination: "Conceição",
    direction: 1 as const,
  };
  const merged = mergeJourneyVehicles([
    {
      line,
      vehicles: [
        {
          id: "123",
          lat: -23.5,
          lon: -46.6,
          observedAt: "2026-10-23T12:01:00Z",
        },
        { id: "invalid", lat: 200, lon: -46.6, observedAt: null },
      ],
    },
    {
      line: { ...line, id: "304", code: "476A-10" },
      vehicles: [
        {
          id: "123",
          lat: -23.6,
          lon: -46.7,
          observedAt: "2026-10-23T12:00:00Z",
        },
      ],
    },
  ]);
  expect(merged).toEqual([
    {
      id: "123",
      lat: -23.5,
      lon: -46.6,
      observedAt: "2026-10-23T12:01:00Z",
      lineCode: "857C-10",
      lineDestination: "Conceição",
      lineId: "1901",
    },
  ]);
});
