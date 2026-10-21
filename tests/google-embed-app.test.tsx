import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import App from "../src/App";
import { installJourneyMocks } from "./journey-harness";
vi.mock("../src/features/map/TransitMap", () => ({
  default: () => <div aria-label="Mapa SPTrans" />,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});
async function endpoints() {
  for (const [label, action, text] of [
    ["De onde você vai sair?", "Localizar origem", "Rua Origem, 1000"],
    ["Para onde você vai?", "Localizar destino", "Rua Destino, 1000"],
  ]) {
    fireEvent.change(screen.getByRole("combobox", { name: label }), {
      target: { value: text },
    });
    fireEvent.click(screen.getByRole("button", { name: action }));
    fireEvent.click(
      await screen.findByRole("option", { name: new RegExp("^" + text) }),
    );
  }
}
const iframe = () => document.querySelector("iframe");
const begin = () =>
  fireEvent.click(
    screen.getByRole("button", { name: "Mostrar trajeto Google" }),
  );
it("requires explicit click and renders an isolated official iframe with fallback and no route-success claim", async () => {
  installJourneyMocks();
  render(<App apiBase="https://api.test" googleEmbedKey="fixture-only" />);
  expect(iframe()).toBeNull();
  await endpoints();
  expect(iframe()).toBeNull();
  begin();
  const frame = iframe()!;
  expect(frame.title).toBe("Trajeto no Google Maps");
  expect(frame.src).toContain(
    "https://www.google.com/maps/embed/v1/directions?",
  );
  expect(frame.getAttribute("referrerpolicy")).toBe(
    "strict-origin-when-cross-origin",
  );
  expect(frame.getAttribute("loading")).toBe("lazy");
  expect(frame.hasAttribute("allowfullscreen")).toBe(true);
  expect(frame.style.minWidth).toBe("200px");
  expect(frame.style.minHeight).toBe("200px");
  expect(
    screen.getByRole("link", { name: "A pé no Google Maps" }),
  ).toBeTruthy();
  const fallback = screen.getByRole("link", {
    name: "Abrir este trajeto no Google Maps",
  }) as HTMLAnchorElement;
  expect(new URL(fallback.href).searchParams.get("travelmode")).toBe("walking");
  expect(new URL(fallback.href).searchParams.get("origin")).toBe(
    "-23.550000,-46.630000",
  );
  fireEvent.load(frame);
  expect(screen.queryByText(/rota (carregada|encontrada|válida)/i)).toBeNull();
  expect(document.querySelector('script[src*="maps.googleapis"]')).toBeNull();
  expect(
    vi
      .mocked(fetch)
      .mock.calls.some(
        ([url, init]) =>
          String(url).includes("routes") || init?.method === "POST",
      ),
  ).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: /Lista/ }));
  expect(iframe()).toBe(frame);
  fireEvent.click(screen.getByRole("button", { name: /Mapa/ }));
  expect(iframe()).toBe(frame);
});
it.each([undefined, "", " \t "])(
  "keeps confirmed external routes and native bus planning without Embed controls (key=%s)",
  async (googleEmbedKey) => {
    const { arrivalUrls } = installJourneyMocks();
    render(<App apiBase="https://api.test" googleEmbedKey={googleEmbedKey} />);
    expect(
      screen.queryByRole("link", { name: "A pé no Google Maps" }),
    ).toBeNull();
    await endpoints();
    for (const [name, mode] of [
      ["A pé no Google Maps", "walking"],
      ["Transporte público no Google Maps", "transit"],
    ]) {
      const link = screen.getByRole("link", { name }) as HTMLAnchorElement;
      expect(link.href).toBe(
        `https://www.google.com/maps/dir/?api=1&origin=-23.550000%2C-46.630000&destination=-23.590000%2C-46.670000&travelmode=${mode}`,
      );
      expect(link.target).toBe("_blank");
      expect(link.rel).toContain("noreferrer");
    }
    expect(
      screen.queryByRole("region", { name: "Google Maps dentro do site" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Mostrar trajeto Google" }),
    ).toBeNull();
    expect(screen.queryByLabelText("Modo no Google")).toBeNull();
    expect(
      screen.queryByText(/Google dentro do site ainda não está configurado/),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Ver opções de transporte" }),
    );
    const option = await screen.findByRole("button", {
      name: "Ver opção 1 no mapa",
    });
    expect(option.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Ver chegadas no embarque da opção 1",
      }),
    );
    await waitFor(() => expect(arrivalUrls.length).toBeGreaterThan(0));
    expect(
      arrivalUrls.every((url) => url.startsWith("https://api.test/api/stops/")),
    ).toBe(true);
    expect(iframe()).toBeNull();
    expect(document.querySelector('script[src*="maps.googleapis"]')).toBeNull();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(
          ([url, init]) =>
            /google|routes/i.test(String(url)) || init?.method === "POST",
        ),
    ).toBe(false);
  },
);
it.each(["mode", "invert", "criterion", "hide", "gtfs", "edit"])(
  "clears iframe on %s and requires another click",
  async (action) => {
    installJourneyMocks();
    render(<App apiBase="https://api.test" googleEmbedKey="fixture-only" />);
    await endpoints();
    begin();
    expect(iframe()).not.toBeNull();
    if (action === "mode")
      fireEvent.change(screen.getByLabelText("Modo no Google"), {
        target: { value: "transit" },
      });
    if (action === "invert")
      fireEvent.click(
        screen.getByRole("button", { name: "Inverter origem e destino" }),
      );
    if (action === "criterion")
      fireEvent.change(screen.getByLabelText("Priorizar"), {
        target: { value: "walking" },
      });
    if (action === "edit")
      fireEvent.change(
        screen.getByRole("combobox", { name: "Para onde você vai?" }),
        { target: { value: "Outro" } },
      );
    if (action === "hide") {
      fireEvent.click(
        screen.getByRole("button", { name: "Linhas e horários" }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Trajeto" }));
    }
    if (action === "gtfs") {
      fireEvent.click(
        screen.getByRole("button", { name: "Ver opções de transporte" }),
      );
      await screen.findByRole("button", { name: "Ver opção 1 no mapa" });
    }
    expect(iframe()).toBeNull();
    if (action !== "edit") {
      expect(
        (
          screen.getByRole("combobox", {
            name: "De onde você vai sair?",
          }) as HTMLInputElement
        ).value,
      ).toContain("Rua");
      begin();
      expect(iframe()).not.toBeNull();
    }
  },
);
it("cancels pending GTFS and never restores a stale selection after Google or leaving", async () => {
  const { workers } = installJourneyMocks({ autoRespond: false });
  render(<App apiBase="https://api.test" googleEmbedKey="fixture-only" />);
  await endpoints();
  fireEvent.click(
    screen.getByRole("button", { name: "Ver opções de transporte" }),
  );
  begin();
  await act(async () => workers[0].reply(1));
  expect(iframe()).not.toBeNull();
  expect(
    screen.queryByRole("button", { name: "Ver opção 1 no mapa" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Perto de mim" }));
  fireEvent.click(screen.getByRole("button", { name: "Trajeto" }));
  expect(iframe()).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Ver opção 1 no mapa" }),
  ).toBeNull();
});
it("opens BUS code search with both directions for the visitor to choose manually", async () => {
  installJourneyMocks();
  const original = fetch;
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) =>
    input.includes("/api/lines?q=675K-10")
      ? Promise.resolve(
          Response.json({
            data: [
              {
                id: "1",
                code: "675K-10",
                origin: "Bairro",
                destination: "Centro",
                direction: 1,
              },
              {
                id: "2",
                code: "675K-10",
                origin: "Centro",
                destination: "Bairro",
                direction: 2,
              },
            ],
            source: "SPTrans",
            fetchedAt: new Date().toISOString(),
            observedAt: null,
          }),
        )
      : original(input, init),
  );
  render(<App apiBase="https://api.test" googleEmbedKey="fixture-only" />);
  await endpoints();
  begin();
  fireEvent.change(screen.getByLabelText("Código de ônibus visto no Google"), {
    target: { value: "675K-10" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Buscar linha na SPTrans" }),
  );
  await waitFor(() =>
    expect(
      screen.getAllByRole("button", { name: /675K-10.*sentido/ }).length,
    ).toBe(2),
  );
  expect(iframe()).toBeNull();
  expect(screen.queryByRole("heading", { name: "Centro" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Trajeto" }));
  expect(iframe()).toBeNull();
  expect(
    (
      screen.getByRole("combobox", {
        name: "De onde você vai sair?",
      }) as HTMLInputElement
    ).value,
  ).toContain("Rua Origem");
});

it("returns to the SPTrans map without restoring Google on reentry", async () => {
  installJourneyMocks();
  render(<App apiBase="https://api.test" googleEmbedKey="fixture-only" />);
  await endpoints();
  begin();
  fireEvent.click(
    screen.getByRole("button", { name: "Voltar ao mapa SPTrans" }),
  );
  expect(iframe()).toBeNull();
  expect(screen.getByLabelText("Mapa SPTrans")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Linhas e horários" }));
  fireEvent.click(screen.getByRole("button", { name: "Trajeto" }));
  expect(iframe()).toBeNull();
});
it.each(["", "fixture-only"])(
  "preserves selected GTFS options with an optional Google selector (key=%s)",
  async (googleEmbedKey) => {
    installJourneyMocks();
    render(<App apiBase="https://api.test" googleEmbedKey={googleEmbedKey} />);
    await endpoints();
    fireEvent.click(
      screen.getByRole("button", { name: "Ver opções de transporte" }),
    );
    await screen.findByRole("button", { name: "Ver opção 1 no mapa" });
    if (googleEmbedKey) {
      fireEvent.change(screen.getByLabelText("Modo no Google"), {
        target: { value: "transit" },
      });
    } else {
      expect(screen.queryByLabelText("Modo no Google")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: /Lista/ }));
      fireEvent.click(screen.getByRole("button", { name: /Mapa/ }));
    }
    expect(
      screen
        .getByRole("button", { name: "Ver opção 1 no mapa" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", {
        name: "Ver chegadas no embarque da opção 1",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Ir a pé até o embarque",
      }),
    ).toBeTruthy();
    expect(iframe()).toBeNull();
  },
);
it.each(["", "fixture-only"])(
  "preserves pending GTFS calculation with an optional Google selector (key=%s)",
  async (googleEmbedKey) => {
    const { workers } = installJourneyMocks({ autoRespond: false });
    render(<App apiBase="https://api.test" googleEmbedKey={googleEmbedKey} />);
    await endpoints();
    fireEvent.click(
      screen.getByRole("button", { name: "Ver opções de transporte" }),
    );
    if (googleEmbedKey) {
      fireEvent.change(screen.getByLabelText("Modo no Google"), {
        target: { value: "transit" },
      });
    } else {
      expect(screen.queryByLabelText("Modo no Google")).toBeNull();
      expect(
        screen.getByRole("link", { name: "Transporte público no Google Maps" }),
      ).toBeTruthy();
    }
    expect(
      screen.getByRole("button", { name: "Buscando opções…" }),
    ).toBeTruthy();
    await act(async () => workers[0].reply(1));
    expect(
      screen
        .getByRole("button", { name: "Ver opção 1 no mapa" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(iframe()).toBeNull();
  },
);
