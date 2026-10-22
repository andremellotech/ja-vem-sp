import { useState } from "react";
import { ChevronRight, LocateFixed, MapPin, Search, X } from "lucide-react";
import type { Stop } from "../../contracts";
import { distanceM } from "./network";
import { matchesSearch } from "../search/text";
function distanceLabel(meters: number) {
  if (meters < 50) return "< 50 m";
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km`;
}

export default function StopPicker({
  stops,
  selectedId,
  onSelect,
  location,
  onLocate,
}: {
  stops: Stop[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  location: [number, number] | null;
  onLocate: () => void;
}) {
  const [query, setQuery] = useState("");
  const visible = stops
    .map((stop) => ({
      stop,
      distance: location
        ? distanceM(location[0], location[1], stop.lat, stop.lon)
        : null,
    }))
    .filter(({ stop }) =>
      matchesSearch([stop.name, stop.address], query, [stop.id]),
    );
  if (location) visible.sort((a, b) => a.distance! - b.distance!);
  return (
    <section className="stop-picker" aria-label="Paradas da linha">
      <div className="stop-picker-heading">
        <h3>Escolha sua parada</h3>
        <span>
          {visible.length} de {stops.length}
        </span>
      </div>
      <div className="stop-search">
        <Search size={17} aria-hidden="true" />
        <input
          aria-label="Buscar parada nesta linha"
          placeholder="Nome, rua ou código da parada"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <button
            type="button"
            aria-label="Limpar busca de paradas"
            onClick={() => setQuery("")}
          >
            <X size={17} />
          </button>
        )}
      </div>
      <button className="nearby-button" type="button" onClick={onLocate}>
        <LocateFixed size={16} /> Usar minha localização
      </button>
      {location && (
        <p className="distance-note">
          Distâncias em linha reta · mais próximas primeiro.
        </p>
      )}
      <div className="stop-list">
        {visible.map(({ stop, distance }) => (
          <button
            type="button"
            key={stop.id}
            className={selectedId === stop.id ? "stop selected" : "stop"}
            aria-pressed={selectedId === stop.id}
            onClick={() => onSelect(stop.id)}
          >
            <span className="stop-number">
              <MapPin size={14} aria-hidden="true" />
            </span>
            <span>
              {stop.name}
              {stop.address && (
                <small className="stop-address">{stop.address}</small>
              )}
              {distance !== null && (
                <small className="stop-distance">
                  {distanceLabel(distance)}
                </small>
              )}
            </span>
            <ChevronRight size={17} aria-hidden="true" />
          </button>
        ))}
      </div>
      {!visible.length && (
        <p className="muted" role="status">
          Nenhuma parada com essa busca. Tente o nome, a rua ou o código.
        </p>
      )}
    </section>
  );
}
