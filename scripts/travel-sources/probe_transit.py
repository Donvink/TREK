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


def probe():
    report = {'checked_at': datetime.now(timezone.utc).isoformat(), 'provider': BASE,
              'purpose': 'current coverage only; not September 2026 reconstruction', 'stations': {}, 'routes': []}
    for key, query in [('bellinzona', 'Bellinzona'), ('turin', 'Torino Porta Nuova'), ('interlaken', 'Interlaken Ost')]:
        try:
            places = fetch('/api/v1/geocode', {'text': query})
            candidates = [place for place in places if isinstance(place.get('lat'), (float, int)) and isinstance(place.get('lon'), (float, int))]
            selected = next((place for place in candidates if place.get('type') == 'STOP'), candidates[0] if candidates else None)
            report['stations'][key] = {'query': query, 'selected': selected, 'candidates': candidates[:3]}
        except Exception as error:
            report['stations'][key] = {'query': query, 'error_type': type(error).__name__, 'selected': None}
    departure = (datetime.now(timezone.utc) + timedelta(days=2)).replace(hour=7, minute=0, second=0, microsecond=0).isoformat()
    for origin, destination in [('bellinzona', 'turin'), ('turin', 'bellinzona'), ('bellinzona', 'interlaken'), ('interlaken', 'bellinzona')]:
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
                                  'modes': [leg.get('mode') for leg in journey.get('legs', [])]} for journey in journeys[:2]]
            except Exception as error:
                item['error_type'] = type(error).__name__
        report['routes'].append(item)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = probe()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'output': str(args.output), 'routes': result['routes']}, ensure_ascii=False))
