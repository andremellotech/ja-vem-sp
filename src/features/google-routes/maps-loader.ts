export interface MapInstance {
  fitBounds(bounds: MapBounds, padding?: number): void;
}
export interface MapBounds {
  extend(point: unknown): MapBounds;
}
export interface MapOverlay {
  setMap(map: MapInstance | null): void;
}
export interface MapsSdk {
  Map: new (host: HTMLElement, options: Record<string, unknown>) => MapInstance;
  Polyline: new (options: Record<string, unknown>) => MapOverlay;
  Marker: new (options: Record<string, unknown>) => MapOverlay;
  LatLngBounds: new () => MapBounds;
  geometry: { encoding: { decodePath(polyline: string): unknown[] } };
  event: {
    clearInstanceListeners(instance: unknown): void;
    trigger(instance: unknown, event: string): void;
  };
}
type MapsWindow = Window & {
  google?: { maps?: MapsSdk };
  gm_authFailure?: () => void;
};
export const GOOGLE_MAP_AUTH_ERROR_EVENT = "ja-vem-google-map-auth-error";
let pending: Promise<MapsSdk> | null = null,
  sequence = 0,
  authFailed = false;
export function loadGoogleMaps(key: string): Promise<MapsSdk> {
  if (!key.trim())
    return Promise.reject(
      new Error("O mapa Google ainda não foi configurado."),
    );
  if (authFailed)
    return Promise.reject(
      new Error(
        "O mapa Google não pôde ser autorizado. Recarregue a página após conferir a configuração.",
      ),
    );
  const win = window as MapsWindow;
  if (win.google?.maps?.geometry?.encoding)
    return Promise.resolve(win.google.maps);
  if (pending) return pending;
  pending = new Promise<MapsSdk>((resolve, reject) => {
    const callback = `__jaVemGoogleMaps${++sequence}`,
      script = document.createElement("script");
    const callbacks = window as unknown as Record<string, unknown>,
      previousAuth = win.gm_authFailure;
    let loading = true;
    const cleanup = (restoreAuth: boolean) => {
      clearTimeout(timer);
      script.onerror = null;
      delete callbacks[callback];
      if (restoreAuth && win.gm_authFailure === authFailure)
        win.gm_authFailure = previousAuth;
    };
    const fail = (message: string) => {
      loading = false;
      cleanup(true);
      script.remove();
      pending = null;
      reject(new Error(message));
    };
    const authFailure = () => {
      authFailed = true;
      if (loading) fail("O mapa Google não pôde ser autorizado.");
      window.dispatchEvent(new Event(GOOGLE_MAP_AUTH_ERROR_EVENT));
      previousAuth?.();
    };
    const timer = setTimeout(
      () => fail("O mapa Google demorou demais. Tente novamente."),
      12000,
    );
    callbacks[callback] = () => {
      if (!win.google?.maps?.geometry?.encoding) {
        fail("O mapa Google não está disponível.");
        return;
      }
      loading = false;
      cleanup(false);
      resolve(win.google.maps);
    };
    win.gm_authFailure = authFailure;
    const url = new URL("https://maps.googleapis.com/maps/api/js");
    url.search = new URLSearchParams({
      key,
      v: "weekly",
      libraries: "geometry",
      language: "pt-BR",
      region: "BR",
      loading: "async",
      callback,
    }).toString();
    script.src = url.href;
    script.async = true;
    script.dataset.googleRoutesSdk = "true";
    script.onerror = () =>
      fail("O mapa Google foi bloqueado ou está indisponível.");
    document.head.append(script);
  });
  return pending;
}
