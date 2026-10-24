import { expect, it } from "vitest";
import { parseMapPoint } from "../src/features/journey/map-point-input";

it.each([
  "-23.5614, -46.6559",
  "-23,5614; -46,6559",
  "https://www.google.com/maps/search/?api=1&query=-23.5614%2C-46.6559",
  "https://maps.google.com/?q=-23.5614,-46.6559",
  "https://www.google.com.br/maps/place/Exemplo/@-23.55,-46.63,17z/data=!4m2!3d-23.5614!4d-46.6559",
])("usa as coordenadas explícitas do ponto colado: %s", (value) => {
  expect(parseMapPoint(value)).toEqual({ lat: -23.5614, lon: -46.6559 });
});
it.each([
  "",
  "91, -46",
  "-23, -181",
  "NaN,Infinity",
  "-23.5,-46.6;0,0",
  "https://example.com/?q=-23.56,-46.65",
  "https://google.com.evil.test/maps/?q=-23.56,-46.65",
  "javascript:alert(1)",
  "http://maps.google.com/?q=-23.56,-46.65",
  "https://www.google.com/maps/dir/?api=1&destination=-23.56,-46.65",
])(
  "recusa conteúdo inválido ou que não identifica um único ponto: %s",
  (value) => {
    expect(() => parseMapPoint(value)).toThrow();
  },
);
it("não confunde o centro da tela do Google com a entrada do imóvel", () => {
  expect(() =>
    parseMapPoint("https://www.google.com/maps/@-23.5614,-46.6559,17z"),
  ).toThrow(/centro|coordenadas/);
});
it("explica como usar link curto sem enviar a localização a outro serviço", () => {
  expect(() => parseMapPoint("https://maps.app.goo.gl/Exemplo")).toThrow(
    /curto/,
  );
});
