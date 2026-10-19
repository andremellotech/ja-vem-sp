import { describe, it, expect, vi } from "vitest";
import worker, { handleRequest } from "../src/index";
import { createSptrans } from "../src/sptrans";
const env = {
  SPTRANS_TOKEN: "secret-fixture",
  ALLOWED_ORIGIN: "https://example.github.io",
};
const req = (path: string, origin = env.ALLOWED_ORIGIN) =>
  new Request("https://api.example" + path, { headers: { Origin: origin } });
const cookieHeaders = {
  "Set-Cookie": "session=fixture; Path=/; Secure; HttpOnly",
};
describe("API de transporte", () => {
  it("consulta com política de redirecionamento compatível com Workers", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.redirect === "error") throw new TypeError("Unsupported redirect mode");
      return String(input).includes("Autenticar")
        ? new Response("true", { headers: cookieHeaders })
        : Response.json([]);
    });
    const response = await handleRequest(req("/api/lines?q=8000"), env, fetcher as typeof fetch);
    expect(response.status).toBe(200);
    expect(fetcher.mock.calls.every(([, init]) => init?.redirect === "manual")).toBe(true);
  });
  it("recusa redirecionamento sem enviar credenciais a outro destino", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, {
      status: 302,
      headers: { Location: "https://other.example/" },
    }));
    await expect(createSptrans("secret", fetcher as typeof fetch).searchLines("8000"))
      .rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
  });
  it("retorna configuração ausente sem expor segredo", async () => {
    const r = await handleRequest(req("/api/lines?q=Paulista"), {
      ALLOWED_ORIGIN: env.ALLOWED_ORIGIN,
    });
    expect(r.status).toBe(503);
    expect(await r.text()).toContain("NOT_CONFIGURED");
  });
  it("nega origem diferente", async () => {
    const r = await handleRequest(
      req("/api/lines?q=x", "https://evil.test"),
      env,
    );
    expect(r.status).toBe(403);
    expect(r.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });
  it("rejeita identificador inválido antes de consultar fornecedor", async () => {
    const f = vi.fn();
    const r = await handleRequest(req("/api/lines/nope/stops"), env, f);
    expect(r.status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });
  it("rejeita consultas vazias e caminhos desconhecidos", async () => {
    expect((await handleRequest(req("/api/lines?q="), env)).status).toBe(400);
    expect((await handleRequest(req("/api/unknown"), env)).status).toBe(404);
  });
  it("limita tráfego pelo binding", async () => {
    const r = await handleRequest(req("/api/lines?q=Paulista"), {
      ...env,
      RATE_LIMITER: { limit: async () => ({ success: false }) },
    });
    expect(r.status).toBe(429);
  });
  it("normaliza linhas e usa cookie no servidor", async () => {
    const calls: string[] = [];
    const f = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(String(input));
      if (String(input).includes("Autenticar"))
        return new Response("true", { headers: cookieHeaders });
      expect(new Headers(init?.headers).get("Cookie")).toBe("session=fixture");
      return Response.json([
        {
          cl: 198,
          lt: "675K",
          tl: 10,
          sl: 1,
          tp: "METRO SANTA CRUZ",
          ts: "JD ANGELA",
          lc: false,
          denominacao: "",
          lt0: "METRO SANTA CRUZ",
          lt1: "JD ANGELA",
        },
      ]);
    };
    const r = await handleRequest(
      req("/api/lines?q=675K"),
      env,
      f as typeof fetch,
    );
    const body = (await r.json()) as any;
    expect(r.status).toBe(200);
    expect(body.data[0]).toMatchObject({
      id: "198",
      code: "675K-10",
      direction: 1,
    });
    expect(JSON.stringify(body)).not.toContain("secret-fixture");
    expect(r.headers.has("set-cookie")).toBe(false);
    expect(calls).toHaveLength(2);
  });
  it("reautentica somente uma vez quando sessão expira", async () => {
    let auth = 0,
      queries = 0;
    const f = async (input: RequestInfo | URL) => {
      if (String(input).includes("Autenticar")) {
        auth++;
        return new Response("true", { headers: cookieHeaders });
      }
      queries++;
      return new Response("expired", { status: 401 });
    };
    const api = createSptrans("secret", f as typeof fetch);
    await expect(api.searchLines("x")).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
    });
    expect(auth).toBe(2);
    expect(queries).toBe(2);
  });
  it("não converte horário sem data em timestamp inventado", async () => {
    const f = async (input: RequestInfo | URL) =>
      String(input).includes("Autenticar")
        ? new Response("true", { headers: cookieHeaders })
        : Response.json({
            hr: "23:59",
            p: {
              cp: 1,
              l: [
                {
                  cl: 198,
                  c: "675K-10",
                  vs: [{ p: "123", t: "00:05", ta: "2026-10-20T02:59:00Z" }],
                },
              ],
            },
          });
    const api = createSptrans("secret", f as typeof fetch);
    const r = await api.getArrivals("1");
    expect(r.data[0]).toMatchObject({
      expectedAt: null,
      expectedLocalTime: "00:05",
      kind: "realtime",
    });
  });
  it("descarta coordenadas inválidas", async () => {
    const f = async (input: RequestInfo | URL) =>
      String(input).includes("Autenticar")
        ? new Response("true", { headers: cookieHeaders })
        : Response.json({
            vs: [
              { p: "1", py: 1000, px: -46 },
              { p: "2", py: -23.5, px: -46.6, ta: "2026-10-19T10:00:00Z" },
            ],
          });
    const r = await createSptrans("secret", f as typeof fetch).getVehicles("1");
    expect(r.data.map((v) => v.id)).toEqual(["2"]);
    expect(r.observedAt).toBe("2026-10-19T10:00:00.000Z");
  });
  it("transforma falha de rede em erro sem segredos", async () => {
    const f = async () => {
      throw Error("secret-fixture network");
    };
    const r = await handleRequest(
      req("/api/lines?q=Paulista"),
      env,
      f as typeof fetch,
    );
    expect(r.status).toBe(502);
    expect(await r.text()).not.toContain("secret-fixture");
  });
});
it("reutiliza sessão entre requisições do mesmo adaptador", async () => {
  let auth = 0;
  const f = async (input: RequestInfo | URL) => {
    if (String(input).includes("Autenticar")) {
      auth++;
      return new Response("true", { headers: cookieHeaders });
    }
    return Response.json([]);
  };
  await handleRequest(req("/api/lines?q=Centro"), env, f as typeof fetch);
  await handleRequest(req("/api/lines?q=Bairro"), env, f as typeof fetch);
  expect(auth).toBe(1);
});

