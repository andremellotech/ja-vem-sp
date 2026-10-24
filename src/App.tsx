import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowLeftRight,
  ArrowUpRight,
  BusFront,
  Check,
  ChevronRight,
  ExternalLink,
  Heart,
  Info,
  LocateFixed,
  List,
  Map,
  MapPin,
  Navigation,
  Radio,
  RefreshCw,
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
import StopPicker from "./features/stops/StopPicker";
import JourneyPlanner from "./features/journey/JourneyPlanner";
import GoogleEmbedMap from "./features/google-embed/GoogleEmbedMap";
import type { GoogleEmbedSelection } from "./features/google-embed/types";
import LineSearch from "./features/lines/LineSearch";
import NearbyTransit from "./features/nearby/NearbyTransit";
import LineSchedule from "./features/schedules/LineSchedule";
import type {
  JourneyMapSelection,
  JourneyFocus,
  Point,
} from "./features/journey/types";
import JourneySteps from "./features/journey/JourneySteps";
import { loadStopsForLine } from "./features/journey/line-stops";
import { loadNetwork, type NetStopIndex } from "./features/stops/network";
import { searchTransit } from "./features/search/transit";
import { useJourneyVehicles } from "./features/journey/useJourneyVehicles";
import JourneyVehiclesStatus from "./features/journey/JourneyVehiclesStatus";
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
  googleEmbedKey = import.meta.env.VITE_GOOGLE_EMBED_API_KEY || "",
}: {
  apiBase?: string;
  googleEmbedKey?: string;
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
  const [view, setView] = useState<"list" | "map">("list");
  const [mode, setMode] = useState<"journey" | "nearby" | "lines">("journey");
  const [journeySelection, setJourneySelectionState] =
    useState<JourneyMapSelection | null>(null);
  const [journeyFocus, setJourneyFocus] = useState<JourneyFocus | null>(null);
  const journeyId = useRef<string | undefined>(undefined);
  const focusRequest = useRef(0);
  const setJourneySelection = useCallback(
    (selection: JourneyMapSelection | null) => {
      if (selection?.id !== journeyId.current) setJourneyFocus(null);
      journeyId.current = selection?.id;
      setJourneySelectionState(selection);
    },
    [],
  );
  function focusJourneyStep(stepId: string | null) {
    if (!journeySelection?.id) return;
    setJourneyFocus({
      journeyId: journeySelection.id,
      stepId,
      request: ++focusRequest.current,
    });
    setView("map");
  }
  const [googleSelection, setGoogleSelection] =
    useState<GoogleEmbedSelection | null>(null);
  const journeyFleet = useJourneyVehicles(
    journeySelection?.busLegs,
    apiBase,
    new URL(import.meta.env.BASE_URL || "./", window.location.href).href,
  );
  const [lineLoading, setLineLoading] = useState(false);
  const [stopStatus, setStopStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [lineStopNote, setLineStopNote] = useState("");
  const [searchNote, setSearchNote] = useState("");
  const [searchIncomplete, setSearchIncomplete] = useState(false);
  const [lineCount, setLineCount] = useState(20);
  const [stopCount, setStopCount] = useState(20);
  const networkRequest = useRef<Promise<NetStopIndex | null>>(
    Promise.resolve(null),
  );
  const [switching, setSwitching] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const lineRefresh = useRef<(() => Promise<void>) | null>(null);
  const arrivalRefresh = useRef<(() => Promise<void>) | null>(null);
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
    networkRequest.current = loadNetwork(
      base + "data/stops.json",
      c.signal,
    ).catch(() => null);
    networkRequest.current.then((n) => {
      if (!c.signal.aborted) setNetwork(n);
    });
    return () => c.abort();
  }, []);
  const searchController = useRef<AbortController | null>(null),
    generation = useRef(0);
  const cancelSearch = useCallback(() => {
    generation.current++;
    searchController.current?.abort();
    setBusy(false);
    setStopsBusy(false);
    setSwitching(false);
  }, []);
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
  function showTab(next: "search" | "favorites") {
    generation.current++;
    searchController.current?.abort();
    setBusy(false);
    setStopsBusy(false);
    setSwitching(false);
    setLine(null);
    setStops([]);
    setVehicles([]);
    setStop(null);
    setError("");
    setSearchNote("");
    setSearchIncomplete(false);
    setTab(next);
    setView("list");
    setJourneySelection(null);
    setGoogleSelection(null);
  }
  function changeMode(next: "journey" | "nearby" | "lines") {
    showTab("search");
    setMode(next);
  }
  function showJourneyArrivals(selected: Stop, selection = journeySelection) {
    if (selection?.railStopIds?.includes(selected.id)) return;
    showTab("search");
    setMode("lines");
    setFoundStops([selected]);
    setStop(selected.id);
    setJourneySelection(selection);
  }
  function editQuery(value: string) {
    generation.current++;
    searchController.current?.abort();
    setBusy(false);
    setStopsBusy(false);
    setSwitching(false);
    setSearched(false);
    setError("");
    setSearchNote("");
    setSearchIncomplete(false);
    setLines([]);
    setFoundStops([]);
    setLine(null);
    setStops([]);
    setVehicles([]);
    setStop(null);
    setJourneySelection(null);
    setGoogleSelection(null);
    setQuery(value);
  }
  function selectLine(selected: Line) {
    editQuery(selected.code);
    setLines([selected]);
    setLine(selected);
  }
  const search = async (value = query) => {
    const q = value.trim();
    if (!q) return;
    setQuery(q);
    setTab("search");
    setView("list");
    setSwitching(false);
    const current = ++generation.current;
    searchController.current?.abort();
    const c = new AbortController();
    searchController.current = c;
    setBusy(true);
    setError("");
    setSearchNote("");
    setSearchIncomplete(false);
    setLineCount(20);
    setStopCount(20);
    setSearched(true);
    setLine(null);
    setStops([]);
    setFoundStops([]);
    setJourneySelection(null);
    setGoogleSelection(null);
    setVehicles([]);
    setStop(null);
    setLines([]);
    setStopsBusy(true);
    await searchTransit({
      query: q,
      base: new URL(import.meta.env.BASE_URL, window.location.href).href,
      apiBase,
      network: network ? Promise.resolve(network) : networkRequest.current,
      signal: c.signal,
      onUpdate: (result) => {
        if (current !== generation.current || c.signal.aborted) return;
        setLines(result.lines);
        setFoundStops(result.stops);
        setBusy(result.linesLoading);
        setStopsBusy(result.stopsLoading);
        setSearchNote(result.note);
        setSearchIncomplete(result.incomplete);
        if (result.liveLinesReady) setOnline(true);
      },
    });
  };
  useEffect(() => {
    if (!line) return;
    const c = new AbortController();
    let active = true;
    const id = line.id;
    const selectedLine = line;
    const staticBase = new URL(import.meta.env.BASE_URL, window.location.href)
      .href;
    setStops([]);
    setStopStatus("loading");
    setLineStopNote("");
    setJourneySelection(null);
    setGoogleSelection(null);
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
      if (active) setLineLoading(true);
      try {
        const issues: string[] = [];
        const issue = (e: unknown, fallback: string) => {
          if (!active || c.signal.aborted) return;
          issues.push(e instanceof Error ? e.message : fallback);
          setError(issues.join(" "));
        };
        await Promise.allSettled([
          stopsLoaded
            ? Promise.resolve()
            : loadStopsForLine(selectedLine, staticBase, apiBase, c.signal)
                .then((s) => {
                  if (!active) return;
                  setStops(s.stops);
                  setStopStatus("ready");
                  setLineStopNote(s.note);
                  stopsLoaded = s.source === "gtfs";
                })
                .catch((e) => {
                  if (active) setStopStatus("error");
                  issue(e, "As paradas estão indisponíveis.");
                }),
          request<Vehicle[]>(
            apiBase,
            "/api/lines/" + id + "/vehicles",
            c.signal,
          )
            .then((v) => {
              if (!active) return;
              setVehicles(v.data);
              setUpdated(v.fetchedAt);
              setObserved(v.observedAt);
              setOnline(true);
            })
            .catch((e) => issue(e, "Não foi possível atualizar os veículos.")),
        ]);
        if (active) setError(issues.join(" "));
      } catch (e) {
        if (active && !c.signal.aborted)
          setError(
            e instanceof ApiError
              ? e.message
              : "Não foi possível atualizar os dados. As posições podem estar desatualizadas.",
          );
      } finally {
        running = false;
        if (active) setLineLoading(false);
      }
    }
    lineRefresh.current = refresh;
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
      lineRefresh.current = null;
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
    arrivalRefresh.current = refresh;
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
      arrivalRefresh.current = null;
      document.removeEventListener("visibilitychange", visible);
    };
  }, [stop, line, apiBase]);
  const stopsRef = useRef<Stop[]>([]);
  stopsRef.current = stops;
  const selectStop = useCallback(
    (id: string) => {
      cancelSearch();
      setStop(id);
      setTab("search");
      setView("list");
    },
    [cancelSearch],
  );
  async function refreshNow() {
    if (manualRefreshing) return;
    setManualRefreshing(true);
    try {
      await Promise.all([lineRefresh.current?.(), arrivalRefresh.current?.()]);
    } finally {
      setManualRefreshing(false);
    }
  }
  async function switchDirection() {
    if (!line || switching) return;
    const current = ++generation.current;
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    setSwitching(true);
    setError("");
    const opposite = (candidate: Line) =>
      candidate.code === line.code &&
      candidate.direction !== line.direction &&
      candidate.id !== line.id;
    try {
      let next = [...lines, ...savedLines].find(opposite);
      if (!next) {
        const response = await request<Line[]>(
          apiBase,
          "/api/lines?q=" + encodeURIComponent(line.code),
          controller.signal,
        );
        if (current !== generation.current || controller.signal.aborted) return;
        next = response.data.find(opposite);
        setLines(response.data);
      }
      if (current !== generation.current || controller.signal.aborted) return;
      if (next) setLine(next);
      else setError("O sentido oposto não está disponível nesta consulta.");
    } catch (e) {
      if (current === generation.current && !controller.signal.aborted)
        setError(
          e instanceof ApiError
            ? e.message
            : "Não foi possível consultar o outro sentido. Tente novamente.",
        );
    } finally {
      if (current === generation.current) setSwitching(false);
    }
  }
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
  async function locate(): Promise<Point | null> {
    if (!navigator.geolocation) {
      setNotice(
        "Localização indisponível neste navegador. Você pode buscar uma linha manualmente.",
      );
      return null;
    }
    return new Promise((resolve) =>
      navigator.geolocation.getCurrentPosition(
        (p) => {
          setLocation([p.coords.latitude, p.coords.longitude]);
          setNotice(
            "Sua posição aparece em azul no mapa. Veja as paradas por perto ou busque uma linha ou parada.",
          );
          resolve({ lat: p.coords.latitude, lon: p.coords.longitude });
        },
        () => {
          setNotice(
            "Não foi possível acessar sua localização. Você pode buscar uma linha manualmente.",
          );
          resolve(null);
        },
        { timeout: 10000, maximumAge: 60000 },
      ),
    );
  }
  const isJourney = mode === "journey" && tab === "search";
  const isNearby = mode === "nearby" && tab === "search";
  const visibleLines =
    tab === "favorites"
      ? savedLines.filter((l) => favorites.includes(l.id))
      : lines;
  const mapStops = line
    ? stops
    : mode === "lines" && tab === "search"
      ? foundStops.slice(0, stopCount)
      : foundStops;
  const selectedStop: { id: string; name: string } | undefined =
    mapStops.find((s) => s.id === stop) ??
    (stop ? network?.byId.get(stop) : undefined);
  const arrivalCard = selectedStop && (
    <div className="arrival-card">
      <span className="eyebrow">PREVISÕES AO VIVO NESTA PARADA</span>
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
            showTab("search");
            setMode("journey");
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
            onClick={() => changeMode("journey")}
            aria-pressed={tab === "search"}
          >
            <Navigation size={16} /> Explorar
          </button>
          <button
            className={tab === "favorites" ? "nav-active" : ""}
            onClick={() => showTab("favorites")}
            aria-pressed={tab === "favorites"}
          >
            <Heart size={16} /> Favoritos{" "}
            <span className="count">{favorites.length}</span>
          </button>
        </nav>
        <div className="city">
          <span className="city-dot" />
          São Paulo, SP
          <span className="city-divider" />
          <span className="city-label">Transporte público</span>
        </div>
      </header>
      <div
        className="mobile-view-switch"
        role="group"
        aria-label="Visualização"
      >
        <button
          onClick={() => setView("list")}
          aria-pressed={view === "list"}
          aria-controls={
            isJourney
              ? "journey-panel"
              : isNearby
                ? "nearby-panel"
                : "line-panel"
          }
        >
          <List size={18} /> Lista
        </button>
        <button
          onClick={() => setView("map")}
          aria-pressed={view === "map"}
          aria-controls="map-panel"
        >
          <Map size={18} /> Mapa
        </button>
      </div>
      <main
        className={
          "app-layout " +
          (isJourney
            ? "journey-layout"
            : line
              ? "has-line"
              : searched
                ? "has-results"
                : "")
        }
        data-view={view}
      >
        <aside className="sidebar">
          <div className="eyebrow">
            <span /> SEU DIA, EM MOVIMENTO
          </div>
          <h1>
            {isJourney ? "De onde você sai." : "Seu próximo ônibus."}
            <br />
            <em>{isJourney ? "Aonde quer chegar." : "Sem adivinhação."}</em>
          </h1>
          <p className="intro">
            {isJourney
              ? "Dois endereços. Caminhe ou vá de ônibus, metrô e trem."
              : "Encontre sua linha e acompanhe a chegada."}
            <br />
            São Paulo fica mais perto quando você sabe.
          </p>
          <div
            className="journey-mode-switch"
            role="group"
            aria-label="Tipo de busca"
          >
            <button
              type="button"
              aria-pressed={isJourney}
              onClick={() => changeMode("journey")}
            >
              Trajeto
            </button>
            <button
              type="button"
              aria-pressed={isNearby}
              onClick={() => changeMode("nearby")}
            >
              Perto de mim
            </button>
            <button
              type="button"
              aria-pressed={mode === "lines" || tab === "favorites"}
              onClick={() => changeMode("lines")}
            >
              Linhas e horários
            </button>
          </div>
          <div className="journey-pane" id="journey-panel" hidden={!isJourney}>
            {!!journeySelection?.busLegs?.length && (
              <JourneyVehiclesStatus fleet={journeyFleet} />
            )}
            <JourneyPlanner
              addressApiBase={apiBase}
              active={isJourney}
              deviceLocation={
                location ? { lat: location[0], lon: location[1] } : null
              }
              googleEmbedKey={googleEmbedKey}
              onGoogleSelection={setGoogleSelection}
              onSearchBus={(code) => {
                changeMode("lines");
                void search(code);
              }}
              onMapSelection={setJourneySelection}
              onFocusStep={focusJourneyStep}
              retainedJourneyId={journeySelection?.id}
              onShowArrivals={showJourneyArrivals}
              onLocate={locate}
              onShowMap={() => setView("map")}
            />
          </div>
          <div className="nearby-pane" id="nearby-panel" hidden={!isNearby}>
            <NearbyTransit
              active={isNearby}
              location={
                location ? { lat: location[0], lon: location[1] } : null
              }
              onLocate={locate}
              onSelectStop={(s) => showJourneyArrivals(s, null)}
              onSelectLine={(code) => {
                changeMode("lines");
                void search(code);
              }}
              onStopsChange={setFoundStops}
            />
          </div>
          <div className="lines-pane" hidden={isJourney || isNearby}>
            <LineSearch
              value={query}
              onChange={editQuery}
              onSubmit={() => void search()}
              onSelect={selectLine}
              active={!isJourney && !isNearby}
            />
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
                <button className="text-btn" onClick={() => showTab(tab)}>
                  Voltar
                </button>
              )}
            </div>
            <div className="panel-content" id="line-panel" aria-live="polite">
              {busy && (
                <div className="loading">
                  <span className="spinner" />
                  Buscando linhas e paradas…
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
              {searchNote && !line && tab === "search" && (
                <p className="search-note" role="status">
                  {searchNote}
                </p>
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
                      aria-label={
                        favorites.includes(line.id)
                          ? "Remover linha dos favoritos"
                          : "Favoritar linha"
                      }
                      aria-pressed={favorites.includes(line.id)}
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
                        {updated
                          ? `${vehicles.length} veículos informados`
                          : error
                            ? "Frota indisponível"
                            : "Consultando frota…"}
                      </span>
                      <span>
                        <MapPin size={14} />
                        {stopStatus === "ready"
                          ? `${stops.length} paradas`
                          : stopStatus === "error"
                            ? "Paradas indisponíveis"
                            : "Consultando paradas…"}
                      </span>
                    </div>
                  </div>
                  <div className="line-actions">
                    <button
                      onClick={() => void switchDirection()}
                      disabled={switching}
                    >
                      <ArrowLeftRight size={16} />{" "}
                      {switching ? "Consultando sentido…" : "Trocar sentido"}
                    </button>
                    <button
                      onClick={() => void refreshNow()}
                      disabled={
                        manualRefreshing || lineLoading || arrivalLoading
                      }
                    >
                      <RefreshCw
                        size={16}
                        className={manualRefreshing ? "refresh-spin" : ""}
                      />
                      {manualRefreshing ? "Atualizando…" : "Atualizar agora"}
                    </button>
                  </div>
                  {updated && (
                    <p className="data-time">
                      Consulta {time(updated)} · GPS {time(observed)}{" "}
                      {stale ? "· posições antigas" : ""}
                    </p>
                  )}
                  <LineSchedule line={line} />
                  {arrivalCard}
                  {lineStopNote && (
                    <p className="line-stop-note">{lineStopNote}</p>
                  )}
                  {!!stops.length && (
                    <StopPicker
                      key={line.id}
                      stops={stops}
                      selectedId={stop}
                      onSelect={selectStop}
                      location={location}
                      onLocate={locate}
                    />
                  )}

                  {!stops.length && !error && (
                    <p className="muted">
                      {lineLoading
                        ? "Consultando paradas na SPTrans…"
                        : "A SPTrans não informou paradas para esta linha nesta consulta."}
                    </p>
                  )}
                </>
              ) : (
                <>
                  {tab === "search" && arrivalCard}
                  {tab === "search" && searched && !!lines.length && (
                    <p className="search-count">
                      {Math.min(lineCount, lines.length)} de {lines.length}{" "}
                      linhas e sentidos encontrados
                    </p>
                  )}
                  {visibleLines
                    .slice(
                      0,
                      tab === "favorites" ? visibleLines.length : lineCount,
                    )
                    .map((l) => (
                      <div className="line-result" key={l.id}>
                        <button
                          className="line-result-main"
                          onClick={() => {
                            cancelSearch();
                            setLine(l);
                          }}
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
                          aria-label={
                            (favorites.includes(l.id)
                              ? "Remover favorito "
                              : "Favoritar ") + l.code
                          }
                          aria-pressed={favorites.includes(l.id)}
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
                  {tab === "search" && visibleLines.length > lineCount && (
                    <button
                      className="search-more"
                      onClick={() => setLineCount((n) => n + 20)}
                    >
                      Mostrar mais linhas
                    </button>
                  )}
                  {tab === "search" && foundStops.length > 0 && (
                    <>
                      <div className="guide-label">
                        PARADAS ENCONTRADAS ·{" "}
                        {Math.min(stopCount, foundStops.length)} DE{" "}
                        {foundStops.length}
                      </div>
                      <div className="stop-list">
                        {foundStops.slice(0, stopCount).map((s) => (
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
                      {foundStops.length > stopCount && (
                        <button
                          className="search-more"
                          onClick={() => setStopCount((n) => n + 20)}
                        >
                          Mostrar mais paradas
                        </button>
                      )}
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
                        <h3>
                          {searchIncomplete
                            ? "Nenhum resultado nas fontes disponíveis"
                            : "Nenhuma linha ou parada encontrada"}
                        </h3>
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
        <section
          className={
            "map-section" +
            (googleSelection && isJourney ? " has-google-embed" : "")
          }
          id="map-panel"
          aria-label="Explorar mapa"
        >
          {googleSelection && isJourney ? (
            <GoogleEmbedMap
              selection={googleSelection}
              apiKey={googleEmbedKey}
              onBack={() => setGoogleSelection(null)}
            />
          ) : (
            <>
              <TransitMap
                network={line || journeySelection ? null : network}
                stops={journeySelection ? [] : mapStops}
                vehicles={journeySelection ? journeyFleet.vehicles : vehicles}
                selectedStop={stop}
                onSelectStop={(id) => {
                  if (journeySelection?.railStopIds?.includes(id)) return;
                  const selected = journeySelection?.stops.find(
                    (s) => s.id === id,
                  );
                  if (selected) showJourneyArrivals(selected);
                  else {
                    setMode("lines");
                    selectStop(id);
                  }
                }}
                location={location}
                journey={journeySelection}
                journeyFocus={journeyFocus}
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
                <div
                  className={
                    "connection-pill " +
                    (online && !error && !arrivalError ? "connected" : "")
                  }
                >
                  <span />
                  {error || arrivalError
                    ? "Atualização indisponível"
                    : online
                      ? "SPTrans conectada"
                      : "Dados ao vivo não conectados"}
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
              {(line || journeySelection) && (
                <div
                  className={
                    journeySelection?.busLegs?.length ||
                    journeySelection?.steps?.length
                      ? "map-journey-summary"
                      : undefined
                  }
                >
                  <div className="map-route-count" role="status">
                    {journeySelection?.steps?.length ? (
                      `${journeySelection.steps.length} etapas da saída ao destino final`
                    ) : line && !journeySelection ? (
                      `${stops.length} paradas desta linha`
                    ) : journeySelection!.stops.length ? (
                      `${journeySelection!.stops.length} paradas/estações das linhas usadas`
                    ) : (
                      <>
                        {journeySelection!.mode === "car"
                          ? "Carro"
                          : "Caminhada"}{" "}
                        no mapa
                        {journeySelection!.roadSummary && (
                          <>
                            {" "}
                            · cerca de{" "}
                            {Math.max(
                              1,
                              Math.round(
                                journeySelection!.roadSummary.durationS / 60,
                              ),
                            )}{" "}
                            min ·{" "}
                            {(
                              journeySelection!.roadSummary.distanceM / 1000
                            ).toLocaleString("pt-BR", {
                              maximumFractionDigits: 1,
                            })}{" "}
                            km
                          </>
                        )}
                        {journeySelection!.mode === "car" &&
                          " · sem trânsito ao vivo"}
                      </>
                    )}{" "}
                    · outros pontos ocultos
                  </div>
                  {!!journeySelection?.steps?.length && (
                    <JourneySteps
                      compact
                      selection={journeySelection}
                      focusedId={journeyFocus?.stepId}
                      onFocus={focusJourneyStep}
                    />
                  )}
                  {!!journeySelection?.busLegs?.length && (
                    <JourneyVehiclesStatus fleet={journeyFleet} compact />
                  )}
                </div>
              )}
              {!line && !journeySelection && (
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
                    <p>
                      {isJourney
                        ? "Informe de onde você sai e aonde quer chegar."
                        : "Busque uma linha ou parada para descobrir seu caminho."}
                    </p>
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
                <button
                  className="connect-btn"
                  onClick={() => setSettings(true)}
                >
                  {online ? <Check size={15} /> : <Info size={15} />}{" "}
                  {online ? "Sobre os dados" : "Conectar dados"}
                  <ArrowUpRight size={14} />
                </button>
              </div>
            </>
          )}
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
        <a href="./termos.html">Termos de uso</a>
        <a href="./privacidade.html">Privacidade</a>
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
              Os dados são atualizados a cada 30 segundos enquanto esta página
              está visível. O horário GPS informa quando a posição foi
              registrada. Previsões podem mudar ou ficar indisponíveis.
            </p>
            {!apiBase && (
              <p>
                O serviço de dados aguarda configuração pelo responsável pelo
                site.
              </p>
            )}
            <p>
              O mapa usa OpenStreetMap. Favoritos são salvos apenas neste
              navegador. O planejador usa itinerários e calendários de ônibus,
              metrô e trem, com até uma troca; não garante operação ou conexão
              neste horário. Os caminhos são exibidos no mapa do site; caminhada
              usa OpenStreetMap/FOSSGIS. Bilhetagem não está integrada.
            </p>
            <p>
              As sugestões de endereço enviam sua digitação ao
              Photon/OpenStreetMap após três caracteres e uma pausa. Endereços e
              GPS não são salvos pelo site. A programação mostra faixas e
              intervalos do GTFS, sem partidas exatas ou horários de passagem
              por ponto; confira o link oficial de cada linha.
            </p>
            <p>
              Ao calcular, os pontos dos trechos a pé são enviados ao FOSSGIS,
              que pode registrar coordenadas e IP. Não há chave Google, cartão
              ou API paga no planejamento publicado. Links opcionais Google só
              enviam pontos ao serem abertos. Veículos e chegadas de ônibus
              continuam pela SPTrans; não há previsão ao vivo de trens ou metrô.
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
