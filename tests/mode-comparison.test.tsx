import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import JourneyPlanner from "../src/features/journey/JourneyPlanner";
import JourneyOptions from "../src/features/journey/JourneyOptions";
import { installJourneyMocks } from "./journey-harness";
import { createPlannerIndex } from "../src/features/journey/data";
import { fixture, hash, networkStops, trip } from "./planner-fixtures";
import { findJourneys } from "../src/features/journey/router";
const mocks = vi.hoisted(() => ({ car: vi.fn(), foot: vi.fn() }));
vi.mock("../src/features/walking/client", () => ({
  routeDriving: mocks.car,
  routeWalking: mocks.foot,
}));
const route = {
  distanceM: 2400,
  durationS: 540,
  points: [
    { lat: -23.55, lon: -46.63 },
    { lat: -23.59, lon: -46.67 },
  ],
  steps: [{ type: "depart", name: "Avenida Paulista", distanceM: 200 }],
  startGapM: 0,
  endGapM: 70,
};
beforeEach(() => {
  mocks.car.mockReset().mockResolvedValue(route);
  mocks.foot.mockReset().mockResolvedValue({ ...route, durationS: 1800 });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function endpoints() {
  for (const [name, q, button] of [
    ["De onde você vai sair?", "Rua Origem", "Localizar origem"],
    ["Para onde você vai?", "Rua Destino", "Localizar destino"],
  ]) {
    fireEvent.change(screen.getByRole("combobox", { name }), {
      target: { value: q + ", 1000" },
    });
    fireEvent.click(screen.getByRole("button", { name: button }));
    fireEvent.click(
      await screen.findByRole("option", {
        name: new RegExp("^" + q + ", 1000"),
      }),
    );
  }
}
it("desenha carro no próprio mapa e mostra tempo/instruções sem GPS de ônibus", async () => {
  installJourneyMocks();
  const selected = vi.fn();
  render(
    <JourneyPlanner
      onMapSelection={selected}
      onShowArrivals={() => {}}
      onLocate={async () => null}
    />,
  );
  expect(
    screen
      .getByRole("button", { name: "Ver carro no mapa" })
      .hasAttribute("disabled"),
  ).toBe(true);
  await endpoints();
  fireEvent.click(screen.getByRole("button", { name: "Ver carro no mapa" }));
  await screen.findByText(/Saia em Avenida Paulista/);
  expect(selected.mock.lastCall?.[0]).toMatchObject({
    mode: "car",
    stops: [],
    paths: [{ kind: "car", points: route.points }],
  });
  expect(selected.mock.lastCall?.[0].busLegs).toBeUndefined();
  expect(
    within(screen.getByRole("region", { name: "Rota de carro" })).getByText(
      /9 min/,
    ),
  ).toBeTruthy();
  expect(screen.getAllByText(/sem trânsito ao vivo/i).length).toBeGreaterThan(
    0,
  );
  expect(screen.getByText(/70 m do ponto final/)).toBeTruthy();
});
it("compara modos e preserva carro e transporte quando caminhada falha", async () => {
  const { workers } = installJourneyMocks();
  mocks.foot.mockRejectedValue(new Error("Caminhada indisponível."));
  render(
    <JourneyPlanner
      onMapSelection={() => {}}
      onShowArrivals={() => {}}
      onLocate={async () => null}
    />,
  );
  await endpoints();
  fireEvent.click(screen.getByRole("button", { name: "Comparar modos" }));
  await screen.findByRole("button", {
    name: "Mostrar carro calculado no mapa",
  });
  await screen.findByRole("button", { name: "Ver opção 1 no mapa" });
  expect(workers[0].jobs).toHaveLength(1);
  expect(mocks.car).toHaveBeenCalledTimes(1);
  expect(screen.getAllByText(/Caminhada indisponível/).length).toBeGreaterThan(
    0,
  );
});
it.each(["editar", "inverter", "sair", "escolher transporte"])(
  "não aplica carro atrasado ao %s",
  async (action) => {
    installJourneyMocks();
    let finish!: (r: typeof route) => void;
    mocks.car.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const selected = vi.fn(),
      props = {
        onMapSelection: selected,
        onShowArrivals: () => {},
        onLocate: async () => null,
      };
    const view = render(<JourneyPlanner {...props} />);
    await endpoints();
    fireEvent.click(screen.getByRole("button", { name: "Ver carro no mapa" }));
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    if (action === "editar")
      fireEvent.change(
        screen.getByRole("combobox", { name: "Para onde você vai?" }),
        { target: { value: "outro" } },
      );
    if (action === "inverter")
      fireEvent.click(
        screen.getByRole("button", { name: "Inverter origem e destino" }),
      );
    if (action === "sair")
      view.rerender(<JourneyPlanner {...props} active={false} />);
    if (action === "escolher transporte") {
      fireEvent.click(
        screen.getByRole("button", { name: "Ver opções de transporte" }),
      );
      await screen.findByRole("button", { name: "Ver opção 1 no mapa" });
    }
    const calls = selected.mock.calls.length;
    await act(async () => finish(route));
    expect(selected.mock.calls).toHaveLength(calls);
    expect(screen.queryByText(/Saia em Avenida Paulista/)).toBeNull();
  },
);
it("conclui os tempos do resultado preservado após selecionar carro", async () => {
  installJourneyMocks();
  const original = fetch;
  let finish!: (r: Response) => void;
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
    String(url).includes("journey-times.json")
      ? new Promise<Response>((resolve) => {
          finish = resolve;
        })
      : original(url, init),
  );
  render(
    <JourneyPlanner
      onMapSelection={() => {}}
      onShowArrivals={() => {}}
      onLocate={async () => null}
    />,
  );
  await endpoints();
  fireEvent.click(screen.getByRole("button", { name: "Comparar modos" }));
  await screen.findByRole("button", { name: "Ver opção 1 no mapa" });
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Mostrar carro calculado no mapa",
    }),
  );
  const trips = Object.fromEntries(
    [
      ["direct", ["A", "X", "D"]],
      ["first", ["A", "X"]],
      ["second", ["X", "D"]],
    ].map(([id, ids]) => [
      id,
      {
        stopIds: ids,
        arrivalS: (ids as string[]).map((_, i) => i * 300),
        departureS: (ids as string[]).map((_, i) => i * 300),
        windows: [[0, 86400, 600, false]],
      },
    ]),
  );
  await act(async () =>
    finish(
      Response.json({
        version: 1,
        provenance: { sha256: hash },
        validFrom: "20260101",
        validTo: "20271231",
        trips,
      }),
    ),
  );
  await screen.findByRole("combobox", { name: "Ordenar opções encontradas" });
  expect(screen.queryByText("Carregando tempos programados…")).toBeNull();
  expect(screen.getByRole("region", { name: "Rota de carro" })).toBeTruthy();
});

