import type { Stop } from "../../contracts";
export type Point = { lat: number; lon: number };
export type Place = Point & {
  id: string;
  label: string;
  approximate: boolean;
  source: "photon" | "device" | "map";
  requestedAddress?: string;
  referenceLabel?: string;
  city?: string;
  district?: string;
  locality?: string;
  postcode?: string;
  outsideCoverage?: boolean;
};
export type TransportMode = "bus" | "metro" | "train";
export type Route = {
  id: string;
  code: string;
  name: string;
  mode?: TransportMode;
  color?: string;
};
export type Trip = {
  id: string;
  routeId: string;
  headsign: string;
  direction: string | null;
  serviceId: string;
  stopIds: string[];
};
export type Calendar = {
  id: string;
  start: string;
  end: string;
  weekdays: boolean[];
};
export type ServiceException = {
  serviceId: string;
  date: string;
  added: boolean;
};
export type Provenance = {
  source: string;
  retrievedAt: string;
  license: string;
  sha256: string;
};
export type PlannerData = {
  version: 1;
  provenance: Provenance;
  validFrom: string;
  validTo: string;
  routes: Route[];
  trips: Trip[];
  calendars: Calendar[];
  exceptions: ServiceException[];
};
export type PlanInput = {
  origin: Point;
  destination: Point;
  serviceDate: string;
  radiusM: 800 | 1200;
  criterion?: "transfers" | "walking";
  transport?: "all" | "bus" | "rail";
  maxTransfers?: 0 | 1 | 2 | 3;
};
export type JourneyLeg = {
  tripId: string;
  routeId: string;
  lineCode: string;
  headsign: string;
  from: Stop;
  to: Stop;
  fromIndex: number;
  toIndex: number;
  stopCount: number;
  routeStops: Stop[];
  mode?: TransportMode;
  color?: string;
  feedHash?: string;
};
export type JourneyOption = {
  id: string;
  legs: JourneyLeg[];
  accessM: number;
  egressM: number;
  transferCount: 0 | 1 | 2 | 3;
  stopCount: number;
  transferWalkM?: number;
  transferWalksM?: number[];
};
export type PlannerResult = {
  options: JourneyOption[];
  radiusM: 800 | 1200;
  reason?: "NO_NEARBY_STOPS" | "NO_CONNECTION";
};
export type JourneyMapSelection = {
  origin: Point;
  destination: Point;
  stops: Stop[];
  paths?: MapPath[];
  railStopIds?: string[];
  busLegs?: JourneyBusLeg[];
};
export type JourneyBusLeg = Pick<
  JourneyLeg,
  "routeId" | "tripId" | "lineCode" | "headsign"
>;
export type MapPath = {
  kind: TransportMode | "walk";
  label: string;
  points: Point[];
  color?: string;
};
export type PlannerErrorCode =
  "INVALID_DATA" | "EXPIRED_DATA" | "DATA_UNAVAILABLE" | "TIMEOUT";
export class PlannerError extends Error {
  constructor(
    public code: PlannerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PlannerError";
  }
}
