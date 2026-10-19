import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Stop, Vehicle } from "../../contracts";
interface Props {
  stops: Stop[];
  vehicles: Vehicle[];
  selectedStop: string | null;
  onSelectStop: (id: string) => void;
  location: [number, number] | null;
}
export default function TransitMap({
  stops,
  vehicles,
  selectedStop,
  onSelectStop,
  location,
}: Props) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    layers = useRef<L.LayerGroup | null>(null);
  const fitted = useRef("");
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
    layers.current = L.layerGroup().addTo(m);
    map.current = m;
    const resize = new ResizeObserver(() => m.invalidateSize());
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
      label.textContent = stop.name;
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
    const key = stops.map((s) => s.id).join(",");
    if (key && key !== fitted.current) {
      const points = stops.map((s) => [s.lat, s.lon] as L.LatLngTuple);
      m.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 });
      fitted.current = key;
    }
  }, [stops, vehicles, selectedStop, onSelectStop, location]);
  useEffect(() => {
    if (location) map.current?.setView(location, 15);
  }, [location]);
  return (
    <div
      className="map-canvas"
      ref={host}
      aria-label="Mapa de linhas e paradas de São Paulo"
    />
  );
}
