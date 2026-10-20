import type { Line } from "../../contracts";
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
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
  const q = normalize(query);
  if (q.length < 2) return [];
  return lines
    .filter((l) =>
      [l.code, l.name, l.origin, l.destination].some((s) =>
        normalize(s).includes(q),
      ),
    )
    .sort(
      (a, b) =>
        Number(normalize(b.code).startsWith(q)) -
        Number(normalize(a.code).startsWith(q)),
    )
    .slice(0, 8);
}
