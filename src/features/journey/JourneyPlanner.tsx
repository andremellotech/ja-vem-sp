import { useEffect, useRef, useState } from "react";
import {
  ArrowDownUp,
  ArrowRight,
  Info,
  LocateFixed,
  Route,
  Footprints,
} from "lucide-react";
import type { Stop } from "../../contracts";
import AddressField from "./AddressField";
import JourneyOptions from "./JourneyOptions";
import GoogleDirections from "./GoogleDirections";
import GoogleEmbedPlanner from "../google-embed/GoogleEmbedPlanner";
import type { GoogleEmbedSelection } from "../google-embed/types";
import { createPlannerClient } from "./client";
import { serviceDateInSaoPaulo } from "./calendar";
import { distanceM } from "../stops/network";
import { loadLegPath } from "./paths";
import { routeWalking } from "../walking/client";
import WalkingPlanner, { type LabeledWalk } from "../walking/WalkingPlanner";
import type {
  JourneyMapSelection,
  JourneyOption,
  Place,
  PlannerResult,
  Point,
  MapPath,
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
  const [transport, setTransport] = useState<"all" | "bus" | "rail">("all");
  const [maxTransfers, setMaxTransfers] = useState<0 | 1 | 2 | 3>(3);
  const [preferencesChanged, setPreferencesChanged] = useState(false);
  const [pathsBusy, setPathsBusy] = useState(false),
    [walks, setWalks] = useState<LabeledWalk[]>([]),
    [pathMessages, setPathMessages] = useState<string[]>([]);
  const pathsController = useRef<AbortController | null>(null),
    pathsGeneration = useRef(0);
  const selectedMap = useRef<{
    id: string;
    selection: JourneyMapSelection;
  } | null>(null);
  function cancelPaths() {
    pathsGeneration.current++;
    pathsController.current?.abort();
    setPathsBusy(false);
    setWalks([]);
    setPathMessages([]);
    selectedMap.current = null;
  }
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
    setPreferencesChanged(false);
    cancelPaths();
    generation.current++;
    controller.current?.abort();
    setBusy(false);
    setError("");
    setResult(null);
    setSelectedId(null);
    onMapSelection(null);
    onGoogleSelection?.(null);
  }
  function invalidatePending() {
    onGoogleSelection?.(null);
    generation.current++;
    controller.current?.abort();
    pathsGeneration.current++;
    pathsController.current?.abort();
    setBusy(false);
    setPathsBusy(false);
    setError("");
    setPreferencesChanged(true);
  }
  function cancelGps() {
    gpsGeneration.current++;
    setLocating(false);
    setLocationError("");
  }
  function choose(option: JourneyOption) {
    if (!origin || !destination) return;
    if (selectedMap.current?.id === option.id) {
      onMapSelection(selectedMap.current.selection);
      return selectedMap.current.selection;
    }
    cancelPaths();
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
      busLegs: option.legs
        .filter((l) => (l.mode ?? "bus") === "bus")
        .map(({ routeId, tripId, lineCode, headsign }) => ({
          routeId,
          tripId,
          lineCode,
          headsign,
        })),
      railStopIds: [
        ...new Set(
          option.legs
            .filter((l) => (l.mode ?? "bus") !== "bus")
            .flatMap((l) => l.routeStops.map((s) => s.id)),
        ),
      ],
      paths: [],
    };
    selectedMap.current = { id: option.id, selection };
    onMapSelection(selection);
    const segments = [
      { from: origin, to: option.legs[0].from, label: "Até o embarque" },
      ...option.legs.slice(1).map((l, i) => ({
        from: option.legs[i].to,
        to: l.from,
        label: `Caminhada na troca ${i + 1}`,
      })),
      {
        from: option.legs[option.legs.length - 1].to,
        to: destination,
        label: "Até o destino",
      },
    ].filter(
      (s) => distanceM(s.from.lat, s.from.lon, s.to.lat, s.to.lon) >= 10,
    );
    void drawPaths(selection, option, segments);
    return selection;
  }
  async function drawPaths(
    selection: JourneyMapSelection,
    option: JourneyOption | null,
    segments: { from: Point; to: Point; label: string }[],
  ) {
    const current = pathsGeneration.current,
      c = new AbortController();
    pathsController.current = c;
    const paths: MapPath[] = [],
      messages: string[] = [],
      walking: LabeledWalk[] = [];
    const valid = () =>
      current === pathsGeneration.current && !c.signal.aborted;
    const publish = () => {
      if (!valid()) return;
      const next = { ...selection, paths: [...paths] };
      if (option) selectedMap.current = { id: option.id, selection: next };
      onMapSelection(next);
      setWalks([...walking]);
      setPathMessages([...messages]);
    };
    setPathsBusy(true);
    try {
      if (option) {
        const lines = await Promise.all(
          option.legs.map((l) => loadLegPath(l, c.signal)),
        );
        if (!valid()) return;
        lines.forEach((path, i) => {
          if (path) paths.push(path);
          else
            messages.push(
              `O desenho do trecho ${option.legs[i].lineCode} está incompleto na base. As paradas cadastradas continuam no mapa.`,
            );
        });
        publish();
      }
      for (const segment of segments) {
        if (!valid()) return;
        try {
          const route = await routeWalking(segment.from, segment.to, c.signal);
          if (!valid()) return;
          paths.push({
            kind: "walk",
            label: segment.label,
            points: route.points,
          });
          walking.push({ label: segment.label, route });
        } catch (e) {
          if (!valid()) return;
          messages.push(
            `${segment.label}: ${e instanceof Error ? e.message : "Caminhada indisponível."}`,
          );
        }
        publish();
      }
    } catch (e) {
      if (valid()) {
        messages.push(
          e instanceof Error
            ? e.message
            : "Não foi possível carregar o caminho.",
        );
        publish();
      }
    } finally {
      if (valid()) setPathsBusy(false);
    }
  }
  function walkBetween(from: Point, to: Point, label: string) {
    if (!active) return;
    generation.current++;
    controller.current?.abort();
    setBusy(false);
    setError("");
    cancelPaths();
    setSelectedId(null);
    onGoogleSelection?.(null);
    const selection: JourneyMapSelection = {
      origin: from,
      destination: to,
      stops: [],
      paths: [],
    };
    onMapSelection(selection);
    onShowMap?.();
    void drawPaths(selection, null, [{ from, to, label }]);
  }
  useEffect(() => {
    if (!active) {
      cancelPaths();
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
      pathsGeneration.current++;
      pathsController.current?.abort();
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
          new URL("data/multimodal.json", base).href,
        );
      }
      const found = await client.current.plan(
        {
          origin: { lat: origin.lat, lon: origin.lon },
          destination: { lat: destination.lat, lon: destination.lon },
          serviceDate: serviceDateInSaoPaulo(new Date()),
          radiusM,
          criterion,
          transport,
          maxTransfers,
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
            setOriginText(place.requestedAddress ?? place.label);
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
            setDestinationText(place.requestedAddress ?? place.label);
          }}
        />
        <label className="journey-priority" htmlFor="journey-priority">
          Priorizar
          <select
            id="journey-priority"
            value={criterion}
            onChange={(e) => {
              invalidatePending();
              setCriterion(e.target.value as "transfers" | "walking");
            }}
          >
            <option value="transfers">Menos trocas</option>
            <option value="walking">Menos caminhada</option>
          </select>
        </label>
        <label className="journey-priority" htmlFor="journey-transport">
          Transporte
          <select
            id="journey-transport"
            value={transport}
            onChange={(e) => {
              invalidatePending();
              setTransport(e.target.value as "all" | "bus" | "rail");
            }}
          >
            <option value="all">Ônibus, metrô e trem</option>
            <option value="bus">Somente ônibus</option>
            <option value="rail">Somente metrô e trem</option>
          </select>
        </label>
        {preferencesChanged && result && (
          <p className="journey-search-note" role="status">
            As opções e o mapa são da última busca. Clique em Ver opções de
            transporte para aplicar os novos filtros.
          </p>
        )}
        <label className="journey-priority" htmlFor="journey-transfers">
          Baldeações
          <select
            id="journey-transfers"
            value={maxTransfers}
            onChange={(e) => {
              invalidatePending();
              setMaxTransfers(Number(e.target.value) as 0 | 1 | 2 | 3);
            }}
          >
            <option value="0">Somente trajetos diretos</option>
            <option value="1">Até 1 baldeação</option>
            <option value="2">Até 2 baldeações</option>
            <option value="3">Até 3 baldeações</option>
          </select>
        </label>
        <button
          type="button"
          className="journey-submit"
          disabled={!origin || !destination || busy || locating}
          onClick={() => void calculate()}
        >
          <Route size={18} />
          {busy ? "Buscando opções…" : "Ver opções de transporte"}
          <ArrowRight size={18} />
        </button>
        <button
          type="button"
          className="journey-walk-submit"
          disabled={!origin || !destination || locating}
          onClick={() =>
            origin &&
            destination &&
            walkBetween(origin, destination, "Caminhada até o destino")
          }
        >
          <Footprints size={18} /> Ver caminhada no mapa
        </button>
        <p className="address-privacy">
          Ao calcular, os pontos dos trechos a pé são enviados ao serviço
          gratuito FOSSGIS/OpenStreetMap, que pode registrar coordenadas e IP.
          Não consultamos caminhadas durante a digitação.{" "}
          <a
            href="https://routing.openstreetmap.de/about.html"
            target="_blank"
            rel="noreferrer"
          >
            Sobre o serviço
          </a>
          .
        </p>
        <p className="journey-search-note">
          São Paulo ·{" "}
          {maxTransfers === 0
            ? "somente diretos"
            : `até ${maxTransfers} ${maxTransfers === 1 ? "baldeação" : "baldeações"}`}{" "}
          · paradas e estações em até 800 m.{" "}
          {criterion === "walking"
            ? "Menor caminhada, depois menos trocas e menos paradas."
            : "Menos trocas, depois menor caminhada e menos paradas."}{" "}
          Não estimamos o menor tempo de viagem. Conexões a pé entre estações e
          paradas não garantem integração tarifária. Consulte a operação atual
          do metrô e dos trens.
        </p>
        {active &&
          origin &&
          destination &&
          googleEmbedKey.trim() &&
          onGoogleSelection && (
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
      </div>
      <WalkingPlanner busy={pathsBusy} walks={walks} messages={pathMessages} />
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
              Não encontramos um trajeto com o limite de baldeações escolhido e
              paradas em até {result.radiusM === 800 ? "800" : "1.200"} m de
              cada endereço. Isso não significa ausência de transporte.
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
          originLabel={origin?.requestedAddress ?? origin?.label}
          destinationLabel={destination?.requestedAddress ?? destination?.label}
          selectedId={selectedId}
          onSelect={(option) => {
            choose(option);
            onShowMap?.();
          }}
          onShowArrivals={(stop, option) => {
            const selection = choose(option);
            if (selection) onShowArrivals(stop, selection);
          }}
          onWalk={walkBetween}
        />
      )}
      <GoogleDirections origin={origin} destination={destination} />
    </section>
  );
}
