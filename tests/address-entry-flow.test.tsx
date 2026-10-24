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
import AddressField from "../src/features/journey/AddressField";
import { installJourneyMocks } from "./journey-harness";

beforeEach(() =>
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  ),
);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("abre a entrada ao selecionar rua aproximada e usa os dois pontos escolhidos no cálculo", async () => {
  const { workers } = installJourneyMocks();
  const selected = vi.fn();
  render(
    <JourneyPlanner
      onMapSelection={selected}
      onShowArrivals={() => {}}
      onLocate={async () => null}
    />,
  );
  for (const [label, value, action, point] of [
    [
      "De onde você vai sair?",
      "Rua Origem 1058",
      "Localizar origem",
      "-23.55015, -46.63012",
    ],
    [
      "Para onde você vai?",
      "Rua Destino 685",
      "Localizar destino",
      "https://www.google.com/maps/search/?api=1&query=-23.59023%2C-46.67018",
    ],
  ]) {
    fireEvent.change(screen.getByRole("combobox", { name: label }), {
      target: { value },
    });
    fireEvent.click(screen.getByRole("button", { name: action }));
    fireEvent.click(
      await screen.findByRole("option", { name: /1000.*Ponto aproximado/ }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Marque a entrada do local",
    });
    expect(within(dialog).getByText(value)).toBeTruthy();
    expect(
      within(dialog)
        .getByRole("button", { name: "Confirmar ponto no mapa" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.change(
      within(dialog).getByLabelText("Coordenadas ou link do ponto"),
      { target: { value: point } },
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Aplicar ponto colado" }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirmar ponto no mapa" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  }
  fireEvent.click(
    screen.getByRole("button", { name: "Ver opções de transporte" }),
  );
  await screen.findByRole("region", { name: "Seu trajeto completo" });
  expect(workers[0].jobs[0].input).toMatchObject({
    origin: { lat: -23.55015, lon: -46.63012 },
    destination: { lat: -23.59023, lon: -46.67018 },
  });
  expect(selected.mock.lastCall?.[0]).toMatchObject({
    originLabel: "Rua Origem 1058",
    destinationLabel: "Rua Destino 685",
    origin: { lat: -23.55015, lon: -46.63012 },
    destination: { lat: -23.59023, lon: -46.67018 },
  });
});

it("cancelar o mapa não aceita o centro da rua nem perde a referência escolhida", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      features: [
        {
          geometry: { type: "Point", coordinates: [-46.65, -23.56] },
          properties: {
            street: "Rua Exemplo",
            city: "São Paulo",
            type: "street",
            osm_id: 1,
          },
        },
      ],
    }),
  );
  const select = vi.fn();
  render(
    <AddressField
      label="Origem"
      value="Rua Exemplo 1058"
      selected={null}
      onChange={() => {}}
      onSelect={select}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Localizar origem" }));
  fireEvent.click(await screen.findByRole("option", { name: /Rua Exemplo/ }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Cancelar marcação" }),
  );
  expect(select).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Usar este ponto aproximado" }),
  ).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Marcar origem no mapa" }),
  );
  const reopened = await screen.findByRole("dialog");
  fireEvent.click(
    within(reopened).getByRole("button", { name: "Usar centro do mapa" }),
  );
  fireEvent.click(
    within(reopened).getByRole("button", { name: "Confirmar ponto no mapa" }),
  );
  expect(select).toHaveBeenCalledWith(
    expect.objectContaining({
      lat: -23.56,
      lon: -46.65,
      requestedAddress: "Rua Exemplo 1058",
      referenceLabel: expect.stringContaining("Rua Exemplo"),
      source: "map",
    }),
  );
});

