import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import TransitMap from "../src/features/map/TransitMap";
import type {JourneyMapSelection} from '../src/features/journey/types';

// Replace the rendering engine, keeping TransitMap's visibility and framing logic real.
const engine = vi.hoisted(() => ({
  width: 0,
  height: 0,
  resize: () => {},
  fitBounds: vi.fn(),
  setView: vi.fn(),
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
      latLngBounds: (points: unknown) => points,
    },
  };
});

it('enquadra o trajeto escolhido na lista só quando o mapa fica visível',()=>{
  engine.width=0;engine.height=0;
  vi.stubGlobal('ResizeObserver',class {constructor(callback:()=>void){engine.resize=callback;}observe(){}disconnect(){}});
  const journey:JourneyMapSelection={origin:{lat:-23.5,lon:-46.6},destination:{lat:-23.6,lon:-46.7},stops:[{id:'1',name:'Origem',lat:-23.51,lon:-46.61},{id:'2',name:'Destino',lat:-23.59,lon:-46.69}]};
  render(<TransitMap stops={[]} vehicles={[]} selectedStop={null} onSelectStop={()=>{}} location={null} journey={journey}/>);
  expect(engine.fitBounds).not.toHaveBeenCalled();engine.width=390;engine.height=540;act(()=>engine.resize());
  expect(engine.fitBounds).toHaveBeenCalledWith(expect.arrayContaining([[-23.5,-46.6],[-23.6,-46.7],[-23.51,-46.61],[-23.59,-46.69]]),{padding:[40,40],maxZoom:15});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  engine.fitBounds.mockClear();
  engine.setView.mockClear();
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
