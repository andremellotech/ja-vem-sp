"""Exporta tempos e frequências GTFS alinhados ao planejador, sem baixar dados."""
import argparse, csv, hashlib, importlib.util, io, json, re, zipfile
from pathlib import Path
spec = importlib.util.spec_from_file_location("base_gtfs", Path(__file__).with_name("import-gtfs.py"))
gtfs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gtfs)

def seconds(value):
    if not isinstance(value, str) or not re.fullmatch(r"[0-4]?\d:[0-5]\d:[0-5]\d", value):
        raise ValueError("Tempo ausente ou inválido")
    h,m,s=map(int,value.split(":"))
    return h*3600+m*60+s

def convert(source, planner):
    blob = Path(source).read_bytes() if isinstance(source,(str,Path)) else source.getvalue()
    if hashlib.sha256(blob).hexdigest() != planner["provenance"]["sha256"]:
        raise ValueError("GTFS e planejador de versões diferentes")
    schedules = gtfs.convert_schedules(io.BytesIO(blob), planner)
    windows = {t["id"]:t["windows"] for t in schedules["trips"]}
    rows = {t["id"]:[] for t in planner["trips"]}
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        for row in gtfs._rows(z,"stop_times.txt"):
            if row.get("trip_id") in rows:
                rows[row["trip_id"]].append(row)
    trips, omitted = {}, []
    for trip in planner["trips"]:
        try:
            ordered = sorted(rows[trip["id"]],key=lambda r:int(r["stop_sequence"]))
            seq=[int(r["stop_sequence"]) for r in ordered]
            ids=[r["stop_id"] for r in ordered]
            arrivals=[seconds(r.get("arrival_time")) for r in ordered]
            departures=[seconds(r.get("departure_time")) for r in ordered]
            if not seq or len(set(seq))!=len(seq) or ids!=trip["stopIds"] or any(a>d or (i and a<departures[i-1]) for i,(a,d) in enumerate(zip(arrivals,departures))):
                raise ValueError("Sequência temporal incompatível")
            trips[trip["id"]]=dict(stopIds=ids,arrivalS=arrivals,departureS=departures,windows=[[w["start"],w["end"],w["headwayS"],w["exactTimes"]] for w in windows[trip["id"]]])
        except (ValueError,KeyError,TypeError):
            omitted.append(trip["id"])
    return {k:planner[k] for k in ("version","provenance","validFrom","validTo")} | dict(trips=trips,omittedTrips=omitted)

if __name__ == "__main__":
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("source",type=Path);p.add_argument("planner",type=Path);p.add_argument("output",type=Path)
    a=p.parse_args();data=convert(a.source,json.loads(a.planner.read_text(encoding="utf-8")))
    a.output.write_text(json.dumps(data,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print(f'{len(data["trips"])} tempos de viagens; {len(data["omittedTrips"])} omitidos')

