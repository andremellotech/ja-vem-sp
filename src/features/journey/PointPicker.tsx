import { useEffect, useId, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Point } from "./types";
import { parseMapPoint } from "./map-point-input";
export default function PointPicker({
  initial,
  address,
  onConfirm,
  onCancel,
  boundary,
  lotPolygons,
  referenceLabel,
}: {
  initial: Point;
  address: string;
  onConfirm: (point: Point) => void;
  onCancel: () => void;
  boundary?: Point[];
  lotPolygons?: Point[][][];
  referenceLabel?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    host = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    pin = useRef<L.Marker | null>(null);
  const [point, setPoint] = useState<Point | null>(null),
    [lat, setLat] = useState(""),
    [lon, setLon] = useState("");
  const [error, setError] = useState(""),
    [pasted, setPasted] = useState("");
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
    const d = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    if (d && !d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
    }
    if (!host.current) return;
    const m = L.map(host.current).setView([initial.lat, initial.lon], 17);
    map.current = m;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    if (lotPolygons?.length)
      L.polygon(
        lotPolygons.map((p) =>
          p.map((r) => r.map((v) => [v.lat, v.lon] as [number, number])),
        ),
        { color: "#bd721d", weight: 2, fillOpacity: 0.12 },
      ).addTo(m);
    else if (boundary?.length)
      L.polygon(
        boundary.map((p) => [p.lat, p.lon] as [number, number]),
        {
          color: "#bd721d",
          weight: 2,
          fillOpacity: 0.12,
        },
      ).addTo(m);
    const marker = L.marker([initial.lat, initial.lon], {
      draggable: true,
      title: "Escolher este ponto",
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
    marker.on("click", () => {
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
      previous?.focus();
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
  function usePasted() {
    try {
      const p = parseMapPoint(pasted);
      place(p);
      map.current?.setView([p.lat, p.lon], 18);
    } catch (e) {
      setPoint(null);
      setError(
        e instanceof Error ? e.message : "Não foi possível usar este ponto.",
      );
    }
  }
  return (
    <dialog
      ref={dialog}
      className="point-picker point-picker-dialog"
      aria-labelledby={id + "-title"}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <h4 id={id + "-title"}>Marque a entrada do local</h4>
      <p>
        <strong>{address}</strong>
      </p>
      {referenceLabel && referenceLabel !== address && (
        <p>
          Referência pesquisada: <strong>{referenceLabel}</strong>
        </p>
      )}
      <p>
        Toque na entrada, arraste o marcador ou mova o mapa e use o centro. O
        ponto inicial é uma referência; confirme onde você vai entrar ou sair.
      </p>
      {boundary?.length ? (
        <p className="point-picker-lot">
          Área do lote cadastrado no GeoSampa. O cadastro do número não confirma
          a posição da porta.
        </p>
      ) : null}
      <div
        ref={host}
        className="point-picker-map"
        aria-label="Mapa para escolher o ponto"
      />
      <button
        type="button"
        onClick={() => {
          const p = map.current?.getCenter();
          if (p) place({ lat: p.lat, lon: p.lng });
        }}
      >
        Usar centro do mapa
      </button>
      <div className="point-picker-paste">
        <label htmlFor={id + "-point"}>Coordenadas ou link do ponto</label>
        <input
          id={id + "-point"}
          value={pasted}
          autoComplete="off"
          spellCheck={false}
          placeholder="-23.5614, -46.6559 ou link Google Maps"
          onChange={(e) => {
            setPasted(e.target.value);
            setPoint(null);
            setError("");
          }}
        />
        <button type="button" onClick={usePasted}>
          Aplicar ponto colado
        </button>
        <p>
          Já encontrou no Google Maps? Copie as coordenadas do local e cole
          acima. A leitura é feita neste site, sem consultar o Google. Links
          curtos precisam ser abertos por você para copiar as coordenadas.
        </p>
      </div>
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
    </dialog>
  );
}
