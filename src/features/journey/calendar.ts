import { validDate } from "./data";
import { PlannerError, type PlannerData } from "./types";
export function serviceDateInSaoPaulo(now: Date): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"]
    .map((type) => parts.find((p) => p.type === type)!.value)
    .join("");
}
export function activeServices(data: PlannerData, date: string): Set<string> {
  if (!validDate(date))
    throw new PlannerError("INVALID_DATA", "Data de serviço inválida.");
  if (date < data.validFrom || date > data.validTo)
    throw new PlannerError(
      "EXPIRED_DATA",
      "A base de trajetos está fora da validade e precisa de atualização. Use a consulta de linhas e paradas.",
    );
  const weekday =
    (new Date(
      `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T12:00:00Z`,
    ).getUTCDay() +
      6) %
    7;
  const active = new Set(
    data.calendars
      .filter((c) => date >= c.start && date <= c.end && c.weekdays[weekday])
      .map((c) => c.id),
  );
  for (const e of data.exceptions)
    if (e.date === date) {
      if (e.added) active.add(e.serviceId);
      else active.delete(e.serviceId);
    }
  return active;
}
