import { expect, it } from "vitest";
import { matchesSearch } from "../src/features/search/text";
it("aceita os títulos e tipos de via abreviados do cadastro de paradas", () => {
  for (const [value, query] of [
    ["R. Pe. Bernardino Bandeira", "padre bernardino rua"],
    ["Av. Dr. Arnaldo", "avenida doutor arnaldo"],
    ["Av. Prof. Xavier de Lima", "lima professor xavier"],
    ["Pq. Dom Pedro II", "parque dom pedro"],
    ["R. Eng. Carlos", "engenheiro carlos"],
  ])
    expect(matchesSearch([value], query)).toBe(true);
});
it("não ignora bairros, números ou palavras diferentes para forçar um resultado", () => {
  expect(matchesSearch(["Vila Paranaguá"], "Lapa")).toBe(false);
  expect(matchesSearch(["Rua Nazareth"], "ana")).toBe(false);
  expect(
    matchesSearch(["R. Pe. Bernardino Bandeira, 101"], "Bernardino 102"),
  ).toBe(false);
  expect(matchesSearch(["Terminal Campo Limpo"], "campo pinheiros")).toBe(
    false,
  );
});
it("encontra cidades, hospitais e estações abreviadas sem tratar nomes completos diferentes como iguais", () => {
  expect(
    matchesSearch(["TERM. CID. TIRADENTES"], "terminal cidade tiradentes"),
  ).toBe(true);
  expect(matchesSearch(["HOSP. DAS CLÍNICAS"], "hospital clinicas")).toBe(true);
  expect(matchesSearch(["EST. AUTÓDROMO"], "estacao autodromo")).toBe(true);
  expect(matchesSearch(["EST. DO CAMPO LIMPO"], "estrada campo limpo")).toBe(
    true,
  );
  expect(matchesSearch(["Estação Autódromo"], "estrada autodromo")).toBe(false);
  expect(matchesSearch(["Estrada do Campo Limpo"], "estacao campo limpo")).toBe(
    false,
  );
});
