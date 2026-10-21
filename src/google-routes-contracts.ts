export interface GoogleRoutePoint {
  lat: number;
  lon: number;
}

export interface GoogleRoutesRequest {
  origin: GoogleRoutePoint;
  destination: GoogleRoutePoint;
  mode: "walking" | "transit";
  preference: "any" | "rail" | "bus";
}

export interface GoogleTransitDetails {
  lineName: string;
  shortName: string;
  headsign: string;
  vehicleType: string;
  departureStop: string;
  arrivalStop: string;
  departureTime: string | null;
  arrivalTime: string | null;
  stopCount: number | null;
  agencies: { name: string; url: string | null }[];
}

export interface GoogleRouteStep {
  mode: "WALK" | "TRANSIT";
  instruction: string;
  distanceM: number | null;
  durationS: number | null;
  from: GoogleRoutePoint | null;
  to: GoogleRoutePoint | null;
  polyline: string | null;
  transit: GoogleTransitDetails | null;
}

export interface GoogleRoute {
  id: string;
  description: string;
  distanceM: number;
  durationS: number;
  polyline: string;
  warnings: string[];
  steps: GoogleRouteStep[];
}

export interface GoogleRoutesResponse {
  source: "Google Maps";
  fetchedAt: string;
  routes: GoogleRoute[];
}
