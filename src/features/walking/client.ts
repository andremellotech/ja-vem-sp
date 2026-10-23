import type { Point } from "../journey/types";
import { routeRoad } from "../routing/client";
export const routeWalking = (from: Point, to: Point, signal: AbortSignal) =>
  routeRoad("foot", from, to, signal);
export const routeDriving = (from: Point, to: Point, signal: AbortSignal) =>
  routeRoad("car", from, to, signal);
