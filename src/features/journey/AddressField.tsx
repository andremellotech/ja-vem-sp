import { useEffect, useId, useRef, useState } from "react";
import { Check, Globe2, MapPin, Search, X } from "lucide-react";
import { searchAddresses, type AddressScope } from "./geocoder";
import type { Place } from "./types";
type Props = {
  label: string;
  value: string;
  selected: Place | null;
  onChange: (text: string) => void;
  onSelect: (place: Place) => void;
  endpoint?: string;
  id?: "origin" | "destination";
  active?: boolean;
};
export default function AddressField({
  label,
  value,
  selected,
  onChange,
  onSelect,
  endpoint,
  id = "origin",
  active = true,
}: Props) {
  const fieldId = useId(),
    inputRef = useRef<HTMLInputElement>(null),
    controller = useRef<AbortController | null>(null),
    generation = useRef(0),
    activeRef = useRef(active),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    cache = useRef(new Map<string, { at: number; places: Place[] }>());
  activeRef.current = active;
  const [results, setResults] = useState<Place[]>([]),
    [pending, setPending] = useState<Place | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [searched, setSearched] = useState(false),
    [open, setOpen] = useState(false),
    [highlighted, setHighlighted] = useState(-1),
    [composing, setComposing] = useState(false);
  const [scope, setScope] = useState<AddressScope>("region");
  function cancel() {
    clearTimeout(timer.current);
    generation.current++;
    controller.current?.abort();
  }
  function schedule() {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void search(), 600);
  }
  function invalidate() {
    cancel();
    setResults([]);
    setPending(null);
    setBusy(false);
    setError("");
    setSearched(false);
    setOpen(false);
    setHighlighted(-1);
  }
  useEffect(() => {
    invalidate();
    if (active && !selected && !composing && value.trim().length >= 3)
      schedule();
    return cancel;
  }, [value, selected, active, composing, scope]);
  useEffect(
    () => () => {
      cancel();
    },
    [],
  );
  async function search(explicit = false) {
    if (!activeRef.current || composing || selected) return;
    if (explicit) inputRef.current?.focus();
    clearTimeout(timer.current);
    const current = ++generation.current;
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setError("");
    setResults([]);
    setPending(null);
    setSearched(true);
    setOpen(false);
    setHighlighted(-1);
    const key = `${endpoint ?? "default"}:${scope}:${value.trim().toLocaleLowerCase("pt-BR")}`;
    try {
      const saved = cache.current.get(key);
      const found =
        saved && Date.now() - saved.at < 300000
          ? saved.places
          : await searchAddresses(value, c.signal, endpoint, scope);
      if (
        activeRef.current &&
        current === generation.current &&
        !c.signal.aborted
      ) {
        if (!saved || Date.now() - saved.at >= 300000) {
          cache.current.delete(key);
          cache.current.set(key, { at: Date.now(), places: found });
          if (cache.current.size > 50)
            cache.current.delete(cache.current.keys().next().value!);
        }
        setResults(found);
        setOpen(found.length > 0);
      }
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
    cancel();
    setBusy(false);
    setOpen(false);
    setHighlighted(-1);
    if (place.approximate || place.outsideCoverage) setPending(place);
    else onSelect(place);
  }
  useEffect(() => {
    if (open && highlighted >= 0)
      document
        .getElementById(`${fieldId}-option-${highlighted}`)
        ?.scrollIntoView?.({ block: "nearest" });
  }, [open, highlighted, fieldId]);
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
          ref={inputRef}
          id={fieldId}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && !!results.length && !selected}
          aria-controls={fieldId + "-results"}
          aria-activedescendant={
            open && highlighted >= 0
              ? `${fieldId}-option-${highlighted}`
              : undefined
          }
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
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          onFocus={() => {
            if (results.length && !selected) setOpen(true);
            else if (active && !selected && value.trim().length >= 3)
              schedule();
          }}
          onBlur={() => {
            cancel();
            setBusy(false);
            setOpen(false);
            if (busy) setSearched(false);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || composing) return;
            if (
              (e.key === "ArrowDown" || e.key === "ArrowUp") &&
              results.length
            ) {
              e.preventDefault();
              setOpen(true);
              setHighlighted((index) =>
                e.key === "ArrowDown"
                  ? (index + 1) % results.length
                  : index <= 0
                    ? results.length - 1
                    : index - 1,
              );
            }
            if (e.key === "Escape") {
              cancel();
              setBusy(false);
              setOpen(false);
              setPending(null);
              setHighlighted(-1);
              setSearched(false);
            }
            if (e.key === "Enter") {
              e.preventDefault();
              if (open && highlighted >= 0) choose(results[highlighted]);
              else if (value.trim().length >= 3) void search(true);
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
          onClick={() => void search(true)}
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
      {!selected && (
        <div className="address-localities">
          <p>
            Ruas com o mesmo nome? Informe também bairro, cidade ou CEP.{" "}
            {scope === "region"
              ? "Busca em São Paulo e arredores."
              : "Busca em todo o Brasil."}
          </p>
          <button
            type="button"
            className="address-scope"
            aria-pressed={scope === "all"}
            onClick={() => {
              invalidate();
              setScope(scope === "region" ? "all" : "region");
            }}
          >
            <Globe2 size={14} />{" "}
            {scope === "region"
              ? "Incluir outras cidades"
              : "Limitar a São Paulo e arredores"}
          </button>
        </div>
      )}
      {error && (
        <div className="address-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void search(true)}>
            Tentar novamente
          </button>
        </div>
      )}
      {open && !!results.length && !selected && (
        <ul
          id={fieldId + "-results"}
          role="listbox"
          className="address-results"
          aria-label={"Endereços de " + purpose}
        >
          {results.map((place, index) => (
            <li key={place.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={highlighted === index}
                id={`${fieldId}-option-${index}`}
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(place)}
              >
                <MapPin size={16} />
                <span>
                  {place.label}
                  {place.approximate && (
                    <small>Ponto aproximado · confira o endereço</small>
                  )}
                  {place.outsideCoverage && (
                    <small>
                      Outro município · confira a cobertura do transporte
                    </small>
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
            {pending.approximate
              ? "O endereço completo, incluindo o número, não foi confirmado. Confira este ponto aproximado: "
              : "Confira o local antes de continuar: "}
            <strong>{pending.label}</strong>.
          </p>
          {pending.outsideCoverage && (
            <p>
              Este local fica fora do município de São Paulo. Os ônibus
              municipais da SPTrans podem não atender essa região; a
              disponibilidade de metrô/trem depende da base de trajetos.
            </p>
          )}
          <button type="button" onClick={() => onSelect(pending)}>
            {pending.approximate
              ? "Usar este ponto aproximado"
              : "Usar este local"}
          </button>
        </div>
      )}
      {searched && !busy && !error && !results.length && !selected && (
        <p className="address-status" role="status">
          Nenhum endereço encontrado
          {scope === "region" ? " em São Paulo e arredores" : ""}. Tente rua,
          número, bairro ou CEP
          {scope === "region" ? ", ou inclua outras cidades" : ""}.
        </p>
      )}
    </div>
  );
}
