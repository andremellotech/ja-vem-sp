import csv, hashlib, importlib.util, io, json, tempfile, unittest, zipfile
from pathlib import Path

SCRIPT = Path(__file__).parents[1] / "scripts/import-paths.py"


def source(**replace):
    tables = {
        "routes.txt": "route_id,route_short_name,route_long_name,route_type,route_color\nb,1000-10,Centro,3,123456\nm,L1,Metro,1,0455A1\nt,L9,Trem,2,00AA88\n",
        "trips.txt": "route_id,service_id,trip_id,trip_headsign,direction_id,shape_id\nb,daily,b1,Centro,0,s1\nm,daily,m1,Norte,0,s2\nt,daily,t1,Sul,1,s3\n",
        "stops.txt": "stop_id,stop_name,stop_lat,stop_lon\nA,Inicio,-23.55,-46.63\nB,Meio,-23.56,-46.64\nC,Fim,-23.57,-46.65\n",
        "stop_times.txt": "trip_id,stop_id,stop_sequence\nb1,A,1\nb1,B,2\nm1,A,1\nm1,C,2\nt1,C,1\nt1,A,2\n",
        "shapes.txt": "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\ns1,-23.55,-46.63,1\ns1,-23.56,-46.64,2\ns2,-23.55,-46.63,1\ns2,-23.56,-46.64,2\ns2,-23.57,-46.65,3\ns3,-23.57,-46.65,1\ns3,-23.55,-46.63,2\n",
        "calendar.txt": "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\ndaily,1,1,1,1,1,1,1,20260101,20270501\n",
    }
    tables.update(replace)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as z:
        for name, text in tables.items(): z.writestr(name, text)
    return buffer.getvalue()


class ImportPaths(unittest.TestCase):
    def run_import(self, content=None, corrupt_hash=False):
        # Load inside each test so RED is an explicit missing implementation assertion.
        self.assertTrue(SCRIPT.exists(), "importador de caminhos ainda não existe")
        spec = importlib.util.spec_from_file_location("paths_gtfs", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory(dir=Path(__file__).parents[1]) as folder:
            root = Path(folder); feed = root / "feed.zip"
            feed.write_bytes(content if content is not None else source())
            provenance = dict(source="official", retrievedAt="2026-10-19", license="portal", sha256=hashlib.sha256(feed.read_bytes()).hexdigest())
            stops = {"version": 1, "provenance": provenance | ({"sha256": "0"*64} if corrupt_hash else {}), "stops": [["A","Inicio","",-23.55,-46.63,0],["B","Meio","",-23.56,-46.64,0],["C","Fim","",-23.57,-46.65,1]]}
            result, buckets, report = module.convert_paths(feed, stops)
            return result, buckets, report

    def test_todos_modos_calendario_e_bucket_reproduzivel(self):
        data, buckets, report = self.run_import()
        self.assertEqual([r["mode"] for r in data["routes"]], ["bus", "metro", "train"])
        self.assertEqual(data["routes"][1]["color"], "0455A1")
        self.assertEqual(data["trips"][1]["stopIds"], ["A", "C"])
        self.assertEqual(data["validTo"], "20270501")
        self.assertEqual(len(buckets), 16)
        path = buckets[sum("m1".encode()) % 16]["paths"]["m1"]
        self.assertEqual(path["stopIndices"], [0, 2])
        self.assertTrue(path["polyline"])
        self.assertEqual(buckets[0]["provenance"]["sha256"], data["provenance"]["sha256"])
        self.assertEqual(report["missingShapes"], 0)

    def test_shape_ausente_contabilizada_sem_inventar(self):
        _, buckets, report = self.run_import(source(**{"shapes.txt": "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n"}))
        self.assertEqual(report["missingShapes"], 3)
        self.assertFalse(any(b["paths"] for b in buckets))

    def test_rejeita_shape_com_ordem_duplicada(self):
        with self.assertRaises(ValueError):
            self.run_import(source(**{"shapes.txt": "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\ns1,-23.55,-46.63,1\ns1,-23.56,-46.64,1\n"}))

    def test_rejeita_base_de_outra_versao(self):
        with self.assertRaises(ValueError): self.run_import(corrupt_hash=True)

    def test_preserva_trecho_coberto_quando_shape_nao_chega_ao_terminal(self):
        tables = {
            "stop_times.txt": "trip_id,stop_id,stop_sequence\nb1,A,1\nb1,B,2\nm1,A,1\nm1,B,2\nm1,C,3\nt1,C,1\nt1,A,2\n",
            "shapes.txt": "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\ns2,-23.56,-46.64,1\ns2,-23.57,-46.65,2\n",
        }
        _, buckets, report = self.run_import(source(**tables))
        path = buckets[sum(b"m1") % 16]["paths"].get("m1")
        self.assertIsNotNone(path)
        self.assertEqual(path["stopIndices"], [None, 0, 1])
        self.assertEqual(report["partialPaths"], 1)


if __name__ == "__main__": unittest.main()
