import { expect, it } from "vitest";
import { buildGoogleEmbedUrl } from "../src/features/google-embed/url";
const selection = {
  origin: { lat: -23.55, lon: -46.63 },
  destination: { lat: -23.59, lon: -46.67 },
  mode: "walking" as const,
};
it("emits only official Embed directions parameters with escaped key and coordinates", () => {
  expect(buildGoogleEmbedUrl(selection, "test &key=other")).toBe(
    "https://www.google.com/maps/embed/v1/directions?key=test+%26key%3Dother&origin=-23.550000%2C-46.630000&destination=-23.590000%2C-46.670000&mode=walking&language=pt-BR&region=BR&units=metric",
  );
  expect(
    new URL(
      buildGoogleEmbedUrl({ ...selection, mode: "transit" }, "fixture")!,
    ).searchParams.get("mode"),
  ).toBe("transit");
});
it.each(["", "   "])("does not produce iframe URL with missing key %s", (key) =>
  expect(buildGoogleEmbedUrl(selection, key)).toBeNull(),
);
it.each([
  { lat: NaN, lon: 0 },
  { lat: Infinity, lon: 0 },
  { lat: 91, lon: 0 },
  { lat: 0, lon: -181 },
])("rejects invalid coordinates %o at either end", (point) => {
  expect(
    buildGoogleEmbedUrl({ ...selection, origin: point }, "fixture"),
  ).toBeNull();
  expect(
    buildGoogleEmbedUrl({ ...selection, destination: point }, "fixture"),
  ).toBeNull();
});
it("rejects unsupported runtime modes", () =>
  expect(
    buildGoogleEmbedUrl({ ...selection, mode: "rail" as "walking" }, "fixture"),
  ).toBeNull());
