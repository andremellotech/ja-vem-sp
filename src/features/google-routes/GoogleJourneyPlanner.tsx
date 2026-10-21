import { useEffect, useRef, useState } from "react";
import { BusFront, Footprints, MapPin, TrainFront } from "lucide-react";
import type {
  GoogleRoute,
  GoogleRoutePoint,
  GoogleRoutesRequest,
} from "../../google-routes-contracts";
import { WalkingDirections } from "../journey/GoogleDirections";
import { fetchGoogleRoutes, validGooglePoint } from "./client";

type Props = {
  origin: GoogleRoutePoint | null;
  destination: GoogleRoutePoint | null;
  apiBase: string;
  active: boolean;
  resetKey: number;
  configured?: boolean;
  onMapSelection: (route: GoogleRoute | null) => void;
  onBegin: () => void;
  onTrackBus: (code: string) => void;
  onShowMap?: () => void;
};
const distance = (m: number) =>
  m < 1000
    ? `${Math.round(m)} m`
    : `${(m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
const duration = (s: number) => `${Math.ceil(s / 60)} min`;
function schedule(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
export default function GoogleJourneyPlanner({
  origin,
  destination,
  apiBase,
  active,
  resetKey,
  configured,
  onMapSelection,
  onBegin,
  onTrackBus,
  onShowMap,
}: Props) {
  const [mode, setMode] = useState<GoogleRoutesRequest["mode"]>("transit"),
    [preference, setPreference] =
      useState<GoogleRoutesRequest["preference"]>("any"),
    [routes, setRoutes] = useState<GoogleRoute[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const generation = useRef(0),
    controller = useRef<AbortController | null>(null),
    selectionCallback = useRef(onMapSelection);
  selectionCallback.current = onMapSelection;
  function clear() {
    generation.current++;
    controller.current?.abort();
    setRoutes([]);
    setSelected(null);
    setMessage("");
    setBusy(false);
    selectionCallback.current(null);
  }
  useEffect(() => {
    clear();
    return () => {
      generation.current++;
      controller.current?.abort();
    };
  }, [
    origin?.lat,
    origin?.lon,
    destination?.lat,
    destination?.lon,
    active,
    resetKey,
    apiBase,
    configured,
  ]);
  function choose(route: GoogleRoute, show = false) {
    setSelected(route.id);
    onMapSelection(route);
    if (show) onShowMap?.();
  }
  async function calculate() {
    if (
      !active ||
      !validGooglePoint(origin) ||
      !validGooglePoint(destination) ||
      configured === false ||
      !apiBase
    )
      return;
    clear();
    onBegin();
    const current = generation.current,
      c = new AbortController();
    controller.current = c;
    setBusy(true);
    try {
      const response = await fetchGoogleRoutes(
        apiBase,
        {
          origin,
          destination,
          mode,
          preference: mode === "walking" ? "any" : preference,
        },
        c.signal,
      );
      if (current !== generation.current || c.signal.aborted) return;
      const found = response.routes.slice(0, 4);
      setRoutes(found);
      if (found[0]) choose(found[0]);
      else
        setMessage(
          "Nenhum trajeto encontrado pelo Google. Tente outro modo ou use os links externos abaixo.",
        );
    } catch (e) {
      if (current === generation.current && !c.signal.aborted)
        setMessage(
          e instanceof Error
            ? e.message
            : "Não foi possível consultar os trajetos Google. Tente novamente.",
        );
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  return (
    <section className="google-journey" aria-label="Trajetos Google Maps">
      <span className="eyebrow">OUTRAS FORMAS DE CHEGAR</span>
      <h3>Seu caminho com Google Maps</h3>
      <p>A pé, de metrô, trem ou ônibus, conforme disponibilidade.</p>
      <div className="google-criteria">
        <label>
          Modo Google
          <select
            value={mode}
            onChange={(e) => {
              clear();
              setMode(e.target.value as typeof mode);
            }}
          >
            <option value="transit">Transporte público</option>
            <option value="walking">Caminhada</option>
          </select>
        </label>
        {mode === "transit" && (
          <label>
            Preferência Google
            <select
              value={preference}
              onChange={(e) => {
                clear();
                setPreference(e.target.value as typeof preference);
              }}
            >
              <option value="any">Todos os transportes</option>
              <option value="rail">Metrô e trem</option>
              <option value="bus">Ônibus</option>
            </select>
          </label>
        )}
      </div>
      <p className="google-privacy">
        Ao clicar em calcular, os pontos confirmados (inclusive GPS, se usado)
        são enviados ao Google pelo servidor do site. O mapa Google é carregado
        após o cálculo. A preferência não garante transporte exclusivo.
      </p>
      {(!apiBase || configured === false) && (
        <p role="status">
          Google Maps ainda não está configurado. Use os links externos abaixo.
        </p>
      )}
      <button
        type="button"
        className="google-calculate"
        disabled={
          !active ||
          !validGooglePoint(origin) ||
          !validGooglePoint(destination) ||
          busy ||
          !apiBase ||
          configured === false
        }
        onClick={() => void calculate()}
      >
        {busy ? "Consultando Google…" : "Calcular com Google Maps"}
      </button>
      {busy && (
        <button type="button" className="google-cancel" onClick={clear}>
          Cancelar consulta Google
        </button>
      )}
      <div aria-live="polite">
        {message && (
          <p className="google-message" role="status">
            {message}
          </p>
        )}
      </div>
      {!!routes.length && (
        <div className="google-results">
          <p className="google-attribution">
            <span className="google-brand-attribution" translate="no">
              Google Maps
            </span>{" "}
            · estimativas de viagem. Posições e chegadas ao vivo: SPTrans.
          </p>
          {routes.map((route, i) => (
            <article
              key={route.id}
              className={
                "google-route " +
                (selected === route.id ? "google-route-selected" : "")
              }
              aria-label={`Alternativa Google ${i + 1}`}
            >
              <h4>{route.description || `Alternativa ${i + 1}`}</h4>
              <p className="google-route-metrics">
                {duration(route.durationS)} · {distance(route.distanceM)}
              </p>
              <button
                type="button"
                className="google-route-select"
                aria-label={`Ver alternativa Google ${i + 1} no mapa`}
                aria-pressed={selected === route.id}
                onClick={() => choose(route, true)}
              >
                <MapPin size={15} /> Ver no mapa
              </button>
              {selected === route.id && (
                <>
                  <ol className="google-steps">
                    {route.steps.map((step, n) => {
                      const t = step.transit;
                      return (
                        <li key={n}>
                          <div className="google-step-title">
                            {step.mode === "WALK" ? (
                              <Footprints size={17} />
                            ) : t?.vehicleType === "BUS" ? (
                              <BusFront size={17} />
                            ) : (
                              <TrainFront size={17} />
                            )}
                            <strong>
                              {step.mode === "WALK"
                                ? "Caminhada"
                                : t?.shortName ||
                                  t?.lineName ||
                                  "Transporte público"}
                              {t?.headsign ? ` · ${t.headsign}` : ""}
                            </strong>
                          </div>
                          {step.instruction && <p>{step.instruction}</p>}
                          {(step.distanceM !== null ||
                            step.durationS !== null) && (
                            <small>
                              {step.distanceM !== null
                                ? distance(step.distanceM)
                                : ""}
                              {step.distanceM !== null &&
                              step.durationS !== null
                                ? " · "
                                : ""}
                              {step.durationS !== null
                                ? duration(step.durationS)
                                : ""}
                            </small>
                          )}
                          {t && (
                            <>
                              <p>
                                Embarque: {t.departureStop || "não informado"}
                                {schedule(t.departureTime) && (
                                  <>
                                    <br />
                                    <time dateTime={t.departureTime!}>
                                      {schedule(t.departureTime)}
                                    </time>
                                  </>
                                )}
                              </p>
                              <p>
                                Desembarque: {t.arrivalStop || "não informado"}
                                {schedule(t.arrivalTime) && (
                                  <>
                                    <br />
                                    <time dateTime={t.arrivalTime!}>
                                      {schedule(t.arrivalTime)}
                                    </time>
                                  </>
                                )}
                              </p>
                              {t.stopCount !== null && (
                                <small>{t.stopCount} paradas</small>
                              )}
                              {t.agencies.map((a, j) => (
                                <small className="google-agency" key={j}>
                                  {a.name}
                                </small>
                              ))}
                            </>
                          )}
                          {step.mode === "WALK" && step.from && step.to && (
                            <WalkingDirections
                              from={step.from}
                              to={step.to}
                              label={`Abrir caminhada ${n + 1}`}
                            />
                          )}
                          {t?.vehicleType === "BUS" && t.shortName.trim() && (
                            <button
                              type="button"
                              className="google-track-bus"
                              onClick={() => onTrackBus(t.shortName.trim())}
                            >
                              Acompanhar ônibus {t.shortName}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                  {route.warnings.map((warning, n) => (
                    <p className="google-warning" key={n}>
                      {warning}
                    </p>
                  ))}
                </>
              )}
            </article>
          ))}
          <p className="google-privacy">
            Horários em São Paulo, com a data do serviço. Para acompanhar um
            ônibus, escolha o sentido na busca SPTrans. Links de caminhada abrem
            outra aba e enviam os pontos ao Google.
          </p>
        </div>
      )}
    </section>
  );
}
