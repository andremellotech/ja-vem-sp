import { afterEach, expect, it, vi } from "vitest";
import { createPlannerClient } from "../src/features/journey/client";
const input = {
  origin: { lat: -23.5, lon: -46.6 },
  destination: { lat: -23.6, lon: -46.7 },
  serviceDate: "20261019",
  radiusM: 800 as const,
};
const workers: FakeWorker[] = [];
class FakeWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  messages: unknown[] = [];
  terminate = vi.fn();
  constructor() {
    workers.push(this);
  }
  postMessage(value: unknown) {
    this.messages.push(value);
  }
  reply(requestId: number, result = { options: [], radiusM: 800 }) {
    this.onmessage?.({ data: { type: "result", requestId, result } });
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  workers.length = 0;
});
it("correlaciona respostas, ignora consulta cancelada e encerra o worker", async () => {
  vi.stubGlobal("Worker", FakeWorker);
  const client = createPlannerClient("/data/stops.json", "/data/planner.json");
  const abort = new AbortController();
  const first = client.plan(input, abort.signal);
  const aborted = expect(first).rejects.toMatchObject({ name: "AbortError" });
  const second = client.plan({ ...input, radiusM: 1200 });
  abort.abort();
  await aborted;
  workers[0].reply(1);
  workers[0].reply(2, { options: [], radiusM: 1200 });
  expect((await second).radiusM).toBe(1200);
  expect(workers[0].messages[0]).toEqual({
    type: "init",
    stopsUrl: "/data/stops.json",
    plannerUrl: "/data/planner.json",
  });
  client.dispose();
  expect(workers[0].terminate).toHaveBeenCalledOnce();
});
it("rejeita todas as consultas quando a carga de dados falha", async () => {
  vi.stubGlobal("Worker", FakeWorker);
  const client = createPlannerClient("s", "p");
  const pending = client.plan(input);
  const failure = expect(pending).rejects.toMatchObject({
    code: "INVALID_DATA",
  });
  workers[0].onmessage?.({
    data: {
      type: "error",
      requestId: null,
      error: { code: "INVALID_DATA", message: "versões diferentes" },
    },
  });
  await failure;
  client.dispose();
});
it("encerra espera sem resposta em 20 segundos", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("Worker", FakeWorker);
  const client = createPlannerClient("s", "p");
  const pending = client.plan(input);
  const failure = expect(pending).rejects.toMatchObject({ code: "TIMEOUT" });
  await vi.advanceTimersByTimeAsync(20000);
  await failure;
  client.dispose();
});
