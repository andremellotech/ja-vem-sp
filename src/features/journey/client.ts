import {
  PlannerError,
  type PlanInput,
  type PlannerResult,
  type PlannerErrorCode,
} from "./types";
type Reply =
  | { type: "result"; requestId: number; result: PlannerResult }
  | {
      type: "error";
      requestId: number | null;
      error: { code: PlannerErrorCode; message: string };
    };
export function createPlannerClient(stopsUrl: string, plannerUrl: string) {
  const worker = new Worker(new URL("./planner.worker.ts", import.meta.url), {
    type: "module",
  });
  let requestId = 0,
    closed = false,
    fatal: PlannerError | null = null;
  const pending = new Map<
    number,
    { resolve: (r: PlannerResult) => void; reject: (e: unknown) => void }
  >();
  const failAll = (error: unknown) => {
    for (const p of [...pending.values()]) p.reject(error);
  };
  worker.onmessage = (event: MessageEvent<Reply>) => {
    const msg = event.data;
    if (msg.type === "result") pending.get(msg.requestId)?.resolve(msg.result);
    else if (msg.type === "error") {
      const error = new PlannerError(msg.error.code, msg.error.message);
      if (msg.requestId === null) {
        fatal = error;
        failAll(error);
      } else pending.get(msg.requestId)?.reject(error);
    }
  };
  worker.onerror = () => {
    fatal = new PlannerError(
      "DATA_UNAVAILABLE",
      "Não foi possível carregar o planejador. Tente novamente.",
    );
    failAll(fatal);
  };
  worker.postMessage({ type: "init", stopsUrl, plannerUrl });
  return {
    plan(input: PlanInput, signal?: AbortSignal): Promise<PlannerResult> {
      if (closed || signal?.aborted)
        return Promise.reject(
          new DOMException("Consulta cancelada", "AbortError"),
        );
      if (fatal) return Promise.reject(fatal);
      const id = ++requestId;
      return new Promise((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", abort);
          pending.delete(id);
        };
        const abort = () => {
          cleanup();
          reject(new DOMException("Consulta cancelada", "AbortError"));
        };
        const timer = setTimeout(() => {
          cleanup();
          reject(
            new PlannerError(
              "TIMEOUT",
              "O cálculo demorou mais que o esperado. Tente novamente.",
            ),
          );
        }, 20000);
        pending.set(id, {
          resolve: (r) => {
            cleanup();
            resolve(r);
          },
          reject: (e) => {
            cleanup();
            reject(e);
          },
        });
        signal?.addEventListener("abort", abort, { once: true });
        try {
          worker.postMessage({ type: "plan", requestId: id, input });
        } catch (e) {
          pending.get(id)?.reject(e);
        }
      });
    },
    dispose() {
      closed = true;
      failAll(new DOMException("Planejador encerrado", "AbortError"));
      worker.terminate();
    },
  };
}
