import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import NearbyTransit from "../src/features/nearby/NearbyTransit";
import { createPlannerIndex } from "../src/features/journey/data";
import { fixture, networkStops, trip } from "./planner-fixtures";
import { loadLineIndex } from "../src/features/journey/line-stops";
vi.mock("../src/features/journey/line-stops", () => ({
  loadLineIndex: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("permite ver todas as paradas e linhas próximas além das oito iniciais", async () => {
  const points = Array.from({ length: 12 }, (_, i) => ({
    ...networkStops[0],
    id: "p" + i,
    name: "Ponto " + i,
    lat: networkStops[0].lat + i * 0.0001,
  }));
  vi.mocked(loadLineIndex).mockResolvedValue(
    createPlannerIndex(
      fixture(points.map((s, i) => trip("L" + i, [s.id, "D"]))),
      [...points, networkStops[2]],
    ),
  );
  const changed = vi.fn();
  render(
    <NearbyTransit
      location={networkStops[0]}
      onLocate={async () => null}
      onSelectStop={() => {}}
      onSelectLine={() => {}}
      onStopsChange={changed}
    />,
  );
  await screen.findByRole("button", { name: /Ponto 0.*Ver chegadas/ });
  expect(screen.queryByText("Ponto 11", { exact: true })).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Mostrar mais paradas próximas" }),
  );
  expect(screen.getByText("Ponto 11", { exact: true })).toBeTruthy();
  await waitFor(() =>
    expect(changed).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "p11" })]),
    ),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Mostrar mais linhas próximas" }),
  );
  expect(
    screen.getByRole("button", { name: /L11.*Consultar linha/ }),
  ).toBeTruthy();
});
it("usa índice compartilhado, amplia explicitamente e abre ponto/linha sem traduzir sentido", async () => {
  const farther = { ...networkStops[0], lat: networkStops[0].lat + 0.009 };
  vi.mocked(loadLineIndex).mockResolvedValue(
    createPlannerIndex(fixture([trip("857C-10", ["A", "D"])]), [
      farther,
      networkStops[2],
    ]),
  );
  const stops = vi.fn(),
    line = vi.fn(),
    show = vi.fn();
  render(
    <NearbyTransit
      location={networkStops[0]}
      onLocate={async () => null}
      onSelectStop={show}
      onSelectLine={line}
      onStopsChange={stops}
    />,
  );
  await screen.findByText("Nenhuma parada de ônibus encontrada neste alcance.");
  expect(
    screen.queryByRole("button", { name: /Origem.*Ver chegadas/ }),
  ).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Ampliar busca para 1.200 m" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: /Origem.*Ver chegadas/ }),
  );
  expect(show).toHaveBeenCalledWith(expect.objectContaining({ id: "A" }));
  fireEvent.click(
    screen.getByRole("button", { name: /857C-10.*Consultar linha/ }),
  );
  expect(line).toHaveBeenCalledWith("857C-10");
  expect(loadLineIndex).toHaveBeenCalledTimes(1);
  expect(stops).toHaveBeenLastCalledWith([
    expect.objectContaining({ id: "A" }),
  ]);
});
it("não carrega índice escondido e informa localização recusada", async () => {
  vi.mocked(loadLineIndex).mockClear();
  const props = {
    location: null,
    onLocate: async () => null,
    onSelectStop: () => {},
    onSelectLine: () => {},
    onStopsChange: () => {},
  };
  const { rerender } = render(<NearbyTransit {...props} active={false} />);
  expect(loadLineIndex).not.toHaveBeenCalled();
  rerender(<NearbyTransit {...props} active />);
  fireEvent.click(
    screen.getByRole("button", { name: "Usar minha localização" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "Não foi possível usar sua localização",
    ),
  );
});
