import React, { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import AddressField from "../src/features/journey/AddressField";
import type { Place } from "../src/features/journey/types";
const feature = (id: number, district: string, city = "São Paulo") => ({
  type: "Feature",
  geometry: {
    type: "Point",
    coordinates:
      city === "São Paulo" ? [-46.65 - id / 10000, -23.56] : [-47.81, -21.17],
  },
  properties: {
    osm_type: "N",
    osm_id: id,
    street: "Rua dos Campos",
    housenumber: "42",
    district,
    locality: "Bairro " + district,
    city,
    countrycode: "BR",
    type: "house",
  },
});
function Harness() {
  const [value, setValue] = useState(""),
    [selected, setSelected] = useState<Place | null>(null);
  return (
    <>
      <AddressField
        label="Origem"
        value={value}
        selected={selected}
        onChange={(text) => {
          setValue(text);
          setSelected(null);
        }}
        onSelect={(place) => {
          setSelected(place);
          setValue(place.label);
        }}
      />
      <output aria-label="Ponto escolhido">
        {selected ? `${selected.id}:${selected.lon}` : "nenhum"}
      </output>
    </>
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("permite escolher ruas homônimas em bairros diferentes sem perder as coordenadas", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      features: [feature(1, "Centro"), feature(2, "Vila Nova")],
    }),
  );
  render(<Harness />);
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "Rua dos Campos, 42" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Localizar origem" }));
  const option = await screen.findByRole("option", { name: /Vila Nova/ });
  expect(screen.getByRole("option", { name: /Centro/ })).toBeTruthy();
  fireEvent.click(option);
  expect(screen.getByLabelText("Ponto escolhido").textContent).toBe(
    "N:2:-46.6502",
  );
});
it("exige confirmação do município mesmo quando rua e número foram encontrados", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", async () =>
    Response.json({ features: [feature(1, "Centro", "Ribeirão Preto")] }),
  );
  render(<Harness />);
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "Rua dos Campos, 42" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Incluir outras cidades" }),
  );
  await act(() => vi.advanceTimersByTimeAsync(600));
  fireEvent.click(screen.getByRole("option", { name: /Ribeirão Preto/ }));
  expect(screen.getByLabelText("Ponto escolhido").textContent).toBe("nenhum");
  expect(screen.getByText(/fora do município de São Paulo/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Usar este local" }));
  expect(screen.getByLabelText("Ponto escolhido").textContent).toContain("N:1");
});
it("cancela a busca e separa o cache ao mudar a região", async () => {
  vi.useFakeTimers();
  let finish!: (response: Response) => void;
  let oldSignal!: AbortSignal;
  const fetcher = vi.fn((url: string, init?: RequestInit) => {
    if (new URL(url).searchParams.has("bbox")) {
      oldSignal = init!.signal!;
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    }
    return Promise.resolve(
      Response.json({ features: [feature(2, "Novo", "Ribeirão Preto")] }),
    );
  });
  vi.stubGlobal("fetch", fetcher);
  render(<Harness />);
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "Rua dos Campos" },
  });
  await act(() => vi.advanceTimersByTimeAsync(600));
  fireEvent.click(
    screen.getByRole("button", { name: "Incluir outras cidades" }),
  );
  await act(() => vi.advanceTimersByTimeAsync(600));
  expect(oldSignal.aborted).toBe(true);
  expect(screen.getByRole("option", { name: /Novo/ })).toBeTruthy();
  await act(async () =>
    finish(Response.json({ features: [feature(1, "Antigo")] })),
  );
  expect(screen.queryByRole("option", { name: /Antigo/ })).toBeNull();
});
