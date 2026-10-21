import type { GoogleEmbedSelection } from "./types";
import { buildGoogleEmbedUrl } from "./url";
export default function GoogleEmbedMap({
  selection,
  apiKey,
  onBack,
}: {
  selection: GoogleEmbedSelection;
  apiKey: string;
  onBack: () => void;
}) {
  const src = buildGoogleEmbedUrl(selection, apiKey);
  if (!src) return null;
  const embedded = new URL(src);
  const fallback = new URL("https://www.google.com/maps/dir/");
  fallback.search = new URLSearchParams({
    api: "1",
    origin: embedded.searchParams.get("origin")!,
    destination: embedded.searchParams.get("destination")!,
    travelmode: selection.mode,
  }).toString();
  return (
    <div className="google-embed-map">
      <div className="google-embed-map-heading">
        <div>
          <strong>Google Maps</strong>
          <span>
            {selection.mode === "walking" ? "Caminhada" : "Transporte público"}{" "}
            · dados do Google
          </span>
        </div>
        <button type="button" onClick={onBack}>
          Voltar ao mapa SPTrans
        </button>
      </div>
      <iframe
        src={src}
        title="Trajeto no Google Maps"
        loading="lazy"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        style={{ width: "100%", minWidth: 200, minHeight: 200, border: 0 }}
      />
      <p>
        Trajeto e horários no quadro: Google. Veículos e chegadas no Já Vem SP:
        SPTrans. Se o quadro estiver indisponível,{" "}
        <a href={fallback.href} target="_blank" rel="noopener noreferrer">
          Abrir este trajeto no Google Maps
        </a>
        .
      </p>
    </div>
  );
}
