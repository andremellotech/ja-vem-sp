import { Car, Footprints, ArrowLeftRight } from "lucide-react";
import type { WalkingRoute } from "../walking/types";
import type { RoadMode, useRoadComparison } from "./useRoadComparison";
type Props = {
  state: ReturnType<typeof useRoadComparison>;
  enabled: boolean;
  onCar: () => void;
  onCompare: () => void;
  onSelect: (mode: RoadMode, route: WalkingRoute) => void;
};
export default function ModeComparison({
  state,
  enabled,
  onCar,
  onCompare,
  onSelect,
}: Props) {
  const hasRows = state.foot.status !== "idle" || state.car.status !== "idle";
  return (
    <section className="mode-comparison" aria-label="Comparar formas de chegar">
      <div className="mode-comparison-actions">
        <button type="button" disabled={!enabled || state.busy} onClick={onCar}>
          <Car size={18} />
          Ver carro no mapa
        </button>
        <button
          type="button"
          disabled={!enabled || state.busy}
          onClick={onCompare}
        >
          <ArrowLeftRight size={18} />
          Comparar modos
        </button>
      </div>
      <p className="address-privacy">
        Carro e caminhada no mapa deste site. Tempo de carro sem trânsito ao
        vivo; não considera tempo de estacionamento nem custos de viagem ou
        pedágio.
      </p>
      {hasRows && (
        <div className="mode-comparison-cards" aria-live="polite">
          {(["foot", "car"] as const).map((mode) => {
            const row = state[mode],
              Icon = mode === "car" ? Car : Footprints;
            return (
              <article
                key={mode}
                aria-label={
                  mode === "car" ? "Comparação carro" : "Comparação a pé"
                }
              >
                <h3>
                  <Icon size={18} />
                  {mode === "car" ? "Carro" : "A pé"}
                </h3>
                {row.status === "loading" && <p role="status">Calculando…</p>}
                {row.status === "idle" && <p>Ainda não calculado.</p>}
                {row.status === "error" && (
                  <p className="walking-warning">{row.message}</p>
                )}
                {row.route && (
                  <>
                    <strong>
                      Cerca de{" "}
                      {Math.max(1, Math.round(row.route.durationS / 60))} min
                    </strong>
                    <p>
                      {(row.route.distanceM / 1000).toLocaleString("pt-BR", {
                        maximumFractionDigits: 1,
                      })}{" "}
                      km pelas vias mapeadas
                    </p>
                    <button
                      type="button"
                      aria-label={
                        mode === "car"
                          ? "Mostrar carro calculado no mapa"
                          : "Mostrar caminhada calculada no mapa"
                      }
                      onClick={() => onSelect(mode, row.route!)}
                    >
                      Ver no mapa
                    </button>
                  </>
                )}
              </article>
            );
          })}
          <p className="mode-comparison-note">
            Transporte público aparece nas opções abaixo, com ônibus, metrô e
            trem conforme os filtros. Os tempos usam fontes e aproximações
            diferentes.
          </p>
        </div>
      )}
    </section>
  );
}
