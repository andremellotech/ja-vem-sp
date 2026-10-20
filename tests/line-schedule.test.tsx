import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
  act,
} from "@testing-library/react";
import LineSchedule from "../src/features/schedules/LineSchedule";
import type { Line } from "../src/contracts";
import { fixture, networkStops, trip } from "./planner-fixtures";

const line: Line = {
  id: "api",
  code: "857C-10",
  name: "Conceição",
  origin: "Term. Campo Limpo",
  destination: "Metrô Conceição",
  direction: 2,
};
let serial = 0;
function install(
  options: {
    hash?: string;
    noTrips?: boolean;
    fail?: boolean;
    ambiguous?: boolean;
    mismatched?: boolean;
  } = {},
) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T15:00:00Z"));
  const planner = fixture([
    trip("out", ["A", "X", "D"], "weekday"),
    trip("back", ["D", "X", "A"]),
  ]);
  planner.routes = [{ id: "r", code: line.code, name: line.name }];
  planner.calendars.push({
    id: "weekday",
    start: "20260101",
    end: "20261231",
    weekdays: [true, true, true, true, true, false, false],
  });
  planner.exceptions = [
    { serviceId: "weekday", date: "20261020", added: false },
    { serviceId: "weekday", date: "20261024", added: true },
  ];
  planner.trips.forEach((t, i) => {
    t.routeId = "r";
    t.direction = String(i);
    t.headsign = options.ambiguous
      ? i
        ? "Volta"
        : "Ida"
      : i
        ? line.origin
        : line.destination;
  });
  if (options.noTrips) planner.routes[0].code = "9999-10";
  const schedules = {
    ...planner,
    provenance: {
      ...planner.provenance,
      sha256: options.hash ?? planner.provenance.sha256,
    },
    trips: planner.trips.map((t, i) => ({
      ...t,
      windows: i
        ? [
            { start: 0, end: 3540, headwayS: 1800, exactTimes: false },
            { start: 86400, end: 89940, headwayS: 3600, exactTimes: false },
          ]
        : [
            { start: 21600, end: 25140, headwayS: 600, exactTimes: false },
            { start: 25200, end: 28740, headwayS: 900, exactTimes: false },
          ],
    })),
  };
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (options.fail) throw new Error("offline");
    if (url.endsWith("/stops.json"))
      return {
        ok: true,
        json: async () => ({
          version: 1,
          fields: ["id", "name", "ref", "lat", "lon", "rail"],
          provenance: planner.provenance,
          stops: networkStops.map((s) => [
            s.id,
            s.name,
            s.ref,
            s.lat,
            s.lon,
            Number(s.rail),
          ]),
        }),
      };
    if (url.endsWith("/planner.json"))
      return { ok: true, json: async () => planner };
    if (url.endsWith("/schedules.json")) {
      if (options.mismatched) schedules.trips[0].routeId = "other-route";
      return { ok: true, json: async () => schedules };
    }
    throw new Error("Unexpected request " + url);
  });
  vi.stubGlobal("fetch", fetcher);
  return { base: `https://schedule-${++serial}.test/app/`, fetcher };
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it("mostra as faixas do itinerário selecionado sem inventar partidas", async () => {
  const { base } = install();
  render(<LineSchedule line={line} base={base} />);
  const table = await screen.findByRole("table");
  expect(within(table).getByText("06:00–06:59")).toBeTruthy();
  expect(within(table).getByText("07:00–07:59")).toBeTruthy();
  expect(within(table).getByText("10 min")).toBeTruthy();
  expect(within(table).getByText("15 min")).toBeTruthy();
  expect(screen.queryByText("06:10")).toBeNull();
  expect(screen.getByText(/não são partidas exatas/i)).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: /programação oficial/i })
      .getAttribute("href"),
  ).toBe("https://www.sptrans.com.br/itinerarios/linha/?numero=857C-10");
  expect(screen.getByText(/Fonte consultada em 19\/10\/2026/)).toBeTruthy();
});
it("aplica exceções à data do serviço e os atalhos de sábado/domingo", async () => {
  const { base } = install();
  render(<LineSchedule line={line} base={base} />);
  await screen.findByRole("table");
  fireEvent.change(screen.getByLabelText("Data do serviço"), {
    target: { value: "2026-10-20" },
  });
  expect(screen.queryByRole("table")).toBeNull();
  expect(
    screen.getByText(/sem serviço cadastrado para esta data/i),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Sábado" }));
  expect(screen.getByRole("table")).toBeTruthy(); // adição em 24/10
  fireEvent.click(screen.getByRole("button", { name: "Domingo" }));
  expect(screen.queryByRole("table")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Dia útil" }));
  expect(screen.getByRole("table")).toBeTruthy();
});
it("usa o outro itinerário ao selecionar o sentido oposto e mantém horas acima de 24", async () => {
  const { base } = install();
  const { rerender } = render(<LineSchedule line={line} base={base} />);
  await screen.findByRole("table");
  rerender(
    <LineSchedule
      line={{
        ...line,
        origin: line.destination,
        destination: line.origin,
        direction: 1,
      }}
      base={base}
    />,
  );
  const table = await screen.findByRole("table");
  expect(within(table).getByText("00:00–00:59")).toBeTruthy();
  expect(within(table).getByText("24:00–24:59")).toBeTruthy();
  expect(within(table).queryByText("06:00–06:59")).toBeNull();
  expect(screen.getByText(/dia seguinte/i)).toBeTruthy();
});
it("não confirma sentido incerto nem afirma ausência de operação da linha", async () => {
  const { base } = install({ ambiguous: true });
  render(<LineSchedule line={line} base={base} />);
  await screen.findAllByRole("table");
  expect(screen.getByText(/sentido.*não.*confirmad/i)).toBeTruthy();
  expect(screen.getByRole("heading", { name: /Ida/ })).toBeTruthy();
  expect(screen.getByRole("heading", { name: /Volta/ })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Data do serviço"), {
    target: { value: "2026-10-25" },
  });
  expect(screen.getAllByRole("table")).toHaveLength(1);
  expect(
    screen.queryByText(/sem serviço cadastrado para esta data/i),
  ).toBeNull();
});
it.each([
  { hash: "b".repeat(64) },
  { noTrips: true },
  { fail: true },
  { mismatched: true },
])(
  "mantém link oficial quando a base está indisponível (%j)",
  async (options) => {
    const { base } = install(options);
    render(<LineSchedule line={line} base={base} />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(
      screen.getByRole("link", { name: /programação oficial/i }),
    ).toBeTruthy();
  },
);
it("informa validade vencida sem afirmar que a linha não opera", async () => {
  const { base } = install();
  render(<LineSchedule line={line} base={base} />);
  await screen.findByRole("table");
  fireEvent.change(screen.getByLabelText("Data do serviço"), {
    target: { value: "2027-01-01" },
  });
  expect(screen.getByText(/fora da validade/i)).toBeTruthy();
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.queryByText(/sem serviço cadastrado/i)).toBeNull();
});

it("ignora programação tardia de uma seleção anterior", async () => {
  const { base, fetcher } = install();
  const original = fetcher.getMockImplementation()!;
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  fetcher.mockImplementation(async (input) => {
    if (String(input).endsWith("/schedules.json")) await hold;
    return original(input);
  });
  const { rerender } = render(<LineSchedule line={line} base={base} />);
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(([url]) =>
        String(url).endsWith("/schedules.json"),
      ),
    ).toBe(true),
  );
  rerender(<LineSchedule line={{ ...line, code: "9999-10" }} base={base} />);
  await screen.findByRole("alert");
  await act(async () => {
    release();
    await hold;
  });
  expect(screen.queryByRole("table")).toBeNull();
  expect(
    screen
      .getByRole("link", { name: /programação oficial/i })
      .getAttribute("href"),
  ).toContain("numero=9999-10");
});

it("usa a base de publicação do Vite quando base não é informada", async () => {
  const { fetcher } = install();
  vi.stubEnv("BASE_URL", "/deployed-app/");
  render(<LineSchedule line={line} />);
  await screen.findByRole("table");
  expect(fetcher.mock.calls.map(([url]) => String(url))).toContain(
    new URL("/deployed-app/data/schedules.json", window.location.href).href,
  );
});
