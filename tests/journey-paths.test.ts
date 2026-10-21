import { afterEach, expect, it, vi } from "vitest";
import { loadLegPath, decodePolyline } from "../src/features/journey/paths";
import { findJourneys } from "../src/features/journey/router";
import { createPlannerIndex } from "../src/features/journey/data";
import { fixture, hash, networkStops } from "./planner-fixtures";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.history.replaceState({}, "", "/");
  vi.resetModules();
});
it("carrega geometrias sob o subdiretório do GitHub Pages", async () => {
  vi.stubEnv("BASE_URL", "./");
  window.history.replaceState({}, "", "/ja-vem-sp/");
  const { loadLegPath: fresh } = await import("../src/features/journey/paths");
  const fetcher = vi.fn().mockResolvedValue({ ok: false });
  vi.stubGlobal("fetch", fetcher);
  await fresh(leg(), new AbortController().signal);
  expect(new URL(String(fetcher.mock.calls[0][0])).pathname).toBe(
    "/ja-vem-sp/data/paths/11.json",
  );
});
const leg = () =>
  findJourneys(createPlannerIndex(fixture(), networkStops), {
    origin: networkStops[0],
    destination: networkStops[2],
    radiusM: 800,
    serviceDate: "20261021",
  }).options[0].legs[0];
const encoded = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";
it("decodifica coordenadas e rejeita dados truncados", () => {
  expect(decodePolyline(encoded)).toEqual([
    { lat: 38.5, lon: -120.2 },
    { lat: 40.7, lon: -120.95 },
    { lat: 43.252, lon: -126.453 },
  ]);
  expect(() => decodePolyline("_p~iF")).toThrow();
});
it("carrega só o bucket da viagem e recorta o trecho de embarque até desembarque", async () => {
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      version: 1,
      provenance: { sha256: hash },
      paths: { direct: { polyline: encoded, stopIndices: [0, 1, 2] } },
    }),
  });
  vi.stubGlobal("fetch", fetcher);
  const result = await loadLegPath(
    { ...leg(), fromIndex: 1 },
    new AbortController().signal,
  );
  expect(result?.points).toEqual([
    { lat: 40.7, lon: -120.95 },
    { lat: 43.252, lon: -126.453 },
  ]);
  expect(String(fetcher.mock.calls[0][0])).toMatch(/data\/paths\/11\.json$/);
});
it.each(["hash", "null", "reverse"])(
  "não desenha geometria inconsistente: %s",
  async (kind) => {
    const { loadLegPath: fresh } =
      await import("../src/features/journey/paths");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          version: 1,
          provenance: { sha256: kind === "hash" ? "b".repeat(64) : hash },
          paths: {
            direct: {
              polyline: encoded,
              stopIndices:
                kind === "null"
                  ? [null, 1, 2]
                  : kind === "reverse"
                    ? [2, 1, 0]
                    : [0, 1, 2],
            },
          },
        }),
      }),
    );
    expect(await fresh(leg(), new AbortController().signal)).toBeNull();
  },
);
it("libera a interface se o arquivo de geometria não responder", async () => {
  vi.useFakeTimers();
  try {
    const { loadLegPath: fresh } =
      await import("../src/features/journey/paths");
    vi.stubGlobal(
      "fetch",
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) =>
          init.signal!.addEventListener("abort", () =>
            reject(new DOMException("Cancelado", "AbortError")),
          ),
        ),
    );
    let settled = false;
    const pending = fresh(
      { ...leg(), tripId: "stalled" },
      new AbortController().signal,
    ).then((result) => {
      settled = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(15000);
    expect(settled).toBe(true);
    expect(await pending).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});
