import type { Line } from "../../contracts";
const KEY = "sp.favorites";
export function loadFavorites(storage: Storage): string[] {
  try {
    const data: unknown = JSON.parse(storage.getItem(KEY) || "[]");
    return Array.isArray(data)
      ? [
          ...new Set(
            data.filter(
              (x): x is string => typeof x === "string" && /^\d+$/.test(x),
            ),
          ),
        ]
      : [];
  } catch {
    return [];
  }
}
export function saveFavorites(storage: Storage, ids: string[]): boolean {
  try {
    storage.setItem(KEY, JSON.stringify([...new Set(ids)]));
    return true;
  } catch {
    return false;
  }
}

export function loadFavoriteLines(storage: Storage): Line[] {
  try {
    const data: unknown = JSON.parse(
      storage.getItem("sp.favorite-lines") || "[]",
    );
    return Array.isArray(data)
      ? data.filter(
          (v): v is Line =>
            v &&
            typeof v === "object" &&
            typeof v.id === "string" &&
            /^\d+$/.test(v.id) &&
            typeof v.code === "string" &&
            typeof v.name === "string" &&
            typeof v.origin === "string" &&
            typeof v.destination === "string" &&
            (v.direction === 1 || v.direction === 2),
        )
      : [];
  } catch {
    return [];
  }
}
export function saveFavoriteLines(storage: Storage, lines: Line[]): boolean {
  try {
    storage.setItem("sp.favorite-lines", JSON.stringify(lines));
    return true;
  } catch {
    return false;
  }
}
