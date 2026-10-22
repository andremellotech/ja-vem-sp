import type { Line } from "../../contracts";
import { compactSearch, matchesSearch } from "../search/text";
export function parseLineCatalog(value: unknown): Line[] {
  const v = value as {
    version?: unknown;
    retrievedAt?: unknown;
    lines?: unknown;
  };
  if (
    !v ||
    v.version !== 1 ||
    typeof v.retrievedAt !== "string" ||
    !Number.isFinite(Date.parse(v.retrievedAt)) ||
    !Array.isArray(v.lines)
  )
    throw new Error("Catálogo indisponível. Use a busca manual.");
  const ids = new Set<string>();
  for (const row of v.lines) {
    const l = row as Line;
    if (
      !l ||
      ![l.id, l.code, l.name, l.origin, l.destination].every(
        (s) => typeof s === "string" && s.trim(),
      ) ||
      ![1, 2].includes(l.direction) ||
      ids.has(l.id)
    )
      throw new Error("Catálogo inválido. Use a busca manual.");
    ids.add(l.id);
  }
  return v.lines as Line[];
}
export function searchCatalog(lines: Line[], query: string): Line[] {
  const q = compactSearch(query);
  if (q.length < 2) return [];
  return lines
    .filter((l) =>
      matchesSearch([l.name, l.origin, l.destination], query, [l.code]),
    )
    .sort(
      (a, b) =>
        Number(compactSearch(b.code).startsWith(q)) -
        Number(compactSearch(a.code).startsWith(q)),
    );
}
