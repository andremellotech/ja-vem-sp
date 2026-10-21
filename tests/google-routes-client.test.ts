import { afterEach, expect, it, vi } from "vitest";
import { fetchGoogleRoutes } from "../src/features/google-routes/client";
import { googleFixture } from "./google-routes-fixture";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const input = {
  origin: { lat: -23.55, lon: -46.63 },
  destination: { lat: -23.59, lon: -46.67 },
  mode: "transit" as const,
  preference: "rail" as const,
};
it("envia apenas coordenadas e critérios via POST e recebe o contrato direto", async () => {
  const fetcher = vi.fn(async () => Response.json(googleFixture));
  vi.stubGlobal("fetch", fetcher);
  expect(
    await fetchGoogleRoutes(
      "https://api.test/",
      input,
      new AbortController().signal,
    ),
  ).toEqual(googleFixture);
  expect(fetcher.mock.calls[0]).toEqual([
    "https://api.test/api/google/routes",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    }),
  ]);
});
it.each(["invalid", "rate", "unconfigured"])(
  "mantém erro seguro para %s",
  async (kind) => {
    vi.stubGlobal("fetch", async () =>
      kind === "invalid"
        ? Response.json({ data: googleFixture })
        : new Response("segredo", { status: kind === "rate" ? 429 : 503 }),
    );
    await expect(
      fetchGoogleRoutes(
        "https://api.test",
        input,
        new AbortController().signal,
      ),
    ).rejects.toThrow(
      kind === "rate"
        ? /Aguarde um minuto/
        : kind === "unconfigured"
          ? /indisponível ou ainda não configurado/
          : /Não foi possível consultar/,
    );
  },
);
it("aborta o transporte em 12s e permite nova tentativa", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    (_u: string, init: RequestInit) =>
      new Promise((_r, reject) =>
        init.signal!.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        ),
      ),
  );
  const failed = expect(
    fetchGoogleRoutes("https://api.test", input, new AbortController().signal),
  ).rejects.toThrow(/demorou demais/);
  await vi.advanceTimersByTimeAsync(12000);
  await failed;
  vi.stubGlobal("fetch", async () => Response.json(googleFixture));
  expect(
    await fetchGoogleRoutes(
      "https://api.test",
      input,
      new AbortController().signal,
    ),
  ).toEqual(googleFixture);
});
it("rejeita pontos inválidos antes de enviar e oculta corpo de erro não confiável", async () => {
  const f = vi.fn(async () =>
    Response.json(
      { error: { code: "BAD", message: "segredo do provedor" } },
      { status: 500 },
    ),
  );
  vi.stubGlobal("fetch", f);
  await expect(
    fetchGoogleRoutes(
      "https://api.test",
      { ...input, origin: { lat: NaN, lon: 0 } },
      new AbortController().signal,
    ),
  ).rejects.toThrow(/Confirme/);
  expect(f).not.toHaveBeenCalled();
  await expect(
    fetchGoogleRoutes("https://api.test", input, new AbortController().signal),
  ).rejects.toThrow(
    "Não foi possível consultar os trajetos Google. Tente novamente.",
  );
});
