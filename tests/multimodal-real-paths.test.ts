import { afterEach, expect, it, vi } from "vitest";
import rawNetwork from "../public/data/stops.json?raw";
import rawPlanner from "../public/data/multimodal.json?raw";
import { parseNetwork, distanceM } from "../src/features/stops/network";
import {
  createPlannerIndex,
  parsePlannerData,
} from "../src/features/journey/data";
import { loadLegPath } from "../src/features/journey/paths";
import { findJourneys } from "../src/features/journey/router";
const buckets = import.meta.glob("../public/data/paths/*.json", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;
afterEach(() => vi.unstubAllGlobals());
it("confere os caminhos dos 2272 itinerários reais e os dois sentidos ferroviários", async () => {
  const network = JSON.parse(rawNetwork),
    data = parsePlannerData(JSON.parse(rawPlanner), network.provenance.sha256);
  const index = createPlannerIndex(data, parseNetwork(network)!);
  const fetcher = vi.fn(async (url: string) => {
    const file = new URL(url).pathname.split("/").pop();
    const raw = buckets[`../public/data/paths/${file}`];
    return raw
      ? Response.json(JSON.parse(raw))
      : new Response("missing", { status: 404 });
  });
  vi.stubGlobal("fetch", fetcher);
  let valid = 0,
    rail = 0;
  for (const trip of data.trips) {
    const route = index.routes.get(trip.routeId)!;
    const stops = trip.stopIds.map((id) => index.stops.byId.get(id)!);
    const leg = {
      tripId: trip.id,
      routeId: route.id,
      lineCode: route.code,
      headsign: trip.headsign,
      mode: route.mode,
      from: stops[0],
      to: stops.at(-1)!,
      fromIndex: 0,
      toIndex: stops.length - 1,
      stopCount: stops.length - 1,
      routeStops: stops,
      feedHash: data.provenance.sha256,
    };
    const path = await loadLegPath(leg, new AbortController().signal);
    if (!path) continue;
    valid++;
    if (route.mode !== "bus") rail++;
    expect(path.points.length, trip.id).toBeGreaterThan(1);
    for (const [stop, point] of [
      [leg.from, path.points[0]],
      [leg.to, path.points.at(-1)!],
    ])
      expect(
        distanceM(stop.lat, stop.lon, point.lat, point.lon),
        trip.id,
      ).toBeLessThan(1000);
  }
  expect(valid).toBeGreaterThan(2100);
  expect(rail).toBe(30);
  expect(fetcher).toHaveBeenCalledTimes(16);
  for (const direction of [0, 1]) {
    const trip = data.trips.filter((t) =>
      index.routes.get(t.routeId)?.code.endsWith(" L1"),
    )[direction];
    expect(trip).toBeTruthy();
    const result = findJourneys(index, {
      origin: index.stops.byId.get(trip.stopIds[0])!,
      destination: index.stops.byId.get(trip.stopIds.at(-1)!)!,
      serviceDate: "20261021",
      radiusM: 800,
      transport: "rail",
    });
    expect(
      result.options.some(
        (o) => o.legs.length === 1 && o.legs[0].lineCode.endsWith(" L1"),
      ),
    ).toBe(true);
  }
});
