import { Car, Footprints } from "lucide-react";
import { walkingInstruction } from "./instructions";
import type { WalkingRoute } from "./types";
export type LabeledWalk = { label: string; route: WalkingRoute };
export default function WalkingPlanner({
  busy,
  walks,
  messages,
  mode = "foot",
}: {
  busy: boolean;
  walks: LabeledWalk[];
  messages: string[];
  mode?: "foot" | "car";
}) {
  if (!busy && !walks.length && !messages.length) return null;
  return (
    <section
      className="walking-planner"
      aria-label={mode === "car" ? "Rota de carro" : "Caminhos no mapa"}
      aria-live="polite"
    >
      <h3>
        {mode === "car" ? <Car size={18} /> : <Footprints size={18} />}{" "}
        {mode === "car" ? "Rota de carro" : "Caminhos no mapa"}
      </h3>
      {busy && <p role="status">Carregando caminhos e instruções…</p>}
      {messages.map((text, i) => (
        <p className="walking-warning" key={i}>
          {text}
        </p>
      ))}
      {walks.map(({ label, route }) => (
        <div key={label}>
          <details open={walks.length === 1}>
            <summary>
              {label} ·{" "}
              {(route.distanceM / 1000).toLocaleString("pt-BR", {
                maximumFractionDigits: 1,
              })}{" "}
              km · cerca de {Math.max(1, Math.round(route.durationS / 60))} min{" "}
              {mode === "car" ? "de carro, sem trânsito ao vivo" : "a pé"}
            </summary>
            <ol>
              {route.steps.map((step, i) => (
                <li key={i}>
                  {walkingInstruction(step, mode)}
                  {step.distanceM > 0 && (
                    <small> · {Math.round(step.distanceM)} m</small>
                  )}
                </li>
              ))}
            </ol>
          </details>
          {(route.startGapM ?? 0) > 50 && (
            <p className="walking-warning">
              O caminho mapeado começa a cerca de {Math.round(route.startGapM!)}{" "}
              m do ponto inicial. Confira o acesso até ele.
            </p>
          )}
          {(route.endGapM ?? 0) > 50 && (
            <p className="walking-warning">
              O caminho mapeado termina a cerca de {Math.round(route.endGapM!)}{" "}
              m do ponto final indicado. O acesso à entrada não está confirmado;
              o marcador final preserva o local que você escolheu.
            </p>
          )}
        </div>
      ))}
      <p className="walking-source">
        {mode === "car" ? "Carro" : "Caminhada"}: OpenStreetMap /{" "}
        <a
          href="https://routing.openstreetmap.de/about.html"
          target="_blank"
          rel="noreferrer"
        >
          FOSSGIS
        </a>
        . Tempo estimado, sem trânsito ao vivo. Confira acessos, travessias e
        condições no local.{" "}
        <a
          href="https://www.openstreetmap.org/fixthemap"
          target="_blank"
          rel="noreferrer"
        >
          Corrigir o mapa
        </a>
        .
      </p>
    </section>
  );
}
