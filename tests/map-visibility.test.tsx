import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import TransitMap from "../src/features/map/TransitMap";
import type { JourneyMapSelection } from "../src/features/journey/types";

// Replace the rendering engine, keeping TransitMap's visibility and framing logic real.
const engine = vi.hoisted(() => ({
  width: 0,
  height: 0,
  resize: () => {},
  fitBounds: vi.fn(),
  setView: vi.fn(),
  polyline: vi.fn(),
  marker: vi.fn(),
}));
vi.mock("leaflet", () => {
  const map = {
    setView: engine.setView.mockImplementation(function () {
      return map;
    }),
    getZoom: () => 13,
    getSize: () => ({ x: engine.width, y: engine.height }),
    fitBounds: engine.fitBounds,
    invalidateSize() {},
    on() {},
    remove() {},
  };
  return {
    default: {
      map: () => map,
      tileLayer: () => ({ addTo() {} }),
      control: { zoom: () => ({ addTo() {} }) },
      layerGroup: () => ({ addTo: () => ({ clearLayers() {} }) }),
      circleMarker: () => ({ addTo: () => ({ bindTooltip() {}, on() {} }) }),
      divIcon: (options: unknown) => options,
      marker: engine.marker.mockImplementation(() => ({
        addTo: () => ({ bindTooltip() {}, bindPopup() {} }),
      })),
      polyline: engine.polyline.mockImplementation(() => ({
        addTo: () => ({ bindTooltip() {} }),
      })),
      latLngBounds: (points: unknown) => points,
    },
  };
});

