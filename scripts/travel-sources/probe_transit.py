"""Check current Transitous coverage; not historical timetable or price verification."""
import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASE = 'https://api.transitous.org'


def fetch(path, params):
    url = BASE + path + '?' + urlencode(params)
    request = Request(url, headers={'User-Agent': 'TREK travel-prototype coverage probe (https://github.com/Donvink/TREK)'})
    with urlopen(request, timeout=25) as response:
        body = response.read(2 * 1024 * 1024 + 1)
        if len(body) > 2 * 1024 * 1024:
            raise ValueError('Response too large')
        return json.loads(body)


CORRIDORS = {
    'turin': {
        'stations': {'bellinzona': 'Bellinzona', 'turin': 'Torino Porta Nuova', 'interlaken': 'Interlaken Ost'},
        'routes': [('bellinzona', 'turin'), ('turin', 'bellinzona'), ('bellinzona', 'interlaken'), ('interlaken', 'bellinzona')],
    },
    'munich': {
        'stations': {'zurich': 'Zürich HB', 'munich': 'München Hbf'},
        'routes': [('zurich', 'munich'), ('munich', 'zurich')],
    },
    'venice': {
        'stations': {'zurich': 'Zürich HB', 'milan': 'Milano Centrale', 'venice': 'Venezia Santa Lucia'},
        'routes': [('zurich', 'milan'), ('milan', 'venice'), ('venice', 'zurich')],
    },
}


def probe(corridor='turin', days_ahead=2):
    spec = CORRIDORS[corridor]
    report = {'checked_at': datetime.now(timezone.utc).isoformat(), 'provider': BASE, 'corridor': corridor,
              'purpose': 'current coverage only; not historical reconstruction', 'stations': {}, 'routes': []}
    for key, query in spec['stations'].items():
        try:
            places = fetch('/api/v1/geocode', {'text': query})
            candidates = [place for place in places if isinstance(place.get('lat'), (float, int)) and isinstance(place.get('lon'), (float, int))]
            selected = next((place for place in candidates if place.get('type') == 'STOP'), candidates[0] if candidates else None)
            report['stations'][key] = {'query': query, 'selected': selected, 'candidates': candidates[:3]}
        except Exception as error:
            report['stations'][key] = {'query': query, 'error_type': type(error).__name__, 'selected': None}
    departure = (datetime.now(timezone.utc) + timedelta(days=days_ahead)).replace(hour=7, minute=0, second=0, microsecond=0).isoformat()
    for origin, destination in spec['routes']:
        item = {'from': origin, 'to': destination, 'test_departure': departure,
                'status': 'unavailable', 'scheduled_itineraries': 0}
        a, b = report['stations'][origin]['selected'], report['stations'][destination]['selected']
        if a and b:
            try:
                data = fetch('/api/v6/plan', {'fromPlace': f"{a['lat']},{a['lon']}", 'toPlace': f"{b['lat']},{b['lon']}",
                            'time': departure, 'numItineraries': '3', 'transitModes': 'TRANSIT', 'directModes': 'WALK'})
                journeys = [journey for journey in data.get('itineraries', []) if any(leg.get('mode') != 'WALK' for leg in journey.get('legs', []))]
                item['scheduled_itineraries'] = len(journeys)
                item['status'] = 'routes_returned' if journeys else 'empty'
                item['sample'] = [{'start': journey.get('startTime'), 'end': journey.get('endTime'), 'transfers': journey.get('transfers'),
                                  'minutes': round((journey.get('duration') or 0) / 60),
                                  'lines': [leg.get('displayName') or leg.get('routeShortName') or leg.get('mode') for leg in journey.get('legs', []) if leg.get('mode') != 'WALK']}
                                  for journey in journeys[:2]]
            except Exception as error:
                item['error_type'] = type(error).__name__
        report['routes'].append(item)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--corridor', choices=sorted(CORRIDORS), default='turin')
    parser.add_argument('--days-ahead', type=int, default=2, help='Test departure this many days from now, at 07:00 UTC')
    args = parser.parse_args()
    result = probe(args.corridor, args.days_ahead)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'output': str(args.output), 'routes': result['routes']}, ensure_ascii=False))
