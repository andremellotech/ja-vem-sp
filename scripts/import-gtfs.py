"""Converte um GTFS obtido pelo operador em JSON validado. Não faz downloads."""
import csv,io,json,zipfile,math,hashlib,re,argparse
from pathlib import Path

def seconds(value):
 if not re.fullmatch(r'\d{1,3}:[0-5]\d:[0-5]\d',value):raise ValueError('Horário GTFS inválido')
 h,m,s=map(int,value.split(':'));return h*3600+m*60+s

def convert(source):
 with zipfile.ZipFile(source) as z:
  total=sum(i.file_size for i in z.infolist())
  if total>2_000_000_000:raise ValueError('GTFS excede limite de leitura')
  def rows(name):
   if name not in z.namelist():raise ValueError('Tabela ausente: '+name)
   with z.open(name) as f:return list(csv.DictReader(io.TextIOWrapper(f,encoding='utf-8-sig')))
  stops=[]
  for r in rows('stops.txt'):
   lat,lon=float(r['stop_lat']),float(r['stop_lon'])
   if not math.isfinite(lat) or not math.isfinite(lon) or abs(lat)>90 or abs(lon)>180:raise ValueError('Coordenada inválida')
   stops.append(dict(id=r['stop_id'],name=r['stop_name'],lat=lat,lon=lon))
  routes=rows('routes.txt');trips=rows('trips.txt');times=rows('stop_times.txt')
  stop_ids={r['id'] for r in stops};route_ids={r['route_id'] for r in routes};trip_ids={r['trip_id'] for r in trips}
  for r in trips:
   if r['route_id'] not in route_ids:raise ValueError('Rota ausente')
  output=[]
  for r in times:
   if r['trip_id'] not in trip_ids or r['stop_id'] not in stop_ids:raise ValueError('Referência de viagem/parada inválida')
   output.append(dict(tripId=r['trip_id'],stopId=r['stop_id'],sequence=int(r['stop_sequence']),arrivalSeconds=seconds(r['arrival_time']) if r['arrival_time'] else None,departureSeconds=seconds(r['departure_time']) if r['departure_time'] else None))
  return dict(stops=stops,routes=routes,trips=trips,stopTimes=output)

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);parser.add_argument('output',type=Path);parser.add_argument('--source-url',required=True);parser.add_argument('--retrieved-at',required=True);parser.add_argument('--license',required=True);a=parser.parse_args()
 data=convert(a.source);data['provenance']={'source':a.source_url,'retrievedAt':a.retrieved_at,'license':a.license,'sha256':hashlib.file_digest(a.source.open('rb'),'sha256').hexdigest(),'limitations':'Dados estáticos, sem posições ou previsões em tempo real. Não contém motor de rotas.'}
 a.output.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf8')
