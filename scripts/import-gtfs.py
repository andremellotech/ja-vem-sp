"""Converte o GTFS da SPTrans (obtido por você no portal) em public/data/stops.json.

Uso:
  python scripts/import-gtfs.py data/gtfs.zip public/data/stops.json \
    --source-url https://www.sptrans.com.br/desenvolvedores/ \
    --retrieved-at 2026-10-19 --license "CONDIÇÕES DO PORTAL SPTRANS"

Não faz downloads. Linhas inválidas são ignoradas e contadas no relatório;
o arquivo gerado fica pequeno o bastante para ser carregado pelo navegador.
"""
import argparse, csv, hashlib, io, json, math, zipfile
from pathlib import Path

RAIL_TYPES = {"1", "2"}  # metrô e trem (CPTM)


def _rows(z, name, required=True):
    if name not in z.namelist():
        if required:
            raise ValueError("Tabela ausente: " + name)
        return iter(())
    return csv.DictReader(io.TextIOWrapper(z.open(name), encoding="utf-8-sig", newline=""))


def _valid_coord(lat, lon):
    return math.isfinite(lat) and math.isfinite(lon) and abs(lat) <= 90 and abs(lon) <= 180


def convert(source):
    skipped = {"coordenada_invalida": 0, "sem_id": 0}
    with zipfile.ZipFile(source) as z:
        if sum(i.file_size for i in z.infolist()) > 2_000_000_000:
            raise ValueError("GTFS excede limite de leitura")
        # tipo de cada rota -> quais paradas são servidas por trem/metrô e por ônibus
        route_type = {r["route_id"]: r.get("route_type", "3") for r in _rows(z, "routes.txt")}
        trip_type = {t["trip_id"]: route_type.get(t["route_id"], "3") for t in _rows(z, "trips.txt")}
        rail, bus = set(), set()
        for r in _rows(z, "stop_times.txt"):
            (rail if trip_type.get(r["trip_id"], "3") in RAIL_TYPES else bus).add(r["stop_id"])
        stops, seen = [], set()
        for r in _rows(z, "stops.txt"):
            sid = (r.get("stop_id") or "").strip()
            if not sid or sid in seen:
                skipped["sem_id"] += 1
                continue
            try:
                lat, lon = float(r["stop_lat"]), float(r["stop_lon"])
            except (KeyError, ValueError):
                lat = lon = math.nan
            if not _valid_coord(lat, lon):
                skipped["coordenada_invalida"] += 1
                continue
            seen.add(sid)
            ref = (r.get("stop_desc") or "").strip()
            if ref.startswith("Ref.:"):
                ref = ref[5:].strip()
            stops.append([
                sid,
                (r.get("stop_name") or "").strip() or "Parada " + sid,
                ref,
                round(lat, 6),
                round(lon, 6),
                1 if sid in rail and sid not in bus else 0,
            ])
        dates = [d for c in _rows(z, "calendar.txt", False) for d in (c.get("start_date"), c.get("end_date")) if d]
    return {
        "version": 1,
        "fields": ["id", "name", "ref", "lat", "lon", "rail"],
        "stops": stops,
        "skipped": skipped,
        "validFrom": min(dates) if dates else None,
        "validTo": max(dates) if dates else None,
    }


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("source", type=Path)
    p.add_argument("output", type=Path)
    p.add_argument("--source-url", required=True)
    p.add_argument("--retrieved-at", required=True)
    p.add_argument("--license", required=True)
    a = p.parse_args()
    data = convert(a.source)
    with a.source.open("rb") as f:
        digest = hashlib.sha256(f.read()).hexdigest()
    data["provenance"] = {
        "source": a.source_url,
        "retrievedAt": a.retrieved_at,
        "license": a.license,
        "sha256": digest,
        "limitations": "Dados estáticos de paradas. Sem posições nem previsões em tempo real.",
    }
    a.output.parent.mkdir(parents=True, exist_ok=True)
    a.output.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(data['stops'])} paradas gravadas em {a.output} ({a.output.stat().st_size/1e6:.2f} MB); ignoradas: {data['skipped']}")


if __name__ == "__main__":
    main()
