import React, { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import AddressField from "../src/features/journey/AddressField";
import type { Place } from "../src/features/journey/types";
const feature = (id: number, street: string, number = "1000") => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [-46.65, -23.56] },
  properties: {
    osm_type: "N",
    osm_id: id,
    street,
    housenumber: number,
    city: "São Paulo",
    countrycode: "br",
    type: "house",
  },
});
function Harness() {
  const [value, setValue] = useState(""),
    [selected, setSelected] = useState<Place | null>(null);
  return (
    <>
      <AddressField
        label="De onde você vai sair?"
        value={value}
        selected={selected}
        onChange={(text) => {
          setValue(text);
          setSelected(null);
        }}
        onSelect={(p) => {
          setSelected(p);
          setValue(p.label);
        }}
      />
      <output>{selected?.id ?? "sem ponto"}</output>
    </>
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("busca somente por ação, exige seleção e invalida ao editar", async () => {
  const fetcher = vi.fn(async () =>
    Response.json({ features: [feature(1, "Avenida Paulista")] }),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<Harness />);
  fireEvent.change(screen.getByLabelText("De onde você vai sair?"), {
    target: { value: "Avenida Paulista, 1000" },
  });
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Localizar origem" }));
  fireEvent.click(
    await screen.findByRole("button", { name: /Avenida Paulista, 1000/ }),
  );
  expect(screen.getByText("N:1")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("De onde você vai sair?"), {
    target: { value: "Outro endereço" },
  });
  expect(screen.getByText("sem ponto")).toBeTruthy();
});
it("exige confirmação do ponto aproximado e mostra marcação como texto", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({ features: [feature(2, "<img src=x>", "")] }),
  );
  render(<Harness />);
  fireEvent.change(screen.getByLabelText("De onde você vai sair?"), {
    target: { value: "Rua Teste, 42" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Localizar origem" }));
  fireEvent.click(await screen.findByRole("button", { name: /<img src=x>/ }));
  expect(screen.getByText("sem ponto")).toBeTruthy();
  expect(document.querySelector("img")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Usar este ponto aproximado" }),
  );
  expect(screen.getByText("N:2")).toBeTruthy();
});
it("ignora resposta antiga mesmo quando o fornecedor ignora abort", async () => {
  let finish!: (r: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      url.includes("antigo")
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(Response.json({ features: [feature(2, "Novo")] })),
    ),
  );
  render(<Harness />);
  const input = screen.getByLabelText("De onde você vai sair?");
  fireEvent.change(input, { target: { value: "antigo" } });
  fireEvent.click(screen.getByRole("button", { name: "Localizar origem" }));
  fireEvent.change(input, { target: { value: "novo" } });
  fireEvent.click(screen.getByRole("button", { name: "Localizar origem" }));
  await screen.findByRole("button", { name: /Novo/ });
  finish(Response.json({ features: [feature(1, "Antigo")] }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: /Antigo/ })).toBeNull(),
  );
});
it("permite tentar novamente depois de falha", async () => {
  let broken = true;
  vi.stubGlobal("fetch", async () =>
    broken
      ? new Response("Bad", { status: 503 })
      : Response.json({ features: [feature(1, "Paulista")] }),
  );
  render(<Harness />);
  fireEvent.change(screen.getByLabelText("De onde você vai sair?"), {
    target: { value: "Paulista" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Localizar origem" }));
  await screen.findByRole("button", { name: "Tentar novamente" });
  broken = false;
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  await screen.findByRole("button", { name: /Paulista/ });
});
