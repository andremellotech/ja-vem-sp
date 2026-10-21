import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import JourneyPlanner from "../src/features/journey/JourneyPlanner";
import { installJourneyMocks } from "./journey-harness";

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
  setup();
  const original = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
    const response = await original(input, init);
    if (!input.includes("photon.komoot.io")) return response;
    const body = await response.json();
    body.features[0].geometry.coordinates = input.includes("Destino")
      ? [-46.671, -23.591]
      : [-46.631, -23.551];
    return Response.json(body);
  });
  await confirmPlaces();
  fireEvent.click(screen.getByRole("button", { name: "Ver opções de ônibus" }));
  await screen.findByRole("button", { name: "Ver opção 1 no mapa" });
  const access = screen.getByRole("link", {
    name: "Ir a pé até o embarque no Google Maps",
  }) as HTMLAnchorElement;
  const egress = screen.getByRole("link", {
    name: "Ir a pé do desembarque ao destino no Google Maps",
  }) as HTMLAnchorElement;
  expect(new URL(access.href).searchParams.get("travelmode")).toBe("walking");
  expect(new URL(access.href).searchParams.get("origin")).toBe(
    "-23.551000,-46.631000",
  );
  expect(new URL(access.href).searchParams.get("destination")).toBe(
    "-23.550000,-46.630000",
  );
  expect(new URL(egress.href).searchParams.get("travelmode")).toBe("walking");
  expect(new URL(egress.href).searchParams.get("destination")).toBe(
    "-23.591000,-46.671000",
  );
  expect(new URL(egress.href).searchParams.get("origin")).toBe(
    "-23.590000,-46.670000",
  );
  expect(
    screen.getByRole("button", { name: "Ver chegadas no embarque da opção 1" }),
  ).toBeTruthy();
});
