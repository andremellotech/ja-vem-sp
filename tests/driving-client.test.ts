import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { walkingInstruction } from "../src/features/walking/instructions";
const a = { lat: -23.55, lon: -46.63 },
  b = { lat: -23.56, lon: -46.64 };
const body = {
  code: "Ok",
  routes: [
    {
      distance: 2400,
      duration: 540,
      geometry: {
        type: "LineString",
        coordinates: [
          [a.lon, a.lat],
          [b.lon, b.lat],
        ],
      },
      legs: [
        {
          steps: [
            {
              name: "Avenida Paulista",
              distance: 200,
              maneuver: { type: "depart" },
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
it.each([
  ["off ramp", "right", /saída à direita/],
  ["on ramp", "left", /acesso à esquerda/],
  ["continue", "uturn", /Faça o retorno/],
  ["unknown future type", "slight right", /levemente à direita/],
  ["roundabout turn", "left", /rotatória.*à esquerda/],
])(
  "preserva a manobra de carro %s e sua direção",
  (type, modifier, expected) => {
    expect(
      walkingInstruction(
        { type, modifier, name: "Rodovia dos Imigrantes", distanceM: 100 },
        "car",
      ),
    ).toMatch(expected);
  },
);
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("calcula carro pelo perfil de carro, com geometria e instruções sem dizer caminhada", async () => {
  const { routeDriving } = await import("../src/features/walking/client");
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => body });
  vi.stubGlobal("fetch", fetcher);
  const result = await routeDriving(a, b, new AbortController().signal);
  expect(String(fetcher.mock.calls[0][0])).toContain(
    "/routed-car/route/v1/driving/",
  );
  expect(result.durationS).toBe(540);
  expect(result.points.at(-1)).toEqual(b);
  expect(walkingInstruction(result.steps[0], "car")).toContain("Saia");
  expect(walkingInstruction(result.steps[0], "car")).not.toContain("caminhada");
  await routeDriving(a, b, new AbortController().signal);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("compartilha o limite de pedidos com a caminhada sem misturar o cache", async () => {
  const { routeDriving, routeWalking } =
    await import("../src/features/walking/client");
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => body });
  vi.stubGlobal("fetch", fetcher);
  await routeDriving(a, b, new AbortController().signal);
  const foot = routeWalking(a, b, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(1000);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(100);
  await foot;
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(String(fetcher.mock.calls[1][0])).toContain("/routed-foot/");
});
it("cancela carro na fila e recusa resposta de rota inválida", async () => {
  const { routeDriving } = await import("../src/features/walking/client");
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => body });
  vi.stubGlobal("fetch", fetcher);
  await routeDriving(a, b, new AbortController().signal);
  const c = new AbortController();
  const pending = routeDriving(b, a, c.signal);
  const checked = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  c.abort();
  await checked;
  expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockResolvedValue({
    ok: true,
    json: async () => ({ code: "NoRoute" }),
  });
  const invalid = routeDriving(b, a, new AbortController().signal);
  const noRoute = expect(invalid).rejects.toThrow(/carro/);
  await vi.advanceTimersByTimeAsync(1100);
  await noRoute;
});
it("libera a fila quando o corpo da resposta ignora o timeout", async () => {
  const { routeDriving } = await import("../src/features/walking/client");
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: () => new Promise(() => {}) })
    .mockResolvedValue({ ok: true, json: async () => body });
  vi.stubGlobal("fetch", fetcher);
  let failure: unknown;
  const pending = routeDriving(a, b, new AbortController().signal).catch(
    (e) => {
      failure = e;
    },
  );
  await vi.advanceTimersByTimeAsync(25000);
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toMatch(/demorou/);
  await pending;
  await routeDriving(b, a, new AbortController().signal);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