it("ordena só opções encontradas por tempo e mantém seleção ligada ao itinerário correto", () => {
  const index = createPlannerIndex(
    fixture([
      trip("direct", ["A", "X", "D"]),
      trip("first", ["A", "X"]),
      trip("second", ["X", "D"]),
    ]),
    networkStops,
  );
  const { options } = findJourneys(index, {
    origin: networkStops[0],
    destination: networkStops[2],
    radiusM: 800,
    serviceDate: "20261023",
  });
  expect(options.length).toBeGreaterThan(1);
  const estimates = Object.fromEntries(
    options.map((o, i) => [
      o.id,
      {
        totalS: i === 1 ? 300 : 1800 + i,
        ridingS: 100,
        walkingS: 100,
        waitingS: 100,
      },
    ]),
  );
  const selected = vi.fn();
  render(
    <JourneyOptions
      options={options}
      selectedId={null}
      onSelect={selected}
      onShowArrivals={() => {}}
      estimates={estimates}
    />,
  );
  fireEvent.change(
    screen.getByRole("combobox", { name: "Ordenar opções encontradas" }),
    { target: { value: "time" } },
  );
  const first = screen.getAllByRole("article")[0];
  fireEvent.click(
    within(first).getByRole("button", { name: "Ver opção 1 no mapa" }),
  );
  expect(selected).toHaveBeenCalledWith(options[1]);
  expect(screen.getByText(/não garante o trajeto mais rápido/i)).toBeTruthy();
});
