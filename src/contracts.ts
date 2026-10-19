export interface Line {
  id: string;
  code: string;
  name: string;
  direction: 1 | 2;
  origin: string;
  destination: string;
}
export interface Stop {
  id: string;
  name: string;
  lat: number;
  lon: number;
}
export interface Vehicle {
  id: string;
  lat: number;
  lon: number;
  observedAt: string | null;
  accessible?: boolean;
}
export interface Arrival {
  lineId: string;
  stopId: string;
  lineCode: string;
  vehicleId: string;
  expectedAt: string | null;
  expectedLocalTime: string | null;
  kind: "realtime" | "scheduled";
  observedAt: string | null;
}
export interface Result<T> {
  data: T;
  source: "SPTrans";
  fetchedAt: string;
  observedAt: string | null;
}
export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
