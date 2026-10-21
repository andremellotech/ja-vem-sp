import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import JourneyPlanner from "../src/features/journey/JourneyPlanner";
import { installJourneyMocks } from "./journey-harness";
import JourneyOptions from "../src/features/journey/JourneyOptions";
import { createPlannerIndex } from "../src/features/journey/data";
import { findJourneys } from "../src/features/journey/router";
import { fixture, networkStops } from "./planner-fixtures";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function confirmPlaces() {
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
  return render(
    <JourneyPlanner
      onMapSelection={() => {}}
      onShowArrivals={() => {}}
      onLocate={async () => null}
    />,
  );
}
it("abre caminhada/transporte público somente com pontos confirmados e invalida ao editar", async () => {
  setup();
  expect(
    screen.queryByRole("link", { name: "A pé no Google Maps" }),
  ).toBeNull();
  await confirmPlaces();
  const walk = screen.getByRole("link", {
    name: "A pé no Google Maps",
  }) as HTMLAnchorElement;
  const transit = screen.getByRole("link", {
    name: "Transporte público no Google Maps",
  }) as HTMLAnchorElement;
  const url = new URL(walk.href);
  expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/");
  expect(url.searchParams.get("api")).toBe("1");
  expect(url.searchParams.get("origin")).toBe("-23.550000,-46.630000");
  expect(url.searchParams.get("destination")).toBe("-23.590000,-46.670000");
  expect(url.searchParams.get("travelmode")).toBe("walking");
  expect(new URL(transit.href).searchParams.get("travelmode")).toBe("transit");
  expect(walk.target).toBe("_blank");
  expect(walk.rel).toContain("noreferrer");
  expect(walk.href).not.toContain("Rua");
  fireEvent.change(
    screen.getByRole("combobox", { name: "Para onde você vai?" }),
    { target: { value: "Outro destino" } },
  );
  expect(
    screen.queryByRole("link", { name: "A pé no Google Maps" }),
  ).toBeNull();
});
it("oferece caminhada exata de acesso/saída da opção selecionada sem trocar a consulta SPTrans", async () => {
  const option = findJourneys(createPlannerIndex(fixture(), networkStops), {
    origin: networkStops[0],
    destination: networkStops[2],
    radiusM: 800,
    serviceDate: "20261021",
  }).options[0];
  const onWalk = vi.fn();
  const origin = { lat: -23.551, lon: -46.631 },
    destination = { lat: -23.591, lon: -46.671 };
  render(
    <JourneyOptions
      options={[option]}
      selectedId={option.id}
      origin={origin}
      destination={destination}
      onSelect={() => {}}
      onShowArrivals={() => {}}
      onWalk={onWalk}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Ir a pé até o embarque" }),
  );
  expect(onWalk).toHaveBeenLastCalledWith(
    origin,
    expect.objectContaining({ id: "A", lat: -23.55, lon: -46.63 }),
    "Até o embarque",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Ir a pé do desembarque ao destino" }),
  );
  expect(onWalk).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: "D", lat: -23.59, lon: -46.67 }),
    destination,
    "Até o destino",
  );
  expect(
    screen.getByRole("button", { name: "Ver chegadas no embarque da opção 1" }),
  ).toBeTruthy();
});
