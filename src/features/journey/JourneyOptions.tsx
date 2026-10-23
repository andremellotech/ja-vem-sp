import { useState } from "react";
import type { JourneyEstimate } from "./timing";
import {
  ArrowRight,
  BusFront,
  MapPin,
  Radio,
  TrainFront,
  Footprints,
} from "lucide-react";
import type { Stop } from "../../contracts";
import type { JourneyOption, Point } from "./types";
const distance = (m: number) =>
  m < 50
    ? "< 50 m"
    : m < 1000
      ? `${Math.round(m / 10) * 10} m`
      : `${(m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
type Props = {
  estimates?: Record<string, JourneyEstimate>;
  calculatedAt?: Date | null;
  timingMessage?: string;
  options: JourneyOption[];
  selectedId: string | null;
  origin?: Point | null;
  destination?: Point | null;
  originLabel?: string;
  destinationLabel?: string;
  onSelect: (option: JourneyOption) => void;
  onShowArrivals: (stop: Stop, option: JourneyOption) => void;
  onWalk?: (from: Point, to: Point, label: string) => void;
  onFocusStep?: (option: JourneyOption, id: string) => void;
};
export default function JourneyOptions({
  estimates,
  calculatedAt,
  timingMessage,
  options,
  selectedId,
  origin,
  destination,
  originLabel,
  destinationLabel,
  onSelect,
  onShowArrivals,
  onWalk,
  onFocusStep,
}: Props) {
  const [order, setOrder] = useState("search");
  const displayed =
    order === "time" && estimates
      ? [...options].sort(
          (a, b) =>
            (estimates[a.id]?.totalS ?? Infinity) -
            (estimates[b.id]?.totalS ?? Infinity),
        )
      : options;
  const minutes = (seconds: number) => Math.max(0, Math.round(seconds / 60));
  return (
    <section className="journey-options" aria-label="Opções de transporte">
      <div className="journey-options-heading">
        <h2>Opções para seu caminho</h2>
        <span>{options.length}</span>
      </div>
      <p className="journey-disclaimer">
        Itinerários cadastrados no GTFS. A operação e as conexões neste momento
        não estão confirmadas.
      </p>
      {timingMessage && (
        <p className="journey-search-note" role="status">
          {timingMessage}
        </p>
      )}
      {estimates && (
        <div className="journey-time-explanation">
          <label>
            Ordenar opções encontradas
            <select value={order} onChange={(e) => setOrder(e.target.value)}>
              <option value="search">Ordem da busca</option>
              <option value="time">Menor tempo programado estimado</option>
            </select>
          </label>
          <p>
            Estimativa GTFS: tempo em transporte + espera média de meio
            intervalo (ou partida programada quando informada) + caminhada
            aproximada em linha reta a 4,5 km/h. Não inclui atrasos, trânsito ao
            vivo nem acessos dentro das estações. Compara estas opções; não
            garante o trajeto mais rápido da rede.
          </p>
          {calculatedAt && (
            <small>
              Consulta às{" "}
              {calculatedAt.toLocaleTimeString("pt-BR", {
                timeZone: "America/Sao_Paulo",
                hour: "2-digit",
                minute: "2-digit",
              })}
              . Consulte as chegadas disponíveis antes de embarcar.
            </small>
          )}
        </div>
      )}
      {displayed.map((option, i) => (
        <article
          key={option.id}
          className={
            "journey-option " +
            (selectedId === option.id ? "journey-option-selected" : "")
          }
          aria-label={`Opção ${i + 1} · ${option.transferCount ? `${option.transferCount} ${option.transferCount === 1 ? "troca" : "trocas"}` : "Direto"}`}
        >
          <div className="journey-option-title">
            <strong>
              {option.transferCount
                ? `${option.transferCount} ${option.transferCount === 1 ? "troca" : "trocas"}`
                : "Direto"}
            </strong>
            <span>Opção {i + 1}</span>
          </div>
          {estimates && (
            <div className="journey-estimate">
              {estimates[option.id]?.totalS != null ? (
                <>
                  <strong>
                    Cerca de{" "}
                    {Math.max(1, minutes(estimates[option.id].totalS!))} min ·
                    estimativa programada
                  </strong>
                  <small>
                    {minutes(estimates[option.id].ridingS)} min em transporte +{" "}
                    {minutes(estimates[option.id].walkingS)} min de caminhada
                    aproximada + {minutes(estimates[option.id].waitingS)} min de
                    espera estimada
                  </small>
                </>
              ) : (
                <>
                  <strong>Tempo total indisponível</strong>
                  <small>{estimates[option.id]?.reason}</small>
                </>
              )}
            </div>
          )}
          <div className="journey-line-badges">
            {option.legs.map((leg, n) => (
              <span key={leg.tripId + ":" + n}>
                {n > 0 && <ArrowRight size={15} />}
                <b>
                  {(leg.mode ?? "bus") === "bus" ? (
                    <BusFront size={15} />
                  ) : (
                    <TrainFront size={15} />
                  )}
                  <small>
                    {leg.mode === "metro"
                      ? "Metrô"
                      : leg.mode === "train"
                        ? "Trem"
                        : "Ônibus"}
                  </small>{" "}
                  {leg.lineCode}
                </b>
              </span>
            ))}
          </div>
          <div className="journey-distances">
            <span>
              Origem ao embarque <b>{distance(option.accessM)}</b>
            </span>
            <span>
              Desembarque ao destino <b>{distance(option.egressM)}</b>
            </span>
          </div>
          <ol className="journey-legs">
            {origin && (
              <li className="journey-walk-step">
                <Footprints size={16} />
                <div>
                  <small>
                    Saída · {originLabel || "Ponto de origem escolhido"}
                  </small>
                  <p>
                    Caminhe até <strong>{option.legs[0].from.name}</strong>.{" "}
                    {distance(option.accessM)} em linha reta; selecione a opção
                    para ver o caminho pelas ruas.
                  </p>
                </div>
              </li>
            )}
            {option.legs.map((leg, n) => (
              <li key={leg.tripId + ":" + n}>
                <p className="journey-direction">
                  {(leg.mode ?? "bus") === "bus" ? (
                    <BusFront size={15} />
                  ) : (
                    <TrainFront size={15} />
                  )}
                  <b>{leg.lineCode}</b> · {leg.headsign}
                </p>
                <div className="journey-stop">
                  <MapPin size={14} />
                  <div>
                    <small>Embarque</small>
                    <strong>{leg.from.name}</strong>
                  </div>
                </div>
                <div className="journey-stop">
                  <MapPin size={14} />
                  <div>
                    <small>Desembarque</small>
                    <strong>{leg.to.name}</strong>
                  </div>
                </div>
                {n < option.legs.length - 1 && (
                  <p className="journey-transfer">
                    {leg.to.id === option.legs[n + 1].from.id
                      ? `Troque neste ponto: ${leg.to.name}`
                      : `Caminhe de ${leg.to.name} até ${option.legs[n + 1].from.name} (aprox. ${distance(option.transferWalksM?.[n] ?? option.transferWalkM ?? 0)} em linha reta). Pode haver nova entrada e cobrança.`}
                  </p>
                )}
              </li>
            ))}
            {destination && (
              <li className="journey-walk-step">
                <Footprints size={16} />
                <div>
                  <small>
                    Chegada · {destinationLabel || "Ponto de destino escolhido"}
                  </small>
                  <p>
                    Após desembarcar em{" "}
                    <strong>{option.legs.at(-1)!.to.name}</strong>, caminhe até
                    o ponto final indicado. {distance(option.egressM)} em linha
                    reta; o caminho selecionado aparece no mapa.
                  </p>
                </div>
              </li>
            )}
          </ol>
          <div className="journey-option-actions">
            <button
              type="button"
              aria-label={`Ver opção ${i + 1} no mapa`}
              aria-pressed={selectedId === option.id}
              onClick={() => onSelect(option)}
            >
              <MapPin size={15} />
              Ver no mapa
            </button>
            {option.legs.some((l) => (l.mode ?? "bus") === "bus") && (
              <button
                type="button"
                aria-label={`Ver chegadas no embarque da opção ${i + 1}`}
                onClick={() =>
                  onShowArrivals(
                    option.legs.find((l) => (l.mode ?? "bus") === "bus")!.from,
                    option,
                  )
                }
              >
                <Radio size={15} />
                Chegadas no embarque
              </button>
            )}
          </div>
          {selectedId === option.id && origin && destination && (
            <div className="journey-walking-links">
              <button
                type="button"
                onClick={() =>
                  onFocusStep
                    ? onFocusStep(option, "walk-access")
                    : onWalk?.(origin, option.legs[0].from, "Até o embarque")
                }
              >
                <Footprints size={15} /> Ir a pé até o embarque
              </button>
              <button
                type="button"
                onClick={() =>
                  onFocusStep
                    ? onFocusStep(option, "walk-egress")
                    : onWalk?.(
                        option.legs[option.legs.length - 1].to,
                        destination,
                        "Até o destino",
                      )
                }
              >
                <Footprints size={15} /> Ir a pé do desembarque ao destino
              </button>
              {option.legs.slice(1).map(
                (leg, n) =>
                  option.legs[n].to.id !== leg.from.id && (
                    <button
                      key={n}
                      type="button"
                      onClick={() =>
                        onFocusStep
                          ? onFocusStep(option, "walk-transfer-" + (n + 1))
                          : onWalk?.(
                              option.legs[n].to,
                              leg.from,
                              `Caminhada na troca ${n + 1}`,
                            )
                      }
                    >
                      <Footprints size={15} /> Ver caminhada da troca {n + 1}
                    </button>
                  ),
              )}
              <small>
                Caminhos e instruções no mapa deste site ·
                OpenStreetMap/FOSSGIS.
              </small>
            </div>
          )}
          {option.legs.slice(1).map(
            (leg, n) =>
              (leg.mode ?? "bus") === "bus" && (
                <button
                  key={n}
                  className="journey-transfer-arrivals"
                  type="button"
                  aria-label={`Ver chegadas na troca ${n + 1} da opção ${i + 1}`}
                  onClick={() => onShowArrivals(leg.from, option)}
                >
                  Consultar chegadas na parada da troca {n + 1}{" "}
                  <ArrowRight size={14} />
                </button>
              ),
          )}
        </article>
      ))}
      <p className="journey-disclaimer">
        Distâncias em linha reta, aproximadas. Confira o acesso às paradas e as
        travessias. Horários ao vivo aparecem somente quando fornecidos pela
        SPTrans.
      </p>
    </section>
  );
}