it("não deixa confirmar o ponto anterior após colar um link inválido", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ features: [] }));
  render(
    <AddressField
      label="Destino"
      id="destination"
      value="Destino 685"
      selected={null}
      onChange={() => {}}
      onSelect={() => {}}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Marcar destino no mapa" }),
  );
  const dialog = await screen.findByRole("dialog");
  const pasted = within(dialog).getByLabelText("Coordenadas ou link do ponto");
  fireEvent.change(pasted, { target: { value: "-23.56,-46.65" } });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Aplicar ponto colado" }),
  );
  fireEvent.change(pasted, {
    target: { value: "https://maps.app.goo.gl/Exemplo" },
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Aplicar ponto colado" }),
  );
  await waitFor(() =>
    expect(within(dialog).getByRole("alert").textContent).toContain("curto"),
  );
  expect(
    within(dialog)
      .getByRole("button", { name: "Confirmar ponto no mapa" })
      .hasAttribute("disabled"),
  ).toBe(true);
});
it("busca o número no cadastro municipal somente pelo botão e abre o mapa do lote", async () => {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(String(url));
    return String(url).includes("/api/addresses")
      ? Response.json({
          data: [
            {
              id: "geosampa:lote.1",
              label: "AV PAULISTA, 1578 · São Paulo · GeoSampa",
              source: "geosampa",
              approximate: true,
              lat: -23.5614,
              lon: -46.6559,
              boundary: [
                { lat: -23.5614, lon: -46.6559 },
                { lat: -23.5615, lon: -46.6558 },
                { lat: -23.5616, lon: -46.6557 },
                { lat: -23.5614, lon: -46.6559 },
              ],
            },
          ],
        })
      : Response.json({ features: [] });
  });
  render(
    <AddressField
      label="Origem"
      value="Av Paulista 1578"
      selected={null}
      onChange={() => {}}
      onSelect={() => {}}
      addressApiBase="https://api.example"
    />,
  );
  expect(calls.some((c) => c.includes("/api/addresses"))).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Localizar origem" }));
  fireEvent.click(await screen.findByRole("option", { name: /GeoSampa/ }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(/Área do lote cadastrado/)).toBeTruthy();
  expect(
    within(dialog)
      .getByRole("button", { name: "Confirmar ponto no mapa" })
      .hasAttribute("disabled"),
  ).toBe(true);
});
it("confere o número ao escolher uma sugestão da rua e abre o lote, sem aceitar o centro da rua", async () => {
  vi.useFakeTimers();
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(String(url));
    return String(url).includes("/api/addresses")
      ? Response.json({
          data: [
            {
              id: "geosampa:lote.2",
              label: "AV PAULISTA, 1578 · São Paulo · GeoSampa",
              lat: -23.5614,
              lon: -46.6559,
              source: "geosampa",
              approximate: true,
              boundary: [
                { lat: -23.5614, lon: -46.6559 },
                { lat: -23.5615, lon: -46.6558 },
                { lat: -23.5616, lon: -46.6557 },
                { lat: -23.5614, lon: -46.6559 },
              ],
            },
          ],
        })
      : Response.json({
          features: [
            {
              geometry: { type: "Point", coordinates: [-46.64, -23.55] },
              properties: {
                street: "Avenida Paulista",
                city: "São Paulo",
                type: "street",
                osm_id: 2,
              },
            },
          ],
        });
  });
  render(
    <AddressField
      label="Origem"
      value="Av Paulista 1578"
      selected={null}
      onChange={() => {}}
      onSelect={() => {}}
      addressApiBase="https://api.example"
    />,
  );
  await act(() => vi.advanceTimersByTimeAsync(600));
  expect(calls.some((c) => c.includes("/api/addresses"))).toBe(false);
  fireEvent.click(screen.getByRole("option", { name: /Avenida Paulista/ }));
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(calls.some((c) => c.includes("/api/addresses"))).toBe(true);
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("option", { name: /GeoSampa/ }));
  expect(
    within(screen.getByRole("dialog")).getByText(/Área do lote cadastrado/),
  ).toBeTruthy();
});