it("enquadra o trajeto escolhido na lista só quando o mapa fica visível", () => {
  engine.width = 0;
  engine.height = 0;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        engine.resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  const journey: JourneyMapSelection = {
    origin: { lat: -23.5, lon: -46.6 },
    destination: { lat: -23.6, lon: -46.7 },
    stops: [
      { id: "1", name: "Origem", lat: -23.51, lon: -46.61 },
      { id: "2", name: "Destino", lat: -23.59, lon: -46.69 },
    ],
  };
  render(
    <TransitMap
      stops={[]}
      vehicles={[]}
      selectedStop={null}
      onSelectStop={() => {}}
      location={null}
      journey={journey}
    />,
  );
  expect(engine.fitBounds).not.toHaveBeenCalled();
  engine.width = 390;
  engine.height = 540;
  act(() => engine.resize());
  expect(engine.fitBounds).toHaveBeenCalledWith(
    expect.arrayContaining([
      [-23.5, -46.6],
      [-23.6, -46.7],
      [-23.51, -46.61],
      [-23.59, -46.69],
    ]),
    { padding: [40, 40], maxZoom: 15 },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  engine.fitBounds.mockClear();
  engine.setView.mockClear();
  engine.polyline.mockClear();
  engine.marker.mockClear();
});

it("inclui os primeiros ônibus do trajeto no enquadramento e não move o mapa a cada atualização GPS", () => {
  engine.width = 390;
  engine.height = 540;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const journey: JourneyMapSelection = {
    origin: { lat: -23.5, lon: -46.6 },
    destination: { lat: -23.6, lon: -46.7 },
    stops: [],
    busLegs: [
      { routeId: "r", tripId: "t", lineCode: "857C-10", headsign: "Conceição" },
    ],
    paths: [
      {
        kind: "bus",
        label: "857C-10",
        points: [
          { lat: -23.5, lon: -46.6 },
          { lat: -23.6, lon: -46.7 },
        ],
      },
    ],
  };
  const props = {
    stops: [],
    selectedStop: null,
    onSelectStop: () => {},
    location: null,
    journey,
  };
  const view = render(<TransitMap {...props} vehicles={[]} />);
  engine.fitBounds.mockClear();
  view.rerender(
    <TransitMap
      {...props}
      vehicles={[
        {
          id: "12345",
          lat: -23.8,
          lon: -46.9,
          observedAt: "2020-01-01T10:00:00Z",
          lineCode: "857C-10",
          lineDestination: "Conceição",
        },
      ]}
    />,
  );
  expect(engine.fitBounds.mock.lastCall?.[0]).toContainEqual([-23.8, -46.9]);
  const title = engine.marker.mock.lastCall?.[1].title;
  expect(title).toContain("857C-10");
  expect(title).toContain("Conceição");
  expect(title).toContain("GPS");
  expect(title).toContain("posição antiga");
  engine.fitBounds.mockClear();
  view.rerender(
    <TransitMap
      {...props}
      vehicles={[{ id: "12345", lat: -23.81, lon: -46.91, observedAt: null }]}
    />,
  );
  expect(engine.fitBounds).not.toHaveBeenCalled();
});

it.each([false, true])(
  "inclui a frota que chega depois da baldeação (mapa oculto: %s)",
  (hidden) => {
    engine.width = hidden ? 0 : 390;
    engine.height = hidden ? 0 : 540;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          engine.resize = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const journey: JourneyMapSelection = {
      origin: { lat: -23.5, lon: -46.6 },
      destination: { lat: -23.6, lon: -46.7 },
      stops: [],
      busLegs: [
        {
          routeId: "r1",
          tripId: "t1",
          lineCode: "857C-10",
          headsign: "Conceição",
        },
        {
          routeId: "r2",
          tripId: "t2",
          lineCode: "476A-10",
          headsign: "Terminal",
        },
      ],
    };
    const first = {
      id: "1",
      lat: -23.7,
      lon: -46.8,
      observedAt: null,
      lineId: "1901",
    };
    const second = {
      id: "2",
      lat: -23.9,
      lon: -47,
      observedAt: null,
      lineId: "304",
    };
    const props = {
      stops: [],
      selectedStop: null,
      onSelectStop: () => {},
      location: null,
      journey,
    };
    const view = render(<TransitMap {...props} vehicles={[]} />);
    view.rerender(<TransitMap {...props} vehicles={[first]} />);
    engine.fitBounds.mockClear();
    view.rerender(<TransitMap {...props} vehicles={[first, second]} />);
    if (hidden) {
      expect(engine.fitBounds).not.toHaveBeenCalled();
      engine.width = 390;
      engine.height = 540;
      act(() => engine.resize());
    }
    expect(engine.fitBounds.mock.lastCall?.[0]).toContainEqual([-23.9, -47]);
    engine.fitBounds.mockClear();
    view.rerender(
      <TransitMap {...props} vehicles={[first, { ...second, lat: -23.91 }]} />,
    );
    expect(engine.fitBounds).not.toHaveBeenCalled();
    const walking = { ...journey, busLegs: [] };
    view.rerender(<TransitMap {...props} journey={walking} vehicles={[]} />);
    view.rerender(<TransitMap {...props} vehicles={[]} />);
    engine.fitBounds.mockClear();
    view.rerender(<TransitMap {...props} vehicles={[first, second]} />);
    expect(engine.fitBounds.mock.lastCall?.[0]).toContainEqual([-23.9, -47]);
  },
);

it.each(["location", "pointer"] as const)(
  "não desfaz foco de %s posterior ao trajeto quando a frota chega",
  (focus) => {
    engine.width = 390;
    engine.height = 540;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    const props = {
      stops: [],
      selectedStop: null,
      onSelectStop: () => {},
      location: null as [number, number] | null,
      journey: {
        origin: { lat: -23.5, lon: -46.6 },
        destination: { lat: -23.6, lon: -46.7 },
        stops: [],
        busLegs: [
          {
            routeId: "r",
            tripId: "t",
            lineCode: "857C-10",
            headsign: "Conceição",
          },
        ],
      },
    };
    const view = render(<TransitMap {...props} vehicles={[]} />);
    const location: [number, number] | null =
      focus === "location" ? [-23.4, -46.4] : null;
    view.rerender(<TransitMap {...props} location={location} vehicles={[]} />);
    if (focus === "pointer")
      fireEvent.pointerDown(
        view.getByLabelText("Mapa de linhas e paradas de São Paulo"),
      );
    engine.fitBounds.mockClear();
    view.rerender(
      <TransitMap
        {...props}
        location={location}
        vehicles={[{ id: "1", lat: -23.9, lon: -47, observedAt: null }]}
      />,
    );
    expect(engine.fitBounds).not.toHaveBeenCalled();
  },
);

it("desenha a curva do caminho e a inclui no enquadramento do mapa", () => {
  engine.width = 390;
  engine.height = 540;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  render(
    <TransitMap
      stops={[]}
      vehicles={[]}
      selectedStop={null}
      onSelectStop={() => {}}
      location={null}
      journey={{
        origin: { lat: -23.5, lon: -46.6 },
        destination: { lat: -23.6, lon: -46.7 },
        stops: [],
        paths: [
          {
            kind: "walk",
            label: "A pé",
            points: [
              { lat: -23.5, lon: -46.6 },
              { lat: -23.7, lon: -46.8 },
              { lat: -23.6, lon: -46.7 },
            ],
          },
        ],
      }}
    />,
  );
  expect(engine.polyline).toHaveBeenCalledWith(
    [
      [-23.5, -46.6],
      [-23.7, -46.8],
      [-23.6, -46.7],
    ],
    expect.objectContaining({ dashArray: "7 8" }),
  );
  expect(engine.fitBounds.mock.lastCall?.[0]).toContainEqual([-23.7, -46.8]);
});
it("enquadra o trecho escolhido mesmo mostrando paradas além dele", () => {
  engine.width = 390;
  engine.height = 540;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  render(
    <TransitMap
      stops={[]}
      vehicles={[]}
      selectedStop={null}
      onSelectStop={() => {}}
      location={null}
      journey={{
        origin: { lat: -23.5, lon: -46.6 },
        destination: { lat: -23.6, lon: -46.7 },
        stops: [
          { id: "beyond", name: "Além do trecho", lat: -23.9, lon: -46.9 },
        ],
        paths: [
          {
            kind: "metro",
            label: "Metrô",
            points: [
              { lat: -23.5, lon: -46.6 },
              { lat: -23.6, lon: -46.7 },
            ],
          },
        ],
      }}
    />,
  );
  expect(engine.fitBounds.mock.lastCall?.[0]).not.toContainEqual([
    -23.9, -46.9,
  ]);
});

it.each(["stop", "location"] as const)(
  "preserva o foco de %s solicitado enquanto o mapa está oculto",
  (focus) => {
    engine.width = 0;
    engine.height = 0;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          engine.resize = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const props = {
      stops: [
        { id: "1", name: "Centro", lat: -23.5, lon: -46.6 },
        { id: "2", name: "Bairro", lat: -23.6, lon: -46.7 },
      ],
      vehicles: [],
      selectedStop: null as string | null,
      onSelectStop: () => {},
      location: null as [number, number] | null,
    };
    const view = render(<TransitMap {...props} />);
    engine.setView.mockClear();
    view.rerender(
      <TransitMap
        {...props}
        selectedStop={focus === "stop" ? "2" : null}
        location={focus === "location" ? [-23.7, -46.8] : null}
      />,
    );
    expect(engine.setView).not.toHaveBeenCalled();
    engine.width = 390;
    engine.height = 540;
    act(() => engine.resize());
    expect(engine.setView).toHaveBeenCalledWith(
      focus === "stop" ? [-23.6, -46.7] : [-23.7, -46.8],
      15,
    );
    expect(engine.fitBounds).not.toHaveBeenCalled();
  },
);

it("aguarda dimensões visíveis para enquadrar as paradas carregadas na Lista", () => {
  engine.width = 0;
  engine.height = 0;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        engine.resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  render(
    <TransitMap
      stops={[
        { id: "1", name: "Centro", lat: -23.5, lon: -46.6 },
        { id: "2", name: "Bairro", lat: -23.6, lon: -46.7 },
      ]}
      vehicles={[]}
      selectedStop={null}
      onSelectStop={() => {}}
      location={null}
    />,
  );
  expect(engine.fitBounds).not.toHaveBeenCalled();
  engine.width = 390;
  engine.height = 540;
  act(() => engine.resize());
  expect(engine.fitBounds).toHaveBeenCalledWith(
    [
      [-23.5, -46.6],
      [-23.6, -46.7],
    ],
    { padding: [40, 40], maxZoom: 15 },
  );
});
