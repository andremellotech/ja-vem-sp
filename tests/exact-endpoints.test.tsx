import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import JourneyPlanner from "../src/features/journey/JourneyPlanner";
import JourneyOptions from "../src/features/journey/JourneyOptions";
import { installJourneyMocks } from "./journey-harness";
import { createPlannerIndex } from "../src/features/journey/data";
import { findJourneys } from "../src/features/journey/router";
import { fixture, networkStops } from "./planner-fixtures";

vi.mock("../src/features/journey/PointPicker", () => ({
  default: ({
    address,
    onConfirm,
  }: {
    address: string;
    onConfirm: (p: { lat: number; lon: number }) => void;
  }) => (
    <button
      onClick={() =>
        onConfirm(
          address.includes("Origem")
            ? { lat: -23.55015, lon: -46.63012 }
            : { lat: -23.59023, lon: -46.67018 },
        )
      }
    >
      Confirmar ponto no mapa
    </button>
  ),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("envia os pontos marcados ao planejador e inclui a caminhada até o destino exato, além da parada", async () => {
  const { workers } = installJourneyMocks();
  const original = fetch;
  const footUrls: string[] = [];
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    if (String(url).includes("routed-foot")) {
      footUrls.push(String(url));
      const pairs = new URL(url).pathname
        .split("/")
        .at(-1)!
        .split(";")
        .map((p) => p.split(",").map(Number));
      return Promise.resolve(
        Response.json({
          code: "Ok",
          routes: [
            {
              distance: 40,
              duration: 30,
              geometry: { type: "LineString", coordinates: pairs },
              legs: [{ steps: [] }],
            },
          ],
        }),
      );
    }
    return original(url, init);
  });
  const selected = vi.fn();
  render(
    <JourneyPlanner
      onMapSelection={selected}
      onShowArrivals={() => {}}
      onLocate={async () => null}
    />,
  );
  for (const [label, value, button] of [
    ["De onde você vai sair?", "Rua Origem, 1058", "Marcar origem no mapa"],
    ["Para onde você vai?", "Rua Destino, 250", "Marcar destino no mapa"],
  ]) {
    fireEvent.change(screen.getByRole("combobox", { name: label }), {
      target: { value },
    });
    fireEvent.click(screen.getByRole("button", { name: button }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirmar ponto no mapa" }),
    );
  }
  fireEvent.change(screen.getByLabelText("Baldeações"), {
    target: { value: "2" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Ver opções de transporte" }),
  );
  await screen.findByRole("button", { name: "Ver opção 1 no mapa" });
  expect(workers[0].jobs[0].input).toMatchObject({
    origin: { lat: -23.55015, lon: -46.63012 },
    destination: { lat: -23.59023, lon: -46.67018 },
    maxTransfers: 2,
  });
  await waitFor(
    () =>
      expect(footUrls.some((u) => u.includes(";-46.67018,-23.59023"))).toBe(
        true,
      ),
    { timeout: 4000 },
  );
  expect(selected.mock.lastCall?.[0].destination).toMatchObject({
    lat: -23.59023,
    lon: -46.67018,
  });
  expect(
    screen.getAllByText(/Chegada · Rua Destino, 250/).length,
  ).toBeGreaterThan(0);
});

it("separa as caminhadas de cada baldeação e a caminhada final em uma opção com quatro veículos", () => {
  const base = findJourneys(createPlannerIndex(fixture(), networkStops), {
    origin: networkStops[0],
    destination: networkStops[2],
    radiusM: 800,
    serviceDate: "20261021",
  }).options[0];
  const legs = [0, 1, 2, 3].map((i) => ({
    ...base.legs[0],
    tripId: "trip" + i,
    mode: i === 1 ? ("metro" as const) : ("bus" as const),
    from: { ...networkStops[0], id: "from" + i, name: "Embarque " + i },
    to: { ...networkStops[2], id: "to" + i, name: "Desembarque " + i },
  }));
  const walk = vi.fn(),
    arrivals = vi.fn(),
    destination = { lat: -23.6, lon: -46.68 };
  const option = {
    ...base,
    legs,
    transferCount: 3 as const,
    transferWalksM: [90, 140, 210],
  };
  render(
    <JourneyOptions
      options={[option]}
      selectedId={option.id}
      origin={networkStops[0]}
      destination={destination}
      onSelect={() => {}}
      onWalk={walk}
      onShowArrivals={arrivals}
    />,
  );
  for (let n = 1; n <= 3; n++) {
    fireEvent.click(
      screen.getByRole("button", { name: "Ver caminhada da troca " + n }),
    );
    expect(walk).toHaveBeenLastCalledWith(
      legs[n - 1].to,
      legs[n].from,
      "Caminhada na troca " + n,
    );
  }
  fireEvent.click(
    screen.getByRole("button", { name: "Ir a pé do desembarque ao destino" }),
  );
  expect(walk).toHaveBeenLastCalledWith(
    legs[3].to,
    destination,
    "Até o destino",
  );
  expect(
    screen.queryByRole("button", {
      name: "Ver chegadas na troca 1 da opção 1",
    }),
  ).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Ver chegadas na troca 3 da opção 1" }),
  );
  expect(arrivals).toHaveBeenLastCalledWith(legs[3].from, option);
});
