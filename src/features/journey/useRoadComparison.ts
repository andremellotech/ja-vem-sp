import { useEffect, useRef, useState } from "react";
import type { Point } from "./types";
import { routeDriving, routeWalking } from "../walking/client";
import type { WalkingRoute } from "../walking/types";
export type RoadMode = "foot" | "car";
type Row = {
  status: "idle" | "loading" | "ready" | "error";
  route?: WalkingRoute;
  message?: string;
};
type State = { key: string; busy: boolean; foot: Row; car: Row };
const empty = (key: string): State => ({
  key,
  busy: false,
  foot: { status: "idle" },
  car: { status: "idle" },
});
export function useRoadComparison(
  from: Point | null,
  to: Point | null,
  active: boolean,
) {
  const key = JSON.stringify([active, from?.lat, from?.lon, to?.lat, to?.lon]);
  const [state, setState] = useState<State>(() => empty(key));
  const controller = useRef<AbortController | null>(null),
    version = useRef(0);
  const cancel = () => {
    version.current++;
    controller.current?.abort();
    setState((s) => ({
      ...s,
      busy: false,
      foot: s.foot.status === "loading" ? { status: "idle" } : s.foot,
      car: s.car.status === "loading" ? { status: "idle" } : s.car,
    }));
  };
  useEffect(() => {
    version.current++;
    controller.current?.abort();
    setState(empty(key));
    return () => {
      version.current++;
      controller.current?.abort();
    };
  }, [key]);
  async function run(
    modes: RoadMode[],
    onResult?: (mode: RoadMode, route: WalkingRoute) => void,
  ) {
    if (!from || !to || !active) return;
    cancel();
    const current = version.current,
      c = new AbortController();
    controller.current = c;
    setState((s) => {
      const next =
        s.key === key ? { ...s, busy: true } : { ...empty(key), busy: true };
      for (const mode of modes) next[mode] = { status: "loading" };
      return next;
    });
    const valid = () => version.current === current && !c.signal.aborted;
    await Promise.all(
      modes.map(async (mode) => {
        try {
          const route = await (mode === "car" ? routeDriving : routeWalking)(
            from,
            to,
            c.signal,
          );
          if (!valid()) return;
          setState((s) =>
            s.key === key ? { ...s, [mode]: { status: "ready", route } } : s,
          );
          onResult?.(mode, route);
        } catch (e) {
          if (valid())
            setState((s) =>
              s.key === key
                ? {
                    ...s,
                    [mode]: {
                      status: "error",
                      message:
                        e instanceof Error
                          ? e.message
                          : "Trajeto indisponível.",
                    },
                  }
                : s,
            );
        }
      }),
    );
    if (valid()) setState((s) => (s.key === key ? { ...s, busy: false } : s));
  }
  return { ...(state.key === key ? state : empty(key)), run, cancel };
}
