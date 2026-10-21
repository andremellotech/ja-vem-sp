"""Deriva trajetos multimodais e shapes compactas do mesmo GTFS das paradas.

Não baixa dados e não altera os datasets auditados de ônibus.
Uso: python scripts/import-paths.py SOURCE STOPS_JSON OUTPUT_DIR MULTIMODAL_JSON
"""
import argparse, hashlib, importlib.util, json, math, zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location("base_gtfs", Path(__file__).with_name("import-gtfs.py"))
gtfs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gtfs)
MODES = {"3": "bus", "1": "metro", "2": "train"}


def encode(points):
    output, previous = [], [0, 0]
    for point in points:
        for axis, coordinate in enumerate(point):
            current = round(coordinate * 100000)
            delta = current - previous[axis]
            previous[axis] = current
            value = ~(delta << 1) if delta < 0 else delta << 1
            while value >= 32:
                output.append(chr((32 | (value & 31)) + 63))
                value >>= 5
            output.append(chr(value + 63))
    return "".join(output)


def convert_paths(source, network):
    source = Path(source)
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    provenance = network.get("provenance", {})
    if provenance.get("sha256") != digest:
        raise ValueError("O GTFS e a base de paradas são de versões diferentes")
    data = gtfs.convert_planner(source, network, provenance, allowed_types=tuple(MODES))
    stops = {row[0]: (row[3], row[4]) for row in network["stops"]}
    with zipfile.ZipFile(source) as z:
        metadata = {r["route_id"]: r for r in gtfs._rows(z, "routes.txt")}
        trip_shapes = {t["trip_id"]: t.get("shape_id") for t in gtfs._rows(z, "trips.txt")}
        shapes = {}
        for row in gtfs._rows(z, "shapes.txt", False):
            try:
                sid, sequence = row["shape_id"], int(row["shape_pt_sequence"])
                lat, lon = float(row["shape_pt_lat"]), float(row["shape_pt_lon"])
            except (KeyError, ValueError) as e:
                raise ValueError("Ponto de shape inválido") from e
            shape = shapes.setdefault(sid, {})
            if not sid or sequence < 0 or sequence in shape or not gtfs._valid_coord(lat, lon):
                raise ValueError("Shape ou sequência inconsistente")
            shape[sequence] = (lat, lon)
    shapes = {sid: [points[n] for n in sorted(points)] for sid, points in shapes.items()}
    for route in data["routes"]:
        meta = metadata[route["id"]]
        route["mode"] = MODES[meta["route_type"]]
        color = meta.get("route_color", "").upper()
        if len(color) == 6 and all(c in "0123456789ABCDEF" for c in color):
            route["color"] = color
    buckets = [{"version": 1, "provenance": dict(provenance), "paths": {}} for _ in range(16)]
    report = {"missingShapes": 0, "unmatchedTrips": 0, "partialPaths": 0, "paths": 0, "points": 0}
    encoded = {}
    for trip in data["trips"]:
        shape_id = trip_shapes.get(trip["id"])
        points = shapes.get(shape_id, [])
        if len(points) < 2:
            report["missingShapes"] += 1
            continue
        indices, previous, unmatched = [], 0, False
        for stop_id in trip["stopIds"]:
            lat, lon = stops[stop_id]
            scale = math.cos(math.radians(lat))
            nearest = min(range(previous, len(points)), key=lambda n: (points[n][0]-lat)**2 + ((points[n][1]-lon)*scale)**2)
            # Do not manufacture a shape connection to a distant/unmatched stop.
            if ((points[nearest][0]-lat)**2 + ((points[nearest][1]-lon)*scale)**2)**0.5 * 111320 > 1000:
                unmatched = True
                indices.append(None)
                continue
            indices.append(nearest)
            previous = nearest
        if sum(n is not None for n in indices) < 2:
            report["unmatchedTrips"] += 1
            continue
        if unmatched: report["partialPaths"] += 1
        if shape_id not in encoded: encoded[shape_id] = encode(points)
        bucket = sum(trip["id"].encode("utf-8")) % 16
        buckets[bucket]["paths"][trip["id"]] = {"polyline": encoded[shape_id], "stopIndices": indices}
        report["paths"] += 1
        report["points"] += len(points)
    return data, buckets, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("source", "stops_json", "output_dir", "multimodal_json"):
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    data, buckets, report = convert_paths(args.source, json.loads(args.stops_json.read_text(encoding="utf-8")))
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for n, bucket in enumerate(buckets):
        (args.output_dir / f"{n:02}.json").write_text(json.dumps(bucket, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    args.multimodal_json.parent.mkdir(parents=True, exist_ok=True)
    args.multimodal_json.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"routes": len(data["routes"]), "trips": len(data["trips"]), **report}))


if __name__ == "__main__": main()
