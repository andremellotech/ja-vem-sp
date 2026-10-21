import type { GoogleEmbedSelection } from "./types";
import type { Point } from "../journey/types";
export function buildGoogleEmbedUrl(
  selection: GoogleEmbedSelection,
  key: string,
): string | null {
  const valid = (p: Point) =>
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lon) <= 180;
  if (
    !key.trim() ||
    !valid(selection.origin) ||
    !valid(selection.destination) ||
    !["walking", "transit"].includes(selection.mode)
  )
    return null;
  const point = (p: Point) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
  const url = new URL("https://www.google.com/maps/embed/v1/directions");
  url.search = new URLSearchParams({
    key: key.trim(),
    origin: point(selection.origin),
    destination: point(selection.destination),
    mode: selection.mode,
    language: "pt-BR",
    region: "BR",
    units: "metric",
  }).toString();
  return url.href;
}
