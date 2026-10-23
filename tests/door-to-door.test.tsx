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
import { installJourneyMocks } from "./journey-harness";
import { doorOption, home, destination } from "./door-to-door-fixture";
const boundary = vi.hoisted(() => ({ walking: vi.fn() }));
vi.mock("../src/features/walking/client", () => ({
  routeWalking: boundary.walking,
  routeDriving: vi.fn(),
}));
vi.mock("../src/features/journey/paths", () => ({
  loadLegPath: async (l: any) => ({
    kind: l.mode,
    label: l.lineCode,
    points: [l.from, l.to],
  }),
}));
beforeEach(() =>
  boundary.walking.mockReset().mockImplementation(async (from, to) => ({
    points: [from, to],
    distanceM: 240,
    durationS: 180,
    steps: [
      {
        type: "turn",
        modifier: "right",
        name: "Rua de Acesso",
        distanceM: 200,
      },
    ],
    startGapM: 0,
    endGapM: 0,
  })),
);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function calculate() {
  const { workers } = installJourneyMocks({ autoRespond: false });
  const selected = vi.fn(),
    focus = vi.fn();
  const props = {
    onMapSelection: selected,
    onShowArrivals: () => {},
    onLocate: async () => null,
    onFocusStep: focus,
  };
  const view = render(<JourneyPlanner {...props} />);
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
  fireEvent.click(
    screen.getByRole("button", { name: "Ver opções de transporte" }),
  );
  await act(async () =>
    workers[0].reply(1, { options: [doorOption], radiusM: 800 }),
  );
  return { selected, focus, view, props };
}
it("mostra a sequência completa com as caminhadas junto a cada embarque", async () => {
  const { selected } = await calculate();
  const detail = await screen.findByRole("region", {
    name: "Seu trajeto completo",
  });
  await waitFor(() => expect(boundary.walking).toHaveBeenCalledTimes(4));
  await waitFor(() =>
    expect(
      selected.mock.lastCall?.[0].steps?.every(
        (s: any) => s.status !== "loading",
      ),
    ).toBe(true),
  );
  expect(
    within(detail)
      .getAllByTestId("journey-step")
      .map((e) => e.getAttribute("data-mode")),
  ).toEqual(["walk", "metro", "walk", "train", "walk", "bus", "walk"]);
  expect(selected.mock.lastCall?.[0]).toMatchObject({
    origin: home,
    destination,
    busLegs: [expect.objectContaining({ lineCode: "476A-10" })],
  });
  expect(within(detail).getAllByText(/Rua de Acesso/)).toHaveLength(4);
});
it("abrir caminhada da baldeação preserva viagem completa, origem, destino e ônibus", async () => {
  const { selected, focus } = await calculate();
  await waitFor(() =>
    expect(
      selected.mock.lastCall?.[0].steps?.every(
        (s: any) => s.status !== "loading",
      ),
    ).toBe(true),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Ver caminhada da troca 1" }),
  );
  expect(selected.mock.lastCall?.[0]).toMatchObject({
    mode: "transit",
    origin: home,
    destination,
    busLegs: [expect.objectContaining({ lineCode: "476A-10" })],
  });
  expect(focus).toHaveBeenLastCalledWith("walk-transfer-1");
  expect(
    screen.getByRole("region", { name: "Seu trajeto completo" }),
  ).toBeTruthy();
});
it("avisa a falha de uma caminhada sem apagar trem, ônibus ou as outras etapas", async () => {
  boundary.walking.mockImplementationOnce(async () => {
    throw new Error("Sem acesso mapeado.");
  });
  const { selected } = await calculate();
  const detail = await screen.findByRole("region", {
    name: "Seu trajeto completo",
  });
  await within(detail).findByText(/Sem acesso mapeado/);
  await waitFor(() =>
    expect(
      selected.mock.lastCall?.[0].steps?.filter(
        (s: any) => s.kind === "walk" && s.status === "ready",
      ),
    ).toHaveLength(3),
  );
  expect(selected.mock.lastCall?.[0].busLegs[0].lineCode).toBe("476A-10");
  expect(within(detail).getAllByTestId("journey-step")).toHaveLength(7);
});
it.each([false, true])(
  "mantém carregamento apenas quando a consulta de chegadas preserva a viagem (%s)",
  async (retain) => {
    let finish!: (value: any) => void;
    boundary.walking.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { selected, view, props } = await calculate();
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    const id = selected.mock.lastCall?.[0].id;
    view.rerender(
      <JourneyPlanner
        {...props}
        active={false}
        retainedJourneyId={retain ? id : null}
      />,
    );
    const count = selected.mock.calls.length;
    await act(async () =>
      finish({
        points: [home, doorOption.legs[0].from],
        distanceM: 240,
        durationS: 180,
        steps: [],
        startGapM: 0,
        endGapM: 0,
      }),
    );
    if (retain)
      await waitFor(() =>
        expect(
          selected.mock.lastCall?.[0].steps.every(
            (s: any) => s.status !== "loading",
          ),
        ).toBe(true),
      );
    else expect(selected.mock.calls).toHaveLength(count);
  },
);
it.each(["Priorizar", "Transporte", "Baldeações"])(
  "conclui as etapas da última busca ao alterar %s durante a carga",
  async (name) => {
    let finish!: (value: any) => void;
    boundary.walking.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { selected } = await calculate();
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    fireEvent.change(screen.getByRole("combobox", { name }), {
      target: {
        value:
          name === "Priorizar"
            ? "walking"
            : name === "Transporte"
              ? "rail"
              : "1",
      },
    });
    await act(async () =>
      finish({
        points: [home, doorOption.legs[0].from],
        distanceM: 240,
        durationS: 180,
        steps: [],
        startGapM: 0,
        endGapM: 0,
      }),
    );
    await waitFor(() =>
      expect(
        selected.mock.lastCall?.[0].steps.every(
          (s: any) => s.status !== "loading",
        ),
      ).toBe(true),
    );
    expect(
      screen
        .getByRole("button", { name: "Ver etapa 1 no mapa" })
        .hasAttribute("disabled"),
    ).toBe(false);
    expect(
      screen.getByText(/As opções e o mapa são da última busca/),
    ).toBeTruthy();
  },
);
it.each([false, true])(
  "remove detalhes e descarta atualizações ao voltar de chegadas sem seleção retida (pendente: %s)",
  async (pending) => {
    let finish!: (value: any) => void;
    if (pending)
      boundary.walking.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
    const { selected, view, props } = await calculate();
    if (pending) await waitFor(() => expect(finish).toBeTypeOf("function"));
    else
      await waitFor(() =>
        expect(
          selected.mock.lastCall?.[0].steps.every(
            (s: any) => s.status !== "loading",
          ),
        ).toBe(true),
      );
    const id = selected.mock.lastCall?.[0].id;
    view.rerender(
      <JourneyPlanner {...props} active={false} retainedJourneyId={id} />,
    );
    view.rerender(
      <JourneyPlanner {...props} active retainedJourneyId={null} />,
    );
    expect(
      screen.queryByRole("region", { name: "Seu trajeto completo" }),
    ).toBeNull();
    const count = selected.mock.calls.length;
    if (pending)
      await act(async () =>
        finish({
          points: [home, doorOption.legs[0].from],
          distanceM: 240,
          durationS: 180,
          steps: [],
          startGapM: 0,
          endGapM: 0,
        }),
      );
    expect(selected.mock.calls).toHaveLength(count);
    fireEvent.click(
      screen.getByRole("button", { name: "Ver opção 1 no mapa" }),
    );
    await screen.findByRole("region", { name: "Seu trajeto completo" });
    await waitFor(() =>
      expect(
        selected.mock.lastCall?.[0].steps.every(
          (s: any) => s.status !== "loading",
        ),
      ).toBe(true),
    );
  },
);
