import { afterEach, describe, expect, it, vi } from "vitest";
import { handleRequest, type Env } from "../src/index";

const payload = {
  origin: { lat: -23.55, lon: -46.63 },
  destination: { lat: -23.56, lon: -46.65 },
  mode: "walking",
  preference: "any",
};
const env: Env = {
  ALLOWED_ORIGIN: "https://site.example",
  GOOGLE_ROUTES_API_KEY: "fixture-secret",
  GOOGLE_RATE_LIMITER: { limit: async () => ({ success: true }) },
};
function request(
  body: unknown = payload,
  headers: Record<string, string> = {},
) {
  return new Request("https://api.example/api/google/routes", {
    method: "POST",
    headers: {
      Origin: env.ALLOWED_ORIGIN,
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
const noRoutes = (_input: RequestInfo | URL, _init?: RequestInit) =>
  Promise.resolve(Response.json({}));
const point = (latitude: number, longitude: number) => ({
  latLng: { latitude, longitude },
});
const routeFixture = {
  description: "Via estação",
  distanceMeters: 2000,
  duration: "901.5s",
  polyline: { encodedPolyline: "route-encoded" },
  warnings: ["Cuidado ao caminhar"],
  legs: [
    {
      steps: [
        {
          travelMode: "WALK",
          distanceMeters: 100,
          staticDuration: "90s",
          navigationInstruction: { instructions: "Siga <b>em frente</b>" },
          startLocation: point(-23.55, -46.63),
          endLocation: point(-23.551, -46.631),
          polyline: { encodedPolyline: "walk" },
        },
        {
          travelMode: "TRANSIT",
          distanceMeters: 900,
          staticDuration: "300s",
          transitDetails: {
            headsign: "Jabaquara",
            stopCount: 2,
            transitLine: {
              name: "Linha Azul",
              nameShort: "1",
              vehicle: { type: "SUBWAY" },
              agencies: [{ name: "Metrô", uri: "https://metro.example/" }],
            },
            stopDetails: {
              departureStop: { name: "Sé" },
              arrivalStop: { name: "Liberdade" },
              departureTime: "2026-10-20T12:00:00Z",
              arrivalTime: "2026-10-20T12:05:00Z",
            },
          },
        },
        {
          travelMode: "TRANSIT",
          transitDetails: {
            transitLine: {
              nameShort: "875A-10",
              vehicle: { type: "BUS" },
              agencies: [{ name: "SPTrans" }],
            },
          },
        },
      ],
    },
  ],
};

afterEach(() => vi.useRealTimers());
describe("Google Routes server boundary", () => {
  it("allows JSON POST preflight only for the configured origin", async () => {
    const r = await handleRequest(
      new Request("https://api.example/api/google/routes", {
        method: "OPTIONS",
        headers: {
          Origin: env.ALLOWED_ORIGIN,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type",
        },
      }),
      env,
    );
    expect(r.status).toBe(204);
    expect(r.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(
      r.headers.get("Access-Control-Allow-Headers")?.toLowerCase(),
    ).toContain("content-type");
    expect(
      (
        await handleRequest(
          request(payload, { Origin: "https://evil.example" }),
          env,
        )
      ).status,
    ).toBe(403);
  });

  it.each([
    { ...env, GOOGLE_ROUTES_API_KEY: undefined },
    { ...env, GOOGLE_RATE_LIMITER: undefined },
  ])(
    "fails closed when a mandatory configuration is missing",
    async (missing) => {
      const fetcher = vi.fn(noRoutes);
      const r = await handleRequest(request(), missing, fetcher);
      expect(r.status).toBe(503);
      expect(await r.json()).toMatchObject({
        error: { code: "NOT_CONFIGURED" },
      });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("health exposes only configuration booleans and preserves SPTrans fields", async () => {
    const r = await handleRequest(
      new Request("https://api.example/api/health"),
      { ...env, SPTRANS_TOKEN: "other-secret" },
    );
    expect(await r.json()).toEqual({
      configured: true,
      source: "SPTrans",
      rateLimited: false,
      googleRoutesConfigured: true,
    });
    const missing = await handleRequest(
      new Request("https://api.example/api/health"),
      { ...env, GOOGLE_RATE_LIMITER: undefined },
    );
    expect(await missing.json()).toMatchObject({
      googleRoutesConfigured: false,
    });
  });

  it("requires POST on the routes resource", async () => {
    expect(
      (
        await handleRequest(
          new Request("https://api.example/api/google/routes"),
          env,
        )
      ).status,
    ).toBe(405);
  });

  it.each([
    null,
    [],
    { ...payload, mode: "drive" },
    { ...payload, preference: "fastest" },
    { ...payload, origin: { lat: 91, lon: 0 } },
    { ...payload, destination: { lat: 0, lon: -181 } },
    { ...payload, origin: { lat: "-23", lon: 0 } },
    { ...payload, origin: { lat: null, lon: 0 } },
    { ...payload, key: "visitor-key" },
    { ...payload, fieldMask: "*" },
    { ...payload, origin: { lat: 0, lon: 0, placeId: "arbitrary" } },
  ])("rejects invalid or unrecognized visitor data", async (body) => {
    const fetcher = vi.fn(noRoutes);
    const r = await handleRequest(request(body), env, fetcher);
    expect(r.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects non-JSON, malformed JSON, and oversized bodies before calling Google", async () => {
    const fetcher = vi.fn(noRoutes);
    expect(
      (
        await handleRequest(
          request(payload, { "Content-Type": "text/plain" }),
          env,
          fetcher,
        )
      ).status,
    ).toBe(415);
    const malformed = new Request("https://api.example/api/google/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    expect((await handleRequest(malformed, env, fetcher)).status).toBe(400);
    expect(
      (
        await handleRequest(
          request({ ...payload, padding: "x".repeat(5000) }),
          env,
          fetcher,
        )
      ).status,
    ).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("applies the dedicated limiter using visitor IP and returns safe failures", async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const fetcher = vi.fn(noRoutes);
    const r = await handleRequest(
      request(payload, { "CF-Connecting-IP": "192.0.2.1" }),
      { ...env, GOOGLE_RATE_LIMITER: { limit } },
      fetcher,
    );
    expect(r.status).toBe(429);
    expect(limit).toHaveBeenCalledWith({ key: "192.0.2.1" });
    expect(fetcher).not.toHaveBeenCalled();
    const failed = await handleRequest(
      request(),
      {
        ...env,
        GOOGLE_RATE_LIMITER: {
          limit: async () => {
            throw new Error("secret coordinates");
          },
        },
      },
      fetcher,
    );
    expect(failed.status).toBe(502);
    expect(await failed.text()).not.toContain("secret coordinates");
  });

  it("emits only the fixed walking request, secret header and explicit field mask", async () => {
    const fetcher = vi.fn(noRoutes);
    const r = await handleRequest(request(), env, fetcher);
    expect(r.status).toBe(200);
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
    );
    expect(init).toMatchObject({ method: "POST", redirect: "manual" });
    expect(JSON.parse(String(init.body))).toEqual({
      origin: { location: point(-23.55, -46.63) },
      destination: { location: point(-23.56, -46.65) },
      travelMode: "WALK",
      languageCode: "pt-BR",
      regionCode: "BR",
      units: "METRIC",
      computeAlternativeRoutes: true,
      polylineEncoding: "ENCODED_POLYLINE",
    });
    const headers = new Headers(init.headers);
    expect(headers.get("X-Goog-Api-Key")).toBe("fixture-secret");
    const mask = headers.get("X-Goog-FieldMask")!;
    expect(mask).not.toContain("*");
    expect(mask.split(",")).toEqual(
      expect.arrayContaining([
        "routes.legs.steps.staticDuration",
        "routes.legs.steps.transitDetails.stopDetails.departureTime",
        "routes.legs.steps.transitDetails.transitLine.agencies.uri",
      ]),
    );
    expect(await r.json()).toEqual({
      source: "Google Maps",
      fetchedAt: expect.any(String),
      routes: [],
    });
    expect(r.headers.get("Cache-Control")).toBe("no-store");
  });

  it.each([
    ["rail", ["RAIL"]],
    ["bus", ["BUS"]],
    ["any", undefined],
  ])(
    "translates transit preference %s and uses server departure time",
    async (preference, modes) => {
      const fetcher = vi.fn(noRoutes);
      await handleRequest(
        request({ ...payload, mode: "transit", preference }),
        env,
        fetcher,
      );
      const init = fetcher.mock.calls[0]?.[1] as RequestInit;
      expect(JSON.parse(String(init.body))).toMatchObject({
        travelMode: "TRANSIT",
        departureTime: expect.any(String),
      });
      const body = JSON.parse(String(init.body));
      expect(Date.parse(body.departureTime)).toBeGreaterThan(Date.now() - 5000);
      expect(body.transitPreferences).toEqual(
        modes ? { allowedTravelModes: modes } : {},
      );
    },
  );

  it("normalizes official walking, subway and bus fields without inventing optional data", async () => {
    const r = await handleRequest(
      request({ ...payload, mode: "transit" }),
      env,
      async () => Response.json({ routes: [routeFixture] }),
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(body.routes[0]).toMatchObject({
      id: "google-route-0",
      description: "Via estação",
      distanceM: 2000,
      durationS: 901.5,
      polyline: "route-encoded",
      warnings: ["Cuidado ao caminhar"],
    });
    expect(body.routes[0].steps[0]).toEqual({
      mode: "WALK",
      instruction: "Siga <b>em frente</b>",
      distanceM: 100,
      durationS: 90,
      from: { lat: -23.55, lon: -46.63 },
      to: { lat: -23.551, lon: -46.631 },
      polyline: "walk",
      transit: null,
    });
    expect(body.routes[0].steps[1].transit).toEqual({
      lineName: "Linha Azul",
      shortName: "1",
      headsign: "Jabaquara",
      vehicleType: "SUBWAY",
      departureStop: "Sé",
      arrivalStop: "Liberdade",
      departureTime: "2026-10-20T12:00:00Z",
      arrivalTime: "2026-10-20T12:05:00Z",
      stopCount: 2,
      agencies: [{ name: "Metrô", url: "https://metro.example/" }],
    });
    expect(body.routes[0].steps[2]).toEqual({
      mode: "TRANSIT",
      instruction: "",
      distanceM: null,
      durationS: null,
      from: null,
      to: null,
      polyline: null,
      transit: {
        lineName: "",
        shortName: "875A-10",
        headsign: "",
        vehicleType: "BUS",
        departureStop: "",
        arrivalStop: "",
        departureTime: null,
        arrivalTime: null,
        stopCount: null,
        agencies: [{ name: "SPTrans", url: null }],
      },
    });
  });

  it.each([400, 403, 429, 500, 302])(
    "does not expose provider response content for HTTP %s",
    async (status) => {
      const r = await handleRequest(
        request(),
        env,
        async () =>
          new Response("fixture-secret -23.55 provider detail", { status }),
      );
      expect(r.status).toBe(502);
      expect(await r.json()).toEqual({
        error: { code: "PROVIDER_UNAVAILABLE", message: expect.any(String) },
      });
    },
  );

  it.each([
    "not-json",
    JSON.stringify({ routes: "broken" }),
    "x".repeat(1_048_577),
  ])("rejects malformed or oversized responses safely", async (text) => {
    const r = await handleRequest(
      request(),
      env,
      async () => new Response(text),
    );
    expect(r.status).toBe(502);
  });

  it("bounds route alternatives to four", async () => {
    const r = await handleRequest(request(), env, async () =>
      Response.json({ routes: Array.from({ length: 6 }, () => routeFixture) }),
    );
    expect(((await r.json()) as any).routes).toHaveLength(4);
  });

  it("preserves absent transit details and rejects unsafe agency links", async () => {
    const fixture = {
      ...routeFixture,
      legs: [
        {
          steps: [
            { travelMode: "TRANSIT" },
            {
              travelMode: "TRANSIT",
              transitDetails: {
                transitLine: {
                  vehicle: { type: "FUTURE_TYPE" },
                  agencies: [
                    { uri: "javascript:alert(1)" },
                    { uri: "https://user:password@example.com" },
                  ],
                },
              },
            },
          ],
        },
      ],
    };
    const r = await handleRequest(request(), env, async () =>
      Response.json({ routes: [fixture] }),
    );
    const body = (await r.json()) as any;
    expect(body.routes[0].steps[0].transit).toBeNull();
    expect(body.routes[0].steps[1].transit).toMatchObject({
      vehicleType: "FUTURE_TYPE",
      agencies: [
        { name: "", url: null },
        { name: "", url: null },
      ],
    });
  });

  it("bounds streamed request and response bytes without relying on content length", async () => {
    const encoder = new TextEncoder();
    const fetcher = vi.fn(noRoutes);
    const oversized = new Request("https://api.example/api/google/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode("x".repeat(4097)));
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit);
    expect((await handleRequest(oversized, env, fetcher)).status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
    const response = await handleRequest(
      request(),
      env,
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode("x".repeat(1_048_577)));
              controller.close();
            },
          }),
        ),
    );
    expect(response.status).toBe(502);
  });

  it("cancels a stalled provider response body at the same deadline", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const pending = handleRequest(
      request(),
      env,
      async () => new Response(new ReadableStream({ cancel })),
    );
    await vi.advanceTimersByTimeAsync(12_000);
    expect((await pending).status).toBe(504);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("ends at 12 seconds even when fetch ignores abort", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const pending = handleRequest(request(), env, ((
      _url: unknown,
      init?: RequestInit,
    ) => {
      signal = init?.signal as AbortSignal;
      return new Promise(() => {});
    }) as typeof fetch);
    await vi.advanceTimersByTimeAsync(11_999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const r = await pending;
    expect(r.status).toBe(504);
    expect(signal?.aborted).toBe(true);
    expect(await r.json()).toMatchObject({
      error: { code: "PROVIDER_TIMEOUT" },
    });
  });
});
