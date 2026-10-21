import type { Point } from "../journey/types";
export type GoogleEmbedSelection = {
  origin: Point;
  destination: Point;
  mode: "walking" | "transit";
};
