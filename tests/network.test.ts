import { it, expect } from "vitest";
import {
  createIndex,
  distanceM,
  parseNetwork,
} from "../src/features/stops/network";
const raw = {
  stops: [
    ["1", "Paulista", "Ref.", -23.5614, -46.6559, 0],
    ["2", "Trianon", "", -23.5617, -46.6563, 1],
    ["3", "Longe", "", -23.7, -46.8, 0],
    ["x", "Quebrada", "", "abc", -46.8, 0],
    "lixo",
  ],
};
it("valida o arquivo e ignora linhas quebradas", () => {
  const s = parseNetwork(raw)!;
  expect(s.map((x) => x.id)).toEqual(["1", "2", "3"]);
  expect(s[1].rail).toBe(true);
  expect(parseNetwork({ data: [] })).toBeNull();
  expect(parseNetwork(null)).toBeNull();
});
it("busca paradas na área visível e respeita o limite", () => {
  const idx = createIndex(parseNetwork(raw)!);
  const all = idx.inBounds(-23.57, -46.67, -23.55, -46.64, 10);
  expect(all.stops.map((s) => s.id).sort()).toEqual(["1", "2"]);
  const lim = idx.inBounds(-23.57, -46.67, -23.55, -46.64, 1);
  expect(lim.stops).toHaveLength(1);
  expect(lim.total).toBe(2);
  expect(idx.inBounds(-24, -47, -23.9, -46.9, 10).total).toBe(0);
});
it("encontra as paradas mais próximas em ordem de distância", () => {
  const idx = createIndex(parseNetwork(raw)!);
  const near = idx.nearest(-23.5614, -46.6559, 500, 5);
  expect(near.map((s) => s.id)).toEqual(["1", "2"]);
  expect(idx.nearest(-23.5614, -46.6559, 20, 5).map((s) => s.id)).toEqual([
    "1",
  ]);
  expect(
    Math.round(distanceM(-23.5614, -46.6559, -23.5617, -46.6563)),
  ).toBeLessThan(60);
});
