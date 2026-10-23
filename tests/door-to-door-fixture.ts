import type { JourneyLeg, JourneyOption } from "../src/features/journey/types";
import { hash, networkStops } from "./planner-fixtures";
const stop = (id: string, lat: number, lon: number) => ({
  id,
  name: id,
  lat,
  lon,
});
const leg = (
  i: number,
  mode: JourneyLeg["mode"],
  code: string,
  from: ReturnType<typeof stop>,
  to: ReturnType<typeof stop>,
): JourneyLeg => ({
  tripId: "trip" + i,
  routeId: "route" + i,
  lineCode: code,
  headsign: "Sentido " + i,
  mode,
  from,
  to,
  fromIndex: 0,
  toIndex: 1,
  stopCount: 1,
  routeStops: [from, to],
  feedHash: hash,
});
export const doorOption: JourneyOption = {
  id: "porta-a-porta",
  accessM: 150,
  egressM: 150,
  transferCount: 2,
  stopCount: 3,
  transferWalkM: 100,
  transferWalksM: [50, 50],
  legs: [
    leg(
      0,
      "metro",
      "L01",
      stop("Estação Inicial", -23.551, -46.631),
      stop("Estação de Conexão", -23.57, -46.65),
    ),
    leg(
      1,
      "train",
      "L09",
      stop("Plataforma do Trem", -23.5704, -46.6503),
      stop("Estação Final", -23.58, -46.66),
    ),
    leg(
      2,
      "bus",
      "476A-10",
      stop("Ponto do Ônibus", -23.5804, -46.6603),
      stop("Ponto Final", -23.589, -46.669),
    ),
  ],
};
export const home = { lat: networkStops[0].lat, lon: networkStops[0].lon },
  destination = { lat: networkStops[2].lat, lon: networkStops[2].lon };
