import { ArrowRight, BusFront, MapPin, Radio } from "lucide-react";
import type { Stop } from "../../contracts";
import type { JourneyOption } from "./types";
const distance = (m: number) =>
  m < 50
    ? "< 50 m"
    : m < 1000
      ? `${Math.round(m / 10) * 10} m`
      : `${(m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
type Props = {
  options: JourneyOption[];
  selectedId: string | null;
  onSelect: (option: JourneyOption) => void;
  onShowArrivals: (stop: Stop, option: JourneyOption) => void;
};
export default function JourneyOptions({
  options,
  selectedId,
  onSelect,
  onShowArrivals,
}: Props) {
  return (
    <section className="journey-options" aria-label="Opções de ônibus">
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
                  <BusFront size={15} />
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
                  <BusFront size={15} />
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
                    Troque nesta mesma parada: {leg.to.name}
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
            <button
              type="button"
              aria-label={`Ver chegadas no embarque da opção ${i + 1}`}
              onClick={() => onShowArrivals(option.legs[0].from, option)}
            >
              <Radio size={15} />
              Chegadas no embarque
            </button>
          </div>
          {option.transferCount === 1 && (
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
