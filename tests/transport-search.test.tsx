import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import App from "../src/App";

vi.mock("../src/features/map/TransitMap", () => ({
  default: ({ stops }: { stops: { id: string }[] }) => (
    <div data-testid="search-map">{stops.map((s) => s.id).join(",")}</div>
  ),
}));
const line = {
  id: "1",
  code: "857C-10",
  name: "Campo Limpo ↔ Conceição",
  origin: "TERM. CAMPO LIMPO",
  destination: "METRÔ CONCEIÇÃO",
  direction: 1,
};
const response = (data: unknown) =>
  Response.json({
    data,
    source: "SPTrans",
    fetchedAt: new Date().toISOString(),
    observedAt: null,
  });
function install(live: (url: string) => Promise<Response>, count = 2) {
  vi.stubGlobal("fetch", async (url: string) => {
    if (url.endsWith("data/lines.json"))
      return Response.json({
        version: 1,
        retrievedAt: "2026-10-20",
        lines: [
          line,
          {
            ...line,
            id: "2",
            direction: 2,
            origin: line.destination,
            destination: line.origin,
          },
        ],
      });
    if (url.endsWith("data/stops.json"))
      return Response.json({
        stops: [
          [
            "p1",
            "MORUMBI C/B",
            "Av. Sto. Amaro, 4440 · R. Bernardino De Campos",
            -23.62,
            -46.68,
          ],
          [
            "p2",
            "MORUMBI C/B",
            "Rua Bernardino de Campos, 1000",
            -23.61,
            -46.67,
          ],
          ...Array.from({ length: count - 2 }, (_, i) => [
            "extra" + i,
            "MORUMBI C/B",
            "Rua Bernardino de Campos, " + (2000 + i),
            -23.6,
            -46.6,
          ]),
          [
            "rail",
            "Estação Bernardino",
            "Rua Bernardino de Campos",
            -23.6,
            -46.6,
            1,
          ],
        ],
      });
    if (url.endsWith("/health")) return Response.json({ configured: true });
    return live(url);
  });
}
function search(q: string) {
  render(<App apiBase="https://api.test" />);
  fireEvent.click(screen.getByRole("button", { name: "Linhas e horários" }));
  fireEvent.change(screen.getByLabelText("Linha ou destino"), {
    target: { value: q },
  });
  fireEvent.click(screen.getByRole("button", { name: "Buscar ônibus" }));
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("libera a troca de sentido ao selecionar uma parada durante a consulta", async () => {
  let finish!: (r: Response) => void;
  install(async (url) => {
    if (url.includes("/api/lines?q="))
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    if (url.endsWith("/api/lines/1/stops"))
      return response([
        { id: "p1", name: "Parada de embarque", lat: -23.62, lon: -46.68 },
      ]);
    return response([]);
  });
  render(<App apiBase="https://api.test" />);
  fireEvent.click(screen.getByRole("button", { name: "Linhas e horários" }));
  fireEvent.change(screen.getByLabelText("Linha ou destino"), {
    target: { value: "857c" },
  });
  fireEvent.click(
    await screen.findByRole("option", { name: /METRÔ CONCEIÇÃO.*sentido 1/ }),
  );
  const stop = await screen.findByRole("button", {
    name: "Parada de embarque",
  });
  fireEvent.click(screen.getByRole("button", { name: "Trocar sentido" }));
  expect(
    (
      screen.getByRole("button", {
        name: "Consultando sentido…",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.click(stop);
  await act(async () => finish(response([])));
  expect(
    (
      screen.getByRole("button", {
        name: "Trocar sentido",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
});
it("mantém uma parada selecionada quando o GTFS atrasado chega com mais de vinte resultados", async () => {
  install(async (url) =>
    response(
      url.includes("/api/stops?q=")
        ? [{ id: "new", name: "Central nova", lat: -23.5, lon: -46.6 }]
        : [],
    ),
  );
  const original = globalThis.fetch;
  let finish!: (r: Response) => void;
  let signal!: AbortSignal;
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    if (url.endsWith("data/stops.json"))
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    if (url.includes("/api/stops?q=")) signal = init!.signal!;
    return original(url, init);
  });
  search("central");
  fireEvent.click(await screen.findByRole("button", { name: "Central nova" }));
  expect(screen.getByRole("heading", { name: "Central nova" })).toBeTruthy();
  expect(signal.aborted).toBe(true);
  await act(async () =>
    finish(
      Response.json({
        stops: Array.from({ length: 30 }, (_, i) => [
          "local" + i,
          "Central local " + i,
          "Rua Central",
          -23.5,
          -46.6,
        ]),
      }),
    ),
  );
  expect(screen.getByRole("heading", { name: "Central nova" })).toBeTruthy();
  expect(screen.getByTestId("search-map").textContent).toContain("new");
});
it("encerra a busca progressiva ao escolher uma linha local enquanto a API ainda responde", async () => {
  let finish!: (r: Response) => void;
  install(async (url) =>
    url.includes("/api/lines?q=")
      ? new Promise<Response>((resolve) => {
          finish = resolve;
        })
      : response([]),
  );
  const original = globalThis.fetch;
  let signal!: AbortSignal;
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    if (url.includes("/api/lines?q=")) signal = init!.signal!;
    return original(url, init);
  });
  search("857c");
  fireEvent.click(
    await screen.findByRole("button", {
      name: /857C-10.*METRÔ CONCEIÇÃO.*sentido 1/,
    }),
  );
  expect(signal.aborted).toBe(true);
  expect(screen.queryByText("Buscando linhas e paradas…")).toBeNull();
  await act(async () => finish(response([])));
  expect(screen.getByRole("heading", { name: "METRÔ CONCEIÇÃO" })).toBeTruthy();
});
it("mantém acesso às paradas depois das vinte primeiras sem cortar a busca", async () => {
  install(async () => response([]), 25);
  search("bernardino");
  const more = await screen.findByRole("button", {
    name: "Mostrar mais paradas",
  });
  expect(screen.queryByRole("button", { name: /Campos, 2022/ })).toBeNull();
  fireEvent.click(more);
  expect(screen.getByRole("button", { name: /Campos, 2022/ })).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Mostrar mais paradas" }),
  ).toBeNull();
});
it("normaliza o código na consulta ao vivo e não duplica o sentido do catálogo", async () => {
  const calls: string[] = [];
  install(async (url) => {
    calls.push(url);
    return response(url.includes("/api/lines?q=") ? [line] : []);
  });
  search("857c10");
  expect(
    await screen.findByRole("button", {
      name: /857C-10.*METRÔ CONCEIÇÃO.*sentido 1/,
    }),
  ).toBeTruthy();
  expect(calls).toContain("https://api.test/api/lines?q=857C-10");
  expect(
    screen.getAllByRole("button", {
      name: /857C-10.*METRÔ CONCEIÇÃO.*sentido 1/,
    }),
  ).toHaveLength(1);
});
it("encontra todos os sentidos pelo catálogo mesmo quando a busca da SPTrans retorna vazia", async () => {
  install(async () => response([]));
  search("conceicao campo limpo");
  expect(
    await screen.findByRole("button", {
      name: /857C-10.*METRÔ CONCEIÇÃO.*sentido 1/,
    }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", {
      name: /857C-10.*TERM. CAMPO LIMPO.*sentido 2/,
    }),
  ).toBeTruthy();
});
it("pesquisa referências de todas as paradas de ônibus do GTFS, preservando homônimas", async () => {
  install(async () => response([]));
  search("campos rua bernardino");
  expect(
    await screen.findByRole("button", { name: /MORUMBI C\/B.*4440/ }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: /MORUMBI C\/B.*1000/ }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: /Estação Bernardino/ }),
  ).toBeNull();
});
it("complementa metadados do mesmo ponto sem perder o endereço local nem duplicar o resultado", async () => {
  install(async (url) =>
    response(
      url.includes("/api/stops?q=")
        ? [{ id: "p1", name: "Nome atualizado", lat: -23.62, lon: -46.68 }]
        : [],
    ),
  );
  search("campos");
  const found = await screen.findByRole("button", {
    name: /Nome atualizado.*4440/,
  });
  expect(found).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: /MORUMBI C\/B.*4440/ }),
  ).toBeNull();
});
it("exibe resultados locais enquanto a API está pendente e avisa quando a consulta falha", async () => {
  let reject!: (reason: Error) => void;
  install(
    () =>
      new Promise<Response>((_, r) => {
        reject = r;
      }),
  );
  search("campos");
  expect(
    await screen.findByRole("button", { name: /MORUMBI C\/B.*1000/ }),
  ).toBeTruthy();
  await act(async () => reject(new Error("offline")));
  expect(
    await screen.findByText(/Busca de paradas da SPTrans indisponível/),
  ).toBeTruthy();
});
