import { useEffect, useId, useRef, useState } from "react";
import { Check, Globe2, MapPin, Search, X } from "lucide-react";
import { searchAddresses, type AddressScope } from "./geocoder";
import { canSearchAddressLots, searchAddressLots } from "./address-lots";
import type { Place } from "./types";
import PointPicker from "./PointPicker";
type Props = {
  label: string;
  value: string;
  selected: Place | null;
  onChange: (text: string) => void;
  onSelect: (place: Place) => void;
  endpoint?: string;
  id?: "origin" | "destination";
  active?: boolean;
  addressApiBase?: string;
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
  addressApiBase = "",
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
    [numberNote, setNumberNote] = useState(""),
    [searched, setSearched] = useState(false),
    [open, setOpen] = useState(false),
    [highlighted, setHighlighted] = useState(-1),
    [composing, setComposing] = useState(false);
  const [scope, setScope] = useState<AddressScope>("region");
  const [pointOpen, setPointOpen] = useState(false);
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
    setNumberNote("");
    setSearched(false);
    setOpen(false);
    setHighlighted(-1);
    setPointOpen(false);
  }
  useEffect(() => {
    invalidate();
    if (active && !selected && !composing && value.trim().length >= 3)
      schedule();
    return cancel;
  }, [value, selected, active, composing, scope, endpoint, addressApiBase]);
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
    setNumberNote("");
    setResults([]);
    setPending(null);
    setSearched(true);
    setOpen(false);
    setHighlighted(-1);
    const key = `${endpoint ?? "default"}:${addressApiBase}:${explicit ? "precise" : "suggest"}:${scope}:${value.trim().toLocaleLowerCase("pt-BR")}`;
    try {
      const saved = cache.current.get(key);
      const municipal =
        explicit &&
        addressApiBase &&
        scope === "region" &&
        canSearchAddressLots(value);
      const lookup = async () => {
        const [photon, lots] = await Promise.allSettled([
          searchAddresses(value, c.signal, endpoint, scope),
          municipal
            ? searchAddressLots(value, c.signal, addressApiBase)
            : Promise.resolve([]),
        ]);
        const addresses = photon.status === "fulfilled" ? photon.value : [];
        const numbers = lots.status === "fulfilled" ? lots.value : [];
        if (photon.status === "rejected" && !numbers.length)
          throw photon.reason;
        if (
          municipal &&
          activeRef.current &&
          current === generation.current &&
          !c.signal.aborted
        )
          setNumberNote(
            lots.status === "rejected"
              ? "O cadastro municipal não respondeu. Escolha uma referência e marque a entrada no mapa."
              : numbers.length
                ? "Número encontrado no cadastro municipal. Confira a entrada no mapa ao escolher o endereço."
                : "Este número não foi localizado no cadastro municipal. Escolha a rua e marque a entrada no mapa.",
          );
        return [...numbers, ...addresses];
      };
      const found =
        saved && Date.now() - saved.at < 300000 ? saved.places : await lookup();
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
    const chosen = { ...place, requestedAddress: value.trim() };
    if (
      place.source === "photon" &&
      place.approximate &&
      !place.outsideCoverage &&
      addressApiBase &&
      scope === "region" &&
      canSearchAddressLots(value)
    ) {
      const current = generation.current,
        c = new AbortController();
      controller.current = c;
      setBusy(true);
      setPending(chosen);
      void searchAddressLots(value, c.signal, addressApiBase)
        .then((lots) => {
          if (
            !activeRef.current ||
            current !== generation.current ||
            c.signal.aborted
          )
            return;
          if (lots.length) {
            setResults(lots);
            setOpen(true);
            setNumberNote(
              "O cadastro do número está disponível abaixo. Escolha essa referência para conferir o lote, ou marque a entrada da rua já escolhida no mapa.",
            );
            return;
          }
          setPending(
            lots[0] ? { ...lots[0], requestedAddress: value.trim() } : chosen,
          );
          setNumberNote(
            lots.length
              ? "Número encontrado no GeoSampa; confirme a entrada no mapa."
              : "Número não localizado no cadastro municipal; marque a entrada no mapa.",
          );
          setPointOpen(true);
        })
        .catch(() => {
          if (
            activeRef.current &&
            current === generation.current &&
            !c.signal.aborted
          ) {
            setNumberNote(
              "Cadastro municipal indisponível. Marque a entrada no mapa.",
            );
            setPointOpen(true);
          }
        })
        .finally(() => {
          if (current === generation.current) setBusy(false);
        });
      return;
    }
    if (place.approximate || place.outsideCoverage) {
      setPending(chosen);
      if (place.approximate) setPointOpen(true);
    } else onSelect(chosen);
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
          {selected.source === "map"
            ? "Entrada marcada por você · confira o acesso"
            : selected.source === "device"
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
      {selected && selected.label !== value.trim() && (
        <p className="address-status">Local escolhido: {selected.label}</p>
      )}
      {selected?.source === "map" && selected.referenceLabel && (
        <p className="address-status">
          Referência pesquisada: {selected.referenceLabel}
        </p>
      )}
      <button
        type="button"
        className="address-map-button"
        aria-label={"Marcar " + purpose + " no mapa"}
        onClick={() => {
          cancel();
          setBusy(false);
          setOpen(false);
          setPointOpen(true);
        }}
      >
        <MapPin size={15} />{" "}
        {selected
          ? "Ajustar entrada no mapa"
          : "Marcar entrada no mapa ou informar coordenadas"}
      </button>
      {pointOpen && active && (
        <PointPicker
          boundary={(pending ?? selected ?? results[0])?.boundary}
          lotPolygons={(pending ?? selected ?? results[0])?.lotPolygons}
          referenceLabel={(pending ?? selected ?? results[0])?.label}
          initial={
            pending ??
            selected ??
            results[0] ?? { lat: -23.5505, lon: -46.6333 }
          }
          address={
            selected?.requestedAddress || value.trim() || `Ponto de ${purpose}`
          }
          onCancel={() => setPointOpen(false)}
          onConfirm={(point) => {
            cancel();
            setPointOpen(false);
            const address =
              selected?.requestedAddress ||
              value.trim() ||
              `Ponto de ${purpose}`;
            const reference = pending ?? selected ?? results[0];
            onSelect({
              ...(reference ?? {}),
              ...point,
              id: `map:${point.lat}:${point.lon}`,
              label: address,
              requestedAddress: address,
              ...(reference
                ? {
                    referenceLabel: reference.referenceLabel ?? reference.label,
                  }
                : {}),
              source: "map",
              approximate: true,
            });
          }}
        />
      )}
      {busy && (
        <p className="address-status" role="status">
          Consultando endereços…
        </p>
      )}
      {numberNote && (
        <p className="address-status" role="status">
          {numberNote}
        </p>
      )}
      {!selected && addressApiBase && (
        <p className="address-privacy">
          Para conferir rua e número em São Paulo, clique em Localizar endereço
          ou escolha uma sugestão aproximada. Essa consulta passa pela nossa API
          e pelo{" "}
          <a
            href="https://geosampa.prefeitura.sp.gov.br/"
            target="_blank"
            rel="noreferrer"
          >
            GeoSampa
          </a>
          . O lote cadastrado é uma referência; a entrada é escolhida no mapa.
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
                  {place.source === "geosampa" ? (
                    <small>
                      Número cadastrado · confirme a entrada no mapa
                    </small>
                  ) : (
                    place.approximate && (
                      <small>Ponto aproximado · confira o endereço</small>
                    )
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
            {pending.requestedAddress && (
              <span>
                Você digitou: <strong>{pending.requestedAddress}</strong>.{" "}
              </span>
            )}
            {pending.source === "geosampa"
              ? "O número foi encontrado no cadastro municipal. Confira a entrada do imóvel no mapa: "
              : pending.approximate
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
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (pending.approximate) {
                cancel();
                setBusy(false);
                setOpen(false);
                setPointOpen(true);
              } else onSelect(pending);
            }}
          >
            {pending.approximate
              ? "Confirmar entrada no mapa"
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
