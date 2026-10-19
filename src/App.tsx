import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BusFront,
  Check,
  ChevronRight,
  ExternalLink,
  Heart,
  Info,
  LocateFixed,
  MapPin,
  Navigation,
  Radio,
  Search,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import { request } from "./api/client";
import {
  ApiError,
  type Line,
  type Stop,
  type Vehicle,
  type Arrival,
} from "./contracts";
import TransitMap from "./features/map/TransitMap";
import {
  distanceM,
  loadNetwork,
  type NetStopIndex,
} from "./features/stops/network";
import {
  loadFavorites,
  saveFavorites,
  loadFavoriteLines,
  saveFavoriteLines,
} from "./features/favorites/storage";
const configuredBase =
  (import.meta as ImportMeta & { env: Record<string, string> }).env
    .VITE_API_BASE_URL || "";
const validStop = (s: Stop) =>
  !!s &&
  typeof s.lat === "number" &&
  typeof s.lon === "number" &&
  Number.isFinite(s.lat) &&
  Number.isFinite(s.lon);
const time = (v: string | null) =>
  v
    ? new Date(v).toLocaleTimeString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "não informado";
export default function App({
  apiBase = configuredBase,
}: {
  apiBase?: string;
}) {
  const [query, setQuery] = useState(""),
    [lines, setLines] = useState<Line[]>([]),
    [line, setLine] = useState<Line | null>(null),
    [stops, setStops] = useState<Stop[]>([]),
    [foundStops, setFoundStops] = useState<Stop[]>([]),
    [network, setNetwork] = useState<NetStopIndex | null>(null),
    [stopsBusy, setStopsBusy] = useState(false),
    [vehicles, setVehicles] = useState<Vehicle[]>([]),
    [stop, setStop] = useState<string | null>(null),
    [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [arrivalUpdated, setArrivalUpdated] = useState<string | null>(null),
    [arrivalObserved, setArrivalObserved] = useState<string | null>(null),
    [arrivalError, setArrivalError] = useState(false),
    [arrivalLoading, setArrivalLoading] = useState(false);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [searched, setSearched] = useState(false),
    [updated, setUpdated] = useState<string | null>(null),
    [observed, setObserved] = useState<string | null>(null),
    [online, setOnline] = useState(false),
    [tab, setTab] = useState<"search" | "favorites">("search"),
    [favorites, setFavorites] = useState<string[]>(() => {
      try {
        return loadFavorites(localStorage);
      } catch {
        return [];
      }
    }),
    [location, setLocation] = useState<[number, number] | null>(null),
    [notice, setNotice] = useState(""),
    [settings, setSettings] = useState(false);
  const [savedLines, setSavedLines] = useState<Line[]>(() => {
    try {
      return loadFavoriteLines(localStorage);
    } catch {
      return [];
    }
  });
  const dialogRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!settings) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = dialogRef.current;
    const items = () =>
      Array.from(
        node?.querySelectorAll<HTMLElement>(
          'button,a[href],input,[tabindex="0"]',
        ) || [],
      );
    items()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettings(false);
      if (e.key === "Tab") {
        const f = items(),
          first = f[0],
          last = f.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [settings]);
  useEffect(() => {
    const c = new AbortController();
    const base =
      (import.meta as ImportMeta & { env: Record<string, string> }).env
        .BASE_URL || "./";
    loadNetwork(base + "data/stops.json", c.signal)
      .then((n) => setNetwork(n))
      .catch(() => {});
    return () => c.abort();
  }, []);
  const searchController = useRef<AbortController | null>(null),
    generation = useRef(0);
  useEffect(() => {
    if (!apiBase) return;
    const c = new AbortController();
    fetch(apiBase.replace(/\/$/, "") + "/api/health", { signal: c.signal })
      .then((r) => r.json())
      .then((r) => setOnline(r.configured === true))
      .catch(() => setOnline(false));
    return () => c.abort();
  }, [apiBase]);
  useEffect(() => () => searchController.current?.abort(), []);
  const search = async (value = query) => {
    const q = value.trim();
    if (!q) return;
    setQuery(q);
    setTab("search");
    const current = ++generation.current;
    searchController.current?.abort();
    const c = new AbortController();
    searchController.current = c;
    setBusy(true);
    setError("");
    setSearched(true);
    setLine(null);
    setStops([]);
    setFoundStops([]);
    setVehicles([]);
    setStop(null);
    setLines([]);
    setStopsBusy(true);
    request<Stop[]>(apiBase, "/api/stops?q=" + encodeURIComponent(q), c.signal)
      .then((s) => {
        if (current === generation.current)
          setFoundStops(s.data.filter(validStop));
      })
      .catch(() => {})
      .finally(() => {
        if (current === generation.current) setStopsBusy(false);
      });
    try {
      const r = await request<Line[]>(
        apiBase,
        "/api/lines?q=" + encodeURIComponent(q),
        c.signal,
      );
      if (current === generation.current) {
        setLines(r.data);
        setOnline(true);
      }
    } catch (e) {
      if (current === generation.current && !c.signal.aborted)
        setError(
          e instanceof ApiError
            ? e.message
            : "Não foi possível conectar. Confira sua internet e tente novamente.",
        );
    } finally {
      if (current === generation.current) setBusy(false);
    }
  };
  useEffect(() => {
    if (!line) return;
    const c = new AbortController();
    let active = true;
    const id = line.id;
    setStops([]);
    setVehicles([]);
    setStop(null);
    setArrivals([]);
    setUpdated(null);
    setObserved(null);
    setError("");
    let running = false,
      stopsLoaded = false;
    async function refresh() {
      if (running || document.hidden) return;
      running = true;
      try {
        const [s, v] = await Promise.all([
          stopsLoaded
            ? null
            : request<Stop[]>(apiBase, "/api/lines/" + id + "/stops", c.signal),
          request<Vehicle[]>(
            apiBase,
            "/api/lines/" + id + "/vehicles",
            c.signal,
          ),
        ]);
        if (active) {
          if (s) {
            setStops(s.data);
            stopsLoaded = true;
          }
          setVehicles(v.data);
          setUpdated(v.fetchedAt);
          setObserved(v.observedAt);
          setError("");
        }
      } catch (e) {
        if (active && !c.signal.aborted)
          setError(
            e instanceof ApiError
              ? e.message
              : "Não foi possível atualizar os dados. As posições podem estar desatualizadas.",
          );
      } finally {
        running = false;
      }
    }
    void refresh();
    const timer = setInterval(refresh, 30000);
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      c.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [line, apiBase]);
  useEffect(() => {
    setArrivals([]);
    setArrivalUpdated(null);
    setArrivalObserved(null);
    setArrivalError(false);
    setArrivalLoading(false);
    if (!stop) return;
    const c = new AbortController();
    let active = true,
      running = false;
    async function refresh() {
      if (document.hidden || running) return;
      running = true;
      if (active) setArrivalLoading(true);
      try {
        const r = await request<Arrival[]>(
          apiBase,
          "/api/stops/" +
            stop +
            "/arrivals" +
            (line && stopsRef.current.some((s) => s.id === stop)
              ? "?lineId=" + line.id
              : ""),
          c.signal,
        );
        if (active) {
          setArrivals(r.data);
          setArrivalUpdated(r.fetchedAt);
          setArrivalObserved(r.observedAt);
          setArrivalError(false);
        }
      } catch {
        if (active && !c.signal.aborted) {
          setArrivals([]);
          setArrivalError(true);
          setArrivalUpdated(null);
          setArrivalObserved(null);
        }
      } finally {
        running = false;
        if (active) setArrivalLoading(false);
      }
    }
    void refresh();
    const timer = setInterval(refresh, 30000);
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      c.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [stop, line, apiBase]);
  const stopsRef = useRef<Stop[]>([]);
  stopsRef.current = stops;
  const selectStop = useCallback((id: string) => {
    setStop(id);
    setTab("search");
  }, []);
  function favorite(id: string) {
    const ids = favorites.includes(id)
      ? favorites.filter((x) => x !== id)
      : [...favorites, id];
    setFavorites(ids);
    const known =
      lines.find((l) => l.id === id) || savedLines.find((l) => l.id === id);
    const next = savedLines.filter((l) => l.id !== id);
    if (ids.includes(id) && known) next.push(known);
    setSavedLines(next);
    try {
      const ok = saveFavorites(localStorage, ids);
      const metadataOk = saveFavoriteLines(localStorage, next);
      if (!ok || !metadataOk)
        setNotice(
          "O navegador não permitiu salvar. Os favoritos valem apenas nesta sessão.",
        );
    } catch {
      setNotice("Favoritos disponíveis apenas nesta sessão.");
    }
  }
  function locate() {
    if (!navigator.geolocation) {
      setNotice(
        "Localização indisponível neste navegador. Você pode buscar uma linha manualmente.",
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocation([p.coords.latitude, p.coords.longitude]);
        setNotice(
          "Sua posição aparece em azul no mapa. Veja as paradas por perto ou busque uma linha ou parada.",
        );
      },
      () =>
        setNotice(
          "Não foi possível acessar sua localização. Você pode buscar uma linha manualmente.",
        ),
      { timeout: 10000, maximumAge: 60000 },
    );
  }
  const visibleLines =
    tab === "favorites"
      ? savedLines.filter((l) => favorites.includes(l.id))
      : lines;
  const mapStops = line ? stops : foundStops;
  const selectedStop: { id: string; name: string } | undefined =
    mapStops.find((s) => s.id === stop) ??
    (stop ? network?.byId.get(stop) : undefined);
  const nearby = useMemo(
    () =>
      network && location
        ? network.nearest(location[0], location[1], 600, 8)
        : [],
    [network, location],
  );
  const arrivalCard = selectedStop && (
    <div className="arrival-card">
      <span className="eyebrow">CHEGADAS NESTA PARADA</span>
      <h3>{selectedStop.name}</h3>
      {arrivals.length ? (
        arrivals.map((a, i) => (
          <div className="arrival" key={a.vehicleId + i}>
            <BusFront size={18} />
            <span>
              {a.lineCode}
              <small>Veículo {a.vehicleId}</small>
            </span>
            <strong>{a.expectedLocalTime || "—"}</strong>
          </div>
        ))
      ) : (
        <p>
          {arrivalError
            ? "Previsões indisponíveis nesta atualização."
            : arrivalLoading
              ? "Consultando previsões…"
              : "Nenhuma previsão disponível nesta consulta."}
        </p>
      )}
      <small>
        {arrivalUpdated && (
          <>
            Previsões consultadas às {time(arrivalUpdated)} · GPS{" "}
            {time(arrivalObserved)}.<br />
          </>
        )}
        {arrivalObserved &&
          Date.now() - Date.parse(arrivalObserved) > 120000 && (
            <>
              Previsões antigas — confirme antes de sair.
              <br />
            </>
          )}
        Horários previstos pela SPTrans, no fuso de São Paulo. Podem mudar.
      </small>
    </div>
  );
  const stale = observed && Date.now() - Date.parse(observed) > 120000;
  return (
    <>
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setLine(null);
          }}
          aria-label="Já Vem SP início"
        >
          <span className="brand-icon">
            <BusFront size={23} />
          </span>
          <span>
            já vem<span className="brand-sp">SP</span>
            <small>menos espera. mais caminho.</small>
          </span>
        </a>
        <nav aria-label="Principal">
          <button
            className={tab === "search" ? "nav-active" : ""}
            onClick={() => setTab("search")}
          >
            <Navigation size={16} /> Explorar
          </button>
          <button
            className={tab === "favorites" ? "nav-active" : ""}
            onClick={() => setTab("favorites")}
          >
            <Heart size={16} /> Favoritos{" "}
            <span className="count">{favorites.length}</span>
          </button>
        </nav>
        <div className="city">
          <span className="city-dot" />
          São Paulo, SP
          <span className="city-divider" />
          <span className="city-label">Ônibus municipais</span>
        </div>
      </header>
      <main className="app-layout">
        <aside className="sidebar">
          <div className="eyebrow">
            <span /> SEU DIA, EM MOVIMENTO
          </div>
          <h1>
            Seu próximo ônibus.
            <br />
            <em>Sem adivinhação.</em>
          </h1>
          <p className="intro">
            Encontre sua linha e acompanhe a chegada.
            <br />
            São Paulo fica mais perto quando você sabe.
          </p>
          <form
            className="search-box"
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <label htmlFor="line-search">PARA ONDE VOCÊ VAI?</label>
            <div className="search-input">
              <Search size={20} />
              <input
                id="line-search"
                aria-label="Linha ou destino"
                placeholder="Linha, parada ou endereço"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button type="submit" aria-label="Buscar ônibus">
                <ArrowRight size={21} />
              </button>
            </div>
          </form>
          <div className="quick-search">
            <span>Experimente</span>
            {["Paulista", "Pinheiros", "Lapa"].map((q) => (
              <button key={q} onClick={() => void search(q)}>
                {q}
                <ArrowUpRight size={12} />
              </button>
            ))}
          </div>
          <div className="section-title">
            <h2>
              {line
                ? "Sua linha"
                : tab === "favorites"
                  ? "Suas linhas favoritas"
                  : "Encontre seu caminho"}
            </h2>
            {line && (
              <button
                className="text-btn"
                onClick={() => {
                  setLine(null);
                  setError("");
                }}
              >
                Voltar
              </button>
            )}
          </div>
          <div className="panel-content" aria-live="polite">
            {busy && (
              <div className="loading">
                <span className="spinner" />
                Buscando linhas na SPTrans…
              </div>
            )}
            {error && (
              <div className="message error">
                <Info size={18} />
                <div>
                  <strong>Não foi possível consultar</strong>
                  <p>{error}</p>
                </div>
              </div>
            )}
            {line ? (
              <>
                <div className="selected-line">
                  <div className="line-badge">
                    <BusFront size={17} />
                    {line.code}
                  </div>
                  <button
                    className={
                      "icon-btn " +
                      (favorites.includes(line.id) ? "is-favorite" : "")
                    }
                    aria-label="Favoritar linha"
                    onClick={() => favorite(line.id)}
                  >
                    <Heart
                      size={19}
                      fill={
                        favorites.includes(line.id) ? "currentColor" : "none"
                      }
                    />
                  </button>
                  <h3>{line.destination}</h3>
                  <p>
                    De {line.origin} · sentido {line.direction}
                  </p>
                  <div className="line-metrics">
                    <span>
                      <Radio size={14} />
                      {vehicles.length} veículos informados
                    </span>
                    <span>
                      <MapPin size={14} />
                      {stops.length} paradas
                    </span>
                  </div>
                </div>
                {updated && (
                  <p className="data-time">
                    Consulta {time(updated)} · GPS {time(observed)}{" "}
                    {stale ? "· posições antigas" : ""}
                  </p>
                )}
                {arrivalCard}
                <div className="stop-list">
                  {stops.map((s, i) => (
                    <button
                      className={stop === s.id ? "stop selected" : "stop"}
                      key={s.id}
                      onClick={() => setStop(s.id)}
                    >
                      <span className="stop-number">{i + 1}</span>
                      <span>{s.name}</span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </div>
                {!stops.length && !error && (
                  <p className="muted">
                    Carregando paradas ou sem paradas informadas para esta
                    linha.
                  </p>
                )}
              </>
            ) : (
              <>
                {tab === "search" && arrivalCard}
                {tab === "search" && nearby.length > 0 && (
                  <>
                    <div className="guide-label">PARADAS PERTO DE VOCÊ</div>
                    <div className="stop-list">
                      {nearby.map((s) => (
                        <button
                          className={stop === s.id ? "stop selected" : "stop"}
                          key={s.id}
                          onClick={() => selectStop(s.id)}
                        >
                          <span className="stop-number">
                            <MapPin size={12} />
                          </span>
                          <span>
                            {s.name}
                            <small style={{ display: "block" }}>
                              {Math.round(
                                distanceM(
                                  location![0],
                                  location![1],
                                  s.lat,
                                  s.lon,
                                ),
                              )}{" "}
                              m{s.ref ? " · " + s.ref : ""}
                            </small>
                          </span>
                          <ChevronRight size={16} />
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {visibleLines.map((l) => (
                  <div className="line-result" key={l.id}>
                    <button
                      className="line-result-main"
                      onClick={() => setLine(l)}
                    >
                      <span className="line-code">
                        <BusFront size={15} />
                        {l.code}
                      </span>
                      <strong>{l.destination}</strong>
                      <small>
                        {l.origin} · sentido {l.direction}
                      </small>
                      <ChevronRight size={19} />
                    </button>
                    <button
                      className={
                        "favorite-btn " +
                        (favorites.includes(l.id) ? "is-favorite" : "")
                      }
                      onClick={() => favorite(l.id)}
                      aria-label={"Favoritar " + l.code}
                    >
                      <Heart
                        size={17}
                        fill={
                          favorites.includes(l.id) ? "currentColor" : "none"
                        }
                      />
                    </button>
                  </div>
                ))}
                {tab === "search" && foundStops.length > 0 && (
                  <>
                    <div className="guide-label">PARADAS ENCONTRADAS</div>
                    <div className="stop-list">
                      {foundStops.map((s) => (
                        <button
                          className={stop === s.id ? "stop selected" : "stop"}
                          key={s.id}
                          onClick={() => setStop(s.id)}
                        >
                          <span className="stop-number">
                            <MapPin size={12} />
                          </span>
                          <span>
                            {s.name}
                            {s.address && (
                              <small style={{ display: "block" }}>
                                {s.address}
                              </small>
                            )}
                          </span>
                          <ChevronRight size={16} />
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {!busy &&
                  !stopsBusy &&
                  !error &&
                  searched &&
                  tab === "search" &&
                  !lines.length &&
                  !foundStops.length && (
                    <div className="empty-state">
                      <Search />
                      <h3>Nenhuma linha ou parada encontrada</h3>
                      <p>Tente outro número, nome de parada ou endereço.</p>
                    </div>
                  )}
                {tab === "favorites" && !visibleLines.length && (
                  <div className="empty-state">
                    <Heart />
                    <h3>Seu caminho, sempre à mão</h3>
                    <p>
                      {favorites.length
                        ? "Busque novamente suas linhas para atualizar os favoritos salvos anteriormente."
                        : "Toque no coração de uma linha para guardá-la neste navegador."}
                    </p>
                  </div>
                )}
                {!searched && tab === "search" && (
                  <>
                    <button className="discovery-card" onClick={locate}>
                      <span className="discovery-icon">
                        <LocateFixed size={23} />
                      </span>
                      <span>
                        <strong>Comece por onde você está</strong>
                        <small>Localize-se no mapa e busque sua linha</small>
                      </span>
                      <ArrowUpRight size={19} />
                    </button>
                    <div className="guide-label">É SIMPLES CHEGAR LÁ</div>
                    <div className="steps">
                      <div>
                        <span>01</span>
                        <p>
                          <strong>Encontre sua linha</strong>
                          <small>Busque pelo número ou destino.</small>
                        </p>
                      </div>
                      <div>
                        <span>02</span>
                        <p>
                          <strong>Escolha sua parada</strong>
                          <small>Veja os pontos e os veículos no mapa.</small>
                        </p>
                      </div>
                      <div>
                        <span>03</span>
                        <p>
                          <strong>Acompanhe a chegada</strong>
                          <small>Consulte as previsões disponíveis.</small>
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
          <div className="sidebar-bottom">
            <ShieldCheck size={17} />
            <span>
              Dados oficiais. Viagens mais tranquilas.
              <small>Fonte: SPTrans · Olho Vivo</small>
            </span>
            <ArrowUpRight size={16} />
          </div>
        </aside>
        <section className="map-section" aria-label="Explorar mapa">
          <TransitMap
            network={network}
            stops={mapStops}
            vehicles={vehicles}
            selectedStop={stop}
            onSelectStop={selectStop}
            location={location}
          />
          <div className="map-top">
            <div className="map-title">
              <span className="map-title-icon">
                <MapPin size={18} />
              </span>
              <span>
                São Paulo<small>Uma cidade. Muitos caminhos.</small>
              </span>
            </div>
            <div className={"connection-pill " + (online ? "connected" : "")}>
              <span />
              {online ? "SPTrans conectada" : "Dados ao vivo não conectados"}
            </div>
          </div>
          <div className="map-controls">
            <button
              onClick={locate}
              aria-label="Minha localização"
              title="Minha localização"
            >
              <LocateFixed size={21} />
            </button>
            <button
              onClick={() => setSettings(true)}
              aria-label="Configurações e informações"
              title="Informações"
            >
              <Settings2 size={20} />
            </button>
          </div>
          {!line && (
            <div className="map-callout">
              <span className="callout-icon">
                <BusFront size={27} />
              </span>
              <div>
                <span className="eyebrow">O PRÓXIMO PASSO É SEU</span>
                <h2>
                  A cidade não para.
                  <br />
                  Você não precisa esperar no escuro.
                </h2>
                <p>Busque uma linha ou parada para descobrir seu caminho.</p>
              </div>
              <ArrowUpRight className="callout-arrow" size={24} />
            </div>
          )}
          <div className="map-bottom">
            <div className="legend">
              <span className="legend-stop" />
              Paradas
              <span className="legend-bus" />
              Ônibus
              <span className="legend-location" />
              Você
            </div>
            <button className="connect-btn" onClick={() => setSettings(true)}>
              {online ? <Check size={15} /> : <Info size={15} />}{" "}
              {online ? "Sobre os dados" : "Conectar dados"}
              <ArrowUpRight size={14} />
            </button>
          </div>
        </section>
      </main>
      <footer>
        <span>FEITO PARA QUEM MOVE SÃO PAULO.</span>
        <span>
          Já Vem SP <span className="footer-dot">●</span> Seu tempo também
          importa.
        </span>
        <a
          href="https://www.sptrans.com.br/desenvolvedores/"
          target="_blank"
          rel="noreferrer"
        >
          Sobre a fonte dos dados <ExternalLink size={12} />
        </a>
      </footer>
      {notice && (
        <div className="toast" role="status">
          <Info size={18} />
          <span>{notice}</span>
          <button onClick={() => setNotice("")} aria-label="Fechar aviso">
            <X size={17} />
          </button>
        </div>
      )}
      {settings && (
        <div className="modal-backdrop" onClick={() => setSettings(false)}>
          <section
            ref={dialogRef}
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-btn"
              onClick={() => setSettings(false)}
              aria-label="Fechar informações"
            >
              <X />
            </button>
            <span className="modal-icon">
              <BusFront size={26} />
            </span>
            <h2 id="settings-title">Seu caminho começa com dados reais.</h2>
            <p>
              O Já Vem SP consulta linhas, paradas, posições e previsões da
              SPTrans. Nenhum ônibus ou horário é simulado.
            </p>
            <div className="config-state">
              <span className={online ? "green-dot" : "amber-dot"} />
              <strong>
                {online ? "API conectada" : "Conexão ainda não configurada"}
              </strong>
            </div>
            <p>
              Para ativar, o responsável pelo site deve publicar a API,
              configurar o token da SPTrans como segredo e definir{" "}
              <code>VITE_API_BASE_URL</code> no build da interface.
            </p>
            <p>
              O mapa usa OpenStreetMap. Favoritos são salvos apenas neste
              navegador. Rotas completas, metrô, trens e bilhetagem ainda não
              estão integrados.
            </p>
            <a
              className="primary-link"
              href="https://www.sptrans.com.br/desenvolvedores/"
              target="_blank"
              rel="noreferrer"
            >
              Portal da SPTrans <ArrowUpRight size={17} />
            </a>
          </section>
        </div>
      )}
    </>
  );
}
