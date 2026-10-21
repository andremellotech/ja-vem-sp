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
import GoogleRouteMap from "../src/features/google-routes/GoogleRouteMap";
import {
  loadGoogleMaps,
  type MapsSdk,
} from "../src/features/google-routes/maps-loader";
import { googleFixture } from "./google-routes-fixture";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document
    .querySelectorAll("script[data-google-routes-sdk]")
    .forEach((s) => s.remove());
  delete (window as any).gm_authFailure;
});
function sdk() {
  const overlays: { setMap: ReturnType<typeof vi.fn>; options: any }[] = [],
    maps: unknown[] = [],
    fits: unknown[] = [];
  class Map {
    constructor(_h: HTMLElement, o: unknown) {
      maps.push(o);
    }
    fitBounds(b: unknown) {
      fits.push(b);
    }
  }
  class Overlay {
    setMap = vi.fn();
    constructor(public options: unknown) {
      overlays.push(this);
    }
  }
  class Bounds {
    extend() {
      return this;
    }
  }
  return {
    api: {
      Map,
      Polyline: Overlay,
      Marker: Overlay,
      LatLngBounds: Bounds,
      geometry: {
        encoding: { decodePath: (p: string) => [{ lat: p.length, lng: 2 }] },
      },
      event: { clearInstanceListeners: vi.fn(), trigger: vi.fn() },
    } as unknown as MapsSdk,
    overlays,
    maps,
    fits,
  };
}
it("desenha só no SDK Google, reutiliza mapa ao trocar alternativa e remove overlays/listeners ao sair", async () => {
  const f = sdk();
  const view = render(
    <GoogleRouteMap
      route={googleFixture.routes[0]}
      apiKey="test"
      loader={async () => f.api}
    />,
  );
  await waitFor(() => expect(f.overlays.length).toBe(3));
  expect(f.maps).toHaveLength(1);
  expect(f.overlays[1].options.position).toEqual({
    lat: -23.551,
    lng: -46.631,
  });
  expect(f.overlays[2].options.position).toEqual({
    lat: -23.591,
    lng: -46.671,
  });
  view.rerender(
    <GoogleRouteMap
      route={googleFixture.routes[1]}
      apiKey="test"
      loader={async () => f.api}
    />,
  );
  await waitFor(() => expect(f.overlays.length).toBe(4));
  expect(f.maps).toHaveLength(1);
  expect(f.overlays[0].setMap).toHaveBeenCalledWith(null);
  view.unmount();
  expect(f.overlays[3].setMap).toHaveBeenCalledWith(null);
  expect(f.api.event.clearInstanceListeners).toHaveBeenCalled();
});
it("StrictMode compartilha SDK atrasado, mantém um mapa e limpa overlays ao desmontar", async () => {
  vi.resetModules();
  const { loadGoogleMaps: sharedLoader } =
    await import("../src/features/google-routes/maps-loader");
  const f = sdk();
  const loader = vi.fn(sharedLoader);
  const view = render(
    <React.StrictMode>
      <GoogleRouteMap
        route={googleFixture.routes[0]}
        apiKey="strict-mode-public-test-key"
        loader={loader}
      />
    </React.StrictMode>,
  );
  expect(loader).toHaveBeenCalledTimes(2);
  expect(f.maps).toHaveLength(0);
  expect(f.overlays).toHaveLength(0);
  const scripts = document.querySelectorAll<HTMLScriptElement>(
    "script[data-google-routes-sdk]",
  );
  expect(scripts).toHaveLength(1);
  const callback = new URL(scripts[0].src).searchParams.get("callback")!;
  vi.stubGlobal("google", { maps: f.api });
  await act(async () => {
    (window as any)[callback]();
  });
  expect(f.maps).toHaveLength(1);
  expect(f.overlays).toHaveLength(3);
  expect(
    document.querySelectorAll("script[data-google-routes-sdk]"),
  ).toHaveLength(1);
  const survivingMap = f.overlays[0].options.map;
  for (const overlay of f.overlays) {
    expect(overlay.options.map).toBe(survivingMap);
    expect(overlay.setMap).not.toHaveBeenCalledWith(null);
  }
  view.unmount();
  for (const overlay of f.overlays) {
    expect(overlay.setMap).toHaveBeenCalledWith(null);
    expect(f.api.event.clearInstanceListeners).toHaveBeenCalledWith(overlay);
  }
  expect(f.api.event.clearInstanceListeners).toHaveBeenCalledWith(survivingMap);
});
it("exibe erro e permite recarregar mapa bloqueado mantendo a rota", async () => {
  const f = sdk();
  const loader = vi
    .fn()
    .mockRejectedValueOnce(new Error("bloqueado"))
    .mockResolvedValue(f.api);
  render(
    <GoogleRouteMap
      route={googleFixture.routes[0]}
      apiKey="test"
      loader={loader}
    />,
  );
  expect(
    await screen.findByText(/Não foi possível carregar o mapa Google/),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Tentar carregar mapa Google" }),
  );
  await waitFor(() => expect(f.maps).toHaveLength(1));
});
it("SDK exige chave, compartilha script e após timeout de 12s permite tentar novamente", async () => {
  await expect(loadGoogleMaps("")).rejects.toThrow(/configurado/);
  expect(document.querySelector("script[data-google-routes-sdk]")).toBeNull();
  vi.useFakeTimers();
  const first = loadGoogleMaps("public-test-key"),
    same = loadGoogleMaps("public-test-key");
  expect(first).toBe(same);
  const script = document.querySelector(
    "script[data-google-routes-sdk]",
  ) as HTMLScriptElement;
  expect(new URL(script.src).origin).toBe("https://maps.googleapis.com");
  const rejected = expect(first).rejects.toThrow(/demorou/);
  await vi.advanceTimersByTimeAsync(12000);
  await rejected;
  expect(script.isConnected).toBe(false);
  const second = loadGoogleMaps("public-test-key");
  const retry = document.querySelector(
    "script[data-google-routes-sdk]",
  ) as HTMLScriptElement;
  const callback = new URL(retry.src).searchParams.get("callback")!;
  const f = sdk();
  vi.stubGlobal("google", { maps: f.api });
  (window as any)[callback]();
  await expect(second).resolves.toBe(f.api);
  vi.useRealTimers();
  const view = render(
    <GoogleRouteMap route={googleFixture.routes[0]} apiKey="public-test-key" />,
  );
  await act(async () => {});
  expect(f.maps).toHaveLength(1);
  act(() => {
    (window as any).gm_authFailure?.();
  });
  expect(
    await screen.findByText(/Não foi possível autorizar o mapa Google/),
  ).toBeTruthy();
  view.rerender(
    <GoogleRouteMap route={googleFixture.routes[1]} apiKey="public-test-key" />,
  );
  expect(
    screen.getByText(/Não foi possível autorizar o mapa Google/),
  ).toBeTruthy();
  view.unmount();
});
it("ignora SDK resolvido depois de desmontar", async () => {
  const f = sdk();
  let finish!: (s: MapsSdk) => void;
  const loader = () => new Promise<MapsSdk>((r) => (finish = r));
  const view = render(
    <GoogleRouteMap
      route={googleFixture.routes[0]}
      apiKey="test"
      loader={loader}
    />,
  );
  view.unmount();
  await act(async () => finish(f.api));
  expect(f.maps).toHaveLength(0);
});
