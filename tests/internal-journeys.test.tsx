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
import JourneyPlanner from "../src/features/journey/JourneyPlanner";
import JourneyOptions from "../src/features/journey/JourneyOptions";
import { installJourneyMocks } from "./journey-harness";
import { fixture, hash, networkStops } from "./planner-fixtures";
import { createPlannerIndex } from "../src/features/journey/data";
import { findJourneys } from "../src/features/journey/router";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function endpoints() {
  for (const [label, term, action] of [
    ["De onde você vai sair?", "Rua Origem", "Localizar origem"],
    ["Para onde você vai?", "Rua Destino", "Localizar destino"],
  ]) {
    fireEvent.change(screen.getByRole("combobox", { name: label }), {
      target: { value: term + ", 1000" },
    });
    fireEvent.click(screen.getByRole("button", { name: action }));
    fireEvent.click(
      await screen.findByRole("option", {
        name: new RegExp("^" + term + ", 1000"),
      }),
    );
  }
}
const foot = {
  code: "Ok",
  routes: [
    {
      distance: 1400,
      duration: 1000,
      geometry: {
        type: "LineString",
        coordinates: [
          [-46.63, -23.55],
          [-46.635, -23.558],
          [-46.67, -23.59],
        ],
      },
      legs: [
        {
          steps: [
            {
              name: "Rua São Bento",
              distance: 100,
              maneuver: { type: "turn", modifier: "left" },
            },
          ],
        },
      ],
    },
  ],
};
it("mostra caminhada e instruções no mapa interno sem abrir outro site", async () => {
  installJourneyMocks();
  const original = fetch;
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
    String(url).includes("routed-foot")
      ? Promise.resolve(Response.json(foot))
      : original(url, init),
  );
  const selected = vi.fn();
  render(
    <JourneyPlanner
      onMapSelection={selected}
      onShowArrivals={() => {}}
      onLocate={async () => null}
    />,
  );
  await endpoints();
  fireEvent.click(
    screen.getByRole("button", { name: "Ver caminhada no mapa" }),
  );
  await screen.findByText(/Siga à esquerda em Rua São Bento/);
  expect(selected.mock.lastCall?.[0]).toMatchObject({
    stops: [],
    paths: [
      {
        kind: "walk",
        points: [
          { lat: -23.55, lon: -46.63 },
          { lat: -23.558, lon: -46.635 },
          { lat: -23.59, lon: -46.67 },
        ],
      },
    ],
  });
  expect(screen.getByText(/17 min/)).toBeTruthy();
});
it.each(["editar", "inverter", "sair"])(
  "descarta a caminhada antiga ao %s",
  async (action) => {
    installJourneyMocks();
    const original = fetch;
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (String(url).includes("routed-foot"))
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      const response = await original(url, init);
      if (!String(url).includes("photon")) return response;
      const data = await response.json();
      data.features[0].geometry.coordinates[0] -=
        { editar: 0.0001, inverter: 0.0002, sair: 0.0003 }[action] ?? 0;
      return Response.json(data);
    });
    const selected = vi.fn();
    const props = {
      onMapSelection: selected,
      onShowArrivals: () => {},
      onLocate: async () => null,
    };
    const view = render(<JourneyPlanner {...props} />);
    await endpoints();
    fireEvent.click(
      screen.getByRole("button", { name: "Ver caminhada no mapa" }),
    );
    await waitFor(() => expect(finish).toBeTypeOf("function"), {
      timeout: 3000,
    });
    if (action === "editar")
      fireEvent.change(
        screen.getByRole("combobox", { name: "Para onde você vai?" }),
        { target: { value: "novo" } },
      );
    else if (action === "inverter")
      fireEvent.click(
        screen.getByRole("button", { name: "Inverter origem e destino" }),
      );
    else view.rerender(<JourneyPlanner {...props} active={false} />);
    const callsBefore = selected.mock.calls.length;
    await act(async () => finish(Response.json(foot)));
    expect(selected.mock.calls).toHaveLength(callsBefore);
    expect(screen.queryByText(/Siga à esquerda/)).toBeNull();
  },
);
it("envia o filtro multimodal ao planejador", async () => {
  const { workers } = installJourneyMocks({ autoRespond: false });
  render(
    <JourneyPlanner
      onMapSelection={() => {}}
      onShowArrivals={() => {}}
      onLocate={async () => null}
    />,
  );
  await endpoints();
  fireEvent.change(screen.getByLabelText("Transporte"), {
    target: { value: "rail" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Ver opções de transporte" }),
  );
  expect(workers[0].jobs[0].input.transport).toBe("rail");
});
it.each([
  ["Transporte", "rail"],
  ["Priorizar", "walking"],
])("preserva o resultado enquanto configura %s", async (label, value) => {
  installJourneyMocks();
  const selected = vi.fn();
  render(
    <JourneyPlanner
      onMapSelection={selected}
      onShowArrivals={() => {}}
      onLocate={async () => null}
    />,
  );
  await endpoints();
  fireEvent.click(
    screen.getByRole("button", { name: "Ver opções de transporte" }),
  );
  await screen.findByRole("button", { name: "Ver opção 1 no mapa" });
  const before = selected.mock.lastCall?.[0];
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
  expect(
    screen.getByRole("button", { name: "Ver opção 1 no mapa" }),
  ).toBeTruthy();
  expect(selected.mock.lastCall?.[0]).toEqual(before);
  expect(screen.getByText(/última busca/)).toBeTruthy();
});
it("cancela o carregamento da geometria ao editar sem rejeição não tratada", async () => {
  installJourneyMocks();
  const original = fetch;
  let pathSignal: AbortSignal | undefined;
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    if (String(url).includes("data/paths/")) {
      pathSignal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) =>
        pathSignal!.addEventListener("abort", () =>
          reject(new DOMException("Cancelado", "AbortError")),
        ),
      );
    }
    return original(url, init);
  });
  const selected = vi.fn();
  render(
    <JourneyPlanner
      onMapSelection={selected}
      onShowArrivals={() => {}}
      onLocate={async () => null}
    />,
  );
  await endpoints();
  fireEvent.click(
    screen.getByRole("button", { name: "Ver opções de transporte" }),
  );
  await waitFor(() => expect(pathSignal).toBeTruthy());
  await act(async () =>
    fireEvent.change(
      screen.getByRole("combobox", { name: "Para onde você vai?" }),
      { target: { value: "Outro" } },
    ),
  );
  expect(pathSignal!.aborted).toBe(true);
  expect(selected.mock.lastCall?.[0]).toBeNull();
});
it("não oferece chegadas SPTrans para metrô; em opção mista consulta o ônibus", () => {
  const option = findJourneys(createPlannerIndex(fixture(), networkStops), {
    origin: networkStops[0],
    destination: networkStops[2],
    radiusM: 800,
    serviceDate: "20261021",
  }).options[0];
  const rail = { ...option.legs[0], mode: "metro" as const };
  const arrivals = vi.fn();
  const view = render(
    <JourneyOptions
      options={[{ ...option, legs: [rail] }]}
      selectedId={option.id}
      onSelect={() => {}}
      onShowArrivals={arrivals}
    />,
  );
  expect(screen.queryByRole("button", { name: /Ver chegadas/ })).toBeNull();
  view.rerender(
    <JourneyOptions
      options={[
        {
          ...option,
          legs: [
            rail,
            { ...option.legs[0], mode: "bus", from: networkStops[1] },
          ],
          transferCount: 1,
        },
      ]}
      selectedId={option.id}
      onSelect={() => {}}
      onShowArrivals={arrivals}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Ver chegadas no embarque da opção 1" }),
  );
  expect(arrivals.mock.lastCall?.[0].id).toBe("X");
});
it("a geometria da opção anterior não substitui a nova seleção", async () => {
  const { workers } = installJourneyMocks({ autoRespond: false });
  const original = fetch;
  let finishOld!: (response: Response) => void;
  let oldSignal: AbortSignal | undefined;
  let calls = 0;
  const bucket = {
    version: 1,
    provenance: { sha256: hash },
    paths: {
      "second-geometry": {
        polyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
        stopIndices: [0, 1, 2],
      },
    },
  };
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    if (!String(url).includes("data/paths/")) return original(url, init);
    calls++;
    if (calls === 1) {
      oldSignal = init?.signal as AbortSignal;
      return new Promise<Response>((resolve) => {
        finishOld = resolve;
      });
    }
    return Promise.resolve(Response.json(bucket));
  });
  const selected = vi.fn();
  render(
    <JourneyPlanner
      onMapSelection={selected}
      onShowArrivals={() => {}}
      onLocate={async () => null}
    />,
  );
  await endpoints();
  fireEvent.click(
    screen.getByRole("button", { name: "Ver opções de transporte" }),
  );
  const result = findJourneys(
      createPlannerIndex(fixture(), networkStops),
      workers[0].jobs[0].input,
    ),
    first = result.options[0];
  await act(async () =>
    workers[0].reply(1, {
      ...result,
      options: [
        first,
        {
          ...first,
          id: "new",
          legs: [
            { ...first.legs[0], tripId: "second-geometry", lineCode: "Nova" },
          ],
        },
      ],
    }),
  );
  await waitFor(() => expect(finishOld).toBeTypeOf("function"));
  fireEvent.click(screen.getByRole("button", { name: "Ver opção 2 no mapa" }));
  await waitFor(() =>
    expect(selected.mock.lastCall?.[0].paths?.[0]?.label).toBe("Nova"),
  );
  expect(oldSignal!.aborted).toBe(true);
  await act(async () =>
    finishOld(
      Response.json({
        ...bucket,
        paths: { direct: bucket.paths["second-geometry"] },
      }),
    ),
  );
  expect(selected.mock.lastCall?.[0].paths?.[0]?.label).toBe("Nova");
});
