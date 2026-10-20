import type { Calendar, Provenance, ServiceException } from "../journey/types";

export type FrequencyWindow = {
  start: number;
  end: number;
  headwayS: number;
  exactTimes: boolean;
};
export type ScheduleTrip = {
  id: string;
  routeId: string;
  headsign: string;
  direction: string | null;
  serviceId: string;
  windows: FrequencyWindow[];
};
export type ScheduleData = {
  version: 1;
  provenance: Provenance;
  validFrom: string;
  validTo: string;
  calendars: Calendar[];
  exceptions: ServiceException[];
  trips: ScheduleTrip[];
};
