import { expect, it } from "vitest";
import rawStops from "../public/data/stops.json?raw";
import rawPlan from "../public/data/multimodal.json?raw";
import { parseNetwork } from "../src/features/stops/network";
import {
  createPlannerIndex,
  parsePlannerData,
} from "../src/features/journey/data";
import { findJourneys } from "../src/features/journey/router";
it.each(["transfers", "walking"] as const)(
  "calcula baldeações na rede real priorizando %s dentro do prazo",
  (criterion) => {
    const network = JSON.parse(rawStops),
      data = parsePlannerData(JSON.parse(rawPlan), network.provenance.sha256);
    const index = createPlannerIndex(data, parseNetwork(network)!);
    const blue = data.trips.find((t) =>
      index.routes.get(t.routeId)?.code.endsWith(" L1"),
    )!;
    const train = data.trips.find((t) =>
      index.routes.get(t.routeId)?.code.endsWith(" L09"),
    )!;
    const origin = index.stops.byId.get(blue.stopIds[0])!,
      destination = index.stops.byId.get(train.stopIds.at(-1)!)!;
    const start = performance.now();
    const result = findJourneys(index, {
      origin,
      destination,
      radiusM: 800,
      maxTransfers: 3,
      transport: "all",
      criterion,
      serviceDate: "20261021",
    });
    expect(result.options.length).toBeGreaterThan(0);
    expect(performance.now() - start).toBeLessThan(15000);
    for (const option of result.options) {
      expect(option.legs.length).toBeLessThanOrEqual(4);
      expect(option.transferWalksM?.length).toBe(option.legs.length - 1);
      expect(new Set(option.legs.map((l) => l.routeId)).size).toBe(
        option.legs.length,
      );
    }
  },
  20000,
);
