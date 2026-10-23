import { expect, it } from "vitest";
import { buildJourneySteps } from "../src/features/journey/steps";
import { doorOption, home, destination } from "./door-to-door-fixture";
it("preserva saída, metrô, baldeação a pé, trem, ônibus e destino em ordem", () => {
  const steps = buildJourneySteps(
    doorOption,
    home,
    destination,
    "Casa escolhida",
    "Destino escolhido",
  );
  expect(steps.map((s) => s.kind)).toEqual([
    "walk",
    "metro",
    "walk",
    "train",
    "walk",
    "bus",
    "walk",
  ]);
  expect(steps[0].from).toMatchObject({ ...home, label: "Casa escolhida" });
  expect(steps.at(-1)!.to).toMatchObject({
    ...destination,
    label: "Destino escolhido",
  });
  expect(steps[4].from.label).toBe("Estação Final");
  expect(steps[4].to.label).toBe("Ponto do Ônibus");
  expect(steps[5].lineCode).toBe("476A-10");
  expect(steps[2].message).toContain("vias externas");
  expect(steps[4].message).toBeUndefined();
});
it("mantém conexão no mesmo ponto sem inventar caminho na rua", () => {
  const option = {
    ...doorOption,
    legs: [
      doorOption.legs[0],
      { ...doorOption.legs[1], from: doorOption.legs[0].to },
    ],
  };
  const steps = buildJourneySteps(option, home, destination, "Casa", "Destino");
  expect(steps[2]).toMatchObject({ kind: "walk", status: "nearby" });
  expect(steps[2].walk).toBeUndefined();
  expect(steps.map((s) => s.kind)).toEqual([
    "walk",
    "metro",
    "walk",
    "train",
    "walk",
  ]);
});
