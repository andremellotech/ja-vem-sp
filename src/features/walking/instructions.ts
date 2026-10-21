import type { WalkingStep } from "./types";
export function walkingInstruction(step: WalkingStep): string {
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
  if (step.type === "depart") return `Comece a caminhada${road}`;
  if (["roundabout", "rotary", "roundabout turn"].includes(step.type))
    return `Na rotatória, ${step.exit ? `use a saída ${step.exit}` : "siga o caminho indicado"}${road}`;
  if (["turn", "fork", "end of road", "merge"].includes(step.type))
    return `Siga ${side[step.modifier ?? ""] ?? "em frente"}${road}`;
  return `Continue${road}`;
}
