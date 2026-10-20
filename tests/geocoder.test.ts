import { afterEach, expect, it, vi } from "vitest";
import { searchAddresses } from "../src/features/journey/geocoder";
export const addressFeature = (overrides: Record<string, unknown> = {}) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [-46.651918, -23.5648865] },
  properties: {
    osm_type: "N",
    osm_id: 1,
    street: "Avenida Paulista",
    housenumber: "1000",
    city: "São Paulo",
    state: "São Paulo",
    countrycode: "BR",
    type: "house",
    ...overrides,
  },
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("pesquisa uma vez com consulta íntegra, deduplica e confirma o número", async () => {
  const fetcher = vi.fn(async (_input: string) =>
    Response.json({
      features: [
        addressFeature({ street: "Avenida São João", housenumber: "42" }),
        addressFeature({ street: "Avenida São João", housenumber: "42" }),
        {
          geometry: { type: "Point", coordinates: [999, 1000] },
          properties: {},
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const result = await searchAddresses("Av. São João, 42 & Praça");
  const url = new URL(fetcher.mock.calls[0][0] as string);
  expect(url.searchParams.getAll("q")).toHaveLength(1);
  expect(url.searchParams.get("q")).toContain("Av. São João, 42 & Praça");
  expect(url.searchParams.get("countrycode")).toBe("BR");
  expect(url.searchParams.get("limit")).toBe("6");
  expect(result).toHaveLength(1);
  expect(result[0].approximate).toBe(false);
  expect(result[0].label).toContain("42");
});
it("avisa quando o número não é confirmado, limita resultados e mantém texto seguro", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        features: Array.from({ length: 8 }, (_, i) =>
          addressFeature({
            osm_id: i + 1,
            street: "<img src=x onerror=alert(1)>",
            housenumber: String(50 + i),
          }),
        ),
      }),
    ),
  );
  const result = await searchAddresses("Rua Exemplo, 42");
  expect(result).toHaveLength(6);
  expect(result.every((r) => r.approximate)).toBe(true);
  expect(result[0].label).toContain("<img");
});
it("não envia busca inválida e diferencia vazio de indisponibilidade", async () => {
  const fetcher = vi.fn(async () => Response.json({ features: [] }));
  vi.stubGlobal("fetch", fetcher);
  await expect(searchAddresses("a")).rejects.toMatchObject({
    code: "INVALID_QUERY",
  });
  expect(fetcher).not.toHaveBeenCalled();
  expect(await searchAddresses("Paulista")).toEqual([]);
  vi.stubGlobal("fetch", async () => new Response("Bad", { status: 502 }));
  await expect(searchAddresses("Paulista")).rejects.toMatchObject({
    code: "UNAVAILABLE",
  });
  vi.stubGlobal("fetch", async () => Response.json({ wrong: [] }));
  await expect(searchAddresses("Paulista")).rejects.toMatchObject({
    code: "UNAVAILABLE",
  });
});
it("encerra consulta travada e respeita cancelamento externo", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", () => new Promise(() => {}));
  const pending = searchAddresses("Paulista");
  const failure = expect(pending).rejects.toMatchObject({ code: "TIMEOUT" });
  await vi.advanceTimersByTimeAsync(12000);
  await failure;
  const c = new AbortController();
  const canceled = searchAddresses("Paulista", c.signal);
  const aborted = expect(canceled).rejects.toMatchObject({
    name: "AbortError",
  });
  c.abort();
  await aborted;
});

it("marca como aproximado quando o número coincide mas o logradouro é outro", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      features: [
        addressFeature({ street: "Avenida Outra", housenumber: "42" }),
      ],
    }),
  );
  expect((await searchAddresses("Rua Procurada, 42"))[0].approximate).toBe(
    true,
  );
});
it("agrupa resultados com o mesmo endereço visível mesmo com identificadores e coordenadas diferentes", async () => {
  const second = addressFeature({ osm_id: 2 });
  second.geometry.coordinates = [-46.652, -23.565];
  vi.stubGlobal("fetch", async () =>
    Response.json({ features: [addressFeature(), second] }),
  );
  expect(await searchAddresses("Avenida Paulista, 1000")).toHaveLength(1);
});

it("preserva o nome do terminal ou local junto do endereço", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      features: [
        addressFeature({
          name: "Terminal Santana",
          street: "Rua Ezequiel Freire",
          housenumber: "",
        }),
      ],
    }),
  );
  const result = await searchAddresses("Terminal Santana");
  expect(result[0].label).toContain("Terminal Santana");
  expect(result[0].label).toContain("Rua Ezequiel Freire");
});
