import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import App from "../src/App";
import { fixture, hash, networkStops, trip } from "./planner-fixtures";
import type { Vehicle } from "../src/contracts";
const leg = {
  routeId: "8000-10",
  tripId: "out",
  lineCode: "8000-10",
  headsign: "Term. Pirituba",
};
const selection = {
  origin: networkStops[0],
  destination: networkStops[2],
  stops: networkStops,
  busLegs: [leg],
};
vi.mock("../src/features/journey/JourneyPlanner", () => ({
  default: ({ onMapSelection }: { onMapSelection: (s: unknown) => void }) => (
    <>
      <button onClick={() => onMapSelection(selection)}>
        Selecionar trajeto de ônibus
      </button>
      <button
        onClick={() =>
          onMapSelection({
            ...selection,
            busLegs: [{ ...leg, tripId: "back", headsign: "Centro" }],
          })
        }
      >
        Selecionar sentido oposto
      </button>
      <button onClick={() => onMapSelection({ ...selection, busLegs: [] })}>
        Selecionar caminhada
      </button>
      <button
        onClick={() =>
          onMapSelection({
            ...selection,
            busLegs: [
              leg,
              {
                routeId: "9000-10",
                tripId: "transfer",
                lineCode: "9000-10",
                headsign: "Bairro",
              },
            ],
          })
        }
      >
        Selecionar trajeto com troca
      </button>
    </>
  ),
}));
vi.mock("../src/features/map/TransitMap", () => ({
  default: ({ vehicles }: { vehicles: Vehicle[] }) => (
    <output aria-label="Frota desenhada">{JSON.stringify(vehicles)}</output>
  ),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
});
function install({
  delayed = false,
  fail = false,
  empty = false,
  delayedTransfer = false,
  failTransfer = false,
  ambiguous = false,
} = {}) {
  const data = fixture([
    trip("out", ["A", "X", "D"]),
    trip("back", ["D", "X", "A"]),
  ]);
  data.routes = [{ id: "8000-10", code: "8000-10", name: "Centro - Pirituba" }];
  data.trips[0] = {
    ...data.trips[0],
    routeId: "8000-10",
    headsign: "Term. Pirituba",
    direction: "0",
  };
  data.trips[1] = {
    ...data.trips[1],
    routeId: "8000-10",
    headsign: "Centro",
    direction: "1",
  };
  data.routes.push({
    id: "9000-10",
    code: "9000-10",
    name: "Pirituba - Bairro",
  });
  data.trips.push({
    ...trip("transfer", ["X", "D"]),
    routeId: "9000-10",
    headsign: "Bairro",
    direction: "0",
  });
  const lines = [
    {
      id: "990",
      code: "8000-10",
      name: "Centro - Pirituba",
      origin: "Centro",
      destination: "TERM. PIRITUBA",
      direction: 1,
    },
    {
      id: "991",
      code: "8000-10",
      name: "Pirituba - Centro",
      origin: "TERM. PIRITUBA",
      destination: "Centro",
      direction: 2,
    },
  ];
  lines.push({
    id: "880",
    code: "9000-10",
    name: "Pirituba - Bairro",
    origin: "Term. Pirituba",
    destination: "Bairro",
    direction: 1,
  });
  if (ambiguous)
    Object.assign(lines[1], {
      origin: "Centro",
      destination: "TERM. PIRITUBA",
    });
  let finish: ((r: Response) => void) | undefined;
  const urls: string[] = [];
  vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/health")) return Response.json({ configured: true });
    if (url.includes("data/stops.json"))
      return Response.json({
        version: 1,
        provenance: { sha256: hash },
        stops: networkStops.map((s) => [
          s.id,
          s.name,
          s.ref,
          s.lat,
          s.lon,
          s.rail ? 1 : 0,
        ]),
      });
    if (url.includes("data/planner.json")) return Response.json(data);
    if (url.includes("data/lines.json"))
      return Response.json({
        version: 1,
        retrievedAt: "2026-10-23T12:00:00Z",
        lines,
      });
    if (url.includes("/vehicles")) {
      urls.push(url);
      if (url.includes("990") && delayed)
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      if (url.includes("880") && delayedTransfer)
        return new Promise<Response>(() => {});
      const failed = fail || (failTransfer && url.includes("880"));
      return Response.json(
        failed
          ? {
              error: {
                code: "PROVIDER_UNAVAILABLE",
                message: "Frota indisponível",
              },
            }
          : {
              data: empty
                ? []
                : [
                    {
                      id: url.includes("990") ? "bus-out" : "bus-back",
                      lat: -23.56,
                      lon: -46.64,
                      observedAt: "2026-10-23T12:00:00Z",
                    },
                  ],
              source: "SPTrans",
              fetchedAt: "2026-10-23T12:00:01Z",
              observedAt: "2026-10-23T12:00:00Z",
            },
        { status: failed ? 502 : 200 },
      );
    }
    return Response.json({
      data: [],
      source: "SPTrans",
      fetchedAt: new Date().toISOString(),
      observedAt: null,
    });
  });
  return { urls, finish: (r: Response) => finish?.(r) };
}
it("carrega no mapa somente os ônibus do sentido selecionado no trajeto", async () => {
  const { urls } = install();
  render(<App apiBase="https://fleet-one.test" />);
  fireEvent.click(
    screen.getByRole("button", { name: "Selecionar trajeto de ônibus" }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Frota desenhada").textContent).toContain(
      "bus-out",
    ),
  );
  expect(urls.some((u) => u.includes("991"))).toBe(false);
  expect(screen.getByLabelText("Frota desenhada").textContent).toContain(
    "8000-10",
  );
});
it("mostra a primeira linha enquanto a consulta de uma baldeação ainda está pendente", async () => {
  const pending = install({ delayedTransfer: true });
  render(<App apiBase="https://fleet-partial.test" />);
  fireEvent.click(
    screen.getByRole("button", { name: "Selecionar trajeto com troca" }),
  );
  await waitFor(() =>
    expect(pending.urls.some((u) => u.includes("880"))).toBe(true),
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Frota desenhada").textContent).toContain(
      "bus-out",
    ),
  );
});
it("preserva os ônibus disponíveis quando a linha de uma baldeação falha", async () => {
  install({ failTransfer: true });
  render(<App apiBase="https://fleet-error.test" />);
  fireEvent.click(
    screen.getByRole("button", { name: "Selecionar trajeto com troca" }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Frota desenhada").textContent).toContain(
      "bus-out",
    ),
  );
  expect(screen.getAllByText(/Frota indisponível/).length).toBeGreaterThan(0);
});
it("não escolhe um sentido arbitrário quando dois registros API correspondem ao mesmo itinerário", async () => {
  const data = install({ ambiguous: true });
  render(<App apiBase="https://fleet-ambiguous.test" />);
  fireEvent.click(
    screen.getByRole("button", { name: "Selecionar trajeto de ônibus" }),
  );
  await screen.findAllByText(/Não foi possível confirmar o sentido/);
  expect(screen.getByLabelText("Frota desenhada").textContent).toBe("[]");
  expect(data.urls).toEqual([]);
});
it("informa resposta vazia sem inventar posições", async () => {
  install({ empty: true });
  render(<App apiBase="https://fleet-empty.test" />);
  fireEvent.click(
    screen.getByRole("button", { name: "Selecionar trajeto de ônibus" }),
  );
  await screen.findAllByText(/Nenhum veículo informado/);
  expect(screen.getByLabelText("Frota desenhada").textContent).toBe("[]");
});
it("atualiza posições a cada 30 segundos, pausa em aba oculta e retoma ao voltar", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-23T12:00:20Z"));
  const data = install();
  const original = fetch;
  let count = 0;
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
    String(url).includes("/vehicles")
      ? Promise.resolve(
          Response.json({
            data: [
              {
                id: "changing",
                lat: -23.55 - ++count / 1000,
                lon: -46.63,
                observedAt: new Date().toISOString(),
              },
            ],
            source: "SPTrans",
            fetchedAt: new Date().toISOString(),
            observedAt: new Date().toISOString(),
          }),
        )
      : original(url, init),
  );
  render(<App apiBase="https://fleet-poll.test" />);
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: "Selecionar trajeto de ônibus" }),
    );
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(screen.getByLabelText("Frota desenhada").textContent).toContain(
    '"lat":-23.551',
  );
  await act(async () => vi.advanceTimersByTimeAsync(30000));
  expect(screen.getByLabelText("Frota desenhada").textContent).toContain(
    '"lat":-23.552',
  );
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(count).toBe(2);
  hidden.mockReturnValue(false);
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(count).toBe(3);
  hidden.mockRestore();
});
it("encerra uma consulta pendente e permite tentar atualizar novamente", async () => {
  vi.useFakeTimers();
  install({ delayed: true });
  render(<App apiBase="https://fleet-timeout.test" />);
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: "Selecionar trajeto de ônibus" }),
    );
    await vi.advanceTimersByTimeAsync(1);
  });
  await act(async () => vi.advanceTimersByTimeAsync(15000));
  expect(
    screen.getAllByText(/consulta de ônibus demorou/).length,
  ).toBeGreaterThan(0);
  expect(
    (
      screen.getByRole("button", {
        name: "Atualizar ônibus do trajeto",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
});
it("descarta a resposta antiga ao trocar de opção e remove ônibus ao escolher caminhada", async () => {
  const pending = install({ delayed: true });
  render(<App apiBase="https://fleet-cancel.test" />);
  fireEvent.click(
    screen.getByRole("button", { name: "Selecionar trajeto de ônibus" }),
  );
  await waitFor(() => expect(pending.urls.length).toBe(1));
  fireEvent.click(
    screen.getByRole("button", { name: "Selecionar sentido oposto" }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Frota desenhada").textContent).toContain(
      "bus-back",
    ),
  );
  await act(async () =>
    pending.finish(
      Response.json({
        data: [{ id: "obsolete", lat: -23.55, lon: -46.63, observedAt: null }],
        source: "SPTrans",
        fetchedAt: "2026-10-23T12:00:00Z",
        observedAt: null,
      }),
    ),
  );
  expect(screen.getByLabelText("Frota desenhada").textContent).not.toContain(
    "obsolete",
  );
  fireEvent.click(screen.getByRole("button", { name: "Selecionar caminhada" }));
  expect(screen.getByLabelText("Frota desenhada").textContent).toBe("[]");
});
