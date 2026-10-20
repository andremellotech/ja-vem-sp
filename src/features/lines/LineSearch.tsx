import { useEffect, useRef, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import type { Line } from "../../contracts";
import { parseLineCatalog, searchCatalog } from "./catalog";
type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onSelect: (line: Line) => void;
  active?: boolean;
};
export default function LineSearch({
  value,
  onChange,
  onSubmit,
  onSelect,
  active = true,
}: Props) {
  const [catalog, setCatalog] = useState<Line[]>([]),
    [error, setError] = useState(false),
    [open, setOpen] = useState(true),
    [selected, setSelected] = useState(-1);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    if (!active) return;
    const c = new AbortController();
    fetch(import.meta.env.BASE_URL + "data/lines.json", { signal: c.signal })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((v) => {
        if (!c.signal.aborted) {
          setCatalog(parseLineCatalog(v));
          setError(false);
        }
      })
      .catch(() => {
        if (!c.signal.aborted) setError(true);
      });
    return () => c.abort();
  }, [active]);
  useEffect(() => {
    setSelected(-1);
  }, [value]);
  useEffect(() => {
    setOpen(active);
    setSelected(-1);
  }, [active]);
  useEffect(() => {
    if (selected >= 0)
      refs.current[selected]?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);
  const matches = active && open ? searchCatalog(catalog, value) : [];
  function choose(line: Line) {
    setOpen(false);
    setSelected(-1);
    onSelect(line);
  }
  return (
    <div className="line-search">
      <form
        className="search-box"
        onSubmit={(e) => {
          e.preventDefault();
          setOpen(false);
          onSubmit();
        }}
      >
        <label htmlFor="line-search">BUSQUE SUA LINHA</label>
        <div className="search-input">
          <Search size={20} />
          <input
            id="line-search"
            role="combobox"
            aria-label="Linha ou destino"
            aria-autocomplete="list"
            aria-controls="line-suggestions"
            aria-expanded={!!matches.length}
            aria-activedescendant={
              selected >= 0 && matches[selected]
                ? "line-option-" + selected
                : undefined
            }
            autoComplete="off"
            placeholder="Código, nome ou terminal"
            value={value}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setSelected(-1);
              setOpen(true);
              onChange(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                setSelected(-1);
              } else if (
                matches.length &&
                (e.key === "ArrowDown" || e.key === "ArrowUp")
              ) {
                e.preventDefault();
                setSelected((i) =>
                  i < 0
                    ? e.key === "ArrowDown"
                      ? 0
                      : matches.length - 1
                    : (i + (e.key === "ArrowDown" ? 1 : -1) + matches.length) %
                      matches.length,
                );
              } else if (
                e.key === "Enter" &&
                selected >= 0 &&
                matches[selected]
              ) {
                e.preventDefault();
                choose(matches[selected]);
              }
            }}
          />
          <button type="submit" aria-label="Buscar ônibus">
            <ArrowRight size={21} />
          </button>
        </div>
      </form>
      {!!matches.length && (
        <div
          id="line-suggestions"
          role="listbox"
          aria-label="Sugestões de linhas"
          className="line-suggestions"
        >
          {matches.map((line, i) => (
            <button
              type="button"
              role="option"
              aria-selected={i === selected}
              id={"line-option-" + i}
              key={line.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              onClick={() => choose(line)}
            >
              <strong>
                {line.code} · {line.destination}
              </strong>
              <small>
                De {line.origin} · sentido {line.direction}
              </small>
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="muted">
          Sugestões locais indisponíveis. Use o botão de busca.
        </p>
      )}
    </div>
  );
}
