import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Stop, Vehicle } from "../../contracts";
import type { NetStopIndex } from "../stops/network";
import type { JourneyMapSelection } from "../journey/types";
const MIN_ZOOM = 15,
  MAX_DRAWN = 700;
interface Props {
  stops: Stop[];
  vehicles: Vehicle[];
  selectedStop: string | null;
  onSelectStop: (id: string) => void;
  location: [number, number] | null;
  network?: NetStopIndex | null;
  journey?: JourneyMapSelection | null;
}
export default function TransitMap({
  stops,
  vehicles,
  selectedStop,
  onSelectStop,
  location,
  network = null,
  journey = null,
}: Props) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    layers = useRef<L.LayerGroup | null>(null),
    netLayer = useRef<L.LayerGroup | null>(null);
  const journeyLayer = useRef<L.LayerGroup | null>(null),
    lastJourney = useRef<JourneyMapSelection | null>(null);
  const [view, setView] = useState(0),
    [hint, setHint] = useState<"zoom" | "dense" | null>(null);
  const fitted = useRef("");
  const pendingBounds = useRef<L.LatLngBounds | null>(null);
  const pendingFocus = useRef<{ point: L.LatLngTuple; zoom: number } | null>(
    null,
  );
  function fitWhenVisible(m: L.Map) {
    const size = m.getSize();
    if (size.x <= 0 || size.y <= 0) return;
    if (pendingFocus.current) {
      m.setView(pendingFocus.current.point, pendingFocus.current.zoom);
      pendingFocus.current = null;
    } else if (pendingBounds.current) {
      m.fitBounds(pendingBounds.current, { padding: [40, 40], maxZoom: 15 });
      pendingBounds.current = null;
    }
  }
  useEffect(() => {
    if (!host.current) return;
    const m = L.map(host.current, {
      zoomControl: false,
      preferCanvas: true,
    }).setView([-23.5505, -46.6333], 13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      crossOrigin: true,
    }).addTo(m);
    L.control.zoom({ position: "bottomright" }).addTo(m);
    netLayer.current = L.layerGroup().addTo(m);
    journeyLayer.current = L.layerGroup().addTo(m);
    layers.current = L.layerGroup().addTo(m);
    map.current = m;
    m.on("moveend", () => setView((v) => v + 1));
    const resize = new ResizeObserver(() => {
      m.invalidateSize();
      fitWhenVisible(m);
    });
    resize.observe(host.current);
    return () => {
      resize.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const group = layers.current,
      m = map.current;
    if (!group || !m) return;
    group.clearLayers();
    for (const stop of stops) {
      const marker = L.circleMarker([stop.lat, stop.lon], {
        radius: selectedStop === stop.id ? 9 : 5,
        color: "#fff",
        weight: 2,
        fillColor: selectedStop === stop.id ? "#df7137" : "#285f50",
        fillOpacity: 1,
      }).addTo(group);
      const label = document.createElement("span");
      label.textContent = [stop.name, stop.address].filter(Boolean).join(" · ");
      marker.bindTooltip(label);
      marker.on("click", () => onSelectStop(stop.id));
    }
    for (const v of vehicles) {
      const marker = L.marker([v.lat, v.lon], {
        icon: L.divIcon({
          className: "bus-pin",
          html: '<span aria-hidden="true">▰</span>',
          iconSize: [28, 28],
        }),
      }).addTo(group);
      const label = document.createElement("span");
      label.textContent = "Ônibus " + v.id;
      marker.bindTooltip(label);
    }
    if (location)
      L.circleMarker(location, {
        radius: 8,
        color: "#fff",
        weight: 3,
        fillColor: "#3478d7",
        fillOpacity: 1,
      }).addTo(group);
    const framing = journey
      ? [journey.origin, journey.destination, ...journey.stops]
      : stops;
    const key = journey
      ? "journey:" + journey.stops.map((s) => s.id).join(",")
      : stops.map((s) => s.id).join(",");
    if (key && (key !== fitted.current || lastJourney.current !== journey)) {
      const points = framing.map((s) => [s.lat, s.lon] as L.LatLngTuple);
      pendingFocus.current = null;
      pendingBounds.current = L.latLngBounds(points);
      fitted.current = key;
      fitWhenVisible(m);
    } else if (!key && fitted.current) {
      fitted.current = "";
      pendingBounds.current = null;
    }
    lastJourney.current = journey;
  }, [stops, vehicles, selectedStop, onSelectStop, location, journey]);
  useEffect(() => {
    const group = journeyLayer.current;
    if (!group) return;
    group.clearLayers();
    if (!journey) return;
    const mark = (
      point: { lat: number; lon: number },
      label: string,
      color: string,
      radius: number,
      onClick?: () => void,
    ) => {
      const marker = L.circleMarker([point.lat, point.lon], {
        radius,
        color: "#fff",
        weight: 2,
        fillColor: color,
        fillOpacity: 1,
      }).addTo(group);
      const node = document.createElement("span");
      node.textContent = label;
      marker.bindTooltip(node);
      if (onClick) marker.on("click", onClick);
    };
    for (const s of journey.stops)
      mark(
        s,
        [s.name, s.address].filter(Boolean).join(" · "),
        selectedStop === s.id ? "#df7137" : "#285f50",
        selectedStop === s.id ? 9 : 5,
        () => onSelectStop(s.id),
      );
    mark(journey.origin, "Origem do trajeto", "#3478d7", 9);
    mark(journey.destination, "Destino do trajeto", "#df7137", 9);
  }, [journey, selectedStop, onSelectStop]);
  useEffect(() => {
    const g = netLayer.current,
      m = map.current;
    if (!g || !m) return;
    g.clearLayers();
    if (!network) return setHint(null);
    if (m.getZoom() < MIN_ZOOM) return setHint("zoom");
    const b = m.getBounds(),
      { stops: visible, total } = network.inBounds(
        b.getSouth(),
        b.getWest(),
        b.getNorth(),
        b.getEast(),
        MAX_DRAWN,
      ),
      own = new Set(stops.map((s) => s.id));
    for (const s of visible) {
      if (own.has(s.id)) continue;
      const on = selectedStop === s.id;
      const marker = L.circleMarker([s.lat, s.lon], {
        radius: on ? 9 : s.rail ? 6 : 4,
        color: "#fff",
        weight: on ? 2 : 1.5,
        fillColor: on ? "#df7137" : s.rail ? "#4b4a9c" : "#7fa293",
        fillOpacity: 1,
      }).addTo(g);
      const label = document.createElement("span");
      label.textContent = s.name;
      marker.bindTooltip(label);
      marker.on("click", () => onSelectStop(s.id));
    }
    setHint(total > MAX_DRAWN ? "dense" : null);
  }, [network, view, stops, selectedStop, onSelectStop]);
  useEffect(() => {
    const s =
      stops.find((x) => x.id === selectedStop) ??
      (selectedStop ? network?.byId.get(selectedStop) : undefined);
    if (s && map.current) {
      pendingBounds.current = null;
      pendingFocus.current = {
        point: [s.lat, s.lon],
        zoom: Math.max(map.current.getZoom(), 15),
      };
      fitWhenVisible(map.current);
    }
  }, [selectedStop]);
  useEffect(() => {
    if (location && map.current) {
      pendingBounds.current = null;
      pendingFocus.current = { point: location, zoom: 15 };
      fitWhenVisible(map.current);
    }
  }, [location]);
  return (
    <>
      <div
        className="map-canvas"
        ref={host}
        aria-label="Mapa de linhas e paradas de São Paulo"
      />
      {hint && (
        <div className="map-hint" role="status">
          {hint === "zoom"
            ? "Aproxime o mapa para ver as paradas"
            : "Muitas paradas aqui — aproxime mais para ver todas"}
        </div>
      )}
    </>
  );
}
