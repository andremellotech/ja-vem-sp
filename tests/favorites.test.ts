import { describe, it, expect } from "vitest";
import {
  loadFavorites,
  saveFavorites,
  loadFavoriteLines,
  saveFavoriteLines,
} from "../src/features/favorites/storage";
describe("favoritos", () => {
  it("deduplica e persiste linhas", () => {
    localStorage.clear();
    expect(saveFavorites(localStorage, ["198", "198", "42"])).toBe(true);
    expect(loadFavorites(localStorage)).toEqual(["198", "42"]);
  });
  it("sobrevive a armazenamento corrompido", () => {
    localStorage.setItem("sp.favorites", "{");
    expect(loadFavorites(localStorage)).toEqual([]);
  });
  it("sobrevive a armazenamento bloqueado", () => {
    const storage = {
      getItem() {
        throw Error("blocked");
      },
      setItem() {
        throw Error("blocked");
      },
    } as unknown as Storage;
    expect(loadFavorites(storage)).toEqual([]);
    expect(saveFavorites(storage, ["1"])).toBe(false);
  });
});
it("preserva dados da linha favorita após recarregar", () => {
  const line = {
    id: "198",
    code: "675K-10",
    name: "Centro",
    direction: 1 as const,
    origin: "Bairro",
    destination: "Centro",
  };
  saveFavoriteLines(localStorage, [line]);
  expect(loadFavoriteLines(localStorage)).toEqual([line]);
  localStorage.setItem("sp.favorite-lines", '[{\"id\":4}]');
  expect(loadFavoriteLines(localStorage)).toEqual([]);
});
