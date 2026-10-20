import { useEffect, useId, useState } from "react";
import type { Line } from "../../contracts";
import { activeServices, serviceDateInSaoPaulo } from "../journey/calendar";
import { validDate } from "../journey/data";
import { loadLineIndex, resolveLineStops } from "../journey/line-stops";
import { PlannerError } from "../journey/types";
import { loadScheduleData } from "./data";
import type { ScheduleData, ScheduleTrip } from "./types";

type Loaded = {
  key: string;
  data: ScheduleData;
  trips: ScheduleTrip[];
  matched: boolean;
};
const dateLabel = (date: string) =>
  `${date.slice(6, 8)}/${date.slice(4, 6)}/${date.slice(0, 4)}`;
const dateValue = (date: string) =>
  `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
const time = (seconds: number) => {
  const hours = String(Math.floor(seconds / 3600)).padStart(2, "0"),
    minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0"),
    remainder = seconds % 60;
  return `${hours}:${minutes}${remainder ? ":" + String(remainder).padStart(2, "0") : ""}`;
};
const interval = (seconds: number) =>
  seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`;

export default function LineSchedule({
  line,
  base,
}: {
  line: Line;
  base?: string;
}) {
  const baseUrl = new URL(
    base ?? import.meta.env.BASE_URL,
    window.location.href,
  ).href;
  const key = JSON.stringify([
    baseUrl,
    line.id,
    line.code,
    line.origin,
    line.destination,
  ]);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(
    null,
  );
  const [date, setDate] = useState(() => serviceDateInSaoPaulo(new Date()));
  const dateId = useId();
  useEffect(() => {
    let current = true;
    setError(null);
    setLoaded(null);
    (async () => {
      const index = await loadLineIndex(baseUrl);
      const resolution = resolveLineStops(line, index, []);
      const ids = resolution.tripIds ?? [];
      if (resolution.source !== "gtfs" || !ids.length)
        throw new PlannerError(
          "DATA_UNAVAILABLE",
          "Esta linha não tem programação disponível na base GTFS. Consulte a programação oficial.",
        );
      const data = await loadScheduleData(
        baseUrl,
        index.data.provenance.sha256,
      );
      const byId = new Map(data.trips.map((t) => [t.id, t]));
      const plannerTrips = new Map(index.data.trips.map((t) => [t.id, t]));
      const trips = ids.map((id) => {
        const t = byId.get(id),
          original = plannerTrips.get(id)!;
        if (
          !t ||
          t.routeId !== original.routeId ||
          t.serviceId !== original.serviceId ||
          t.direction !== original.direction ||
          t.headsign !== original.headsign
        )
          throw new PlannerError(
            "INVALID_DATA",
            "A programação não corresponde aos itinerários desta base. Recarregue e tente novamente.",
          );
        return t;
      });
      if (current)
        setLoaded({ key, data, trips, matched: resolution.directionMatched });
    })().catch((e) => {
      if (current)
        setError({
          key,
          message:
            e instanceof PlannerError
              ? e.message
              : "Não foi possível carregar a programação. Consulte a programação oficial ou tente novamente.",
        });
    });
    return () => {
      current = false;
    };
  }, [key]);

  const result = loaded?.key === key ? loaded : null;
  const message = error?.key === key ? error.message : "";
  let active = new Set<string>(),
    dateError = "";
  if (result) {
    if (!validDate(date)) dateError = "Escolha uma data de serviço válida.";
    else if (date < result.data.validFrom || date > result.data.validTo)
      dateError =
        "A data está fora da validade desta base. Consulte a programação oficial.";
    else active = activeServices(result.data, date);
  }
  const trips = result?.trips.filter((t) => active.has(t.serviceId)) ?? [];
  function shortcut(kind: "weekday" | "saturday" | "sunday") {
    const start = validDate(date) ? date : serviceDateInSaoPaulo(new Date());
    const next = new Date(`${dateValue(start)}T12:00:00Z`);
    for (let i = 0; i < 7; i++) {
      const day = next.getUTCDay();
      if (
        kind === "weekday"
          ? day >= 1 && day <= 5
          : day === (kind === "saturday" ? 6 : 0)
      )
        break;
      next.setUTCDate(next.getUTCDate() + 1);
    }
    setDate(next.toISOString().slice(0, 10).replaceAll("-", ""));
  }
  const official = `https://www.sptrans.com.br/itinerarios/linha/?numero=${encodeURIComponent(line.code)}`;
  return (
    <section aria-label="Programação da linha" className="line-schedule">
      <h3>Programação por intervalos</h3>
      <p>
        Faixas de saída no terminal e intervalos cadastrados no GTFS; não são
        partidas exatas nem previsões de chegada ao ponto.
      </p>
      <p>
        <a href={official} target="_blank" rel="noreferrer">
          Ver programação oficial da linha {line.code}
        </a>
      </p>
      {!result && !message && <p role="status">Carregando programação…</p>}
      {message && <p role="alert">{message}</p>}
      {result && (
        <>
          <label htmlFor={dateId}>Data do serviço</label>{" "}
          <input
            id={dateId}
            type="date"
            value={validDate(date) ? dateValue(date) : ""}
            onChange={(e) => setDate(e.target.value.replaceAll("-", ""))}
          />
          <div role="group" aria-label="Escolher tipo de dia">
            <button type="button" onClick={() => shortcut("weekday")}>
              Dia útil
            </button>{" "}
            <button type="button" onClick={() => shortcut("saturday")}>
              Sábado
            </button>{" "}
            <button type="button" onClick={() => shortcut("sunday")}>
              Domingo
            </button>
          </div>
          <p>
            Calendário válido de {dateLabel(result.data.validFrom)} a{" "}
            {dateLabel(result.data.validTo)}. Fonte consultada em{" "}
            {result.data.provenance.retrievedAt.split("-").reverse().join("/")}.
          </p>
          <p>
            {result.data.exceptions.length
              ? "Exceções de calendário da base são aplicadas à data escolhida."
              : "A base não contém exceções de calendário para feriados. Confirme a programação oficial."}
          </p>
          {!result.matched && (
            <p role="note">
              O sentido selecionado não foi confirmado. Abaixo estão os
              itinerários disponíveis; confira o letreiro antes de usar esta
              programação.
            </p>
          )}
          {dateError ? (
            <p role="alert">{dateError}</p>
          ) : (
            <>
              {!trips.length && (
                <p>
                  {result.matched
                    ? "Sem serviço cadastrado para esta data no itinerário selecionado. Confirme a programação oficial."
                    : "Nenhum dos itinerários disponíveis tem programação cadastrada para esta data; o sentido selecionado permanece incerto. Confirme a programação oficial."}
                </p>
              )}
              {trips.map((t) => (
                <section key={t.id} aria-label={`Itinerário ${t.headsign}`}>
                  <h4>{t.headsign}</h4>
                  <table style={{ width: "100%" }}>
                    <caption>Saídas no terminal · {dateLabel(date)}</caption>
                    <thead>
                      <tr>
                        <th scope="col">Faixa publicada</th>
                        <th scope="col">Intervalo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.windows.map((w, i) => (
                        <tr key={i}>
                          <td>
                            {time(w.start)}–{time(w.end)}
                          </td>
                          <td>{interval(w.headwayS)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {t.windows.some((w) => w.end >= 86400) && (
                    <p>
                      Horários a partir de 24:00 pertencem ao dia seguinte do
                      mesmo dia de serviço.
                    </p>
                  )}
                </section>
              ))}
              <p>
                Os limites e as lacunas entre faixas foram preservados como
                publicados. Eles não confirmam interrupções reais de operação.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
