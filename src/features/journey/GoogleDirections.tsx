import { ExternalLink, Footprints, TrainFront } from "lucide-react";
import type { Point } from "./types";

function directions(from: Point, to: Point, mode: "walking" | "transit") {
  const valid = (point: Point) =>
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lon) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lon) <= 180;
  if (!valid(from) || !valid(to)) return null;
  const coordinate = (point: Point) =>
    `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`;
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", coordinate(from));
  url.searchParams.set("destination", coordinate(to));
  url.searchParams.set("travelmode", mode);
  return url.href;
}

export function WalkingDirections({
  from,
  to,
  label,
}: {
  from: Point;
  to: Point;
  label: string;
}) {
  const href = directions(from, to, "walking");
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} no Google Maps`}
    >
      <Footprints size={16} />
      {label}
      <ExternalLink size={13} />
    </a>
  ) : null;
}

export default function GoogleDirections({
  origin,
  destination,
}: {
  origin: Point | null;
  destination: Point | null;
}) {
  if (!origin || !destination) return null;
  const transit = directions(origin, destination, "transit");
  if (!transit) return null;
  return (
    <section className="google-directions" aria-label="Outras formas de chegar">
      <h3>Compare no Google Maps</h3>
      <p>
        Caminhada e transporte público, incluindo metrô e trem quando
        disponíveis.
      </p>
      <div className="google-directions-links">
        <WalkingDirections from={origin} to={destination} label="A pé" />
        <a
          href={transit}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Transporte público no Google Maps"
        >
          <TrainFront size={16} />
          Transporte público
          <ExternalLink size={13} />
        </a>
      </div>
      <p className="google-directions-privacy">
        Abre o Google Maps em outra aba. Ao clicar nesses links, os pontos
        confirmados são enviados ao Google, inclusive a localização se você a
        usou. Posições e chegadas dos ônibus neste site continuam pela SPTrans.
      </p>
    </section>
  );
}
