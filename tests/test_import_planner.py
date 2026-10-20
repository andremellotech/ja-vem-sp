import unittest, importlib.util, io, zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location('planner_gtfs', Path(__file__).parents[1] / 'scripts/import-gtfs.py')
gtfs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gtfs)
PROVENANCE = dict(source='official', retrievedAt='2026-10-19', license='portal', sha256='a' * 64)
NETWORK = {'stops': [['A', 'Origem', '', -23.55, -46.63, 0], ['X', 'Troca', '', -23.57, -46.65, 0], ['D', 'Destino', '', -23.59, -46.67, 0]]}

def feed(**replace):
    tables = {
        'routes.txt': 'route_id,route_short_name,route_long_name,route_type\nbus,1000-10,Bairro-Centro,3\nrail,L1,Metro,1\n',
        'trips.txt': 'route_id,service_id,trip_id,trip_headsign,direction_id\nbus,daily,t1,Centro,0\nbus,extra,t2,Bairro,1\nrail,daily,m1,Metro,0\n',
        'stop_times.txt': 'trip_id,stop_id,stop_sequence\nt1,D,3\nt1,A,1\nt1,X,2\nt2,D,1\nt2,A,2\nm1,A,1\n',
        'calendar.txt': 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\ndaily,1,1,1,1,1,1,1,20260101,20261231\n',
        'calendar_dates.txt': 'service_id,date,exception_type\nextra,20261019,1\ndaily,20261020,2\n',
    }
    tables.update(replace)
    data = io.BytesIO()
    with zipfile.ZipFile(data, 'w') as z:
        for name, content in tables.items(): z.writestr(name, content)
    data.seek(0)
    return data

class ImportPlanner(unittest.TestCase):
    def test_gera_viagens_onibus_ordenadas_e_calendarios(self):
        self.assertTrue(callable(getattr(gtfs, 'convert_planner', None)))
        data = gtfs.convert_planner(feed(), NETWORK, PROVENANCE)
        self.assertEqual([r['id'] for r in data['routes']], ['bus'])
        self.assertEqual(data['trips'][0]['stopIds'], ['A','X','D'])
        self.assertEqual(data['trips'][0]['headsign'], 'Centro')
        self.assertEqual(data['trips'][0]['direction'], '0')
        self.assertEqual(data['trips'][1]['stopIds'], ['D','A'])
        self.assertEqual(data['calendars'][0]['weekdays'], [True] * 7)
        self.assertEqual(data['exceptions'][0], dict(serviceId='extra', date='20261019', added=True))
        self.assertEqual(data['provenance'], PROVENANCE)
        self.assertEqual(data['validTo'], '20261231')

    def test_rejeita_referencia_inexistente(self):
        with self.assertRaises(ValueError):
            gtfs.convert_planner(feed(**{'stop_times.txt': 'trip_id,stop_id,stop_sequence\nt1,A,1\nt1,MISSING,2\n'}), NETWORK, PROVENANCE)

    def test_rejeita_sequencia_duplicada(self):
        with self.assertRaises(ValueError):
            gtfs.convert_planner(feed(**{'stop_times.txt': 'trip_id,stop_id,stop_sequence\nt1,A,1\nt1,D,1\n'}), NETWORK, PROVENANCE)

    def test_rejeita_calendario_invalido(self):
        with self.assertRaises(ValueError):
            gtfs.convert_planner(feed(**{'calendar.txt': 'service_id,monday,start_date,end_date\ndaily,2,20261301,20261231\n'}), NETWORK, PROVENANCE)

    def test_preserva_ocorrencias_em_linha_circular(self):
        data = gtfs.convert_planner(feed(**{'stop_times.txt': 'trip_id,stop_id,stop_sequence\nt1,A,1\nt1,X,2\nt1,A,3\nt1,D,4\nt2,D,1\nt2,A,2\n'}), NETWORK, PROVENANCE)
        self.assertEqual(data['trips'][0]['stopIds'], ['A','X','A','D'])

if __name__ == '__main__': unittest.main()
