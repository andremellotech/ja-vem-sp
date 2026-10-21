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
import { installJourneyMocks } from "./journey-harness";
import { googleFixture } from "./google-routes-fixture";
vi.mock("../src/features/map/TransitMap", () => ({
  default: () => <div aria-label="Rede SPTrans" />,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function places() {
  for (const [label, action, text] of [
    ["De onde você vai sair?", "Localizar origem", "Rua Origem, 1000"],
    ["Para onde você vai?", "Localizar destino", "Rua Destino, 1000"],
  ]) {
    fireEvent.change(screen.getByRole("combobox", { name: label }), {
      target: { value: text },
    });
    fireEvent.click(screen.getByRole("button", { name: action }));
    fireEvent.click(
      await screen.findByRole("option", { name: new RegExp("^" + text) }),
    );
  }
}
function setup() {
  installJourneyMocks();
  const original = globalThis.fetch;
  const routes = vi.fn();
  const searches: string[] = [];
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
    if (input.includes("/api/health"))
      return Promise.resolve(
        Response.json({ configured: true, googleRoutesConfigured: true }),
      );
    if (input.includes("/api/google/routes")) {
      routes(input, init);
      return Promise.resolve(Response.json(googleFixture));
    }
    if (input.includes("/api/lines?q=")) {
      searches.push(input);
      return Promise.resolve(
        Response.json({
          data: [
            {
              id: "one",
              code: "675K-10",
              name: "Linha",
              direction: 1,
              origin: "Centro",
              destination: "Terminal 1",
            },
            {
              id: "two",
              code: "675K-10",
              name: "Linha",
              direction: 2,
              origin: "Terminal",
              destination: "Centro 2",
            },
          ],
          source: "SPTrans",
          fetchedAt: "2026-10-20T13:00:00Z",
          observedAt: null,
        }),
      );
    }
    return original(input, init);
  });
  render(<App apiBase="https://api.test" />);
  return { routes, searches };
}
it("integra mapa Google separado e volta a GTFS sem perder os endereços", async () => {
  const { routes } = setup();
  await places();
  expect(routes).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Calcular com Google Maps" }),
  );
  await screen.findByText("Metrô e ônibus");
  expect(
    screen.getByRole("region", { name: "Mapa do trajeto Google Maps" }),
  ).toBeTruthy();
  expect(screen.queryByLabelText("Rede SPTrans")).toBeNull();
  expect(
    await screen.findByText(/Não foi possível carregar o mapa Google/),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Ver opções de ônibus" }));
  await screen.findByRole("button", { name: "Ver opção 1 no mapa" });
  expect(screen.queryByText("Metrô e ônibus")).toBeNull();
  expect(
    screen.queryByRole("region", { name: "Mapa do trajeto Google Maps" }),
  ).toBeNull();
  expect(
    (
      screen.getByRole("combobox", {
        name: "De onde você vai sair?",
      }) as HTMLInputElement
    ).value,
  ).toContain("Rua Origem");
});
it("BUS busca por código e mantém ambos sentidos para escolha manual", async () => {
  const { searches } = setup();
  await places();
  fireEvent.click(
    screen.getByRole("button", { name: "Calcular com Google Maps" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: /Acompanhar ônibus/ }),
  );
  await screen.findByText("Terminal 1");
  expect(screen.getByText("Centro 2")).toBeTruthy();
  expect(screen.queryByText("Sua linha")).toBeNull();
  expect(searches).toEqual(["https://api.test/api/lines?q=675K-10"]);
  expect(
    (
      screen.getByRole("combobox", {
        name: "Linha ou destino",
      }) as HTMLInputElement
    ).value,
  ).toBe("675K-10");
  expect(screen.queryByText("Metrô e ônibus")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Trajeto" }));
  expect(
    (
      screen.getByRole("combobox", {
        name: "Para onde você vai?",
      }) as HTMLInputElement
    ).value,
  ).toContain("Rua Destino");
});
