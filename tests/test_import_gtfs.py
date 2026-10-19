import unittest,importlib.util,io,zipfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('gtfs',Path(__file__).parents[1]/'scripts/import-gtfs.py')
gtfs=importlib.util.module_from_spec(spec);spec.loader.exec_module(gtfs)
class ImportGTFS(unittest.TestCase):
 def feed(self,lat='-23.5',time='25:10:00'):
  b=io.BytesIO()
  with zipfile.ZipFile(b,'w') as z:
   z.writestr('stops.txt',f'stop_id,stop_name,stop_lat,stop_lon\n1,Centro,{lat},-46.6\n');z.writestr('routes.txt','route_id,route_short_name,route_long_name\nr,1000-10,Centro\n');z.writestr('trips.txt','route_id,service_id,trip_id\nr,s,t\n');z.writestr('stop_times.txt',f'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nt,{time},{time},1,1\n')
  b.seek(0);return b
 def test_preserves_extended_hours(self):
  data=gtfs.convert(self.feed());self.assertEqual(data['stopTimes'][0]['arrivalSeconds'],90600);self.assertEqual(data['stops'][0]['lat'],-23.5)
 def test_rejects_invalid_coordinates(self):
  with self.assertRaises(ValueError):gtfs.convert(self.feed('1000'))
 def test_rejects_invalid_time(self):
  with self.assertRaises(ValueError):gtfs.convert(self.feed(time='25:99:00'))
if __name__=='__main__':unittest.main()
