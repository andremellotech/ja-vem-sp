import React from "react";
import { it, expect, vi, afterEach } from "vitest";
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import App from "../src/App";
vi.mock("../src/features/map/TransitMap", () => ({
  default: () => <div>Mapa de São Paulo</div>,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
});
it("explica configuração ausente sem simular chegadas", async () => {
  render(<App apiBase="" />);
  expect(screen.getAllByText(/conectar dados/i).length).toBeGreaterThan(0);
  fireEvent.change(screen.getByLabelText("Linha ou destino"), {
    target: { value: "Paulista" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Buscar ônibus" }));
  expect(
    await screen.findByText(/conexão com a SPTrans ainda não/i),
  ).toBeTruthy();
});
it("mantém a última busca quando respostas chegam fora de ordem", async () => {
  let resolveA!: (r: Response) => void;
  const pendingA = new Promise<Response>((r) => (resolveA = r));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (input.includes("health")) return Response.json({ configured: true });
      if (input.includes("q=antiga")) return pendingA;
      return Response.json({
        data: [
          {
            id: "2",
            code: "2000-10",
            name: "Busca atual",
            direction: 1,
            origin: "Centro",
            destination: "Busca atual",
          },
        ],
        source: "SPTrans",
        fetchedAt: new Date().toISOString(),
        observedAt: null,
      });
    }),
  );
  render(<App apiBase="https://api.test" />);
  const input = screen.getByLabelText("Linha ou destino");
  fireEvent.change(input, { target: { value: "antiga" } });
  fireEvent.click(screen.getByRole("button", { name: "Buscar ônibus" }));
  fireEvent.change(input, { target: { value: "atual" } });
  fireEvent.click(screen.getByRole("button", { name: "Buscar ônibus" }));
  await screen.findByText("2000-10");
  resolveA(
    Response.json({
      data: [
        {
          id: "1",
          code: "1000-10",
          name: "Resposta antiga",
          direction: 1,
          origin: "Centro",
          destination: "Resposta antiga",
        },
      ],
    }),
  );
  await waitFor(() => expect(screen.queryByText("1000-10")).toBeNull());
  expect(screen.getByText("2000-10")).toBeTruthy();
});

it("remove previsões quando sua própria atualização falha", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  let arrivalCalls = 0;
  const result = (data: unknown) =>
    Response.json({
      data,
      source: "SPTrans",
      fetchedAt: new Date().toISOString(),
      observedAt: new Date().toISOString(),
    });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (input.includes("health")) return Response.json({ configured: true });
      if (input.includes("/arrivals")) {
        arrivalCalls++;
        return arrivalCalls === 1
          ? result([
              {
                lineId: "198",
                stopId: "1",
                lineCode: "675K-10",
                vehicleId: "9",
                expectedAt: null,
                expectedLocalTime: "12:05",
                kind: "realtime",
                observedAt: new Date().toISOString(),
              },
            ])
          : Response.json(
              {
                error: { code: "PROVIDER_UNAVAILABLE", message: "Sem conexão" },
              },
              { status: 502 },
            );
      }
      if (input.includes("/stops"))
        return result([
          { id: "1", name: "Parada Central", lat: -23.5, lon: -46.6 },
        ]);
      if (input.includes("/vehicles")) return result([]);
      return result([
        {
          id: "198",
          code: "675K-10",
          name: "Centro",
          direction: 1,
          origin: "Bairro",
          destination: "Centro",
        },
      ]);
    }),
  );
  render(<App apiBase="https://api.test" />);
  fireEvent.change(screen.getByLabelText("Linha ou destino"), {
    target: { value: "675K" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Buscar ônibus" }));
  await screen.findByText("675K-10");
  fireEvent.click(screen.getByText("Centro"));
  await screen.findByRole("button", { name: /Parada Central/ });
  fireEvent.click(screen.getByRole("button", { name: /Parada Central/ }));
  await screen.findByText("12:05");
  await act(async () => {
    vi.advanceTimersByTime(30000);
  });
  await waitFor(() => expect(screen.queryByText("12:05")).toBeNull());
  expect(
    screen.getByText("Previsões indisponíveis nesta atualização."),
  ).toBeTruthy();
});

it("mostra paradas encontradas na busca e consulta chegadas de todas as linhas", async () => {
  const arrivalUrls: string[] = [];
  const result = (data: unknown) =>
    Response.json({
      data,
      source: "SPTrans",
      fetchedAt: new Date().toISOString(),
      observedAt: new Date().toISOString(),
    });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (input.includes("health")) return Response.json({ configured: true });
      if (input.includes("/arrivals")) {
        arrivalUrls.push(input);
        return result([
          {
            lineId: "198",
            stopId: "10",
            lineCode: "675K-10",
            vehicleId: "9",
            expectedAt: null,
            expectedLocalTime: "12:05",
            kind: "realtime",
            observedAt: new Date().toISOString(),
          },
        ]);
      }
      if (input.includes("/api/stops?q="))
        return result([
          {
            id: "10",
            name: "Parada Paulista",
            address: "Av. Paulista, 1000",
            lat: -23.56,
            lon: -46.65,
          },
        ]);
      return result([]);
    }),
  );
  render(<App apiBase="https://api.test" />);
  fireEvent.change(screen.getByLabelText("Linha ou destino"), {
    target: { value: "Paulista" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Buscar ônibus" }));
  fireEvent.click(
    await screen.findByRole("button", { name: /Parada Paulista/ }),
  );
  await screen.findByText("12:05");
  expect(arrivalUrls[0]).toContain("/api/stops/10/arrivals");
  expect(arrivalUrls[0]).not.toContain("lineId");
});

it("lista paradas do GTFS perto de você e consulta chegadas de todas as linhas", async () => {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (ok: (p: unknown) => void) =>
        ok({ coords: { latitude: -23.5614, longitude: -46.6559 } }),
    },
  });
  const arrivalUrls: string[] = [];
  const result = (data: unknown) =>
    Response.json({
      data,
      source: "SPTrans",
      fetchedAt: new Date().toISOString(),
      observedAt: new Date().toISOString(),
    });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (input.includes("health")) return Response.json({ configured: true });
      if (input.includes("data/stops.json"))
        return Response.json({
          stops: [
            ["10", "Parada Perto", "Ref.: Praça", -23.5617, -46.6563, 0],
            ["11", "Parada Longe", "", -23.7, -46.8, 0],
          ],
        });
      if (input.includes("/arrivals")) {
        arrivalUrls.push(input);
        return result([
          {
            lineId: "198",
            stopId: "10",
            lineCode: "675K-10",
            vehicleId: "9",
            expectedAt: null,
            expectedLocalTime: "12:05",
            kind: "realtime",
            observedAt: new Date().toISOString(),
          },
        ]);
      }
      return result([]);
    }),
  );
  render(<App apiBase="https://api.test" />);
  fireEvent.click(screen.getByRole("button", { name: "Minha localização" }));
  fireEvent.click(await screen.findByRole("button", { name: /Parada Perto/ }));
  await screen.findByText("12:05");
  expect(screen.queryByText("Parada Longe")).toBeNull();
  expect(arrivalUrls[0]).toContain("/api/stops/10/arrivals");
  expect(arrivalUrls[0]).not.toContain("lineId");
});
