import { BusFront, RefreshCw } from "lucide-react";
import type { useJourneyVehicles } from "./useJourneyVehicles";
const time = (s: string | null) =>
  s && Number.isFinite(Date.parse(s))
    ? new Date(s).toLocaleTimeString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "não informado";
export default function JourneyVehiclesStatus({
  fleet,
  compact = false,
}: {
  fleet: ReturnType<typeof useJourneyVehicles>;
  compact?: boolean;
}) {
  return (
    <section
      className={compact ? "journey-fleet journey-fleet-map" : "journey-fleet"}
      aria-label={compact ? "Ônibus do trajeto no mapa" : "Ônibus do trajeto"}
    >
      <div className="journey-fleet-heading">
        <BusFront size={17} />
        <strong>{fleet.vehicles.length} ônibus do trajeto</strong>
        <button
          type="button"
          disabled={fleet.busy}
          onClick={() => void fleet.refresh()}
          aria-label={
            compact
              ? "Atualizar ônibus do trajeto no mapa"
              : "Atualizar ônibus do trajeto"
          }
          title="Atualizar ônibus"
        >
          <RefreshCw size={16} />
        </button>
      </div>
      <div role="status" aria-live="polite">
        {fleet.busy && <p>Consultando posições na SPTrans…</p>}
        {fleet.rows.map((row) => {
          const times = row.vehicles
            .map((v) => v.observedAt)
            .filter((s): s is string => !!s && Number.isFinite(Date.parse(s)))
            .sort();
          const oldest = times[0] ?? null,
            stale = !!oldest && Date.now() - Date.parse(oldest) > 120000;
          return (
            <div className="journey-fleet-line" key={row.leg.tripId}>
              <b>{row.leg.lineCode}</b>
              <span> → {row.leg.headsign}</span>
              <small>
                {row.status === "loading"
                  ? "Consultando…"
                  : row.status === "empty"
                    ? "Nenhum veículo informado nesta consulta."
                    : row.status === "error" || row.status === "unmatched"
                      ? row.message
                      : `${row.vehicles.length} veículos · GPS ${time(oldest)}${stale ? " · posição antiga" : ""}`}
              </small>
            </div>
          );
        })}
      </div>
      <p className="journey-fleet-note">
        SPTrans · atualização a cada 30 s
        {compact
          ? ""
          : ". Posições da linha inteira; não confirmam qual veículo fará seu embarque. Metrô e trem sem posição ao vivo."}
      </p>
    </section>
  );
}
