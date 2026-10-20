import { vi } from "vitest";
import { createPlannerIndex } from "../src/features/journey/data";
import { findJourneys } from "../src/features/journey/router";
import { fixture, hash, networkStops, trip } from "./planner-fixtures";
import type { PlanInput, PlannerResult } from "../src/features/journey/types";
export function installJourneyMocks({
  autoRespond = true,
  empty = false,
  networkFailure = false,
} = {}) {
  const index = createPlannerIndex(
    fixture([
      trip("direct", ["A", "X", "D"]),
      trip("first", ["A", "X"]),
      trip("second", ["X", "D"]),
    ]),
    networkStops,
  );
  const workers: TestWorker[] = [],
    arrivalUrls: string[] = [];
  class TestWorker {
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onerror: (() => void) | null = null;
    jobs: { requestId: number; input: PlanInput }[] = [];
    terminate = vi.fn();
    constructor() {
      workers.push(this);
    }
    postMessage(msg: { type: string; requestId: number; input: PlanInput }) {
      if (msg.type !== "plan") return;
      this.jobs.push(msg);
      if (autoRespond)
        queueMicrotask(() =>
          this.reply(
            msg.requestId,
            empty
              ? {
                  options: [],
                  radiusM: msg.input.radiusM,
                  reason: "NO_CONNECTION",
                }
              : findJourneys(index, msg.input),
          ),
        );
    }
    reply(requestId: number, result?: PlannerResult) {
      const job = this.jobs.find((j) => j.requestId === requestId)!;
      this.onmessage?.({
        data: {
          type: "result",
          requestId,
          result: result ?? findJourneys(index, job.input),
        },
      });
    }
  }
  vi.stubGlobal("Worker", TestWorker);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (input.includes("/api/health"))
        return Response.json({ configured: true });
      if (input.includes("data/stops.json"))
        return networkFailure
          ? new Response("bad", { status: 503 })
          : Response.json({
              version: 1,
              provenance: { sha256: hash },
              stops: networkStops.map((s) => [
                s.id,
                s.name,
                s.ref,
                s.lat,
                s.lon,
                s.rail ? 1 : 0,
              ]),
            });
      if (input.includes("photon.komoot.io")) {
        const query = new URL(input).searchParams.get("q")!.toLowerCase(),
          destination = query.includes("destino");
        const point = destination ? networkStops[2] : networkStops[0];
        return Response.json({
          features: [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [point.lon, point.lat] },
              properties: {
                osm_type: "N",
                osm_id: destination ? 2 : 1,
                street: destination ? "Rua Destino" : "Rua Origem",
                housenumber: "1000",
                city: "São Paulo",
                countrycode: "BR",
                type: "house",
              },
            },
          ],
        });
      }
      if (input.includes("/arrivals")) arrivalUrls.push(input);
      return Response.json({
        data: [],
        source: "SPTrans",
        fetchedAt: new Date().toISOString(),
        observedAt: null,
      });
    }),
  );
  return { workers, arrivalUrls };
}
