import { afterEach, expect, it, vi } from "vitest";
import { searchAddresses } from "../src/features/journey/geocoder";

function feature(
  id: number,
  fields: Record<string, unknown> = {},
  coordinates = [-46.65, -23.56],
) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates },
    properties: {
      osm_type: "N",
      osm_id: id,
      street: "Rua dos Campos",
      city: "São Paulo",
      state: "São Paulo",
      countrycode: "BR",
      district: "Centro",
      locality: "Vila Central",
      type: "street",
      ...fields,
    },
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("busca também a rua sem número e encontra a capital quando só há número exato em outra cidade", async () => {
  const fetcher = vi.fn(async (url: string) =>
    Response.json({
      features: new URL(url).searchParams.get("q")!.includes("1058")
        ? [
            feature(
              1,
              { city: "Ribeirão Preto", housenumber: "1058", type: "house" },
              [-47.81, -21.17],
            ),
          ]
        : [
            feature(2, {
              district: "Campo Belo",
              locality: "Brooklin Velho",
              postcode: "04556-500",
            }),
          ],
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const places = await searchAddresses("Rua dos Campos,1058");
  expect(places).toHaveLength(1);
  expect(places[0].label).toContain("Brooklin Velho");
  expect(places[0].approximate).toBe(true);
  expect(
    fetcher.mock.calls.map(([url]) => new URL(url).searchParams.get("q")),
  ).toEqual(["Rua dos Campos,1058", "Rua dos Campos"]);
  expect(
    fetcher.mock.calls.every(([url]) => new URL(url).searchParams.has("bbox")),
  ).toBe(true);
});
it("preserva bairros e localidades diferentes e dá diversidade antes de repetir o mesmo bairro", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      features: [
        ...Array.from({ length: 8 }, (_, i) =>
          feature(i + 1, { housenumber: String(i + 1), type: "house" }),
        ),
        ...Array.from({ length: 8 }, (_, i) =>
          feature(100 + i, {
            district: "Distrito " + i,
            locality: "Bairro " + i,
            postcode: "01000-00" + i,
          }),
        ),
      ],
    }),
  );
  const places = await searchAddresses("Rua dos Campos");
  expect(places.length).toBeGreaterThan(6);
  expect(places.length).toBeLessThanOrEqual(12);
  for (let i = 0; i < 8; i++)
    expect(
      places.slice(0, 9).some((p) => p.label.includes("Bairro " + i)),
    ).toBe(true);
});
it("prioriza o bairro informado e não considera outro bairro como endereço confirmado", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      features: [
        feature(1, {
          district: "Vila Antiga",
          housenumber: "42",
          type: "house",
        }),
        feature(2, { district: "Vila Nova", housenumber: "42", type: "house" }),
      ],
    }),
  );
  const places = await searchAddresses("Rua dos Campos, 42, Vila Nova");
  expect(places[0].label).toContain("Vila Nova");
  expect(places[0].approximate).toBe(false);
  expect(places.find((p) => p.id === "N:1")?.approximate).toBe(true);
});
it("amplia para outras cidades por escolha explícita e marca o município fora da cobertura SPTrans", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      features: [
        feature(
          1,
          { city: "Ribeirão Preto", housenumber: "42", type: "house" },
          [-47.81, -21.17],
        ),
      ],
    }),
  );
  const places = await searchAddresses(
    "Rua dos Campos, 42, Ribeirão Preto",
    undefined,
    "https://photon.test/api/",
    "all",
  );
  expect(places[0]).toMatchObject({
    city: "Ribeirão Preto",
    outsideCoverage: true,
  });
});
it.each(["Rua 25 de Março, 42", "Rua 25 de Março 42"])(
  "preserva números que fazem parte do nome da rua: %s",
  async (query) => {
    const fetcher = vi.fn(async (_url: string) =>
      Response.json({ features: [] }),
    );
    vi.stubGlobal("fetch", fetcher);
    await searchAddresses(query);
    expect(
      fetcher.mock.calls.map(([url]) => new URL(url).searchParams.get("q")),
    ).toContain("Rua 25 de Março");
  },
);
it("não interpreta o nome Rua 7 como número do imóvel", async () => {
  const fetcher = vi.fn(async () =>
    Response.json({ features: [feature(1, { street: "Rua 7" })] }),
  );
  vi.stubGlobal("fetch", fetcher);
  await searchAddresses("Rua 7");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("aproveita resultados válidos se uma das duas consultas falhar", async () => {
  vi.stubGlobal("fetch", async (url: string) =>
    new URL(url).searchParams.get("q")!.includes("42")
      ? new Response("bad", { status: 503 })
      : Response.json({ features: [feature(2)] }),
  );
  const places = await searchAddresses("Rua dos Campos, 42");
  expect(places).toHaveLength(1);
  expect(places[0].approximate).toBe(true);
});
it("não funde pontos homônimos distantes quando o bairro não é conhecido", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      features: [
        feature(1, { district: "", locality: "" }),
        feature(2, { district: "", locality: "" }, [-46.75, -23.6]),
      ],
    }),
  );
  const places = await searchAddresses("Rua dos Campos");
  expect(places).toHaveLength(2);
  expect(new Set(places.map((p) => p.label)).size).toBe(2);
});
it("agrupa fragmentos da mesma rua e CEP sem ocultar outro bairro", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      features: [
        feature(1, { postcode: "01000-000" }),
        feature(2, { postcode: "01000-000" }, [-46.651, -23.56]),
        feature(
          3,
          { district: "Outro bairro", postcode: "02000-000" },
          [-46.75, -23.6],
        ),
      ],
    }),
  );
  const places = await searchAddresses("Rua dos Campos");
  expect(places).toHaveLength(2);
  expect(places.some((place) => place.label.includes("Outro bairro"))).toBe(
    true,
  );
});
it("preserva homônimos distantes mesmo quando o cadastro informa o mesmo bairro e CEP", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      features: [
        feature(1, { postcode: "01000-000" }),
        feature(2, { postcode: "01000-000" }, [-46.75, -23.6]),
      ],
    }),
  );
  expect(await searchAddresses("Rua dos Campos")).toHaveLength(2);
});
it("mantém rótulos distinguíveis mesmo para homônimos à mesma distância do centro", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      features: [
        feature(1, { district: "", locality: "" }, [-46.6333, -23.56]),
        feature(2, { district: "", locality: "" }, [-46.6333, -23.541]),
      ],
    }),
  );
  const places = await searchAddresses("Rua dos Campos");
  expect(places).toHaveLength(2);
  expect(new Set(places.map((p) => p.label)).size).toBe(2);
});
it("não confirma um bairro apenas porque seu nome é prefixo de outro", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      features: [
        feature(1, {
          district: "Vila Nova Cachoeirinha",
          locality: "",
          housenumber: "42",
          type: "house",
        }),
      ],
    }),
  );
  expect(
    (await searchAddresses("Rua dos Campos, 42, Vila Nova"))[0].approximate,
  ).toBe(true);
});
it("mantém respostas úteis no timeout de uma consulta complementar e cancela os dois pedidos", async () => {
  vi.useFakeTimers();
  const signals: AbortSignal[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    signals.push(init.signal!);
    return new URL(url).searchParams.get("q")!.includes("42")
      ? Response.json({
          features: [feature(1, { housenumber: "42", type: "house" })],
        })
      : new Promise<Response>(() => {});
  });
  const pending = searchAddresses("Rua dos Campos, 42");
  await vi.advanceTimersByTimeAsync(12000);
  expect((await pending)[0].id).toBe("N:1");
  expect(signals).toHaveLength(2);
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  const controller = new AbortController();
  const canceled = searchAddresses("Rua dos Campos, 42", controller.signal);
  const checked = expect(canceled).rejects.toMatchObject({
    name: "AbortError",
  });
  controller.abort();
  await checked;
});
it("não transforma falha da consulta complementar em ausência de endereço", async () => {
  vi.stubGlobal("fetch", async (url: string) =>
    new URL(url).searchParams.get("q")!.includes("42")
      ? Response.json({ features: [] })
      : new Response("bad", { status: 503 }),
  );
  await expect(searchAddresses("Rua dos Campos, 42")).rejects.toMatchObject({
    code: "UNAVAILABLE",
  });
});
it.each(["Rua dos Campos, 42 - Vila Nova", "Rua dos Campos, 42 Vila Nova"])(
  "preserva bairro no mesmo segmento do número: %s",
  async (query) => {
    const fetcher = vi.fn(async (_url: string) =>
      Response.json({
        features: [
          feature(1, { district: "Centro", housenumber: "42", type: "house" }),
        ],
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    expect((await searchAddresses(query))[0].approximate).toBe(true);
    expect(
      fetcher.mock.calls.map(([url]) => new URL(url).searchParams.get("q")),
    ).toContain("Rua dos Campos, Vila Nova");
  },
);
it.each([
  "Rua dos Campos, 01000-000",
  "Rua dos Campos, 01000000",
  "Rua dos Campos 01000-000",
])("não interpreta CEP como número do imóvel: %s", async (query) => {
  const fetcher = vi.fn(async (_url: string) =>
    Response.json({
      features: [
        feature(1, {
          housenumber: "01000",
          postcode: "99999-999",
          type: "house",
        }),
      ],
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  expect((await searchAddresses(query))[0].approximate).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("não usa o estado São Paulo para confirmar um endereço na capital", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      features: [
        feature(1, { city: "Osasco", housenumber: "42", type: "house" }),
      ],
    }),
  );
  expect(
    (await searchAddresses("Rua dos Campos, 42, São Paulo"))[0].approximate,
  ).toBe(true);
});
it("mantém erro de timeout quando a resposta parcial não contém endereços utilizáveis", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", async (url: string) =>
    new URL(url).searchParams.get("q")!.includes("42")
      ? Response.json({ features: [feature(1, { street: "", name: "" })] })
      : new Promise<Response>(() => {}),
  );
  const pending = searchAddresses("Rua dos Campos, 42");
  const checked = expect(pending).rejects.toMatchObject({ code: "TIMEOUT" });
  await vi.advanceTimersByTimeAsync(12000);
  await checked;
});
