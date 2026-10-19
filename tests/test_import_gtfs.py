import unittest, importlib.util, io, zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location("gtfs", Path(__file__).parents[1] / "scripts/import-gtfs.py")
gtfs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gtfs)


class ImportGTFS(unittest.TestCase):
    def feed(self, stops=None):
        stops = stops or 'stop_id,stop_name,stop_desc,stop_lat,stop_lon\n1,Centro,Ref.: Praça,-23.5,-46.6\n2,Estação,,-23.6,-46.7\n'
        b = io.BytesIO()
        with zipfile.ZipFile(b, "w") as z:
            z.writestr("stops.txt", stops)
            z.writestr("routes.txt", "route_id,route_type\nbus,3\nmetro,1\n")
            z.writestr("trips.txt", "route_id,service_id,trip_id\nbus,s,t1\nmetro,s,t2\n")
            z.writestr("stop_times.txt", "trip_id,arrival_time,departure_time,stop_id,stop_sequence\nt1,07:00:00,07:00:00,1,1\nt2,07:00:00,07:00:00,2,1\n")
            z.writestr("calendar.txt", "service_id,start_date,end_date\ns,20231001,20270501\n")
        b.seek(0)
        return b

    def test_converte_paradas_e_marca_trilhos(self):
        d = gtfs.convert(self.feed())
        self.assertEqual(d["stops"][0], ["1", "Centro", "Praça", -23.5, -46.6, 0])
        self.assertEqual(d["stops"][1][5], 1)
        self.assertEqual((d["validFrom"], d["validTo"]), ("20231001", "20270501"))

    def test_ignora_coordenada_invalida_e_conta(self):
        d = gtfs.convert(self.feed('stop_id,stop_name,stop_desc,stop_lat,stop_lon\n1,A,,1000,-46.6\n2,B,,-23.6,-46.7\n3,C,,abc,-46.7\n'))
        self.assertEqual([s[0] for s in d["stops"]], ["2"])
        self.assertEqual(d["skipped"]["coordenada_invalida"], 2)

    def test_exige_tabelas_obrigatorias(self):
        b = io.BytesIO()
        with zipfile.ZipFile(b, "w") as z:
            z.writestr("stops.txt", "stop_id,stop_name,stop_lat,stop_lon\n")
        b.seek(0)
        with self.assertRaises(ValueError):
            gtfs.convert(b)


if __name__ == "__main__":
    unittest.main()
