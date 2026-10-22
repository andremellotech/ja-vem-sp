import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import StopPicker from "../src/features/stops/StopPicker";
const stops = [
  {
    id: "150015739",
    name: "MORUMBI C/B",
    address: "Av. Sto. Amaro, 4440 · R Bernardino De Campos",
    lat: -23.622115,
    lon: -46.684425,
  },
  {
    id: "outro",
    name: "Outro ponto",
    address: "Rua Distante, 12",
    lat: -23.6,
    lon: -46.6,
  },
];
afterEach(cleanup);
it("combina as palavras da referência em qualquer ordem e preserva paradas homônimas", () => {
  render(
    <StopPicker
      stops={[
        ...stops,
        {
          ...stops[0],
          id: "outro-trecho",
          address: "R. Bernardino de Campos, 1000",
        },
      ]}
      selectedId={null}
      onSelect={() => {}}
      location={null}
      onLocate={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText("Buscar parada nesta linha"), {
    target: { value: "Campos rua Bernardino" },
  });
  expect(screen.getAllByRole("button", { name: /MORUMBI C\/B/ })).toHaveLength(
    2,
  );
  expect(screen.queryByRole("button", { name: /Outro ponto/ })).toBeNull();
});
it("encontra e identifica uma parada pela rua de referência, mesmo com prefixo abreviado", () => {
  const onSelect = vi.fn();
  render(
    <StopPicker
      stops={stops}
      selectedId={null}
      onSelect={onSelect}
      location={null}
      onLocate={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText("Buscar parada nesta linha"), {
    target: { value: "Rua Bernardino de Campos" },
  });
  expect(screen.queryByRole("button", { name: /Outro ponto/ })).toBeNull();
  const found = screen.getByRole("button", {
    name: /MORUMBI C\/B.*Bernardino De Campos/,
  });
  fireEvent.click(found);
  expect(onSelect).toHaveBeenCalledWith("150015739");
});
it("permite localizar pelo código do ponto e limpar o filtro", () => {
  render(
    <StopPicker
      stops={stops}
      selectedId={null}
      onSelect={() => {}}
      location={null}
      onLocate={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText("Buscar parada nesta linha"), {
    target: { value: "150015739" },
  });
  expect(screen.getByRole("button", { name: /MORUMBI C\/B/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Outro ponto/ })).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Limpar busca de paradas" }),
  );
  expect(screen.getByRole("button", { name: /Outro ponto/ })).toBeTruthy();
});
