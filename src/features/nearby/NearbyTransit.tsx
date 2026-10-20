import { useEffect, useState } from "react";
import type { Stop } from "../../contracts";
import type { Point } from "../journey/types";
import type { PlannerIndex } from "../journey/data";
import { loadLineIndex } from "../journey/line-stops";
import { serviceDateInSaoPaulo } from "../journey/calendar";
import { distanceM } from "../stops/network";
import { findNearbyTransit } from "./nearby";
type Props = {
  location: Point | null;
  onLocate: () => Promise<Point | null>;
  onSelectStop: (stop: Stop) => void;
  onSelectLine: (code: string) => void;
  onStopsChange: (stops: Stop[]) => void;
  active?: boolean;
};
export default function NearbyTransit({
  location,
  onLocate,
  onSelectStop,
  onSelectLine,
  onStopsChange,
  active = true,
}: Props) {
  const [index, setIndex] = useState<PlannerIndex | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [locating, setLocating] = useState(false),
    [radius, setRadius] = useState(800),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    setRadius(800);
  }, [location?.lat, location?.lon]);
  useEffect(() => {
    if (!active || !location) return;
    let alive = true;
    setLoading(true);
    setError("");
    loadLineIndex(new URL(import.meta.env.BASE_URL, window.location.href).href)
      .then((v) => {
        if (alive) setIndex(v);
      })
      .catch((e) => {
        if (alive)
          setError(
            e instanceof Error
              ? e.message
              : "Não foi possível carregar a rede.",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [active, !!location, retry]);
  const [result, setResult] = useState<ReturnType<
    typeof findNearbyTransit
  > | null>(null);
  useEffect(() => {
    if (!active) return;
    if (!index || !location) {
      setResult(null);
      onStopsChange([]);
      return;
    }
    try {
      const found = findNearbyTransit(
        index,
        location,
        serviceDateInSaoPaulo(new Date()),
        radius,
      );
      setResult(found);
      setError("");
      onStopsChange(found.stops.slice(0, 8));
    } catch (e) {
      setResult(null);
      onStopsChange([]);
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível consultar proximidade.",
      );
    }
  }, [index, location?.lat, location?.lon, radius, active, onStopsChange]);
  async function locate() {
    setLocating(true);
    try {
      const p = await onLocate();
      if (!p)
        setError(
          "Não foi possível usar sua localização. Você pode buscar uma linha ou informar endereços no modo Trajeto.",
        );
    } catch {
      setError("Localização indisponível. Informe endereços no modo Trajeto.");
    } finally {
      setLocating(false);
    }
  }
  if (!active) return null;
  return (
    <section className="nearby-transit" aria-label="Transporte perto de mim">
      <h2>Ônibus perto de você</h2>
      <p>
        Sua posição é usada neste navegador. Distâncias em linha reta; confira o
        acesso às paradas.
      </p>
      <button
        className="nearby-locate"
        type="button"
        disabled={locating}
        onClick={() => void locate()}
      >
        {locating
          ? "Localizando…"
          : location
            ? "Atualizar minha localização"
            : "Usar minha localização"}
      </button>
      <div aria-live="polite">
        {loading && <p>Carregando a rede de ônibus…</p>}
        {error && (
          <div role="alert">
            <p>{error}</p>
            {location && (
              <button onClick={() => setRetry((n) => n + 1)}>
                Tentar novamente
              </button>
            )}
          </div>
        )}
        {result && !error && (
          <>
            <p>
              Calendário de hoje · alcance de {radius === 800 ? "800" : "1.200"}{" "}
              m. A operação neste horário não está confirmada.
            </p>
            {!result.stops.length && (
              <p>Nenhuma parada de ônibus encontrada neste alcance.</p>
            )}
            <h3>Paradas próximas</h3>
            <div className="nearby-list">
              {result.stops.slice(0, 8).map((s) => (
                <button key={s.id} onClick={() => onSelectStop(s)}>
                  <strong>{s.name}</strong>
                  <small>
                    {Math.round(
                      distanceM(location!.lat, location!.lon, s.lat, s.lon),
                    )}{" "}
                    m · Ver chegadas nesta parada
                  </small>
                </button>
              ))}
            </div>
            <h3>Linhas próximas</h3>
            <div className="nearby-list">
              {result.lines.slice(0, 8).map((l) => (
                <button
                  key={l.code + "|" + l.headsign}
                  onClick={() => onSelectLine(l.code)}
                >
                  <strong>
                    {l.code} · {l.headsign}
                  </strong>
                  <small>
                    {l.stop.name} · {Math.round(l.distanceM)} m · Consultar
                    linha
                  </small>
                </button>
              ))}
            </div>
            {radius === 800 && (
              <button className="nearby-expand" onClick={() => setRadius(1200)}>
                Ampliar busca para 1.200 m
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
