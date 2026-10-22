import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { walkingInstruction } from "../src/features/walking/instructions";
const from = { lat: -23.55, lon: -46.63 },
  to = { lat: -23.56, lon: -46.64 };
const response = {
  code: "Ok",
  routes: [
    {
      distance: 1400,
      duration: 1000,
      geometry: {
        type: "LineString",
        coordinates: [
          [-46.63, -23.55],
          [-46.635, -23.558],
          [-46.64, -23.56],
        ],
      },
      legs: [
        {
          steps: [
            {
              name: "Rua São Bento",
              distance: 100,
              duration: 70,
              maneuver: { type: "turn", modifier: "left" },
            },
          ],
        },
      ],
    },
  ],
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("avisa quando o caminho de pedestres termina distante do ponto final solicitado", async () => {
  const { routeWalking } = await import("../src/features/walking/client");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => response }),
  );
  const farther = { lat: to.lat + 0.003, lon: to.lon };
  const result = await routeWalking(
    from,
    farther,
    new AbortController().signal,
  );
  expect(result.endGapM).toBeGreaterThan(300);
  expect(result.endGapM).toBeLessThan(350);
  expect(result.points.at(-1)).toEqual(to);
});
it("usa o perfil de pedestres e entrega geometria, distância e instruções internas", async () => {
  const { routeWalking } = await import("../src/features/walking/client");
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => response });
  vi.stubGlobal("fetch", fetcher);
  const result = await routeWalking(from, to, new AbortController().signal);
  expect(String(fetcher.mock.calls[0][0])).toContain(
    "routing.openstreetmap.de/routed-foot/route/v1/foot/-46.63,-23.55;-46.64,-23.56",
  );
  expect(result.distanceM).toBe(1400);
  expect(result.points[1]).toEqual({ lat: -23.558, lon: -46.635 });
  expect(walkingInstruction(result.steps[0])).toMatch(
    /esquerda.*Rua São Bento/,
  );
  await routeWalking(from, to, new AbortController().signal);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each(["NoRoute", "malformed"])(
  "recusa %s sem inventar caminho",
  async (kind) => {
    const { routeWalking } = await import("../src/features/walking/client");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          kind === "NoRoute"
            ? { code: "NoRoute" }
            : { code: "Ok", routes: [{ geometry: {} }] },
      }),
    );
    await expect(
      routeWalking(from, to, new AbortController().signal),
    ).rejects.toThrow();
  },
);
it("espaça pedidos e cancela trabalho na fila antes de enviar coordenadas", async () => {
  const { routeWalking } = await import("../src/features/walking/client");
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => response });
  vi.stubGlobal("fetch", fetcher);
  await routeWalking(from, to, new AbortController().signal);
  const controller = new AbortController();
  const pending = routeWalking(to, from, controller.signal);
  const rejected = expect(pending).rejects.toMatchObject({
    name: "AbortError",
  });
  await vi.advanceTimersByTimeAsync(1000);
  expect(fetcher).toHaveBeenCalledTimes(1);
  controller.abort();
  await rejected;
  await vi.advanceTimersByTimeAsync(2000);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const next = routeWalking(to, from, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(1100);
  await next;
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("limita a espera e não envia pontos inválidos", async () => {
  const { routeWalking } = await import("../src/features/walking/client");
  const fetcher = vi.fn(
    (_url, init) =>
      new Promise((_resolve, reject) =>
        init.signal.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        ),
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  await expect(
    routeWalking({ lat: NaN, lon: 0 }, to, new AbortController().signal),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  const timed = routeWalking(from, to, new AbortController().signal);
  const checked = expect(timed).rejects.toThrow(/demorou/);
  await vi.advanceTimersByTimeAsync(25000);
  await checked;
});
