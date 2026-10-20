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
from datetime import datetime

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


def _date(value):
    if not isinstance(value, str) or len(value) != 8 or not value.isdigit():
        raise ValueError("Data GTFS inválida")
    try:
        datetime.strptime(value, "%Y%m%d")
    except ValueError as e:
        raise ValueError("Data GTFS inválida: " + value) from e
    return value


def convert_planner(source, stops_data, provenance):
    """Gera itinerários cadastrados; não deduz horários nem sentidos Olho Vivo."""
    valid_stops = {r[0] for r in stops_data["stops"]}
    with zipfile.ZipFile(source) as z:
        if sum(i.file_size for i in z.infolist()) > 2_000_000_000:
            raise ValueError("GTFS excede limite de leitura")
        routes, route_ids, bus_ids = [], set(), set()
        for r in _rows(z, "routes.txt"):
            rid = (r.get("route_id") or "").strip()
            if not rid or rid in route_ids:
                raise ValueError("Identificador de rota ausente ou repetido")
            route_ids.add(rid)
            if r.get("route_type") == "3":
                bus_ids.add(rid)
                routes.append(dict(id=rid, code=(r.get("route_short_name") or rid).strip(), name=(r.get("route_long_name") or rid).strip()))
        trips, all_trips, bus_trips = [], set(), {}
        for t in _rows(z, "trips.txt"):
            tid, rid = t.get("trip_id"), t.get("route_id")
            if not tid or tid in all_trips or rid not in route_ids:
                raise ValueError("Referência de viagem inválida")
            all_trips.add(tid)
            if rid not in bus_ids:
                continue
            if not t.get("service_id"):
                raise ValueError("Viagem sem serviço")
            row = dict(id=tid, routeId=rid, headsign=(t.get("trip_headsign") or "").strip() or "Destino não informado", direction=t.get("direction_id") or None, serviceId=t["service_id"], stopIds=[])
            trips.append(row)
            bus_trips[tid] = (row, {})
        for s in _rows(z, "stop_times.txt"):
            tid = s.get("trip_id")
            if tid not in all_trips:
                raise ValueError("Parada referencia viagem inexistente")
            if tid not in bus_trips:
                continue
            row, sequence = bus_trips[tid]
            try:
                n = int(s["stop_sequence"])
            except (KeyError, ValueError) as e:
                raise ValueError("Sequência inválida") from e
            sid = s.get("stop_id")
            if n < 0 or n in sequence or sid not in valid_stops:
                raise ValueError("Parada ou sequência inconsistente")
            sequence[n] = sid
        for row, sequence in bus_trips.values():
            if not sequence:
                raise ValueError("Viagem sem paradas: " + row["id"])
            row["stopIds"] = [sequence[n] for n in sorted(sequence)]
        calendars, exceptions, services, dates = [], [], set(), []
        days = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
        for c in _rows(z, "calendar.txt", False):
            sid = c.get("service_id")
            start, end = _date(c.get("start_date")), _date(c.get("end_date"))
            if not sid or sid in services or start > end or any(c.get(d) not in ("0", "1") for d in days):
                raise ValueError("Calendário inválido")
            services.add(sid)
            dates.extend((start, end))
            calendars.append(dict(id=sid, start=start, end=end, weekdays=[c[d] == "1" for d in days]))
        seen_exceptions = set()
        for e in _rows(z, "calendar_dates.txt", False):
            sid, date, kind = e.get("service_id"), _date(e.get("date")), e.get("exception_type")
            if not sid or kind not in ("1", "2") or (sid, date) in seen_exceptions:
                raise ValueError("Exceção de calendário inválida")
            seen_exceptions.add((sid, date))
            services.add(sid)
            dates.append(date)
            exceptions.append(dict(serviceId=sid, date=date, added=kind == "1"))
        if not trips or not dates or any(t["serviceId"] not in services for t in trips):
            raise ValueError("Viagens sem calendário de serviço")
    return dict(version=1, provenance=dict(provenance), validFrom=min(dates), validTo=max(dates), routes=routes, trips=trips, calendars=calendars, exceptions=exceptions)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("source", type=Path)
    p.add_argument("output", type=Path)
    p.add_argument("--source-url", required=True)
    p.add_argument("--retrieved-at", required=True)
    p.add_argument("--license", required=True)
    p.add_argument("--planner-output", type=Path)
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
    planner = convert_planner(a.source, data, data["provenance"]) if a.planner_output else None
    a.output.parent.mkdir(parents=True, exist_ok=True)
    a.output.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(data['stops'])} paradas gravadas em {a.output} ({a.output.stat().st_size/1e6:.2f} MB); ignoradas: {data['skipped']}")
    if planner is not None:
        a.planner_output.parent.mkdir(parents=True, exist_ok=True)
        a.planner_output.write_text(json.dumps(planner, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"{len(planner['routes'])} rotas de ônibus e {len(planner['trips'])} viagens gravadas em {a.planner_output}")


if __name__ == "__main__":
    main()
