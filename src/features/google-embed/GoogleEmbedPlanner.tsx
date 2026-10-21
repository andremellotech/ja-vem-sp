import { useState } from "react";
import { MapPin, ArrowUpRight } from "lucide-react";
import type { Point } from "../journey/types";
import type { GoogleEmbedSelection } from "./types";
import { buildGoogleEmbedUrl } from "./url";
type Props = {
  origin: Point;
  destination: Point;
  apiKey: string;
  onSelection: (selection: GoogleEmbedSelection | null) => void;
  onBegin: () => void;
  onShowMap?: () => void;
  onSearchBus?: (code: string) => void;
};
export default function GoogleEmbedPlanner({
  origin,
  destination,
  apiKey,
  onSelection,
  onBegin,
  onShowMap,
  onSearchBus,
}: Props) {
  const [mode, setMode] = useState<GoogleEmbedSelection["mode"]>("walking");
  const [code, setCode] = useState("");
  const selection = {
    origin: { lat: origin.lat, lon: origin.lon },
    destination: { lat: destination.lat, lon: destination.lon },
    mode,
  };
  const available = !!buildGoogleEmbedUrl(selection, apiKey);
  return (
    <section
      className="google-embed-planner"
      aria-label="Google Maps dentro do site"
    >
      <span className="eyebrow">OUTRAS FORMAS DE CHEGAR</span>
      <h3>
        <MapPin size={18} /> Google Maps aqui
      </h3>
      <p>Compare caminhada e transporte público no quadro do Google.</p>
      <label htmlFor="google-embed-mode">Modo no Google</label>
      <select
        id="google-embed-mode"
        value={mode}
        onChange={(e) => {
          onSelection(null);
          setMode(e.target.value as GoogleEmbedSelection["mode"]);
        }}
      >
        <option value="walking">Caminhada</option>
        <option value="transit">Transporte público</option>
      </select>
      <p className="google-embed-privacy">
        Ao mostrar, os dois pontos confirmados são enviados diretamente ao
        Google, incluindo GPS se usado. O site não lê nem salva o trajeto do
        quadro.
      </p>
      {!available && (
        <p>
          Google dentro do site ainda não está configurado. Use os links abaixo.
        </p>
      )}
      <button
        className="google-embed-submit"
        type="button"
        disabled={!available}
        onClick={() => {
          onBegin();
          onSelection(selection);
          onShowMap?.();
        }}
      >
        Mostrar trajeto Google <ArrowUpRight size={16} />
      </button>
      <p className="google-embed-privacy">
        Se o quadro não mostrar um trajeto, use a alternativa em outra aba
        abaixo. O site não consegue verificar o resultado do Google.
      </p>
      {onSearchBus && (
        <form
          className="google-bus-search"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) onSearchBus(code.trim());
          }}
        >
          <label htmlFor="google-bus-code">
            Código de ônibus visto no Google
          </label>
          <p>
            Digite o código da linha para consultar veículos e chegadas na
            SPTrans. Escolha o sentido nos resultados; não há associação
            automática.
          </p>
          <input
            id="google-bus-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Ex.: 675K-10"
            maxLength={30}
          />
          <button type="submit" disabled={!code.trim()}>
            Buscar linha na SPTrans
          </button>
        </form>
      )}
    </section>
  );
}
