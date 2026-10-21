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
  options: JourneyOption[];
  selectedId: string | null;
  origin?: Point | null;
  destination?: Point | null;
  onSelect: (option: JourneyOption) => void;
  onShowArrivals: (stop: Stop, option: JourneyOption) => void;
  onWalk?: (from: Point, to: Point, label: string) => void;
};
export default function JourneyOptions({
  options,
  selectedId,
  origin,
  destination,
  onSelect,
  onShowArrivals,
  onWalk,
}: Props) {
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
      {options.map((option, i) => (
        <article
          key={option.id}
          className={
            "journey-option " +
            (selectedId === option.id ? "journey-option-selected" : "")
          }
          aria-label={`Opção ${i + 1} · ${option.transferCount ? "1 troca" : "Direto"}`}
        >
          <div className="journey-option-title">
            <strong>{option.transferCount ? "1 troca" : "Direto"}</strong>
            <span>Opção {i + 1}</span>
          </div>
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
                      : `Caminhe de ${leg.to.name} até ${option.legs[n + 1].from.name} (aprox. ${distance(option.transferWalkM ?? 0)} em linha reta). Pode haver nova entrada e cobrança.`}
                  </p>
                )}
              </li>
            ))}
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
                  onWalk?.(origin, option.legs[0].from, "Até o embarque")
                }
              >
                <Footprints size={15} /> Ir a pé até o embarque
              </button>
              <button
                type="button"
                onClick={() =>
                  onWalk?.(
                    option.legs[option.legs.length - 1].to,
                    destination,
                    "Até o destino",
                  )
                }
              >
                <Footprints size={15} /> Ir a pé do desembarque ao destino
              </button>
              {option.transferWalkM !== undefined && (
                <button
                  type="button"
                  onClick={() =>
                    onWalk?.(
                      option.legs[0].to,
                      option.legs[1].from,
                      "Caminhada na troca",
                    )
                  }
                >
                  <Footprints size={15} /> Ver caminhada da troca
                </button>
              )}
              <small>
                Caminhos e instruções no mapa deste site ·
                OpenStreetMap/FOSSGIS.
              </small>
            </div>
          )}
          {option.transferCount === 1 &&
            (option.legs[1].mode ?? "bus") === "bus" && (
              <button
                className="journey-transfer-arrivals"
                type="button"
                aria-label={`Ver chegadas na troca da opção ${i + 1}`}
                onClick={() => onShowArrivals(option.legs[1].from, option)}
              >
                Consultar chegadas na parada da troca <ArrowRight size={14} />
              </button>
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
