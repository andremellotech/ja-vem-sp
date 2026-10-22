import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AddressField from "../src/features/journey/AddressField";
vi.mock("../src/features/journey/PointPicker", () => ({
  default: ({
    onConfirm,
  }: {
    onConfirm: (p: { lat: number; lon: number }) => void;
  }) => (
    <button onClick={() => onConfirm({ lat: -23.62, lon: -46.68 })}>
      Confirmar ponto no mapa
    </button>
  ),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("permite indicar a entrada exata e preserva o número solicitado sem inventar confirmação cadastral", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ features: [] })),
  );
  const select = vi.fn();
  render(
    <AddressField
      label="Destino"
      id="destination"
      value="Rua Exemplo, 1058"
      selected={null}
      onChange={() => {}}
      onSelect={select}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Marcar destino no mapa" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Confirmar ponto no mapa" }),
  );
  expect(select).toHaveBeenCalledWith(
    expect.objectContaining({
      lat: -23.62,
      lon: -46.68,
      label: "Rua Exemplo, 1058",
      source: "map",
      requestedAddress: "Rua Exemplo, 1058",
    }),
  );
});
it("mantém a referência escolhida de bairro e cidade ao ajustar a entrada no mapa", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ features: [] })),
  );
  const select = vi.fn();
  const reference = {
    id: "street-reference",
    lat: -23.62,
    lon: -46.68,
    label: "Rua Exemplo · Bairro Jardim · São Paulo · CEP 04500-000",
    requestedAddress: "Rua Exemplo, 1058",
    source: "photon" as const,
    approximate: true,
    city: "São Paulo",
    district: "Bairro Jardim",
    locality: "São Paulo",
    postcode: "04500-000",
    outsideCoverage: false,
  };
  render(
    <AddressField
      label="Destino"
      id="destination"
      value="Rua Exemplo, 1058"
      selected={reference}
      onChange={() => {}}
      onSelect={select}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Marcar destino no mapa" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Confirmar ponto no mapa" }),
  );
  expect(select).toHaveBeenCalledWith(
    expect.objectContaining({
      ...reference,
      id: expect.stringMatching(/^map:/),
      source: "map",
      label: "Rua Exemplo, 1058",
      referenceLabel: reference.label,
    }),
  );
});
