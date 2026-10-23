import type { JourneyOption, JourneyStep, Point } from "./types";
import { distanceM } from "../stops/network";
export function buildJourneySteps(
  option: JourneyOption,
  origin: Point,
  destination: Point,
  originLabel: string,
  destinationLabel: string,
): JourneyStep[] {
  if (!option.legs.length) return [];
  const named = (p: Point, label: string) => ({ ...p, label });
  const walk = (
    id: string,
    title: string,
    from: JourneyStep["from"],
    to: JourneyStep["to"],
  ): JourneyStep => ({
    id,
    kind: "walk",
    title,
    from,
    to,
    status:
      distanceM(from.lat, from.lon, to.lat, to.lon) < 10 ? "nearby" : "loading",
  });
  const first = option.legs[0],
    last = option.legs.at(-1)!;
  const result: JourneyStep[] = [
    walk(
      "walk-access",
      "Caminhe até o primeiro embarque",
      named(origin, originLabel),
      named(first.from, first.from.name),
    ),
  ];
  option.legs.forEach((leg, i) => {
    result.push({
      id: "ride-" + i,
      kind: leg.mode ?? "bus",
      title:
        (leg.mode === "metro"
          ? "Metrô"
          : leg.mode === "train"
            ? "Trem"
            : "Ônibus") +
        " " +
        leg.lineCode,
      from: named(leg.from, leg.from.name),
      to: named(leg.to, leg.to.name),
      lineCode: leg.lineCode,
      headsign: leg.headsign,
      legIndex: i,
      status: "loading",
    });
    const next = option.legs[i + 1];
    if (next) {
      const transfer = walk(
        "walk-transfer-" + (i + 1),
        "Caminhada da baldeação " + (i + 1),
        named(leg.to, leg.to.name),
        named(next.from, next.from.name),
      );
      if (
        ["metro", "train"].includes(leg.mode ?? "bus") &&
        ["metro", "train"].includes(next.mode ?? "bus")
      )
        transfer.message =
          "O mapa calcula vias externas. Se houver ligação interna entre as linhas, siga a sinalização da estação. O percurso e o tempo dentro da estação não estão disponíveis.";
      result.push(transfer);
    }
  });
  result.push(
    walk(
      "walk-egress",
      "Caminhe até o destino final",
      named(last.to, last.to.name),
      named(destination, destinationLabel),
    ),
  );
  return result;
}
