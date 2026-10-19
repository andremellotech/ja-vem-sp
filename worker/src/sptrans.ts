import {
  ApiError,
  type Line,
  type Stop,
  type Vehicle,
  type Arrival,
  type Result,
} from "../../src/contracts";
const BASE = "https://api.olhovivo.sptrans.com.br/v2.1";
type Row = Record<string, any>;
const array = (x: unknown): Row[] =>
  Array.isArray(x) ? x.filter((v) => v && typeof v === "object") : [];
const coord = (r: Row) =>
  typeof r.py === "number" &&
  typeof r.px === "number" &&
  Number.isFinite(r.py) &&
  Number.isFinite(r.px) &&
  Math.abs(r.py) <= 90 &&
  Math.abs(r.px) <= 180;
const date = (v: unknown): string | null =>
  typeof v === "string" && Number.isFinite(Date.parse(v))
    ? new Date(v).toISOString()
    : null;
function wrap<T>(data: T, dates: (string | null)[] = []): Result<T> {
  const valid = dates.filter((v): v is string => v !== null).sort();
  return {
    data,
    source: "SPTrans",
    fetchedAt: new Date().toISOString(),
    observedAt: valid.length ? valid[0] : null,
  };
}
export function createSptrans(token: string, fetcher: typeof fetch = fetch) {
  let cookie = "",
    authenticatedAt = 0,
    authPromise: Promise<void> | undefined;
  async function send(path: string, init: RequestInit = {}): Promise<Response> {
    try {
      return await fetcher(BASE + path, {
        ...init,
        signal: AbortSignal.timeout(12000),
        redirect: "error",
      });
    } catch {
      throw new ApiError(
        "PROVIDER_UNAVAILABLE",
        502,
        "A SPTrans não respondeu. Tente novamente.",
      );
    }
  }
  async function authenticate() {
    if (authPromise) return authPromise;
    authPromise = (async () => {
      const r = await send(
        "/Login/Autenticar?token=" + encodeURIComponent(token),
        { method: "POST" },
      );
      if (!r.ok)
        throw new ApiError(
          "PROVIDER_UNAVAILABLE",
          502,
          "Não foi possível autenticar na SPTrans.",
        );
      let ok = false;
      try {
        ok = (await r.json()) === true;
      } catch {}
      const headers = r.headers as Headers & { getSetCookie?: () => string[] };
      const values = headers.getSetCookie?.() ?? [
        headers.get("set-cookie") || "",
      ];
      const next = values
        .map((s) => s.split(";")[0])
        .filter(Boolean)
        .join("; ");
      if (!ok || !next)
        throw new ApiError(
          "PROVIDER_UNAVAILABLE",
          502,
          "Não foi possível autenticar na SPTrans.",
        );
      cookie = next;
      authenticatedAt = Date.now();
    })();
    try {
      await authPromise;
    } finally {
      authPromise = undefined;
    }
  }
  async function query(path: string): Promise<any> {
    if (!cookie || Date.now() - authenticatedAt > 15 * 60 * 1000)
      await authenticate();
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await send(path, {
        headers: { Cookie: cookie, Accept: "application/json" },
      });
      if ((r.status === 401 || r.status === 403) && attempt === 0) {
        cookie = "";
        await authenticate();
        continue;
      }
      if (!r.ok)
        throw new ApiError(
          "PROVIDER_UNAVAILABLE",
          502,
          "A consulta à SPTrans está indisponível.",
        );
      try {
        const data = await r.json();
        if (data === false || data === null) throw Error();
        return data;
      } catch {
        throw new ApiError(
          "PROVIDER_UNAVAILABLE",
          502,
          "A SPTrans retornou uma resposta inválida.",
        );
      }
    }
    throw new ApiError(
      "PROVIDER_UNAVAILABLE",
      502,
      "A consulta à SPTrans está indisponível.",
    );
  }
  return {
    async searchLines(q: string): Promise<Result<Line[]>> {
      const rows = array(
        await query("/Linha/Buscar?termosBusca=" + encodeURIComponent(q)),
      );
      return wrap(
        rows
          .filter((r) => Number.isInteger(r.cl) && (r.sl === 1 || r.sl === 2))
          .map((r) => ({
            id: String(r.cl),
            code: String(r.lt) + "-" + String(r.tl).padStart(2, "0"),
            name: String(r.tp || "") + " ↔ " + String(r.ts || ""),
            direction: r.sl,
            origin: String((r.sl === 1 ? r.ts : r.tp) || ""),
            destination: String((r.sl === 1 ? r.tp : r.ts) || ""),
          })),
      );
    },
    async getStops(id: string): Promise<Result<Stop[]>> {
      const rows = array(
        await query("/Parada/BuscarParadasPorLinha?codigoLinha=" + id),
      );
      return wrap(
        rows
          .filter((r) => coord(r) && r.cp != null)
          .map((r) => ({
            id: String(r.cp),
            name: String(r.np || ""),
            lat: r.py,
            lon: r.px,
          })),
      );
    },
    async getVehicles(id: string): Promise<Result<Vehicle[]>> {
      const r = await query("/Posicao/Linha?codigoLinha=" + id);
      const data = array(r.vs)
        .filter(coord)
        .map((v) => ({
          id: String(v.p),
          lat: v.py,
          lon: v.px,
          observedAt: date(v.ta),
          accessible: v.a === true,
        }));
      return wrap(
        data,
        data.map((v) => v.observedAt),
      );
    },
    async getArrivals(id: string, lineId?: string): Promise<Result<Arrival[]>> {
      const r = await query("/Previsao/Parada?codigoParada=" + id);
      const data: Arrival[] = array(r.p?.l)
        .filter((l) => !lineId || String(l.cl) === lineId)
        .flatMap((l) =>
          array(l.vs).map((v) => ({
            lineId: String(l.cl),
            stopId: id,
            lineCode: String(l.c || ""),
            vehicleId: String(v.p),
            expectedAt: null,
            expectedLocalTime:
              typeof v.t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.t)
                ? v.t
                : null,
            kind: "realtime" as const,
            observedAt: date(v.ta),
          })),
        );
      return wrap(
        data,
        data.map((v) => v.observedAt),
      );
    },
  };
}
