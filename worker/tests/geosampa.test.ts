import { afterEach, expect, it, vi } from "vitest";
import { handleRequest } from "../src/index";
const env = { ALLOWED_ORIGIN: "https://andremellotech.github.io" };
const req = (street = "Avenida Paulista", number = "1578") =>
  new Request(
    "https://example.test/api/addresses?" +
      new URLSearchParams({ street, number }),
    { headers: { Origin: env.ALLOWED_ORIGIN } },
  );
const feature = (
  props = {},
  geometry: unknown = {
    type: "Polygon",
    coordinates: [
      [
        [-46.656, -23.562],
        [-46.655, -23.562],
        [-46.655, -23.561],
        [-46.656, -23.561],
        [-46.656, -23.562],
      ],
    ],
  },
) => ({
  id: "lote_cidadao.1",
  geometry,
  properties: {
    nm_logradouro_completo: "AV PAULISTA",
    cd_numero_porta: "1578",
    cd_logradouro: "156566",
    ...props,
  },
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("consulta somente o lote do nome e número pedidos, sem credencial SPTrans ou Google", async () => {
  const f = vi.fn(async (_input: RequestInfo | URL) =>
    Response.json({ features: [feature()] }),
  );
  const r = await handleRequest(req(), env, f);
  expect(r.status).toBe(200);
  const body = await r.json();
  expect(body.data).toHaveLength(1);
  expect(body.data[0]).toMatchObject({
    source: "geosampa",
    approximate: true,
    city: "São Paulo",
    label: expect.stringContaining("1578"),
  });
  expect(body.data[0].lat).toBeGreaterThan(-23.562);
  expect(body.data[0].lat).toBeLessThan(-23.561);
  expect(body.data[0].boundary).toHaveLength(5);
  const url = new URL(String(f.mock.calls[0][0]));
  expect(url.origin).toBe("https://wfs.geosampa.prefeitura.sp.gov.br");
  expect(url.searchParams.get("CQL_FILTER")).toContain(
    "cd_numero_porta = '1578'",
  );
  expect(url.searchParams.get("propertyName")).not.toContain("proprietario");
  expect(url.searchParams.get("CQL_FILTER")).toContain(
    "nm_logradouro_completo ILIKE 'AV PAULISTA'",
  );
  expect(url.searchParams.get("CQL_FILTER")).not.toContain("%");
  expect(r.headers.get("access-control-allow-origin")).toBe(env.ALLOWED_ORIGIN);
});
it("descarta outro número, nome ou tipo de via e não inventa correspondência", async () => {
  const f = vi.fn(async () =>
    Response.json({
      features: [
        feature({ cd_numero_porta: "1579" }),
        feature({ nm_logradouro_completo: "R PAULISTA" }),
        feature({ nm_logradouro_completo: "AV OUTRO NOME" }),
      ],
    }),
  );
  const r = await handleRequest(req(), env, f);
  expect((await r.json()).data).toEqual([]);
});
it("diferencia lotes homônimos e preserva todos os anéis e componentes do lote", async () => {
  const a = feature(),
    outer = (a.geometry as any).coordinates[0];
  const hole = [
    [-46.6558, -23.5618],
    [-46.6552, -23.5618],
    [-46.6552, -23.5612],
    [-46.6558, -23.5612],
    [-46.6558, -23.5618],
  ];
  const b = { ...feature(), id: "lote_cidadao.2" };
  const f = vi.fn(async () =>
    Response.json({
      features: [
        {
          ...a,
          geometry: {
            type: "MultiPolygon",
            coordinates: [
              [outer, hole],
              [outer.map((p: number[]) => [p[0] + 0.003, p[1]])],
            ],
          },
        },
        b,
      ],
    }),
  );
  const body = await (await handleRequest(req(), env, f)).json();
  expect(body.data).toHaveLength(2);
  expect(body.data[0].label).not.toBe(body.data[1].label);
  expect(body.data[0].lotPolygons).toHaveLength(2);
  expect(body.data[0].lotPolygons[0]).toHaveLength(2);
});
it.each([
  ["", "1578"],
  ["Avenida Paulista", ""],
  ["Avenida Paulista", "1' OR 1=1"],
  ["a".repeat(121), "1"],
])(
  "rejeita entrada inválida antes da consulta (%s, %s)",
  async (street, number) => {
    const f = vi.fn();
    expect((await handleRequest(req(street, number), env, f)).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  },
);
it("usa cache em memória e respeita limite de requisições", async () => {
  const f = vi.fn(async () => Response.json({ features: [feature()] }));
  await handleRequest(req(), env, f);
  await handleRequest(req(), env, f);
  expect(f).toHaveBeenCalledTimes(1);
  const r = await handleRequest(
    req(),
    { ...env, RATE_LIMITER: { limit: async () => ({ success: false }) } },
    f,
  );
  expect(r.status).toBe(429);
});
it("recusa origem externa e esconde detalhes de falha do fornecedor", async () => {
  const f = vi.fn(async () => {
    throw new Error("upstream-private-details");
  });
  const denied = new Request(req(), {
    headers: { Origin: "https://another.test" },
  });
  expect((await handleRequest(denied, env, f)).status).toBe(403);
  expect(f).not.toHaveBeenCalled();
  const r = await handleRequest(req(), env, f);
  expect(r.status).toBe(502);
  expect(await r.text()).not.toContain("upstream-private-details");
});
it("encerra timeout mesmo se o fornecedor ignora o cancelamento", async () => {
  vi.useFakeTimers();
  const f = vi.fn(() => new Promise<Response>(() => {}));
  const pending = handleRequest(req(), env, f);
  await vi.advanceTimersByTimeAsync(12001);
  expect((await pending).status).toBe(502);
});
