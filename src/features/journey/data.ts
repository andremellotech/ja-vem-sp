import { createIndex, type NetStop, type NetStopIndex } from "../stops/network";
import { PlannerError, type PlannerData, type Route } from "./types";
export type PlannerIndex = {
  data: PlannerData;
  stops: NetStopIndex;
  routes: Map<string, Route>;
  occurrences: Map<string, { tripIndex: number; stopIndex: number }[]>;
};
const fail = (): never => {
  throw new PlannerError(
    "INVALID_DATA",
    "A base de trajetos está inválida. Tente novamente após uma atualização.",
  );
};
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;
export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{8}$/.test(value)) return false;
  const date = new Date(
    `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T12:00:00Z`,
  );
  return (
    Number.isFinite(+date) &&
    date.toISOString().slice(0, 10).replaceAll("-", "") === value
  );
}
export function parsePlannerData(
  value: unknown,
  expectedFeedHash: string,
): PlannerData {
  if (!record(value) || value.version !== 1 || !record(value.provenance))
    return fail();
  const p = value.provenance;
  if (
    !text(p.sha256) ||
    !/^[a-f0-9]{64}$/.test(p.sha256) ||
    !text(p.source) ||
    !text(p.retrievedAt) ||
    !text(p.license)
  )
    return fail();
  if (p.sha256 !== expectedFeedHash)
    throw new PlannerError(
      "INVALID_DATA",
      "As bases de paradas e trajetos são de versões diferentes. Recarregue e tente novamente.",
    );
  if (
    !validDate(value.validFrom) ||
    !validDate(value.validTo) ||
    value.validFrom > value.validTo
  )
    return fail();
  if (
    !Array.isArray(value.routes) ||
    !value.routes.length ||
    !Array.isArray(value.trips) ||
    !value.trips.length ||
    !Array.isArray(value.calendars) ||
    !Array.isArray(value.exceptions)
  )
    return fail();
  const routes = new Set<string>(),
    services = new Set<string>(),
    trips = new Set<string>(),
    exceptions = new Set<string>();
  for (const r of value.routes) {
    if (
      !record(r) ||
      !text(r.id) ||
      !text(r.code) ||
      !text(r.name) ||
      (r.mode !== undefined &&
        !["bus", "metro", "train"].includes(r.mode as string)) ||
      (r.color !== undefined &&
        (typeof r.color !== "string" || !/^[a-f0-9]{6}$/i.test(r.color))) ||
      routes.has(r.id)
    )
      return fail();
    routes.add(r.id);
  }
  for (const c of value.calendars) {
    if (
      !record(c) ||
      !text(c.id) ||
      services.has(c.id) ||
      !validDate(c.start) ||
      !validDate(c.end) ||
      c.start > c.end ||
      !Array.isArray(c.weekdays) ||
      c.weekdays.length !== 7 ||
      !c.weekdays.every((d) => typeof d === "boolean")
    )
      return fail();
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
      return fail();
    const key = e.serviceId + ":" + e.date;
    if (exceptions.has(key)) return fail();
    exceptions.add(key);
    services.add(e.serviceId);
  }
  for (const t of value.trips) {
    if (
      !record(t) ||
      !text(t.id) ||
      trips.has(t.id) ||
      !text(t.routeId) ||
      !routes.has(t.routeId) ||
      !text(t.serviceId) ||
      !services.has(t.serviceId) ||
      !text(t.headsign) ||
      (t.direction !== null && typeof t.direction !== "string") ||
      !Array.isArray(t.stopIds) ||
      !t.stopIds.length ||
      !t.stopIds.every(text)
    )
      return fail();
    trips.add(t.id);
  }
  return value as unknown as PlannerData;
}
export function createPlannerIndex(
  data: PlannerData,
  networkStops: NetStop[],
): PlannerIndex {
  const byId = new Map<string, NetStop>();
  for (const s of networkStops) {
    if (
      !s.id ||
      byId.has(s.id) ||
      !Number.isFinite(s.lat) ||
      !Number.isFinite(s.lon) ||
      Math.abs(s.lat) > 90 ||
      Math.abs(s.lon) > 180
    )
      return fail();
    byId.set(s.id, s);
  }
  const occurrences: PlannerIndex["occurrences"] = new Map();
  data.trips.forEach((t, tripIndex) =>
    t.stopIds.forEach((id, stopIndex) => {
      if (!byId.has(id)) return fail();
      const list = occurrences.get(id) ?? [];
      list.push({ tripIndex, stopIndex });
      occurrences.set(id, list);
    }),
  );
  return {
    data,
    stops: createIndex(networkStops.filter((s) => occurrences.has(s.id))),
    routes: new Map(data.routes.map((r) => [r.id, r])),
    occurrences,
  };
}
