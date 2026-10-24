import type { Point } from "./types";

function coordinates(value: string): Point | null {
  const parts = value.trim().includes(";")
    ? value
        .trim()
        .split(";")
        .map((p) => p.trim().replace(",", "."))
    : value
        .trim()
        .split(",")
        .map((p) => p.trim());
  if (parts.length !== 2 || parts.some((p) => !/^-?\d+(?:\.\d+)?$/.test(p)))
    return null;
  const [lat, lon] = parts.map(Number);
  return Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
    ? { lat, lon }
    : null;
}

// Read only the point the person pasted. Never fetch a URL or resolve a short link.
export function parseMapPoint(input: string): Point {
  const value = input.trim();
  const direct = coordinates(value);
  if (direct) return direct;
  const invalid = () =>
    new Error(
      "Cole latitude e longitude válidas, como -23.5614, -46.6559, ou um link Google Maps que contenha o ponto.",
    );
  if (!value || value.length > 4096) throw invalid();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalid();
  }
  if (url.protocol !== "https:" || url.username || url.password)
    throw invalid();
  if (url.hostname === "maps.app.goo.gl" || url.hostname === "goo.gl")
    throw new Error(
      "O link curto não contém as coordenadas. No Google Maps, copie a latitude e longitude do local e cole aqui.",
    );
  if (!/^(?:(?:www|maps)\.)?google\.(?:com|com\.br)$/.test(url.hostname))
    throw invalid();
  if (/\/maps\/dir(?:\/|$)/.test(url.pathname))
    throw new Error(
      "Esse link contém uma rota. Copie as coordenadas de um único ponto de origem ou destino.",
    );
  for (const name of ["query", "q"]) {
    const point = coordinates(url.searchParams.get(name) ?? "");
    if (point) return point;
  }
  // A place URL can contain a viewport (@) and a different place (!3d/!4d).
  if (url.pathname.startsWith("/maps/place/")) {
    const pairs = [
      ...decodeURIComponent(url.pathname).matchAll(
        /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g,
      ),
    ];
    if (pairs.length === 1) {
      const point = coordinates(pairs[0][1] + "," + pairs[0][2]);
      if (point) return point;
    }
  }
  throw new Error(
    "O link não contém as coordenadas do local; o centro da tela não confirma uma entrada. No Google Maps, copie latitude e longitude do ponto e cole aqui.",
  );
}
