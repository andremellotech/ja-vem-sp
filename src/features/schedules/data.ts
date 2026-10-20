import { validDate } from "../journey/data";
import { PlannerError } from "../journey/types";
import type { ScheduleData } from "./types";

const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && !!v.trim();
const seconds = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const invalid = (): never => {
  throw new PlannerError(
    "INVALID_DATA",
    "A base de programação está inválida. Consulte a programação oficial.",
  );
};

export function parseScheduleData(
  value: unknown,
  expectedHash: string,
): ScheduleData {
  if (!record(value) || value.version !== 1 || !record(value.provenance))
    return invalid();
  const p = value.provenance;
  if (
    !text(p.sha256) ||
    !/^[a-f0-9]{64}$/.test(p.sha256) ||
    !text(p.source) ||
    !text(p.retrievedAt) ||
    !text(p.license)
  )
    return invalid();
  if (p.sha256 !== expectedHash)
    throw new PlannerError(
      "INVALID_DATA",
      "As bases de itinerários e programação são de versões diferentes. Recarregue e tente novamente.",
    );
  if (
    !validDate(value.validFrom) ||
    !validDate(value.validTo) ||
    value.validFrom > value.validTo ||
    !Array.isArray(value.calendars) ||
    !Array.isArray(value.exceptions) ||
    !Array.isArray(value.trips) ||
    !value.trips.length
  )
    return invalid();
  const services = new Set<string>(),
    exceptions = new Set<string>(),
    trips = new Set<string>();
  for (const c of value.calendars) {
    if (
      !record(c) ||
      !text(c.id) ||
      services.has(c.id) ||
      !validDate(c.start) ||
      !validDate(c.end) ||
      c.start > c.end ||
      c.start < value.validFrom ||
      c.end > value.validTo ||
      !Array.isArray(c.weekdays) ||
      c.weekdays.length !== 7 ||
      !c.weekdays.every((d) => typeof d === "boolean")
    )
      return invalid();
    services.add(c.id);
  }
  for (const e of value.exceptions) {
    if (
      !record(e) ||
      !text(e.serviceId) ||
      !validDate(e.date) ||
      typeof e.added !== "boolean" ||
      e.date < value.validFrom ||
      e.date > value.validTo
    )
      return invalid();
    const key = `${e.serviceId}:${e.date}`;
    if (exceptions.has(key)) return invalid();
    exceptions.add(key);
    services.add(e.serviceId);
  }
  for (const t of value.trips) {
    if (
      !record(t) ||
      !text(t.id) ||
      trips.has(t.id) ||
      !text(t.routeId) ||
      !text(t.headsign) ||
      (t.direction !== null &&
        (!text(t.direction) || !["0", "1"].includes(t.direction))) ||
      !text(t.serviceId) ||
      !services.has(t.serviceId) ||
      !Array.isArray(t.windows) ||
      !t.windows.length
    )
      return invalid();
    trips.add(t.id);
    let previousEnd = -1,
      exact: boolean | undefined;
    for (const w of t.windows) {
      if (
        !record(w) ||
        !seconds(w.start) ||
        !seconds(w.end) ||
        w.start >= w.end ||
        w.start < previousEnd ||
        !seconds(w.headwayS) ||
        w.headwayS === 0 ||
        typeof w.exactTimes !== "boolean" ||
        (exact !== undefined && exact !== w.exactTimes)
      )
        return invalid();
      previousEnd = w.end;
      exact = w.exactTimes;
    }
  }
  return value as unknown as ScheduleData;
}

const cache = new Map<string, Promise<ScheduleData>>();
export function loadScheduleData(
  base: string,
  expectedHash: string,
): Promise<ScheduleData> {
  const key = `${base}|${expectedHash}`,
    existing = cache.get(key);
  if (existing) return existing;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new PlannerError(
          "TIMEOUT",
          "A programação demorou mais de 12 segundos para carregar. Tente novamente.",
        ),
      );
      controller.abort();
    }, 12000);
  });
  const request = (async () => {
    const response = await fetch(new URL("data/schedules.json", base).href, {
      signal: controller.signal,
      cache: "no-cache",
    });
    if (!response.ok)
      throw new PlannerError(
        "DATA_UNAVAILABLE",
        "A programação não carregou. Consulte a programação oficial.",
      );
    return parseScheduleData(await response.json(), expectedHash);
  })();
  const pending = Promise.race([request, timeout])
    .catch((error) => {
      cache.delete(key);
      throw error;
    })
    .finally(() => clearTimeout(timer));
  cache.set(key, pending);
  return pending;
}
