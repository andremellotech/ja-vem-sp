import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "../src/App";
import { fixture, hash, networkStops, trip } from "./planner-fixtures";
import type { Stop } from "../src/contracts";
vi.mock("../src/features/map/TransitMap", () => ({
  default: ({ stops, network }: { stops: Stop[]; network: unknown }) => (
    <>
      <output aria-label="Pontos no mapa">
        {stops.map((s) => s.id).join(",")}
      </output>
      <output aria-label="Rede geral no mapa">
        {network ? "visível" : "oculta"}
      </output>
    </>
  ),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});
function install(fleetFailure = false) {
  const data = fixture([trip("t", ["A", "X", "D"])]);
  data.routes = [{ id: "r", code: "8000-10", name: "Pirituba" }];
  data.trips[0] = {
    ...data.trips[0],
    routeId: "r",
    headsign: "Term. Pirituba",
  };
  const result = (data: unknown) =>
    Response.json({
      data,
      source: "SPTrans",
      fetchedAt: new Date().toISOString(),
      observedAt: null,
    });
  vi.stubGlobal("fetch", async (input: string) => {
    if (input.includes("health")) return Response.json({ configured: true });
    if (input.includes("data/stops.json"))
      return Response.json({
        provenance: { sha256: hash },
        stops: networkStops.map((s) => [
          s.id,
          s.name,
          s.ref,
          s.lat,
          s.lon,
          s.rail ? 1 : 0,
        ]),
      });
    if (input.includes("data/planner.json")) return Response.json(data);
    if (input.includes("/vehicles"))
      return fleetFailure
        ? Response.json(
            {
              error: {
                code: "PROVIDER_UNAVAILABLE",
                message: "Frota indisponível agora",
              },
            },
            { status: 502 },
          )
        : result([]);
    if (input.includes("/stops")) return result([]);
    return result([
      {
        id: "999",
        code: "8000-10",
        name: "Pirituba",
        direction: 2,
        origin: "Centro",
        destination: "TERM. PIRITUBA",
      },
    ]);
  });
}
async function openLine() {
  render(<App apiBase="https://api.test" />);
  fireEvent.click(screen.getByRole("button", { name: "Linhas e paradas" }));
  fireEvent.change(screen.getByLabelText("Linha ou destino"), {
    target: { value: "8000" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Buscar ônibus" }));
  fireEvent.click(
    await screen.findByRole("button", {
      name: /8000-10.*TERM. PIRITUBA.*sentido 2/,
    }),
  );
}
it("mostra a linha completa do GTFS quando Olho Vivo não retorna paradas e oculta os outros pontos", async () => {
  install();
  await openLine();
  await screen.findByRole("button", { name: "Troca" });
  expect(screen.getByLabelText("Pontos no mapa").textContent).toBe("A,X,D");
  expect(screen.getByLabelText("Rede geral no mapa").textContent).toBe(
    "oculta",
  );
  expect(screen.getByText("3 paradas")).toBeTruthy();
});
it("mantém todas as paradas disponíveis mesmo quando a consulta de veículos falha", async () => {
  install(true);
  await openLine();
  await screen.findByRole("button", { name: "Troca" });
  expect(screen.getByText("3 paradas")).toBeTruthy();
  expect(screen.getByText("Frota indisponível agora")).toBeTruthy();
});
