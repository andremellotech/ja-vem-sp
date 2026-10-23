import { expect, it } from "vitest";
import {
  estimateJourney,
  parseJourneyTimes,
} from "../src/features/journey/timing";
import type { JourneyOption } from "../src/features/journey/types";
const hash = "a".repeat(64);
const times = {
  version: 1,
  provenance: { sha256: hash },
  validFrom: "20260101",
  validTo: "20261231",
  trips: {
    t: {
      stopIds: ["A", "B", "C"],
      arrivalS: [25200, 25800, 26400],
      departureS: [25200, 25860, 26400],
      windows: [[14400, 82800, 600, false]],
    },
  },
};
const option: JourneyOption = {
  id: "o",
  accessM: 150,
  egressM: 75,
  transferCount: 0,
  stopCount: 1,
  legs: [
    {
      tripId: "t",
      routeId: "r",
      lineCode: "1000-10",
      headsign: "Centro",
      from: { id: "B", name: "B", lat: -23.5, lon: -46.6 },
      to: { id: "C", name: "C", lat: -23.6, lon: -46.7 },
      fromIndex: 1,
      toIndex: 2,
      stopCount: 1,
      routeStops: [],
      feedHash: hash,
    },
  ],
};
it("compara o trecho correto com caminhada aproximada e espera média", () => {
  const result = estimateJourney(
    option,
    parseJourneyTimes(times),
    new Date("2026-10-23T15:00:00Z"),
  );
  expect(result).toMatchObject({
    ridingS: 540,
    walkingS: 180,
    waitingS: 300,
    totalS: 1020,
  });
});
it("soma baldeação e estima espera em cada embarque", () => {
  const x = {
    ...option,
    transferCount: 1 as const,
    transferWalkM: 125,
    legs: [...option.legs, ...option.legs],
  };
  expect(
    estimateJourney(
      x,
      parseJourneyTimes(times),
      new Date("2026-10-23T15:00:00Z"),
    ),
  ).toMatchObject({
    ridingS: 1080,
    walkingS: 280,
    waitingS: 600,
    totalS: 1960,
  });
});
it("informa serviço encerrado e não transforma ausência em zero", () => {
  expect(
    estimateJourney(
      option,
      parseJourneyTimes(times),
      new Date("2026-10-24T02:50:00Z"),
    ).totalS,
  ).toBeNull();
  expect(estimateJourney(option, null, new Date()).totalS).toBeNull();
  expect(
    estimateJourney(
      { ...option, legs: [{ ...option.legs[0], feedHash: "b".repeat(64) }] },
      parseJourneyTimes(times),
      new Date(),
    ).totalS,
  ).toBeNull();
});
it("valida números, ordem de paradas e validade da base", () => {
  expect(() =>
    parseJourneyTimes({
      ...times,
      trips: { t: { ...times.trips.t, arrivalS: [25200, 25000, 26400] } },
    }),
  ).toThrow();
  const wrong = {
    ...option,
    legs: [{ ...option.legs[0], to: { ...option.legs[0].to, id: "Z" } }],
  };
  expect(
    estimateJourney(
      wrong,
      parseJourneyTimes(times),
      new Date("2026-10-23T15:00:00Z"),
    ).totalS,
  ).toBeNull();
  expect(
    estimateJourney(
      option,
      parseJourneyTimes(times),
      new Date("2027-10-23T15:00:00Z"),
    ).totalS,
  ).toBeNull();
});
it("usa partidas exatas somente quando exact_times permite", () => {
  const exact = {
    ...times,
    trips: {
      t: {
        ...times.trips.t,
        windows: [[14400, 82800, 600, true]],
      },
    },
  };
  const r = estimateJourney(
    option,
    parseJourneyTimes(exact),
    new Date("2026-10-23T15:00:00Z"),
  );
  expect(r.waitingS).toBe(540); // embarque pronto12:02; partida deslocada12:11
  expect(r.totalS).toBe(1260);
});
