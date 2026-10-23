import { useEffect, useRef, useState } from "react";
import { request } from "../../api/client";
import type { Vehicle } from "../../contracts";
import { parseLineCatalog } from "../lines/catalog";
import { loadLineIndex } from "./line-stops";
import {
  mergeJourneyVehicles,
  resolveVehicleLines,
  type VehicleLine,
} from "./journey-vehicles";
import type { JourneyBusLeg } from "./types";
export type FleetRow = VehicleLine & {
  vehicles: Vehicle[];
  status: "loading" | "ready" | "empty" | "error" | "unmatched";
  fetchedAt: string | null;
  message?: string;
};
type FleetState = { key: string; rows: FleetRow[]; busy: boolean };
/** Bound both response and body parsing, and release the caller on cancellation. */
async function deadline<T>(
  work: (signal: AbortSignal) => Promise<T>,
  parent: AbortSignal,
): Promise<T> {
  if (parent.aborted) throw new DOMException("Cancelado", "AbortError");
  const c = new AbortController();
  let timedOut = false;
  const forward = () => c.abort();
  parent.addEventListener("abort", forward, { once: true });
  let rejectAbort = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    rejectAbort = () =>
      reject(
        timedOut
          ? new Error("A consulta de ônibus demorou. Tente atualizar.")
          : new DOMException("Cancelado", "AbortError"),
      );
    c.signal.addEventListener("abort", rejectAbort, { once: true });
  });
  const timer = setTimeout(() => {
    timedOut = true;
    c.abort();
  }, 15000);
  try {
    return await Promise.race([work(c.signal), interrupted]);
  } finally {
    clearTimeout(timer);
    parent.removeEventListener("abort", forward);
    c.signal.removeEventListener("abort", rejectAbort);
  }
}
export function useJourneyVehicles(
  legs: JourneyBusLeg[] | undefined,
  apiBase: string,
  base: string,
) {
  const key = JSON.stringify(legs ?? []);
  const [state, setState] = useState<FleetState>({
    key: "",
    rows: [],
    busy: false,
  });
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    const selected = JSON.parse(key) as JourneyBusLeg[],
      c = new AbortController();
    let active = true,
      running = false,
      resolved: VehicleLine[] | null = null;
    const initial = selected.map((leg) => ({
      leg,
      line: null,
      vehicles: [],
      status: "loading" as const,
      fetchedAt: null,
    }));
    if (!selected.length) {
      setState({ key, rows: [], busy: false });
      return;
    }
    if (!apiBase) {
      setState({
        key,
        rows: initial.map((r) => ({
          ...r,
          status: "error",
          message: "A conexão com a SPTrans não está configurada.",
        })),
        busy: false,
      });
      return;
    }
    setState({ key, rows: initial, busy: true });
    const valid = () => active && !c.signal.aborted;
    async function refresh() {
      if (running || !valid() || document.hidden) return;
      running = true;
      setState((s) => (s.key === key ? { ...s, busy: true } : s));
      try {
        if (!resolved)
          resolved = await deadline(async (signal) => {
            const [index, response] = await Promise.all([
              loadLineIndex(base),
              fetch(new URL("data/lines.json", base).href, { signal }),
            ]);
            if (!response.ok)
              throw new Error(
                "O catálogo das linhas não carregou. Tente atualizar.",
              );
            return resolveVehicleLines(
              selected,
              parseLineCatalog(await response.json()),
              index,
            );
          }, c.signal);
        if (!valid()) return;
        const queryRow = async (r: VehicleLine): Promise<FleetRow> => {
          if (!r.line)
            return {
              ...r,
              vehicles: [],
              status: "unmatched",
              fetchedAt: null,
              message:
                "Não foi possível confirmar o sentido da linha na SPTrans.",
            };
          try {
            const result = await deadline(
              (signal) =>
                request<Vehicle[]>(
                  apiBase,
                  `/api/lines/${r.line!.id}/vehicles`,
                  signal,
                ),
              c.signal,
            );
            if (!Array.isArray(result.data))
              throw new Error("A SPTrans retornou posições inválidas.");
            const vehicles = mergeJourneyVehicles([
              { line: r.line, vehicles: result.data },
            ]);
            return {
              ...r,
              vehicles,
              status: vehicles.length ? "ready" : "empty",
              fetchedAt: result.fetchedAt,
            };
          } catch (e) {
            return {
              ...r,
              vehicles: [],
              status: "error",
              fetchedAt: null,
              message:
                e instanceof Error
                  ? e.message
                  : "Não foi possível atualizar os ônibus.",
            };
          }
        };
        const rows = await Promise.all(
          resolved.map(async (r) => {
            const row = await queryRow(r);
            if (valid())
              setState((s) =>
                s.key === key
                  ? {
                      ...s,
                      rows: s.rows.map((old) =>
                        old.leg.tripId === row.leg.tripId ? row : old,
                      ),
                    }
                  : s,
              );
            return row;
          }),
        );
        if (valid()) setState({ key, rows, busy: false });
      } catch (e) {
        if (valid())
          setState({
            key,
            rows: initial.map((r) => ({
              ...r,
              status: "error",
              message:
                e instanceof Error
                  ? e.message
                  : "Não foi possível consultar os ônibus.",
            })),
            busy: false,
          });
      } finally {
        running = false;
        if (valid())
          setState((s) => (s.key === key ? { ...s, busy: false } : s));
      }
    }
    refreshRef.current = refresh;
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      c.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      refreshRef.current = async () => {};
    };
  }, [key, apiBase, base]);
  const current =
    state.key === key ? state : { key, rows: [], busy: !!legs?.length };
  const vehicles = mergeJourneyVehicles(
    current.rows
      .filter(
        (r): r is FleetRow & { line: NonNullable<FleetRow["line"]> } =>
          !!r.line,
      )
      .map((r) => ({ line: r.line, vehicles: r.vehicles })),
  );
  return { ...current, vehicles, refresh: () => refreshRef.current() };
}
