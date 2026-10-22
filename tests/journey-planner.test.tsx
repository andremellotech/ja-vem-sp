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
import JourneyPlanner from "../src/features/journey/JourneyPlanner";
import { installJourneyMocks } from "./journey-harness";
import { networkStops } from "./planner-fixtures";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
export async function confirmEndpoints() {
  fireEvent.change(
    screen.getByRole("combobox", { name: "De onde você vai sair?" }),
    { target: { value: "Rua Origem, 1000" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Localizar origem" }));
  fireEvent.click(
    await screen.findByRole("option", { name: /^Rua Origem, 1000/ }),
  );
  fireEvent.change(
    screen.getByRole("combobox", { name: "Para onde você vai?" }),
    { target: { value: "Rua Destino, n. 1000" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Localizar destino" }));
  fireEvent.click(
    await screen.findByRole("option", { name: /^Rua Destino, 1000/ }),
  );
}
it("exige dois pontos, calcula opções e invalida ao editar", async () => {
  installJourneyMocks();
  const onMapSelection = vi.fn();
  render(
    <JourneyPlanner
      onMapSelection={onMapSelection}
      onShowArrivals={() => {}}
      onLocate={async () => null}
    />,
  );
  expect(
    (
      screen.getByRole("button", {
        name: "Ver opções de transporte",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  await confirmEndpoints();
  fireEvent.click(
    screen.getByRole("button", { name: "Ver opções de transporte" }),
  );
  await screen.findByRole("button", { name: "Ver opção 1 no mapa" });
  expect(onMapSelection).toHaveBeenCalledWith(
    expect.objectContaining({
      origin: expect.objectContaining({ lat: networkStops[0].lat }),
      destination: expect.objectContaining({ lat: networkStops[2].lat }),
    }),
  );
  expect(screen.getByText(/Distâncias em linha reta/)).toBeTruthy();
  expect(screen.getAllByText(/1 troca/).length).toBeGreaterThan(0);
  fireEvent.change(
    screen.getByRole("combobox", { name: "De onde você vai sair?" }),
    { target: { value: "Outra origem" } },
  );
  expect(
    screen.queryByRole("button", { name: "Ver opção 1 no mapa" }),
  ).toBeNull();
  expect(onMapSelection).toHaveBeenLastCalledWith(null);
});
it("inverte os dois pontos confirmados", async () => {
  installJourneyMocks();
  render(
    <JourneyPlanner
      onMapSelection={() => {}}
      onShowArrivals={() => {}}
      onLocate={async () => null}
    />,
  );
  await confirmEndpoints();
  fireEvent.click(
    screen.getByRole("button", { name: "Inverter origem e destino" }),
  );
  expect(
    (
      screen.getByRole("combobox", {
        name: "De onde você vai sair?",
      }) as HTMLInputElement
    ).value,
  ).toContain("Rua Destino");
  expect(
    (
      screen.getByRole("combobox", {
        name: "Para onde você vai?",
      }) as HTMLInputElement
    ).value,
  ).toContain("Rua Origem");
  expect(
    (
      screen.getByRole("button", {
        name: "Ver opções de transporte",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
});
it("só amplia para 1200m depois do clique", async () => {
  const { workers } = installJourneyMocks({ empty: true });
  render(
    <JourneyPlanner
      onMapSelection={() => {}}
      onShowArrivals={() => {}}
      onLocate={async () => null}
    />,
  );
  await confirmEndpoints();
  fireEvent.click(
    screen.getByRole("button", { name: "Ver opções de transporte" }),
  );
  await screen.findByRole("button", { name: "Ampliar busca para 1.200 m" });
  expect(workers[0].jobs[0].input.radiusM).toBe(800);
  fireEvent.click(
    screen.getByRole("button", { name: "Ampliar busca para 1.200 m" }),
  );
  await waitFor(() => expect(workers[0].jobs.at(-1)!.input.radiusM).toBe(1200));
});
it("não aplica resultado antigo após nova consulta", async () => {
  const { workers } = installJourneyMocks({ autoRespond: false });
  render(
    <JourneyPlanner
      onMapSelection={() => {}}
      onShowArrivals={() => {}}
      onLocate={async () => null}
    />,
  );
  await confirmEndpoints();
  fireEvent.click(
    screen.getByRole("button", { name: "Ver opções de transporte" }),
  );
  fireEvent.change(
    screen.getByRole("combobox", { name: "Para onde você vai?" }),
    { target: { value: "Rua Destino, 1000" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Localizar destino" }));
  fireEvent.click(
    await screen.findByRole("option", { name: /^Rua Destino, 1000/ }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Ver opções de transporte" }),
  );
  await act(async () => {
    workers[0].reply(2);
    workers[0].reply(1, { options: [], radiusM: 800 });
  });
  expect(
    screen.getByRole("button", { name: "Ver opção 1 no mapa" }),
  ).toBeTruthy();
});
it("permite digitar com GPS recusado e ignora GPS que chega após edição", async () => {
  installJourneyMocks();
  let finish!: (p: { lat: number; lon: number } | null) => void;
  const locate = vi.fn(
    () =>
      new Promise<{ lat: number; lon: number } | null>((resolve) => {
        finish = resolve;
      }),
  );
  render(
    <JourneyPlanner
      onMapSelection={() => {}}
      onShowArrivals={() => {}}
      onLocate={locate}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Usar minha localização como origem" }),
  );
  fireEvent.change(
    screen.getByRole("combobox", { name: "De onde você vai sair?" }),
    { target: { value: "Origem digitada" } },
  );
  await act(async () => finish(networkStops[0]));
  expect(
    (
      screen.getByRole("combobox", {
        name: "De onde você vai sair?",
      }) as HTMLInputElement
    ).value,
  ).toBe("Origem digitada");
  fireEvent.click(
    screen.getByRole("button", { name: "Usar minha localização como origem" }),
  );
  await act(async () => finish(null));
  expect(screen.getByText(/Digite o endereço de origem/)).toBeTruthy();
});
it("reutiliza GPS disponível para origem vazia e permite confirmar somente destino", async () => {
  const { workers } = installJourneyMocks();
  render(
    <JourneyPlanner
      deviceLocation={networkStops[0]}
      onMapSelection={() => {}}
      onShowArrivals={() => {}}
      onLocate={async () => null}
    />,
  );
  expect(
    (
      screen.getByRole("combobox", {
        name: "De onde você vai sair?",
      }) as HTMLInputElement
    ).value,
  ).toBe("Minha localização");
  fireEvent.change(
    screen.getByRole("combobox", { name: "Para onde você vai?" }),
    { target: { value: "Rua Destino, 1000" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Localizar destino" }));
  fireEvent.click(
    await screen.findByRole("option", { name: /^Rua Destino, 1000/ }),
  );
  fireEvent.change(screen.getByLabelText("Priorizar"), {
    target: { value: "walking" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Ver opções de transporte" }),
  );
  await screen.findByRole("button", { name: "Ver opção 1 no mapa" });
  expect(workers[0].jobs[0].input.criterion).toBe("walking");
});
it("não substitui origem manual quando GPS compartilhado chega depois", () => {
  installJourneyMocks();
  const props = {
    onMapSelection: () => {},
    onShowArrivals: () => {},
    onLocate: async () => null,
  };
  const { rerender } = render(<JourneyPlanner {...props} />);
  fireEvent.change(
    screen.getByRole("combobox", { name: "De onde você vai sair?" }),
    { target: { value: "Origem manual" } },
  );
  rerender(<JourneyPlanner {...props} deviceLocation={networkStops[0]} />);
  expect(
    (
      screen.getByRole("combobox", {
        name: "De onde você vai sair?",
      }) as HTMLInputElement
    ).value,
  ).toBe("Origem manual");
});
