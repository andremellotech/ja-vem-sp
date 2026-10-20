import { parseNetwork } from "../stops/network";
import {
  createPlannerIndex,
  parsePlannerData,
  type PlannerIndex,
} from "./data";
import { findJourneys } from "./router";
import { PlannerError, type PlanInput } from "./types";
type Input =
  | { type: "init"; stopsUrl: string; plannerUrl: string }
  | { type: "plan"; requestId: number; input: PlanInput };
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Input>) => void) | null;
  postMessage: (message: unknown) => void;
};
let loading: Promise<PlannerIndex> | null = null;
async function load(stopsUrl: string, plannerUrl: string) {
  const [s, p] = await Promise.all([
    fetch(stopsUrl, { cache: "no-cache" }),
    fetch(plannerUrl, { cache: "no-cache" }),
  ]);
  if (!s.ok || !p.ok)
    throw new PlannerError(
      "DATA_UNAVAILABLE",
      "A base de trajetos não carregou. Tente novamente.",
    );
  const [network, raw] = await Promise.all([s.json(), p.json()]);
  const stops = parseNetwork(network);
  if (!stops || typeof network.provenance?.sha256 !== "string")
    throw new PlannerError("INVALID_DATA", "A base de paradas está inválida.");
  return createPlannerIndex(
    parsePlannerData(raw, network.provenance.sha256),
    stops,
  );
}
const report = (requestId: number | null, error: unknown) =>
  scope.postMessage({
    type: "error",
    requestId,
    error:
      error instanceof PlannerError
        ? { code: error.code, message: error.message }
        : {
            code: "DATA_UNAVAILABLE",
            message: "Não foi possível carregar os trajetos. Tente novamente.",
          },
  });
scope.onmessage = async ({ data }) => {
  if (data.type === "init") {
    loading = load(data.stopsUrl, data.plannerUrl);
    void loading.catch((error) => report(null, error));
    return;
  }
  if (data.type !== "plan") return;
  try {
    if (!loading)
      throw new PlannerError(
        "DATA_UNAVAILABLE",
        "O planejador não foi inicializado.",
      );
    const index = await loading;
    scope.postMessage({
      type: "result",
      requestId: data.requestId,
      result: findJourneys(index, data.input),
    });
  } catch (error) {
    report(data.requestId, error);
  }
};
