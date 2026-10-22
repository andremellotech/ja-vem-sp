import type { Point } from "../journey/types";
export type WalkingStep = {
  name: string;
  distanceM: number;
  type: string;
  modifier?: string;
  exit?: number;
};
export type WalkingRoute = {
  distanceM: number;
  durationS: number;
  points: Point[];
  steps: WalkingStep[];
  startGapM?: number;
  endGapM?: number;
};
