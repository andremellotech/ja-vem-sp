import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import App from "../src/App";
import type { Line, Stop } from "../src/contracts";
import {
  saveFavorites,
  saveFavoriteLines,
} from "../src/features/favorites/storage";

vi.mock("../src/features/map/TransitMap", () => ({
  default: ({ onSelectStop }: { onSelectStop: (id: string) => void }) => (
    <button onClick={() => onSelectStop("p1")}>
      Selecionar parada do mapa
    </button>
  ),
}));
const outward: Line = {
  id: "1",
  code: "8000-10",
  name: "Centro ↔ Bairro",
  direction: 1,
  origin: "Bairro",
  destination: "Centro",
};
const inward: Line = {
  ...outward,
  id: "2",
  direction: 2,
  origin: "Centro",
  destination: "Bairro",
};
const stops: Stop[] = [
  { id: "p1", name: "Ângela", lat: -23.5009, lon: -46.6 },
  { id: "p2", name: "Praça Central", lat: -23.51, lon: -46.6 },
];
const result = (data: unknown) =>
  Response.json({
    data,
    source: "SPTrans",
    fetchedAt: new Date().toISOString(),
    observedAt: new Date().toISOString(),
  });
function installApi(
  options: {
    lines?: Line[];
    vehicles?: () => Response | Promise<Response>;
    arrivals?: () => Response;
  } = {},
) {
  vi.stubGlobal("fetch", async (input: string) => {
    if (input.endsWith("/health")) return Response.json({ configured: true });
    if (input.includes("data/stops.json")) return Response.json({ stops: [] });
    if (input.includes("/api/stops?q=")) return result([]);
    if (input.includes("/arrivals")) return options.arrivals?.() ?? result([]);
    if (input.endsWith("/stops")) return result(stops);
    if (input.endsWith("/vehicles"))
      return (
        options.vehicles?.() ??
        result([
          {
            id: "v1",
            lat: -23.5,
            lon: -46.6,
            observedAt: new Date().toISOString(),
            accessible: true,
          },
        ])
      );
    if (input.includes("/lines?q="))
      return result(options.lines ?? [outward, inward]);
    throw new Error("Unexpected transport request");
  });
}
async function openLine() {
  render(<App apiBase="https://api.test" />);
  fireEvent.change(screen.getByLabelText("Linha ou destino"), {
    target: { value: "8000" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Buscar ônibus" }));
  fireEvent.click(
    await screen.findByRole("button", { name: /8000-10.*Centro.*sentido 1/ }),
  );
  await screen.findByRole("button", { name: /Ângela/ });
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it("abre os favoritos mesmo quando uma linha está selecionada", async () => {
  installApi();
  await openLine();
  fireEvent.click(screen.getByRole("button", { name: "Favoritar linha" }));
  fireEvent.click(screen.getByRole("button", { name: /^Favoritos/ }));
  expect(
    screen.getByRole("heading", { name: "Suas linhas favoritas" }),
  ).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Centro" })).toBeNull();
  expect(
    screen.getByRole("button", { name: /8000-10.*Centro.*sentido 1/ }),
  ).toBeTruthy();
});

it("filtra paradas ignorando acentos e permite limpar a busca", async () => {
  installApi();
  await openLine();
  fireEvent.change(screen.getByLabelText("Buscar parada nesta linha"), {
    target: { value: "angela" },
  });
  expect(screen.getByRole("button", { name: /Ângela/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Praça Central/ })).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Limpar busca de paradas" }),
  );
  expect(screen.getByRole("button", { name: /Praça Central/ })).toBeTruthy();
});

it("mostra distância em linha reta depois da ação de localização", async () => {
  installApi();
  vi.stubGlobal("navigator", {
    ...navigator,
    geolocation: {
      getCurrentPosition: (success: PositionCallback) =>
        success({
          coords: { latitude: -23.5, longitude: -46.6 },
        } as GeolocationPosition),
    },
  });
  await openLine();
  expect(screen.queryByText("100 m")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Usar minha localização" }),
  );
  expect(await screen.findByText("100 m")).toBeTruthy();
  expect(screen.getByText(/Distâncias em linha reta/)).toBeTruthy();
});

it("troca para o sentido oposto da mesma linha", async () => {
  installApi();
  await openLine();
  fireEvent.click(screen.getByRole("button", { name: "Trocar sentido" }));
  expect(await screen.findByRole("heading", { name: "Bairro" })).toBeTruthy();
  expect(screen.getByText(/De Centro · sentido 2/)).toBeTruthy();
});

it("encontra o outro sentido ao abrir uma linha salva sem resultados de busca", async () => {
  installApi();
  saveFavorites(localStorage, [outward.id]);
  saveFavoriteLines(localStorage, [outward]);
  render(<App apiBase="https://api.test" />);
  fireEvent.click(screen.getByRole("button", { name: /^Favoritos/ }));
  fireEvent.click(
    screen.getByRole("button", { name: /8000-10.*Centro.*sentido 1/ }),
  );
  await screen.findByRole("button", { name: /Ângela/ });
  fireEvent.click(screen.getByRole("button", { name: "Trocar sentido" }));
  expect(await screen.findByRole("heading", { name: "Bairro" })).toBeTruthy();
});

it("atualiza veículos e chegadas manualmente mantendo a parada escolhida", async () => {
  let revision = 0;
  installApi({
    vehicles: () =>
      result(
        Array.from({ length: revision + 1 }, (_, i) => ({
          id: String(i),
          lat: -23.5,
          lon: -46.6,
          observedAt: new Date().toISOString(),
          accessible: true,
        })),
      ),
    arrivals: () =>
      result([
        {
          lineId: "1",
          stopId: "p1",
          lineCode: "8000-10",
          vehicleId: "v1",
          expectedAt: null,
          expectedLocalTime: revision ? "12:09" : "12:05",
          kind: "realtime",
          observedAt: new Date().toISOString(),
        },
      ]),
  });
  await openLine();
  fireEvent.click(screen.getByRole("button", { name: /Ângela/ }));
  await screen.findByText("12:05");
  revision = 1;
  fireEvent.click(screen.getByRole("button", { name: "Atualizar agora" }));
  await screen.findByText("12:09");
  expect(screen.getByText("2 veículos informados")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Ângela" })).toBeTruthy();
  expect(screen.queryByText("12:05")).toBeNull();
});

it("distingue frota em carregamento de frota sem veículos", async () => {
  let finish!: (response: Response) => void;
  installApi({
    vehicles: () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  });
  render(<App apiBase="https://api.test" />);
  fireEvent.change(screen.getByLabelText("Linha ou destino"), {
    target: { value: "8000" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Buscar ônibus" }));
  fireEvent.click(
    await screen.findByRole("button", { name: /8000-10.*Centro.*sentido 1/ }),
  );
  expect(screen.queryByText("0 veículos informados")).toBeNull();
  expect(screen.getByText("Consultando frota…")).toBeTruthy();
  finish(result([]));
  expect(await screen.findByText("0 veículos informados")).toBeTruthy();
});

it("abre as chegadas na lista ao selecionar uma parada pelo mapa", async () => {
  installApi();
  await openLine();
  fireEvent.click(screen.getByRole("button", { name: "Mapa" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Selecionar parada do mapa" }),
  );
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Lista" })
        .getAttribute("aria-pressed"),
    ).toBe("true"),
  );
  expect(screen.getByRole("heading", { name: "Ângela" })).toBeTruthy();
});

it("encerra a indicação de carregamento quando a consulta da frota falha", async () => {
  installApi({
    vehicles: () =>
      Response.json(
        {
          error: {
            code: "PROVIDER_UNAVAILABLE",
            message: "Sem conexão com a frota",
          },
        },
        { status: 502 },
      ),
  });
  render(<App apiBase="https://api.test" />);
  fireEvent.change(screen.getByLabelText("Linha ou destino"), {
    target: { value: "8000" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Buscar ônibus" }));
  fireEvent.click(
    await screen.findByRole("button", { name: /8000-10.*Centro.*sentido 1/ }),
  );
  await screen.findByText("Sem conexão com a frota");
  expect(screen.queryByText("Consultando frota…")).toBeNull();
  expect(screen.getByText("Frota indisponível")).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Atualizar agora",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
});
