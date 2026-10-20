import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import LineSearch from "../src/features/lines/LineSearch";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("sugere catálogo local com teclado, cancela ao esconder e preserva busca manual", async () => {
  const line = {
    id: "1",
    code: "857C-10",
    name: "Campo Limpo",
    origin: "Terminal",
    destination: "Conceição",
    direction: 1,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ version: 1, retrievedAt: "2026-10-20", lines: [line] }),
    ),
  );
  const select = vi.fn(),
    submit = vi.fn(),
    change = vi.fn();
  const props = {
    value: "857c",
    onChange: change,
    onSelect: select,
    onSubmit: submit,
    active: true,
  };
  const { rerender } = render(<LineSearch {...props} />);
  await screen.findByRole("option", { name: /857C-10/ });
  const input = screen.getByRole("combobox", { name: "Linha ou destino" });
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(input.getAttribute("aria-activedescendant")).toBeTruthy();
  fireEvent.keyDown(input, { key: "Enter" });
  expect(select).toHaveBeenCalledWith(line);
  fireEvent.keyDown(input, { key: "Escape" });
  fireEvent.submit(input.closest("form")!);
  expect(submit).toHaveBeenCalled();
  rerender(<LineSearch {...props} active={false} />);
  expect(screen.queryByRole("option")).toBeNull();
});
it("seta para cima inicia na última sugestão e seleção permanece fechada após atualizar valor", async () => {
  const rows = [1, 2].map((i) => ({
    id: String(i),
    code: "857C-10",
    name: "Campo Limpo",
    origin: "Terminal",
    destination: "Destino " + i,
    direction: i,
  }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ version: 1, retrievedAt: "2026-10-20", lines: rows }),
    ),
  );
  const select = vi.fn();
  const props = {
    value: "857c",
    onChange: () => {},
    onSelect: select,
    onSubmit: () => {},
  };
  const { rerender } = render(<LineSearch {...props} />);
  await screen.findAllByRole("option");
  const input = screen.getByRole("combobox", { name: "Linha ou destino" });
  fireEvent.keyDown(input, { key: "ArrowUp" });
  expect(input.getAttribute("aria-activedescendant")).toBe("line-option-1");
  fireEvent.keyDown(input, { key: "Enter" });
  expect(select).toHaveBeenCalledWith(rows[1]);
  rerender(<LineSearch {...props} value="857C-10" />);
  expect(screen.queryByRole("option")).toBeNull();
});
