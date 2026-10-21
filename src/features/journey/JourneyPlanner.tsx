import { useEffect, useRef, useState } from "react";
import {
  ArrowDownUp,
  ArrowRight,
  Info,
  LocateFixed,
  Route,
} from "lucide-react";
import type { Stop } from "../../contracts";
import AddressField from "./AddressField";
import JourneyOptions from "./JourneyOptions";
import GoogleDirections from "./GoogleDirections";
import GoogleEmbedPlanner from "../google-embed/GoogleEmbedPlanner";
import type { GoogleEmbedSelection } from "../google-embed/types";
import { createPlannerClient } from "./client";
import { serviceDateInSaoPaulo } from "./calendar";
import type {
  JourneyMapSelection,
  JourneyOption,
  Place,
  PlannerResult,
  Point,
} from "./types";
type Props = {
  onMapSelection: (selection: JourneyMapSelection | null) => void;
  onShowArrivals: (stop: Stop, selection: JourneyMapSelection) => void;
  onLocate: () => Promise<Point | null>;
  onShowMap?: () => void;
  active?: boolean;
  deviceLocation?: Point | null;
  googleEmbedKey?: string;
  onGoogleSelection?: (selection: GoogleEmbedSelection | null) => void;
  onSearchBus?: (code: string) => void;
};
export default function JourneyPlanner({
  onMapSelection,
  onShowArrivals,
  onLocate,
  onShowMap,
  active = true,
  deviceLocation,
  googleEmbedKey = "",
  onGoogleSelection,
  onSearchBus,
}: Props) {
  const [originText, setOriginText] = useState(""),
    [destinationText, setDestinationText] = useState("");
  const [origin, setOrigin] = useState<Place | null>(null),
    [destination, setDestination] = useState<Place | null>(null);
  const [busy, setBusy] = useState(false),
    [locating, setLocating] = useState(false),
    [locationError, setLocationError] = useState(""),
    [error, setError] = useState("");
  const [result, setResult] = useState<PlannerResult | null>(null),
    [selectedId, setSelectedId] = useState<string | null>(null);
  const [criterion, setCriterion] = useState<"transfers" | "walking">(
    "transfers",
  );
  useEffect(() => {
    if (!active || !deviceLocation || origin || originText.trim()) return;
    setOrigin({
      ...deviceLocation,
      id: "device",
      label: "Minha localização",
      source: "device",
      approximate: false,
    });
    setOriginText("Minha localização");
  }, [deviceLocation?.lat, deviceLocation?.lon, active]);
  const client = useRef<ReturnType<typeof createPlannerClient> | null>(null),
    controller = useRef<AbortController | null>(null),
    generation = useRef(0),
    gpsGeneration = useRef(0);
  function resetPlan() {
    generation.current++;
    controller.current?.abort();
    setBusy(false);
    setError("");
    setResult(null);
    setSelectedId(null);
    onMapSelection(null);
    onGoogleSelection?.(null);
  }
  function cancelGps() {
    gpsGeneration.current++;
    setLocating(false);
    setLocationError("");
  }
  function choose(option: JourneyOption) {
    if (!origin || !destination) return;
    onGoogleSelection?.(null);
    setSelectedId(option.id);
    const stops = [
      ...new Map(
        option.legs.flatMap((l) => l.routeStops).map((s) => [s.id, s]),
      ).values(),
    ];
    const selection: JourneyMapSelection = {
      origin: { lat: origin.lat, lon: origin.lon },
      destination: { lat: destination.lat, lon: destination.lon },
      stops,
    };
    onMapSelection(selection);
    return selection;
  }
  useEffect(() => {
    if (!active) {
      onGoogleSelection?.(null);
      generation.current++;
      gpsGeneration.current++;
      controller.current?.abort();
      client.current?.dispose();
      client.current = null;
      setBusy(false);
      setLocating(false);
      setSelectedId(null);
    }
  }, [active]);
  useEffect(
    () => () => {
      generation.current++;
      gpsGeneration.current++;
      controller.current?.abort();
      client.current?.dispose();
      client.current = null;
    },
    [],
  );
  async function locate() {
    resetPlan();
    const current = ++gpsGeneration.current;
    setLocating(true);
    setLocationError("");
    try {
      const point = await onLocate();
      if (current !== gpsGeneration.current) return;
      if (point) {
        setOrigin({
          ...point,
          id: "device",
          label: "Minha localização",
          source: "device",
          approximate: false,
        });
        setOriginText("Minha localização");
      } else
        setLocationError(
          "Digite o endereço de origem para continuar. Não foi possível usar sua localização.",
        );
    } catch {
      if (current === gpsGeneration.current)
        setLocationError(
          "Digite o endereço de origem para continuar. Não foi possível usar sua localização.",
        );
    } finally {
      if (current === gpsGeneration.current) setLocating(false);
    }
  }
  async function calculate(radiusM: 800 | 1200 = 800) {
    if (!origin || !destination || !active) return;
    resetPlan();
    const current = generation.current,
      c = new AbortController();
    controller.current = c;
    setBusy(true);
    try {
      if (!client.current) {
        const base = new URL(import.meta.env.BASE_URL, location.href);
        client.current = createPlannerClient(
          new URL("data/stops.json", base).href,
          new URL("data/planner.json", base).href,
        );
      }
      const found = await client.current.plan(
        {
          origin: { lat: origin.lat, lon: origin.lon },
          destination: { lat: destination.lat, lon: destination.lon },
          serviceDate: serviceDateInSaoPaulo(new Date()),
          radiusM,
          criterion,
        },
        c.signal,
      );
      if (current !== generation.current || c.signal.aborted) return;
      setResult(found);
      if (found.options[0]) choose(found.options[0]);
    } catch (e) {
      if (current === generation.current && !c.signal.aborted) {
        setError(
          e instanceof Error
            ? e.message
            : "Não foi possível calcular. Tente novamente.",
        );
        client.current?.dispose();
        client.current = null;
      }
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  return (
    <section className="journey-planner" aria-label="Planejar trajeto">
      <div className="journey-form">
        <p className="address-privacy">
          Ao digitar pelo menos três caracteres ou clicar em localizar, a busca
          é enviada ao{" "}
          <a
            href="https://github.com/komoot/photon"
            target="_blank"
            rel="noreferrer"
          >
            Photon/OpenStreetMap
          </a>
          . Os endereços não são salvos pelo site.
        </p>
        <AddressField
          active={active}
          id="origin"
          label="De onde você vai sair?"
          value={originText}
          selected={origin}
          onChange={(text) => {
            cancelGps();
            resetPlan();
            setOriginText(text);
            setOrigin(null);
          }}
          onSelect={(place) => {
            cancelGps();
            resetPlan();
            setOrigin(place);
            setOriginText(place.label);
          }}
        />
        <div className="journey-between">
          <button
            type="button"
            className="journey-locate"
            aria-label="Usar minha localização como origem"
            disabled={locating}
            onClick={() => void locate()}
          >
            <LocateFixed size={16} />
            {locating ? "Localizando…" : "Usar minha localização"}
          </button>
          <button
            type="button"
            className="journey-invert"
            aria-label="Inverter origem e destino"
            onClick={() => {
              cancelGps();
              resetPlan();
              setOrigin(destination);
              setDestination(origin);
              setOriginText(destinationText);
              setDestinationText(originText);
            }}
          >
            <ArrowDownUp size={18} />
          </button>
        </div>
        {locationError && (
          <p className="address-error" role="alert">
            {locationError}
          </p>
        )}
        <AddressField
          active={active}
          id="destination"
          label="Para onde você vai?"
          value={destinationText}
          selected={destination}
          onChange={(text) => {
            resetPlan();
            setDestinationText(text);
            setDestination(null);
          }}
          onSelect={(place) => {
            resetPlan();
            setDestination(place);
            setDestinationText(place.label);
          }}
        />
        <label className="journey-priority" htmlFor="journey-priority">
          Priorizar
          <select
            id="journey-priority"
            value={criterion}
            onChange={(e) => {
              resetPlan();
              setCriterion(e.target.value as "transfers" | "walking");
            }}
          >
            <option value="transfers">Menos trocas</option>
            <option value="walking">Menos caminhada</option>
          </select>
        </label>
        <button
          type="button"
          className="journey-submit"
          disabled={!origin || !destination || busy || locating}
          onClick={() => void calculate()}
        >
          <Route size={18} />
          {busy ? "Buscando opções…" : "Ver opções de ônibus"}
          <ArrowRight size={18} />
        </button>
        <p className="journey-search-note">
          Ônibus de São Paulo · diretos e até uma troca · paradas em até 800 m.{" "}
          {criterion === "walking"
            ? "Menor caminhada, depois menos trocas e menos paradas."
            : "Menos trocas, depois menor caminhada e menos paradas."}{" "}
          Não estimamos o menor tempo de viagem.
        </p>
        {active && origin && destination && onGoogleSelection && (
          <GoogleEmbedPlanner
            origin={origin}
            destination={destination}
            apiKey={googleEmbedKey}
            onSelection={onGoogleSelection}
            onBegin={() => {
              cancelGps();
              resetPlan();
            }}
            onShowMap={onShowMap}
            onSearchBus={onSearchBus}
          />
        )}
        <GoogleDirections origin={origin} destination={destination} />
      </div>
      <div className="journey-result-state" aria-live="polite">
        {busy && (
          <p className="journey-loading">
            <span className="spinner" />
            Comparando linhas e paradas próximas…
          </p>
        )}
        {error && (
          <div className="message error">
            <Info size={18} />
            <div>
              <strong>Não foi possível buscar os trajetos</strong>
              <p>{error}</p>
              <button type="button" onClick={() => void calculate()}>
                Tentar novamente
              </button>
            </div>
          </div>
        )}
        {result && !result.options.length && (
          <div className="journey-empty">
            <Info size={22} />
            <h3>Nenhuma opção neste alcance</h3>
            <p>
              Não encontramos um trajeto com até uma troca e paradas em até{" "}
              {result.radiusM === 800 ? "800" : "1.200"} m de cada endereço.
              Isso não significa ausência de transporte.
            </p>
            {result.radiusM === 800 && (
              <button type="button" onClick={() => void calculate(1200)}>
                Ampliar busca para 1.200 m
              </button>
            )}
          </div>
        )}
      </div>
      {!!result?.options.length && (
        <JourneyOptions
          options={result.options}
          origin={origin}
          destination={destination}
          selectedId={selectedId}
          onSelect={(option) => {
            choose(option);
            onShowMap?.();
          }}
          onShowArrivals={(stop, option) => {
            const selection = choose(option);
            if (selection) onShowArrivals(stop, selection);
          }}
        />
      )}
    </section>
  );
}
