import hashlib, importlib.util, io, zipfile, unittest
from pathlib import Path

def archive(times='t,A,1,07:00:00,07:00:00\nt,B,2,07:10:00,07:11:00\nt,C,3,07:20:00,07:20:00\n'):
    b=io.BytesIO()
    with zipfile.ZipFile(b,'w') as z:
        z.writestr('trips.txt','trip_id,route_id,service_id\nt,r,s\n')
        z.writestr('stop_times.txt','trip_id,stop_id,stop_sequence,arrival_time,departure_time\n'+times)
        z.writestr('frequencies.txt','trip_id,start_time,end_time,headway_secs\nt,04:00:00,23:00:00,600\n')
    b.seek(0); return b

class JourneyTimesTests(unittest.TestCase):
    def convert(self,b,hash_override=None):
        spec=importlib.util.spec_from_file_location('journey_times',Path(__file__).parents[1]/'scripts/import-journey-times.py')
        m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
        digest=hashlib.sha256(b.getvalue()).hexdigest()
        p=dict(version=1,provenance=dict(sha256=hash_override or digest),validFrom='20260101',validTo='20261231',calendars=[],exceptions=[],trips=[dict(id='t',routeId='r',headsign='Fim',direction='0',serviceId='s',stopIds=['A','B','C'])])
        return m.convert(b,p)
    def test_preserva_tempo_entre_paradas_e_frequencia(self):
        data=self.convert(archive()); t=data['trips']['t']
        self.assertEqual(t['arrivalS'][2]-t['departureS'][1],540)
        self.assertEqual(t['stopIds'],['A','B','C'])
        self.assertEqual(t['windows'][0],[14400,82800,600,False])
    def test_rejeita_feed_divergente(self):
        with self.assertRaises(ValueError): self.convert(archive(),'0'*64)
    def test_omite_tempos_ausentes_sem_inventar(self):
        data=self.convert(archive('t,A,1,,\nt,B,2,,\nt,C,3,,\n'))
        self.assertEqual(data['trips'],{});self.assertEqual(data['omittedTrips'],['t'])
    def test_omite_ordem_temporal_invalida(self):
        data=self.convert(archive('t,A,1,07:00:00,07:00:00\nt,B,2,06:00:00,06:00:00\nt,C,3,08:00:00,08:00:00\n'))
        self.assertEqual(data['trips'],{})
