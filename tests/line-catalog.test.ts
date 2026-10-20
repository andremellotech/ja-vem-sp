import { expect, it } from "vitest";
import { parseLineCatalog, searchCatalog } from "../src/features/lines/catalog";
import type { Line } from "../src/contracts";
const lines: Line[] = [
  {
    id: "1",
    code: "857C-10",
    origin: "TERM. CAMPO LIMPO",
    destination: "METRÔ CONCEIÇÃO",
    name: "Campo Limpo ↔ Conceição",
    direction: 1,
  },
  {
    id: "32769",
    code: "857C-10",
    origin: "METRÔ CONCEIÇÃO",
    destination: "TERM. CAMPO LIMPO",
    name: "Campo Limpo ↔ Conceição",
    direction: 2,
  },
];
it("sugere código sem hífen, nomes sem acento e mantém os dois sentidos", () => {
  expect(searchCatalog(lines, "857c10").map((l) => l.id)).toEqual([
    "1",
    "32769",
  ]);
  expect(searchCatalog(lines, "conceicao")).toHaveLength(2);
  expect(searchCatalog(lines, "8")).toEqual([]);
});
it("valida o catálogo completo e rejeita IDs duplicados ou sentido inválido", () => {
  expect(
    parseLineCatalog({ version: 1, retrievedAt: "2026-10-20", lines }),
  ).toEqual(lines);
  expect(() =>
    parseLineCatalog({
      version: 1,
      retrievedAt: "2026-10-20",
      lines: [lines[0], lines[0]],
    }),
  ).toThrow();
  expect(() =>
    parseLineCatalog({
      version: 1,
      retrievedAt: "2026-10-20",
      lines: [{ ...lines[0], direction: 3 }],
    }),
  ).toThrow();
});
import snapshot from "../public/data/lines.json";
it("mantém os 2698 sentidos auditados e limita as sugestões locais a oito", () => {
  const catalog = parseLineCatalog(snapshot);
  expect(catalog).toHaveLength(2698);
  expect(new Set(catalog.map((l) => l.code)).size).toBe(1349);
  expect(searchCatalog(catalog, "857c10").map((l) => l.direction)).toEqual([
    1, 2,
  ]);
  expect(searchCatalog(catalog, "term")).toHaveLength(8);
});
