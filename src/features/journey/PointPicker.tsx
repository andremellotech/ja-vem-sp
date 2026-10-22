import { useEffect, useId, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Point } from "./types";
export default function PointPicker({
  initial,
  address,
  onConfirm,
  onCancel,
}: {
  initial: Point;
  address: string;
  onConfirm: (point: Point) => void;
  onCancel: () => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    pin = useRef<L.Marker | null>(null);
  const [point, setPoint] = useState<Point | null>(null),
    [lat, setLat] = useState(""),
    [lon, setLon] = useState("");
  const [error, setError] = useState("");
  const id = useId();
  function place(p: Point) {
    if (
      !Number.isFinite(p.lat) ||
      !Number.isFinite(p.lon) ||
      Math.abs(p.lat) > 90 ||
      Math.abs(p.lon) > 180
    )
      return;
    setPoint(p);
    setLat(p.lat.toFixed(6));
    setLon(p.lon.toFixed(6));
    setError("");
    pin.current?.setLatLng([p.lat, p.lon]);
  }
  useEffect(() => {
    if (!host.current) return;
    const m = L.map(host.current).setView([initial.lat, initial.lon], 17);
    map.current = m;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    const marker = L.marker([initial.lat, initial.lon], {
      draggable: true,
      icon: L.divIcon({
        className: "address-location-pin",
        html: '<span aria-hidden="true">📍</span>',
        iconSize: [32, 38],
        iconAnchor: [16, 34],
      }),
    }).addTo(m);
    pin.current = marker;
    m.on("click", (e: L.LeafletMouseEvent) =>
      place({ lat: e.latlng.lat, lon: e.latlng.lng }),
    );
    marker.on("dragend", () => {
      const p = marker.getLatLng();
      place({ lat: p.lat, lon: p.lng });
    });
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(host.current);
    return () => {
      resize.disconnect();
      m.remove();
      map.current = null;
      pin.current = null;
    };
  }, []);
  function useCoordinates() {
    const a = lat.trim().replace(",", "."),
      b = lon.trim().replace(",", ".");
    if (
      !a ||
      !b ||
      !Number.isFinite(Number(a)) ||
      !Number.isFinite(Number(b)) ||
      Math.abs(Number(a)) > 90 ||
      Math.abs(Number(b)) > 180
    ) {
      setError("Informe latitude entre -90 e 90 e longitude entre -180 e 180.");
      return;
    }
    const p = { lat: Number(a), lon: Number(b) };
    place(p);
    map.current?.setView([p.lat, p.lon], 18);
  }
  return (
    <section className="point-picker" aria-label="Marcar entrada no mapa">
      <h4>Marque a entrada do local</h4>
      <p>
        <strong>{address}</strong>
      </p>
      <p>
        Toque no mapa ou arraste o marcador até a entrada do imóvel. O marcador
        inicial é uma referência; o número não foi validado pela base.
      </p>
      <div
        ref={host}
        className="point-picker-map"
        aria-label="Mapa para escolher o ponto"
      />
      <details>
        <summary>Informar latitude e longitude</summary>
        <label htmlFor={id + "-lat"}>Latitude</label>
        <input
          id={id + "-lat"}
          inputMode="decimal"
          value={lat}
          onChange={(e) => {
            setLat(e.target.value);
            setPoint(null);
          }}
          placeholder="-23.550500"
        />
        <label htmlFor={id + "-lon"}>Longitude</label>
        <input
          id={id + "-lon"}
          inputMode="decimal"
          value={lon}
          onChange={(e) => {
            setLon(e.target.value);
            setPoint(null);
          }}
          placeholder="-46.633300"
        />
        <button type="button" onClick={useCoordinates}>
          Aplicar coordenadas
        </button>
      </details>
      {error && <p role="alert">{error}</p>}
      <p role="status">
        {point
          ? `Ponto escolhido: ${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}`
          : "Escolha o ponto antes de confirmar."}
      </p>
      <div className="point-picker-actions">
        <button
          type="button"
          disabled={!point}
          onClick={() => point && onConfirm(point)}
        >
          Confirmar ponto no mapa
        </button>
        <button type="button" onClick={onCancel}>
          Cancelar marcação
        </button>
      </div>
    </section>
  );
}
