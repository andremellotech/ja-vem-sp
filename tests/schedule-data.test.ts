import { afterEach, expect, it, vi } from "vitest";
import scheduleJson from "../public/data/schedules.json?raw";
import plannerJson from "../public/data/planner.json?raw";
import {
  loadScheduleData,
  parseScheduleData,
} from "../src/features/schedules/data";
import type { PlannerData } from "../src/features/journey/types";
const hash = "a".repeat(64);
export const scheduleFixture = () => ({
  version: 1,
  provenance: {
    sha256: hash,
    source: "official",
    retrievedAt: "2026-10-19",
    license: "portal",
  },
  validFrom: "20260101",
  validTo: "20261231",
  calendars: [
    {
      id: "daily",
      start: "20260101",
      end: "20261231",
      weekdays: [true, true, true, true, true, true, true],
    },
  ],
  exceptions: [],
  trips: [
    {
      id: "t",
      routeId: "r",
      headsign: "Centro",
      direction: "0",
      serviceId: "daily",
      windows: [
        { start: 82800, end: 86340, headwayS: 3600, exactTimes: false },
        { start: 86400, end: 89940, headwayS: 1200, exactTimes: false },
      ],
    },
  ],
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("preserva as janelas, incluindo lacunas e horas acima de 24", () => {
  const data = parseScheduleData(scheduleFixture(), hash);
  expect(data.trips[0].windows).toEqual([
    { start: 82800, end: 86340, headwayS: 3600, exactTimes: false },
    { start: 86400, end: 89940, headwayS: 1200, exactTimes: false },
  ]);
});
it("rejeita hash diferente, serviços ausentes e frequências sobrepostas", () => {
  expect(() => parseScheduleData(scheduleFixture(), "b".repeat(64))).toThrow();
  const missing = scheduleFixture();
  missing.trips[0].serviceId = "missing";
  expect(() => parseScheduleData(missing, hash)).toThrow();
  const overlap = scheduleFixture();
  overlap.trips[0].windows[1].start = 86000;
  expect(() => parseScheduleData(overlap, hash)).toThrow();
  const invalid = scheduleFixture();
  invalid.trips[0].windows[0].headwayS = 0;
  expect(() => parseScheduleData(invalid, hash)).toThrow();
});
it("rejeita calendário, identificadores e janelas incompletos ou incoerentes", () => {
  for (const mutate of [
    (d: ReturnType<typeof scheduleFixture>) => {
      d.validTo = "20260230";
    },
    (d: ReturnType<typeof scheduleFixture>) => {
      d.calendars[0].weekdays.pop();
    },
    (d: ReturnType<typeof scheduleFixture>) => {
      d.trips.push(d.trips[0]);
    },
    (d: ReturnType<typeof scheduleFixture>) => {
      d.trips[0].routeId = "";
    },
    (d: ReturnType<typeof scheduleFixture>) => {
      d.trips[0].windows = [];
    },
    (d: ReturnType<typeof scheduleFixture>) => {
      d.trips[0].windows[0].start = -1;
    },
    (d: ReturnType<typeof scheduleFixture>) => {
      d.trips[0].windows[0].headwayS = 1.5;
    },
    (d: ReturnType<typeof scheduleFixture>) => {
      d.trips[0].windows[1].exactTimes = true;
    },
  ]) {
    const data = scheduleFixture();
    mutate(data);
    expect(() => parseScheduleData(data, hash)).toThrow();
  }
});
it("compartilha carga por base/hash e permite outra tentativa após erro", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValue({ ok: true, json: async () => scheduleFixture() });
  vi.stubGlobal("fetch", fetcher);
  await expect(
    loadScheduleData("https://retry.test/app/", hash),
  ).rejects.toThrow();
  const a = loadScheduleData("https://retry.test/app/", hash),
    b = loadScheduleData("https://retry.test/app/", hash);
  expect(a).toBe(b);
  expect((await a).trips[0].windows[0].headwayS).toBe(3600);
  expect(fetcher).toHaveBeenLastCalledWith(
    "https://retry.test/app/data/schedules.json",
    expect.anything(),
  );
  await expect(
    loadScheduleData("https://retry.test/app/", "b".repeat(64)),
  ).rejects.toThrow();
});
it("encerra carga em 12 segundos e não mantém erro no cache", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValue({ ok: true, json: async () => scheduleFixture() }),
  );
  const pending = expect(
    loadScheduleData("https://timeout.test/", hash),
  ).rejects.toThrow(/tempo|demor|12/i);
  await vi.advanceTimersByTimeAsync(12000);
  await pending;
  expect(
    (await loadScheduleData("https://timeout.test/", hash)).trips,
  ).toHaveLength(1);
});

it("valida todas as faixas publicadas e a mesma proveniência dos itinerários", () => {
  const planner = JSON.parse(plannerJson) as PlannerData;
  const data = parseScheduleData(
    JSON.parse(scheduleJson),
    planner.provenance.sha256,
  );
  expect(data.provenance).toEqual(planner.provenance);
  expect(data.trips).toHaveLength(2240);
  expect(data.trips.reduce((sum, t) => sum + t.windows.length, 0)).toBe(39846);
  expect(data.trips.some((t) => t.windows.some((w) => w.exactTimes))).toBe(
    false,
  );
  const tripIds = new Set(planner.trips.map((t) => t.id));
  expect(data.trips.every((t) => tripIds.has(t.id))).toBe(true);
  expect(
    data.trips
      .find((t) => t.id === "857C-10-0")!
      .windows.find((w) => w.start === 21600),
  ).toEqual({ start: 21600, end: 25140, headwayS: 600, exactTimes: false });
  expect(
    data.trips
      .find((t) => t.id === "476A-10-1")!
      .windows.slice(0, 2)
      .map((w) => [w.start, w.end]),
  ).toEqual([
    [0, 3540],
    [14400, 17940],
  ]);
});
