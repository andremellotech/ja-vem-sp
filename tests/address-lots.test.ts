import { afterEach, expect, it, vi } from "vitest";
import { searchAddressLots } from "../src/features/journey/address-lots";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const lot = {
  id: "geosampa:lote.1",
  label: "AV PAULISTA, 1578 · São Paulo · GeoSampa",
  source: "geosampa",
  approximate: true,
  lat: -23.5614,
  lon: -46.6559,
  boundary: [
    { lat: -23.5614, lon: -46.6559 },
    { lat: -23.5615, lon: -46.6558 },
    { lat: -23.5616, lon: -46.6557 },
    { lat: -23.5614, lon: -46.6559 },
  ],
};
it("consulta o número sem vírgula e valida o lote municipal sem declarar a porta exata", async () => {
  const f = vi.fn(async (_input: string) => Response.json({ data: [lot] }));
  vi.stubGlobal("fetch", f);
  const result = await searchAddressLots(
    "Av. Paulista 1578",
    new AbortController().signal,
    "https://api.example",
  );
  expect(result[0]).toMatchObject({
    id: lot.id,
    source: "geosampa",
    approximate: true,
  });
  const url = new URL(String(f.mock.calls[0][0]));
  expect(url.pathname).toBe("/api/addresses");
  expect(url.searchParams.get("street")).toBe("Av. Paulista");
  expect(url.searchParams.get("number")).toBe("1578");
});
it("não consulta sem número nem API configurada", async () => {
  const f = vi.fn();
  vi.stubGlobal("fetch", f);
  expect(
    await searchAddressLots(
      "Paulista",
      new AbortController().signal,
      "https://api.example",
    ),
  ).toEqual([]);
  expect(
    await searchAddressLots("Paulista 1578", new AbortController().signal, ""),
  ).toEqual([]);
  expect(f).not.toHaveBeenCalled();
});
it("não descarta bairro, CEP ou outro município para buscar um homônimo na capital", async () => {
  const f = vi.fn(async () => Response.json({ data: [lot] }));
  vi.stubGlobal("fetch", f);
  for (const q of [
    "Rua Exemplo 1058, Vila Nova",
    "Rua Exemplo 1058, Santo André",
    "Rua Exemplo 1058, 09105-190",
  ])
    expect(
      await searchAddressLots(
        q,
        new AbortController().signal,
        "https://api.example",
      ),
    ).toEqual([]);
  expect(f).not.toHaveBeenCalled();
});
it("recusa coordenadas ou geometria inválida na resposta", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      data: [
        { ...lot, lat: 1000 },
        { ...lot, boundary: [{ lat: NaN, lon: 0 }] },
      ],
    }),
  );
  expect(
    await searchAddressLots(
      "Av Paulista 1578",
      new AbortController().signal,
      "https://api.example",
    ),
  ).toEqual([]);
});
it("cancela uma resposta tardia e limita o tempo da consulta", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", () => new Promise<Response>(() => {}));
  const pending = searchAddressLots(
    "Av Paulista 1578",
    new AbortController().signal,
    "https://api.example",
  );
  const assertion = expect(pending).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(12001);
  await assertion;
});
