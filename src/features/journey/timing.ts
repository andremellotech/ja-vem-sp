import type { JourneyOption } from "./types";
import type { FrequencyWindow } from "../schedules/types";
import { serviceDateInSaoPaulo } from "./calendar";
import { validDate } from "./data";
export type TimingTrip = {
  stopIds: string[];
  arrivalS: number[];
  departureS: number[];
  windows: FrequencyWindow[];
};
export type JourneyTimes = {
  version: 1;
  provenance: { sha256: string };
  validFrom: string;
  validTo: string;
  trips: Record<string, TimingTrip>;
};
export type JourneyEstimate = {
  totalS: number | null;
  ridingS: number;
  walkingS: number;
  waitingS: number;
  reason?: string;
};
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const seconds = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 172800;
export function parseJourneyTimes(v: unknown): JourneyTimes {
  const fail = (): never => {
    throw new Error("A base de tempos programados está inválida.");
  };
  if (
    !record(v) ||
    v.version !== 1 ||
    !record(v.provenance) ||
    typeof v.provenance.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(v.provenance.sha256) ||
    !validDate(v.validFrom) ||
    !validDate(v.validTo) ||
    v.validFrom > v.validTo ||
    !record(v.trips)
  )
    return fail();
  const trips: Record<string, TimingTrip> = {};
  for (const [id, t] of Object.entries(v.trips)) {
    if (
      !record(t) ||
      !Array.isArray(t.stopIds) ||
      !t.stopIds.length ||
      !t.stopIds.every((s) => typeof s === "string" && s.length > 0) ||
      !Array.isArray(t.arrivalS) ||
      !Array.isArray(t.departureS) ||
      t.arrivalS.length !== t.stopIds.length ||
      t.departureS.length !== t.stopIds.length ||
      !Array.isArray(t.windows)
    )
      return fail();
    const arrivals = t.arrivalS,
      departures = t.departureS;
    if (
      arrivals.some(
        (a, i) =>
          !seconds(a) ||
          !seconds(departures[i]) ||
          a > departures[i] ||
          (i > 0 && a < departures[i - 1]),
      )
    )
      return fail();
    let end = -1;
    const windows: FrequencyWindow[] = [];
    for (const w of t.windows) {
      if (
        !Array.isArray(w) ||
        w.length !== 4 ||
        !seconds(w[0]) ||
        !seconds(w[1]) ||
        w[1] <= w[0] ||
        w[0] < end ||
        !seconds(w[2]) ||
        !w[2] ||
        typeof w[3] !== "boolean"
      )
        return fail();
      end = w[1];
      windows.push({
        start: w[0],
        end: w[1],
        headwayS: w[2],
        exactTimes: w[3],
      });
    }
    trips[id] = {
      stopIds: t.stopIds,
      arrivalS: arrivals,
      departureS: departures,
      windows,
    };
  }
  return {
    version: 1,
    provenance: { sha256: v.provenance.sha256 },
    validFrom: v.validFrom,
    validTo: v.validTo,
    trips,
  };
}
function timeInSaoPaulo(at: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return n("hour") * 3600 + n("minute") * 60 + n("second");
}
export function estimateJourney(
  option: JourneyOption,
  data: JourneyTimes | null,
  at: Date,
): JourneyEstimate {
  let ridingS = 0,
    waitingS = 0;
  const walkingS =
    (option.accessM + option.egressM + (option.transferWalkM ?? 0)) / 1.25;
  const missing = (reason: string): JourneyEstimate => ({
    totalS: null,
    ridingS,
    walkingS,
    waitingS,
    reason,
  });
  if (
    !data ||
    !Number.isFinite(+at) ||
    !Number.isFinite(walkingS) ||
    walkingS < 0
  )
    return missing("Tempo total indisponível.");
  const date = serviceDateInSaoPaulo(at);
  if (date < data.validFrom || date > data.validTo)
    return missing("Base de tempos fora da validade.");
  let ready = timeInSaoPaulo(at) + option.accessM / 1.25;
  for (let i = 0; i < option.legs.length; i++) {
    const leg = option.legs[i],
      t = data.trips[leg.tripId];
    if (
      !t ||
      leg.feedHash !== data.provenance.sha256 ||
      !Number.isInteger(leg.fromIndex) ||
      !Number.isInteger(leg.toIndex) ||
      leg.fromIndex < 0 ||
      leg.toIndex <= leg.fromIndex ||
      t.stopIds[leg.fromIndex] !== leg.from.id ||
      t.stopIds[leg.toIndex] !== leg.to.id
    )
      return missing("Tempos deste sentido não confirmados.");
    const ride = t.arrivalS[leg.toIndex] - t.departureS[leg.fromIndex];
    if (!Number.isFinite(ride) || ride <= 0)
      return missing("Duração deste trecho indisponível.");
    if (i > 0)
      ready +=
        (option.transferWalksM?.[i - 1] ??
          (option.transferWalkM ?? 0) / Math.max(1, option.legs.length - 1)) /
        1.25;
    const offset = t.departureS[leg.fromIndex] - t.departureS[0];
    let departure: number | null = null;
    for (const w of t.windows) {
      const start = w.start + offset,
        end = w.end + offset;
      if (ready >= end) continue;
      const candidate = w.exactTimes
        ? start +
          Math.max(0, Math.ceil((ready - start) / w.headwayS)) * w.headwayS
        : Math.max(start, ready) + w.headwayS / 2;
      if (candidate < end) {
        departure = candidate;
        break;
      }
    }
    if (departure === null)
      return missing("Sem janela programada restante para este trecho.");
    waitingS += departure - ready;
    ridingS += ride;
    ready = departure + ride;
  }
  if (!option.legs.length) return missing("Nenhum trecho de transporte.");
  return { totalS: ridingS + walkingS + waitingS, ridingS, walkingS, waitingS };
}
const cache = new Map<string, JourneyTimes>();
export async function loadJourneyTimes(
  signal: AbortSignal,
): Promise<JourneyTimes> {
  if (signal.aborted) throw new DOMException("Cancelado", "AbortError");
  const url = new URL(
    import.meta.env.BASE_URL + "data/journey-times.json",
    location.href,
  ).href;
  const existing = cache.get(url);
  if (existing) return existing;
  const c = new AbortController(),
    abort = () => c.abort();
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 15000);
  try {
    const response = await fetch(url, { signal: c.signal });
    if (!response.ok) throw new Error("Tempos programados indisponíveis.");
    const data = parseJourneyTimes(await response.json());
    if (c.signal.aborted) throw new DOMException("Cancelado", "AbortError");
    cache.set(url, data);
    return data;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
