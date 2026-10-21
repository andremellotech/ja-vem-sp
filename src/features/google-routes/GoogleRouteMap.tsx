import { useEffect, useRef, useState } from "react";
import type { GoogleRoute } from "../../google-routes-contracts";
import {
  GOOGLE_MAP_AUTH_ERROR_EVENT,
  loadGoogleMaps,
  type MapInstance,
  type MapOverlay,
  type MapsSdk,
} from "./maps-loader";
type Props = {
  route: GoogleRoute;
  apiKey?: string;
  loader?: typeof loadGoogleMaps;
};
export default function GoogleRouteMap({
  route,
  apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
  loader = loadGoogleMaps,
}: Props) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<MapInstance | null>(null),
    overlays = useRef<MapOverlay[]>([]),
    load = useRef(loader),
    authorized = useRef(true);
  const [sdk, setSdk] = useState<MapsSdk | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  load.current = loader;
  useEffect(() => {
    let active = true;
    let loaded: MapsSdk | null = null;
    setError("");
    setSdk(null);
    authorized.current = true;
    const authFailure = () => {
      authorized.current = false;
      setError(
        "Não foi possível autorizar o mapa Google. As instruções e os links externos continuam disponíveis. Confira a configuração e recarregue a página.",
      );
      overlays.current.forEach((o) => {
        o.setMap(null);
        loaded?.event.clearInstanceListeners(o);
      });
      overlays.current = [];
    };
    window.addEventListener(GOOGLE_MAP_AUTH_ERROR_EVENT, authFailure);
    load
      .current(apiKey)
      .then((api) => {
        if (!active || !host.current) return;
        loaded = api;
        map.current = new api.Map(host.current, {
          center: { lat: -23.5505, lng: -46.6333 },
          zoom: 13,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        setSdk(api);
      })
      .catch(() => {
        if (active)
          setError(
            "Não foi possível carregar o mapa Google. As instruções e os links externos continuam disponíveis.",
          );
      });
    return () => {
      active = false;
      window.removeEventListener(GOOGLE_MAP_AUTH_ERROR_EVENT, authFailure);
      overlays.current.forEach((o) => {
        o.setMap(null);
        loaded?.event.clearInstanceListeners(o);
      });
      overlays.current = [];
      if (map.current) loaded?.event.clearInstanceListeners(map.current);
      map.current = null;
      host.current?.replaceChildren();
    };
  }, [apiKey, attempt]);
  useEffect(() => {
    if (!sdk || !map.current || !authorized.current) return;
    const m = map.current;
    const bounds = new sdk.LatLngBounds();
    let hasBounds = false;
    const remove = () => {
      overlays.current.forEach((o) => {
        o.setMap(null);
        sdk.event.clearInstanceListeners(o);
      });
      overlays.current = [];
    };
    remove();
    setError("");
    try {
      const path = route.polyline
        ? sdk.geometry.encoding.decodePath(route.polyline)
        : [];
      if (path.length) {
        overlays.current.push(
          new sdk.Polyline({
            map: m,
            path,
            strokeColor: "#176449",
            strokeWeight: 5,
            strokeOpacity: 0.9,
          }),
        );
        path.forEach((p) => bounds.extend(p));
        hasBounds = true;
      }
      const from = route.steps[0]?.from,
        to = route.steps.at(-1)?.to;
      for (const [label, point] of [
        ["A", from],
        ["B", to],
      ] as const) {
        if (!point) continue;
        const position = { lat: point.lat, lng: point.lon };
        overlays.current.push(
          new sdk.Marker({
            map: m,
            position,
            label,
            title: label === "A" ? "Origem" : "Destino",
          }),
        );
        bounds.extend(position);
        hasBounds = true;
      }
      if (!path.length)
        setError(
          "Google não forneceu o desenho deste trajeto. Consulte as instruções e os links externos.",
        );
    } catch {
      remove();
      setError(
        "Não foi possível desenhar este trajeto Google. Consulte as instruções e os links externos.",
      );
    }
    const fit = () => {
      if (
        hasBounds &&
        host.current &&
        host.current.getBoundingClientRect().width > 0
      ) {
        sdk.event.trigger(m, "resize");
        m.fitBounds(bounds, 50);
      }
    };
    fit();
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    if (host.current) observer?.observe(host.current);
    return () => {
      observer?.disconnect();
      remove();
    };
  }, [route, sdk]);
  return (
    <div className="google-map-panel">
      <div
        ref={host}
        className="google-map-canvas"
        role="region"
        aria-label="Mapa do trajeto Google Maps"
      />
      <div className="google-map-caption">
        <span className="google-brand-attribution" translate="no">
          Google Maps
        </span>{" "}
        · {route.description || "Trajeto selecionado"}
      </div>
      {!sdk && !error && (
        <p className="google-map-state" role="status">
          Carregando mapa Google…
        </p>
      )}
      {error && (
        <div className="google-map-state" role="status">
          <p>{error}</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)}>
            Tentar carregar mapa Google
          </button>
        </div>
      )}
    </div>
  );
}
