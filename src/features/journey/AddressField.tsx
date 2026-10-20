import { useEffect, useId, useRef, useState } from "react";
import { Check, MapPin, Search, X } from "lucide-react";
import { searchAddresses } from "./geocoder";
import type { Place } from "./types";
type Props = {
  label: string;
  value: string;
  selected: Place | null;
  onChange: (text: string) => void;
  onSelect: (place: Place) => void;
  endpoint?: string;
  id?: "origin" | "destination";
};
export default function AddressField({
  label,
  value,
  selected,
  onChange,
  onSelect,
  endpoint,
  id = "origin",
}: Props) {
  const fieldId = useId(),
    controller = useRef<AbortController | null>(null),
    generation = useRef(0);
  const [results, setResults] = useState<Place[]>([]),
    [pending, setPending] = useState<Place | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [searched, setSearched] = useState(false);
  function invalidate() {
    generation.current++;
    controller.current?.abort();
    setResults([]);
    setPending(null);
    setBusy(false);
    setError("");
    setSearched(false);
  }
  useEffect(() => {
    invalidate();
  }, [value]);
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [],
  );
  async function search() {
    const current = ++generation.current;
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setError("");
    setResults([]);
    setPending(null);
    setSearched(true);
    try {
      const found = await searchAddresses(value, c.signal, endpoint);
      if (current === generation.current && !c.signal.aborted)
        setResults(found);
    } catch (e) {
      if (current === generation.current && !c.signal.aborted)
        setError(
          e instanceof Error ? e.message : "A busca falhou. Tente novamente.",
        );
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  function choose(place: Place) {
    if (place.approximate) setPending(place);
    else onSelect(place);
  }
  const purpose = id === "origin" ? "origem" : "destino";
  return (
    <div
      className={"address-field " + (selected ? "address-confirmed" : "")}
      role="group"
      aria-label={"Endereço de " + purpose}
    >
      <label htmlFor={fieldId} id={fieldId + "-label"}>
        <span className={"journey-dot " + id} />
        {label}
      </label>
      <div className="address-input-row">
        <input
          id={fieldId}
          autoComplete="off"
          maxLength={160}
          value={value}
          placeholder={
            id === "origin"
              ? "Rua, avenida, travessa, número…"
              : "Endereço para onde você quer ir"
          }
          onChange={(e) => {
            invalidate();
            onChange(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (value.trim().length >= 3) void search();
            }
          }}
        />
        {value && (
          <button
            type="button"
            className="address-clear"
            aria-label={"Limpar " + purpose}
            onClick={() => {
              invalidate();
              onChange("");
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>
      {selected ? (
        <p className="address-confirmation">
          <Check size={14} />{" "}
          {selected.source === "device"
            ? "Localização confirmada"
            : selected.approximate
              ? "Ponto aproximado confirmado"
              : "Endereço confirmado"}
        </p>
      ) : (
        <button
          type="button"
          className="address-search-button"
          aria-label={"Localizar " + purpose}
          disabled={
            busy || value.trim().length < 3 || value.trim().length > 160
          }
          onClick={() => void search()}
        >
          <Search size={15} />
          {busy ? "Localizando…" : "Localizar endereço"}
        </button>
      )}
      {busy && (
        <p className="address-status" role="status">
          Consultando endereços…
        </p>
      )}
      {error && (
        <div className="address-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void search()}>
            Tentar novamente
          </button>
        </div>
      )}
      {!!results.length && !selected && (
        <ul className="address-results" aria-label={"Endereços de " + purpose}>
          {results.map((place) => (
            <li key={place.id}>
              <button type="button" onClick={() => choose(place)}>
                <MapPin size={16} />
                <span>
                  {place.label}
                  {place.approximate && (
                    <small>Ponto aproximado · confira o endereço</small>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {pending && !selected && (
        <div className="address-approximate" role="status">
          <p>
            O endereço completo, incluindo o número, não foi confirmado. Confira
            este ponto aproximado: <strong>{pending.label}</strong>.
          </p>
          <button type="button" onClick={() => onSelect(pending)}>
            Usar este ponto aproximado
          </button>
        </div>
      )}
      {searched && !busy && !error && !results.length && !selected && (
        <p className="address-status" role="status">
          Nenhum endereço encontrado. Tente rua, número e bairro.
        </p>
      )}
    </div>
  );
}
