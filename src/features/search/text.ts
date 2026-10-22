const aliases: Record<string, string> = {
  r: "rua",
  av: "avenida",
  tv: "travessa",
  tr: "travessa",
  trv: "travessa",
  al: "alameda",
  estr: "estrada",
  pca: "praca",
  sto: "santo",
  sta: "santa",
  term: "terminal",
  jd: "jardim",
  vl: "vila",
  pe: "padre",
  dr: "doutor",
  dra: "doutora",
  prof: "professor",
  eng: "engenheiro",
  pres: "presidente",
  rod: "rodovia",
  lgo: "largo",
  pq: "parque",
  cid: "cidade",
  hosp: "hospital",
};
// In the source data, “Est.” may mean either estação or estrada. Keep that
// ambiguity only for the abbreviation; full names do not become synonyms.
const alternatives = (word: string) =>
  word === "est" ? ["est", "estacao", "estrada"] : [word];
const connectors = new Set(["de", "da", "do", "das", "dos", "e"]);
export function searchWords(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((s) => aliases[s] ?? s);
}
export function matchesSearch(
  values: (string | undefined)[],
  query: string,
  codes: string[] = [],
): boolean {
  const terms = searchWords(query).filter((s) => !connectors.has(s));
  const fields = values
    .filter((s): s is string => !!s)
    .map((s) => searchWords(s));
  if (!terms.length) return !query.trim();
  // Only identifiers are compacted: “Vila Paranaguá” must not match “Lapa”.
  const identifiers = codes.map(compactSearch);
  return terms.every(
    (term) =>
      identifiers.some((code) => code.includes(term)) ||
      fields.some((words) =>
        words.some((word) =>
          alternatives(word).some((w) =>
            alternatives(term).some((t) => w.includes(t)),
          ),
        ),
      ),
  );
}
export const compactSearch = (value: string) => searchWords(value).join("");
