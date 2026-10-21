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
    fireEvent.change(screen.getByRole("combobox", { name: label }), {
      target: { value: term + ", 1000" },
    });
    fireEvent.click(screen.getByRole("button", { name: action }));
    fireEvent.click(
      await screen.findByRole("option", {
        name: new RegExp("^" + term + ", 1000"),
      }),
    );
  }
}
it("abre o formulário por padrão e consulta todas as linhas ao escolher embarque", async () => {
  const { arrivalUrls } = installJourneyMocks({ networkFailure: true });
  render(<App apiBase="https://api.test" />);
  expect(
    screen.getByRole("combobox", { name: "De onde você vai sair?" }),
  ).toBeTruthy();
  await endpoints();
  fireEvent.click(
    screen.getByRole("button", { name: "Ver opções de transporte" }),
  );
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
      screen.getByRole("combobox", {
        name: "De onde você vai sair?",
      }) as HTMLInputElement
    ).value,
  ).toContain("Rua Origem");
});
it("mantém consulta de linhas acessível quando o geocodificador falha", async () => {
  installJourneyMocks();
  render(<App apiBase="https://api.test" />);
  fireEvent.click(screen.getByRole("button", { name: "Linhas e horários" }));
  expect(
    screen.getByRole("combobox", { name: "Linha ou destino" }),
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
  fireEvent.click(screen.getByRole("button", { name: "Linhas e horários" }));
  fireEvent.change(screen.getByLabelText("Linha ou destino"), {
    target: { value: "Antiga" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Buscar ônibus" }));
  await screen.findByRole("button", { name: "Parada antiga" });
  fireEvent.click(screen.getByRole("button", { name: "Trajeto" }));
  await endpoints();
  fireEvent.click(
    screen.getByRole("button", { name: "Ver opções de transporte" }),
  );
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
  fireEvent.click(
    screen.getByRole("button", { name: "Ver opções de transporte" }),
  );
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
it("ignora linhas e paradas antigas assim que o texto da busca muda", async () => {
  installJourneyMocks();
  const original = globalThis.fetch;
  let finishLines!: (r: Response) => void, finishStops!: (r: Response) => void;
  const signals: AbortSignal[] = [];
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
    if (input.includes("/api/lines?q=")) {
      signals.push(init!.signal!);
      return new Promise<Response>((r) => {
        finishLines = r;
      });
    }
    if (input.includes("/api/stops?q="))
      return new Promise<Response>((r) => {
        finishStops = r;
      });
    return original(input, init);
  });
  render(<App apiBase="https://api.test" />);
  fireEvent.click(screen.getByRole("button", { name: "Linhas e horários" }));
  const input = screen.getByLabelText("Linha ou destino");
  fireEvent.change(input, { target: { value: "antiga" } });
  fireEvent.click(screen.getByRole("button", { name: "Buscar ônibus" }));
  fireEvent.change(input, { target: { value: "nova" } });
  expect(signals[0].aborted).toBe(true);
  const result = (data: unknown) =>
    Response.json({
      data,
      source: "SPTrans",
      fetchedAt: new Date().toISOString(),
      observedAt: null,
    });
  await act(async () => {
    finishLines(
      result([
        {
          id: "old",
          code: "8000-10",
          name: "Antiga",
          origin: "Terminal",
          destination: "Resultado antigo",
          direction: 1,
        },
      ]),
    );
    finishStops(
      result([{ ...networkStops[0], id: "old-stop", name: "Parada antiga" }]),
    );
  });
  expect(screen.queryByRole("button", { name: /Resultado antigo/ })).toBeNull();
  expect(screen.queryByRole("button", { name: "Parada antiga" })).toBeNull();
});
