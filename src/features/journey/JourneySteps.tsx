import { BusFront, TrainFront, Footprints, MapPin } from "lucide-react";
import type { JourneyMapSelection, JourneyStep } from "./types";
import { walkingInstruction } from "../walking/instructions";
type Props = {
  selection: JourneyMapSelection;
  onFocus: (id: string | null) => void;
  compact?: boolean;
  focusedId?: string | null;
};
const distance = (m: number) =>
  m < 1000
    ? Math.round(m) + " m"
    : (m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " km";
export default function JourneySteps({
  selection,
  onFocus,
  compact = false,
  focusedId,
}: Props) {
  const steps = selection.steps ?? [];
  if (!steps.length) return null;
  const rows = (
    <ol className="journey-step-list">
      {steps.map((s, i) => {
        const Icon =
          s.kind === "walk"
            ? Footprints
            : s.kind === "bus"
              ? BusFront
              : TrainFront;
        return (
          <li
            key={s.id}
            data-testid="journey-step"
            data-mode={s.kind}
            className={focusedId === s.id ? "journey-step-focused" : ""}
          >
            <span className="journey-step-number">{i + 1}</span>
            <div className="journey-step-body">
              <h3>
                <Icon size={17} />
                {s.title}
              </h3>
              {s.kind !== "walk" && (
                <p className="journey-step-direction">Sentido: {s.headsign}</p>
              )}
              <p>
                <small>{s.kind === "walk" ? "De" : "Embarque"}</small>
                <strong>{s.from.label}</strong>
              </p>
              <p>
                <small>{s.kind === "walk" ? "Até" : "Desembarque"}</small>
                <strong>{s.to.label}</strong>
              </p>
              {s.status === "loading" && (
                <p role="status">Carregando este trecho…</p>
              )}
              {s.status === "nearby" && (
                <p>
                  Pontos muito próximos. Confira a sinalização, a plataforma e o
                  acesso no local.
                </p>
              )}
              {s.message && <p className="walking-warning">{s.message}</p>}
              {s.walk && (
                <p className="journey-step-metrics">
                  {distance(s.walk.distanceM)} pelas ruas · cerca de{" "}
                  {Math.max(1, Math.round(s.walk.durationS / 60))} min a pé
                </p>
              )}
              {!compact && s.walk && (
                <details>
                  <summary>Instruções da caminhada da etapa {i + 1}</summary>
                  <ol>
                    {s.walk.steps.map((instruction, n) => (
                      <li key={n}>
                        {walkingInstruction(instruction)}
                        {instruction.distanceM > 0 && (
                          <small>
                            {" "}
                            · {Math.round(instruction.distanceM)} m
                          </small>
                        )}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
              {!compact && s.walk && (s.walk.startGapM ?? 0) > 50 && (
                <p className="walking-warning">
                  O caminho começa a {Math.round(s.walk.startGapM!)} m da saída
                  escolhida. Confira o acesso.
                </p>
              )}
              {!compact && s.walk && (s.walk.endGapM ?? 0) > 50 && (
                <p className="walking-warning">
                  O caminho termina a {Math.round(s.walk.endGapM!)} m do ponto
                  final desta etapa. A entrada não foi confirmada; o destino
                  escolhido foi preservado.
                </p>
              )}
              <button
                type="button"
                disabled={s.status === "loading"}
                aria-label={
                  "Ver etapa " +
                  (i + 1) +
                  " no mapa" +
                  (compact ? " pelo painel" : "")
                }
                onClick={() => onFocus(s.id)}
              >
                <MapPin size={14} />
                Ver este trecho
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
  const fullButton = (
    <button
      type="button"
      className="journey-show-all"
      onClick={() => onFocus(null)}
    >
      Ver trajeto completo no mapa
    </button>
  );
  if (compact)
    return (
      <section
        className="journey-steps-map"
        aria-label="Etapas do trajeto no mapa"
      >
        <details>
          <summary>Trajeto completo · {steps.length} etapas</summary>
          <p>Da origem escolhida até o destino final</p>
          {fullButton}
          {rows}
        </details>
      </section>
    );
  return (
    <section className="journey-steps" aria-label="Seu trajeto completo">
      <header>
        <h2>Seu trajeto completo</h2>
        {fullButton}
      </header>
      <p className="journey-step-endpoints">
        <strong>Saída:</strong> {selection.originLabel}
        <br />
        <strong>Chegada:</strong> {selection.destinationLabel}
      </p>
      {rows}
      <p className="journey-step-source">
        Caminhadas pelas ruas:{" "}
        <a
          href="https://routing.openstreetmap.de/about.html"
          target="_blank"
          rel="noreferrer"
        >
          OpenStreetMap/FOSSGIS
        </a>
        . Transporte: GTFS. Confira acessos internos, plataformas, operação e
        integração tarifária.
      </p>
    </section>
  );
}
