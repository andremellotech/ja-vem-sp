import type { WalkingStep } from "./types";
export function walkingInstruction(
  step: WalkingStep,
  mode: "foot" | "car" = "foot",
): string {
  const side: Record<string, string> = {
    left: "à esquerda",
    right: "à direita",
    "slight left": "levemente à esquerda",
    "slight right": "levemente à direita",
    "sharp left": "à esquerda",
    "sharp right": "à direita",
    straight: "em frente",
    uturn: "e retorne",
  };
  const road = step.name ? ` em ${step.name}` : "";
  if (step.type === "arrive") return "Você chegou ao destino deste trecho";
  if (step.type === "depart")
    return mode === "car" ? `Saia${road}` : `Comece a caminhada${road}`;
  if (step.modifier === "uturn") return `Faça o retorno${road}`;
  const direction = side[step.modifier ?? ""] ?? "em frente";
  if (step.type === "on ramp") return `Pegue o acesso ${direction}${road}`;
  if (step.type === "off ramp") return `Pegue a saída ${direction}${road}`;
  if (["exit roundabout", "exit rotary"].includes(step.type))
    return `Saia da rotatória ${direction}${road}`;
  if (["roundabout", "rotary", "roundabout turn"].includes(step.type))
    return `Na rotatória, ${step.exit ? `use a saída ${step.exit}` : `siga ${direction}`}${road}`;
  if (["turn", "fork", "end of road", "merge"].includes(step.type))
    return `Siga ${side[step.modifier ?? ""] ?? "em frente"}${road}`;
  return step.modifier ? `Siga ${direction}${road}` : `Continue${road}`;
}