it("aceita ExecutionContext do runtime sem usá-lo como fetch", async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL) =>
    String(input).includes("Autenticar")
      ? new Response("true", { headers: cookieHeaders })
      : Response.json([]),
  );
  vi.stubGlobal("fetch", fetcher);
  try {
    const response = await (worker.fetch as any)(
      req("/api/lines?q=Centro"),
      env,
      { waitUntil() {}, passThroughOnException() {} },
    );
    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
it("usa tp e ts oficiais para distinguir os sentidos", async () => {
  const f = async (input: RequestInfo | URL) =>
    String(input).includes("Autenticar")
      ? new Response("true", { headers: cookieHeaders })
      : Response.json([
          {
            cl: 1273,
            lt: "8000",
            tl: 10,
            sl: 1,
            tp: "PCA.RAMOS DE AZEVEDO",
            ts: "TERMINAL LAPA",
          },
          {
            cl: 34041,
            lt: "8000",
            tl: 10,
            sl: 2,
            tp: "PCA.RAMOS DE AZEVEDO",
            ts: "TERMINAL LAPA",
          },
        ]);
  const r = await createSptrans("secret", f as typeof fetch).searchLines(
    "8000",
  );
  expect(r.data[0]).toMatchObject({
    origin: "TERMINAL LAPA",
    destination: "PCA.RAMOS DE AZEVEDO",
  });
  expect(r.data[1]).toMatchObject({
    origin: "PCA.RAMOS DE AZEVEDO",
    destination: "TERMINAL LAPA",
  });
});
