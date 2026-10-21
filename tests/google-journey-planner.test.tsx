import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import GoogleJourneyPlanner from "../src/features/google-routes/GoogleJourneyPlanner";
import { googleFixture } from "./google-routes-fixture";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const props = {
  origin: { lat: -23.551, lon: -46.631 },
  destination: { lat: -23.591, lon: -46.671 },
  apiBase: "https://api.test",
  active: true,
  resetKey: 0,
  onMapSelection: vi.fn(),
  onBegin: vi.fn(),
  onTrackBus: vi.fn(),
  onShowMap: vi.fn(),
};
it("exige pontos válidos e clique; mostra alternativas, instruções escapadas e BUS sem presumir sentido", async () => {
  const f = vi.fn(async () => Response.json(googleFixture));
  vi.stubGlobal("fetch", f);
  const view = render(<GoogleJourneyPlanner {...props} origin={null} />);
  expect(
    (
      screen.getByRole("button", {
        name: "Calcular com Google Maps",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  view.rerender(<GoogleJourneyPlanner {...props} />);
  expect(f).not.toHaveBeenCalled();
  expect(document.querySelector('script[src*="maps.googleapis"]')).toBeNull();
  fireEvent.change(screen.getByLabelText("Preferência Google"), {
    target: { value: "rail" },
  });
  expect(f).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Calcular com Google Maps" }),
  );
  expect(await screen.findByText("Metrô e ônibus")).toBeTruthy();
  expect(props.onMapSelection).toHaveBeenLastCalledWith(
    googleFixture.routes[0],
  );
  expect(screen.getByText(/20\/10\/2026.*10:10/)).toBeTruthy();
  expect(
    screen.getAllByRole("button", { name: /Acompanhar ônibus/ }),
  ).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: /Acompanhar ônibus/ }));
  expect(props.onTrackBus).toHaveBeenCalledWith("675K-10");
  fireEvent.click(
    screen.getByRole("button", { name: "Ver alternativa Google 2 no mapa" }),
  );
  expect(props.onMapSelection).toHaveBeenLastCalledWith(
    googleFixture.routes[1],
  );
  expect(
    JSON.parse(
      (f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    ).preference,
  ).toBe("rail");
});
it.each(["edit", "hidden", "gtfs", "criteria", "cancel"])(
  "descarta resposta pendente quando %s",
  async (kind) => {
    let finish!: (r: Response) => void;
    let signal!: AbortSignal;
    vi.stubGlobal("fetch", (_u: string, init: RequestInit) => {
      signal = init.signal!;
      return new Promise<Response>((r) => (finish = r));
    });
    const view = render(<GoogleJourneyPlanner {...props} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Calcular com Google Maps" }),
    );
    if (kind === "criteria")
      fireEvent.change(screen.getByLabelText("Modo Google"), {
        target: { value: "walking" },
      });
    else if (kind === "cancel")
      fireEvent.click(
        screen.getByRole("button", { name: "Cancelar consulta Google" }),
      );
    else
      view.rerender(
        <GoogleJourneyPlanner
          {...props}
          origin={kind === "edit" ? null : props.origin}
          active={kind !== "hidden"}
          resetKey={kind === "gtfs" ? 1 : 0}
        />,
      );
    expect(signal.aborted).toBe(true);
    await act(async () => finish(Response.json(googleFixture)));
    expect(screen.queryByText("Metrô e ônibus")).toBeNull();
  },
);
it("limpa conteúdo exibido ao esconder e ao editar sem recalcular ao voltar", async () => {
  const f = vi.fn(async () => Response.json(googleFixture));
  vi.stubGlobal("fetch", f);
  const view = render(<GoogleJourneyPlanner {...props} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Calcular com Google Maps" }),
  );
  await screen.findByText("Metrô e ônibus");
  view.rerender(<GoogleJourneyPlanner {...props} active={false} />);
  expect(screen.queryByText("Metrô e ônibus")).toBeNull();
  expect(props.onMapSelection).toHaveBeenLastCalledWith(null);
  view.rerender(<GoogleJourneyPlanner {...props} />);
  expect(f).toHaveBeenCalledTimes(1);
});
it.each(["empty", "error", "config"])(
  "mostra estado %s sem inventar rota",
  async (kind) => {
    vi.stubGlobal("fetch", async () =>
      kind === "error"
        ? new Response("private", { status: 502 })
        : Response.json({ ...googleFixture, routes: [] }),
    );
    render(<GoogleJourneyPlanner {...props} configured={kind !== "config"} />);
    if (kind !== "config")
      fireEvent.click(
        screen.getByRole("button", { name: "Calcular com Google Maps" }),
      );
    expect(
      await screen.findByText(
        kind === "empty"
          ? /Nenhum trajeto encontrado/
          : kind === "config"
            ? /Google Maps ainda não está configurado/
            : /Não foi possível consultar os trajetos Google/,
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Metrô e ônibus")).toBeNull();
  },
);
it("escapa instruções do fornecedor e não oferece BUS sem código nem caminhada sem pontos", async () => {
  const response = structuredClone(googleFixture);
  response.routes[0].steps[0].instruction = '<img src=x onerror="alert(1)">';
  response.routes[0].steps[0].from = null;
  response.routes[0].steps[2].transit!.shortName = "";
  vi.stubGlobal("fetch", async () => Response.json(response));
  render(<GoogleJourneyPlanner {...props} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Calcular com Google Maps" }),
  );
  expect(
    await screen.findByText('<img src=x onerror="alert(1)">'),
  ).toBeTruthy();
  expect(document.querySelector("img")).toBeNull();
  expect(
    screen.queryByRole("button", { name: /Acompanhar ônibus/ }),
  ).toBeNull();
  expect(screen.queryByRole("link", { name: /Abrir caminhada 1/ })).toBeNull();
});
