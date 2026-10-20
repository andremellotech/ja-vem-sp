import React, { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  act,
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
function Harness({ active = true }: { active?: boolean }) {
  const [value, setValue] = useState(""),
    [selected, setSelected] = useState<Place | null>(null);
  return (
    <>
      <AddressField
        active={active}
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
  vi.useRealTimers();
});
it("sugere após três caracteres e pausa, sem consultar a cada tecla", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(async () =>
    Response.json({ features: [feature(101, "Avenida Paulista")] }),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<Harness />);
  const input = screen.getByRole("combobox", {
    name: "De onde você vai sair?",
  });
  fireEvent.change(input, { target: { value: "Av" } });
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "Avenida Paul" } });
  await act(() => vi.advanceTimersByTimeAsync(300));
  fireEvent.change(input, { target: { value: "Avenida Paulista, 1000" } });
  await act(() => vi.advanceTimersByTimeAsync(599));
  expect(fetcher).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("option", { name: /Avenida Paulista/ })).toBeTruthy();
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(input.getAttribute("aria-activedescendant")).toBeTruthy();
  fireEvent.keyDown(input, { key: "Enter" });
  expect(screen.getByText("N:101")).toBeTruthy();
});
it("cancela sugestões de um painel inativo e ignora resposta tardia", async () => {
  vi.useFakeTimers();
  let finish!: (r: Response) => void;
  const fetcher = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  const view = render(<Harness />);
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "Avenida Paulista" },
  });
  await act(() => vi.advanceTimersByTimeAsync(600));
  view.rerender(<Harness active={false} />);
  await act(async () =>
    finish(Response.json({ features: [feature(102, "Antigo")] })),
  );
  expect(screen.queryByRole("option")).toBeNull();
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("reutiliza sugestões em memória e renova depois de cinco minutos", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(async () =>
    Response.json({ features: [feature(103, "Paulista")] }),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<Harness />);
  const input = screen.getByRole("combobox");
  const repeat = async () => {
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.change(input, { target: { value: "Paulista" } });
    await act(() => vi.advanceTimersByTimeAsync(600));
  };
  await repeat();
  await repeat();
  expect(fetcher).toHaveBeenCalledTimes(1);
  await act(() => vi.advanceTimersByTimeAsync(300000));
  await repeat();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("fecha com Escape e não reabre por uma resposta que chegou depois", async () => {
  vi.useFakeTimers();
  let finish!: (r: Response) => void;
  vi.stubGlobal(
    "fetch",
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  render(<Harness />);
  const input = screen.getByRole("combobox");
  fireEvent.change(input, { target: { value: "Paulista" } });
  await act(() => vi.advanceTimersByTimeAsync(600));
  fireEvent.keyDown(input, { key: "Escape" });
  await act(async () =>
    finish(Response.json({ features: [feature(104, "Tardia")] })),
  );
  expect(screen.queryByRole("option")).toBeNull();
  expect(input.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByText(/Nenhum endereço encontrado/)).toBeNull();
});
it("busca manual devolve o foco ao campo e não duplica o debounce", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(async () =>
    Response.json({ features: [feature(106, "Paulista")] }),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<Harness />);
  const input = screen.getByRole("combobox");
  fireEvent.change(input, { target: { value: "Paulista" } });
  fireEvent.click(screen.getByRole("button", { name: "Localizar origem" }));
  await act(() => vi.advanceTimersByTimeAsync(600));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(input);
});
it("não deixa timer de foco consultar depois que o painel foi desativado", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(async () =>
    Response.json({ features: [feature(105, "Paulista")] }),
  );
  vi.stubGlobal("fetch", fetcher);
  const props = {
    label: "Origem",
    value: "Paulista",
    selected: null,
    onChange: vi.fn(),
    onSelect: vi.fn(),
  };
  const view = render(<AddressField {...props} />);
  fireEvent.focus(screen.getByRole("combobox"));
  view.rerender(<AddressField {...props} active={false} />);
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.queryByRole("option")).toBeNull();
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
    await screen.findByRole("option", { name: /Avenida Paulista, 1000/ }),
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
  fireEvent.click(await screen.findByRole("option", { name: /<img src=x>/ }));
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
  await screen.findByRole("option", { name: /Novo/ });
  finish(Response.json({ features: [feature(1, "Antigo")] }));
  await waitFor(() =>
    expect(screen.queryByRole("option", { name: /Antigo/ })).toBeNull(),
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
  await screen.findByRole("option", { name: /Paulista/ });
});
