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
import { installJourneyMocks } from "./journey-harness";
import type { Stop } from "../src/contracts";
import type { JourneyMapSelection } from "../src/features/journey/types";
import { createPlannerIndex } from "../src/features/journey/data";
import { findJourneys } from "../src/features/journey/router";
import { fixture, networkStops } from "./planner-fixtures";
vi.mock("../src/features/map/TransitMap", () => ({
  default: ({
    stops,
    journey,
  }: {
    stops: Stop[];
    journey: JourneyMapSelection | null;
  }) => (
    <>
      <output aria-label="Pontos da pesquisa no mapa">
        {stops.map((s) => s.id).join(",")}
      </output>
      <output aria-label="Pontos do trajeto no mapa">
        {journey?.stops.map((s) => s.id).join(",")}
      </output>
    </>
  ),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});
async function endpoints() {
  for (const [label, term, action] of [
    ["De onde você vai sair?", "Rua Origem", "Localizar origem"],
    ["Para onde você vai?", "Rua Destino", "Localizar destino"],
  ]) {
    fireEvent.change(screen.getByRole("textbox", { name: label }), {
      target: { value: term + ", 1000" },
    });
    fireEvent.click(screen.getByRole("button", { name: action }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: new RegExp("^" + term + ", 1000"),
      }),
    );
  }
}
it("abre o formulário por padrão e consulta todas as linhas ao escolher embarque", async () => {
  const { arrivalUrls } = installJourneyMocks({ networkFailure: true });
  render(<App apiBase="https://api.test" />);
  expect(
    screen.getByRole("textbox", { name: "De onde você vai sair?" }),
  ).toBeTruthy();
  await endpoints();
  fireEvent.click(screen.getByRole("button", { name: "Ver opções de ônibus" }));
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Ver chegadas no embarque da opção 1",
    }),
  );
  await waitFor(() =>
    expect(arrivalUrls[0]).toContain("/api/stops/A/arrivals"),
  );
  expect(arrivalUrls[0]).not.toContain("lineId");
  expect(screen.getByRole("heading", { name: "Origem" })).toBeTruthy();
  expect(
    await screen.findByText("Nenhuma previsão disponível nesta consulta."),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Trajeto" }));
  expect(
    (
      screen.getByRole("textbox", {
        name: "De onde você vai sair?",
      }) as HTMLInputElement
    ).value,
  ).toContain("Rua Origem");
});
it("mantém consulta de linhas acessível quando o geocodificador falha", async () => {
  installJourneyMocks();
  render(<App apiBase="https://api.test" />);
  fireEvent.click(screen.getByRole("button", { name: "Linhas e paradas" }));
  expect(
    screen.getByRole("textbox", { name: "Linha ou destino" }),
  ).toBeTruthy();
});
it("oculta paradas de pesquisas anteriores ao desenhar um trajeto", async () => {
  installJourneyMocks();
  const originalFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (input: string) =>
    input.includes("/api/stops?q=")
      ? Promise.resolve(
          Response.json({
            data: [{ ...networkStops[0], id: "antiga", name: "Parada antiga" }],
            source: "SPTrans",
            fetchedAt: new Date().toISOString(),
            observedAt: null,
          }),
        )
      : originalFetch(input),
  );
  render(<App apiBase="https://api.test" />);
  fireEvent.click(screen.getByRole("button", { name: "Linhas e paradas" }));
  fireEvent.change(screen.getByLabelText("Linha ou destino"), {
    target: { value: "Antiga" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Buscar ônibus" }));
  await screen.findByRole("button", { name: "Parada antiga" });
  fireEvent.click(screen.getByRole("button", { name: "Trajeto" }));
  await endpoints();
  fireEvent.click(screen.getByRole("button", { name: "Ver opções de ônibus" }));
  await screen.findByRole("button", { name: "Ver opção 1 no mapa" });
  expect(screen.getByLabelText("Pontos da pesquisa no mapa").textContent).toBe(
    "",
  );
  expect(screen.getByLabelText("Pontos do trajeto no mapa").textContent).toBe(
    "A,X,D",
  );
});
it("chegadas de uma alternativa também selecionam as paradas dessa alternativa", async () => {
  const { workers, arrivalUrls } = installJourneyMocks({ autoRespond: false });
  render(<App apiBase="https://api.test" />);
  await endpoints();
  fireEvent.click(screen.getByRole("button", { name: "Ver opções de ônibus" }));
  const input = workers[0].jobs[0].input;
  const result = findJourneys(
    createPlannerIndex(fixture(), networkStops),
    input,
  );
  const first = result.options[0];
  const alternateStop = {
    ...networkStops[0],
    id: "alternativa",
    name: "Embarque alternativo",
  };
  const second = {
    ...first,
    id: "outra",
    legs: [
      {
        ...first.legs[0],
        from: alternateStop,
        routeStops: [alternateStop, networkStops[2]],
      },
    ],
  };
  await act(async () =>
    workers[0].reply(1, { ...result, options: [first, second] }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Ver chegadas no embarque da opção 2" }),
  );
  await waitFor(() =>
    expect(arrivalUrls[0]).toContain("/api/stops/alternativa/arrivals"),
  );
  expect(screen.getByLabelText("Pontos do trajeto no mapa").textContent).toBe(
    "alternativa,D",
  );
});
