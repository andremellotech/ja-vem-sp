import unittest, importlib.util, io, zipfile
from unittest.mock import patch
import tempfile, sys, json
from pathlib import Path

spec = importlib.util.spec_from_file_location('schedule_gtfs', Path(__file__).parents[1] / 'scripts/import-gtfs.py')
gtfs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gtfs)
PLANNER = dict(version=1, provenance={'sha256': 'a'*64}, validFrom='20260101', validTo='20261231', calendars=[], exceptions=[], trips=[dict(id='t1', routeId='r', headsign='Centro', direction='0', serviceId='daily')])

def source(frequencies):
    data = io.BytesIO()
    with zipfile.ZipFile(data, 'w') as z:
        z.writestr('trips.txt', 'trip_id,route_id\nt1,r\nrail,m\n')
        z.writestr('frequencies.txt', frequencies)
    data.seek(0)
    return data

class ImportSchedules(unittest.TestCase):
    def test_horas_nao_limitadas_a_tres_digitos_e_inteiros_seguros(self):
        data = gtfs.convert_schedules(source('trip_id,start_time,end_time,headway_secs\nt1,1000:00:00,1001:00:00,600\n'), PLANNER)
        self.assertEqual(data['trips'][0]['windows'][0]['start'], 3600000)
        with self.assertRaises(ValueError):
            gtfs.convert_schedules(source('trip_id,start_time,end_time,headway_secs\nt1,99999999999999:00:00,99999999999999:59:00,600\n'), PLANNER)

    def test_preserva_exact_times_e_rejeita_mistura_por_itinerario(self):
        data = gtfs.convert_schedules(source('trip_id,start_time,end_time,headway_secs,exact_times\nt1,06:00:00,07:00:00,600,1\n'), PLANNER)
        self.assertTrue(data['trips'][0]['windows'][0]['exactTimes'])
        with self.assertRaises(ValueError):
            gtfs.convert_schedules(source('trip_id,start_time,end_time,headway_secs,exact_times\nt1,06:00:00,07:00:00,600,1\nt1,07:00:00,08:00:00,600,0\n'), PLANNER)

    def test_cli_legado_sem_frequencies_continua_funcionando(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parents[1]) as directory:
            root = Path(directory)
            gtfs_file = root / 'gtfs.zip'
            with zipfile.ZipFile(gtfs_file, 'w') as z:
                z.writestr('routes.txt', 'route_id,route_type\nbus,3\n')
                z.writestr('trips.txt', 'route_id,service_id,trip_id\nbus,daily,t1\n')
                z.writestr('stop_times.txt', 'trip_id,stop_id,stop_sequence\nt1,A,1\n')
                z.writestr('stops.txt', 'stop_id,stop_name,stop_lat,stop_lon\nA,Terminal,-23.55,-46.63\n')
                z.writestr('calendar.txt', 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\ndaily,1,1,1,1,1,1,1,20260101,20261231\n')
            argv = ['import-gtfs.py', str(gtfs_file), str(root / 'stops.json'), '--source-url', 'official', '--retrieved-at', '2026-10-19', '--license', 'portal', '--planner-output', str(root / 'planner.json')]
            with patch.object(sys, 'argv', argv):
                gtfs.main()
            self.assertEqual(json.loads((root/'planner.json').read_text(encoding='utf-8'))['trips'][0]['id'], 't1')
            with patch.object(sys, 'argv', argv + ['--schedules-output', str(root / 'schedules.json')]):
                with self.assertRaisesRegex(ValueError, 'frequencies'):
                    gtfs.main()

    def test_preserva_faixas_lacunas_e_horas_depois_da_meia_noite(self):
        data = gtfs.convert_schedules(source('trip_id,start_time,end_time,headway_secs\nt1,23:00:00,23:59:00,3600\nt1,24:00:00,24:59:00,1200\nrail,01:00:00,01:59:00,600\n'), PLANNER)
        self.assertEqual(data['trips'][0]['windows'], [dict(start=82800,end=86340,headwayS=3600,exactTimes=False),dict(start=86400,end=89940,headwayS=1200,exactTimes=False)])
        self.assertEqual(data['provenance'], PLANNER['provenance'])
        self.assertEqual(data['trips'][0]['id'], 't1')

    def test_rejeita_frequencias_inconsistentes(self):
        for rows in ['t1,06:00:00,05:59:00,600,0', 't1,06:00:00,06:59:00,0,0', 't1,06:60:00,06:59:00,600,0', 'missing,06:00:00,06:59:00,600,0', 't1,06:00:00,06:59:00,600,2', 't1,06:00:00,06:59:00,600,0\nt1,06:30:00,07:00:00,600,0', 't1,06:00:00,06:59:00,600.5,0']:
            with self.subTest(rows=rows), self.assertRaises(ValueError):
                gtfs.convert_schedules(source('trip_id,start_time,end_time,headway_secs,exact_times\n'+rows+'\n'), PLANNER)

    def test_rejeita_intervalo_ausente_com_erro_de_dados(self):
        with self.assertRaises(ValueError):
            gtfs.convert_schedules(source('trip_id,start_time,end_time,headway_secs\nt1,06:00:00,06:59:00\n'), PLANNER)

    def test_sinaliza_itinerario_sem_programacao_em_vez_de_inventar(self):
        with self.assertRaises(ValueError):
            gtfs.convert_schedules(source('trip_id,start_time,end_time,headway_secs\n'), PLANNER)

if __name__ == '__main__':
    unittest.main()
