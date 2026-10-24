import { ApiError } from "../../src/contracts";
import { createSptrans } from "./sptrans";
import { findAddressLots, validAddressQuery } from "./geosampa";
const clients = new WeakMap<
  typeof fetch,
  { token: string; api: ReturnType<typeof createSptrans> }
>();
function getClient(token: string, fetcher: typeof fetch) {
  let entry = clients.get(fetcher);
  if (!entry || entry.token !== token) {
    entry = { token, api: createSptrans(token, fetcher) };
    clients.set(fetcher, entry);
  }
  return entry.api;
}
export interface Env {
  SPTRANS_TOKEN?: string;
  ALLOWED_ORIGIN: string;
  RATE_LIMITER?: {
    limit(input: { key: string }): Promise<{ success: boolean }>;
  };
}
export async function handleRequest(
  request: Request,
  env: Env,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const origin = request.headers.get("Origin");
  const allowed = origin === env.ALLOWED_ORIGIN;
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    Vary: "Origin",
    "X-Content-Type-Options": "nosniff",
  };
  if (allowed) {
    headers["Access-Control-Allow-Origin"] = env.ALLOWED_ORIGIN;
    headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
  }
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers });
  if (origin && !allowed)
    return json(
      { error: { code: "FORBIDDEN", message: "Origem não permitida." } },
      403,
    );
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (request.method !== "GET")
    return json(
      {
        error: { code: "METHOD_NOT_ALLOWED", message: "Método não permitido." },
      },
      405,
    );
  const url = new URL(request.url),
    p = url.pathname;
  if (p === "/api/health")
    return json({
      configured: !!env.SPTRANS_TOKEN,
      source: "SPTrans",
      rateLimited: !!env.RATE_LIMITER,
    });
  if (p === "/api/addresses") {
    const street = (url.searchParams.get("street") ?? "").trim(),
      number = (url.searchParams.get("number") ?? "").trim();
    if (!validAddressQuery(street, number))
      return json(
        {
          error: {
            code: "INVALID_REQUEST",
            message:
              "Informe rua e número para consultar o cadastro municipal.",
          },
        },
        400,
      );
    try {
      if (
        env.RATE_LIMITER &&
        !(
          await env.RATE_LIMITER.limit({
            key: request.headers.get("CF-Connecting-IP") || "unknown",
          })
        ).success
      )
        return json(
          {
            error: {
              code: "RATE_LIMITED",
              message: "Muitas consultas. Aguarde um instante.",
            },
          },
          429,
        );
      return json({
        data: await findAddressLots(street, number, fetcher),
        source: "GeoSampa",
      });
    } catch (e) {
      return json(
        {
          error: {
            code: "ADDRESS_UNAVAILABLE",
            message:
              "Não foi possível consultar os números do GeoSampa. Marque a entrada no mapa.",
          },
        },
        502,
      );
    }
  }
  const line = p.match(/^\/api\/lines\/([^/]+)\/(stops|vehicles)$/),
    stop = p.match(/^\/api\/stops\/([^/]+)\/arrivals$/);
  if (p !== "/api/lines" && p !== "/api/stops" && !line && !stop)
    return json(
      { error: { code: "NOT_FOUND", message: "Recurso não encontrado." } },
      404,
    );
  const validId = (v: string | null) => v !== null && /^\d{1,10}$/.test(v);
  const q = (url.searchParams.get("q") || "").trim(),
    filter = url.searchParams.get("lineId");
  if (
    ((p === "/api/lines" || p === "/api/stops") && (!q || q.length > 100)) ||
    (line && !validId(line[1])) ||
    (stop && !validId(stop[1])) ||
    (filter !== null && !validId(filter))
  )
    return json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "Confira os dados da consulta.",
        },
      },
      400,
    );
  if (!env.SPTRANS_TOKEN)
    return json(
      {
        error: {
          code: "NOT_CONFIGURED",
          message: "A conexão com a SPTrans ainda não foi configurada.",
        },
      },
      503,
    );
  try {
    if (env.RATE_LIMITER) {
      const { success } = await env.RATE_LIMITER.limit({
        key: request.headers.get("CF-Connecting-IP") || "unknown",
      });
      if (!success)
        return json(
          {
            error: {
              code: "RATE_LIMITED",
              message: "Muitas consultas. Aguarde um instante.",
            },
          },
          429,
        );
    }
    const api = getClient(env.SPTRANS_TOKEN, fetcher);
    if (p === "/api/lines") return json(await api.searchLines(q));
    if (p === "/api/stops") return json(await api.searchStops(q));
    if (line)
      return json(
        line[2] === "stops"
          ? await api.getStops(line[1])
          : await api.getVehicles(line[1]),
      );
    return json(await api.getArrivals(stop![1], filter || undefined));
  } catch (e) {
    if (e instanceof ApiError)
      return json({ error: { code: e.code, message: e.message } }, e.status);
    return json(
      {
        error: {
          code: "PROVIDER_UNAVAILABLE",
          message: "Não foi possível consultar o serviço.",
        },
      },
      502,
    );
  }
}
export default {
  fetch(request: Request, env: Env) {
    return handleRequest(request, env);
  },
};
