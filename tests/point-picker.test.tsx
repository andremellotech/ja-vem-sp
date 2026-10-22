import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import PointPicker from "../src/features/journey/PointPicker";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("exige marcação explícita e usa as coordenadas informadas sem deslocar para uma parada", () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const confirm = vi.fn();
  render(
    <PointPicker
      initial={{ lat: -23.55, lon: -46.63 }}
      address="Rua Exemplo, 1058"
      onConfirm={confirm}
      onCancel={() => {}}
    />,
  );
  const submit = screen.getByRole("button", {
    name: "Confirmar ponto no mapa",
  }) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Latitude"), {
    target: { value: "-23,620123" },
  });
  fireEvent.change(screen.getByLabelText("Longitude"), {
    target: { value: "-46,680456" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Aplicar coordenadas" }));
  fireEvent.click(submit);
  expect(confirm).toHaveBeenCalledWith({ lat: -23.620123, lon: -46.680456 });
  fireEvent.change(screen.getByLabelText("Latitude"), {
    target: { value: "1000" },
  });
  expect(submit.disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Aplicar coordenadas" }));
  expect(screen.getByRole("alert").textContent).toContain(
    "latitude entre -90 e 90",
  );
});
