#!/usr/bin/env python3
"""Read-only verification of the published catalog, using only its public key."""
import argparse
import collections
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--snapshot', type=Path)
    parser.add_argument('--compare', type=Path)
    parser.add_argument('--require-examples', action='store_true')
    args = parser.parse_args()
    config = (ROOT / 'supabase-config.js').read_text()
    base = re.search(r"supabaseUrl:\s*'([^']+)'", config)[1]
    key = re.search(r"supabaseAnonKey:\s*'([^']+)'", config)[1]

    def rows(table):
        result = []
        while True:
            query = urllib.parse.urlencode({'select': '*', 'order': 'id.asc', 'limit': 1000, 'offset': len(result)})
            request = urllib.request.Request(f'{base}/rest/v1/{table}?{query}', headers={'apikey': key, 'Accept': 'application/json'})
            with urllib.request.urlopen(request, timeout=40) as response:
                page = json.load(response)
            if not isinstance(page, list):
                raise ValueError(f'{table}: invalid response')
            result.extend(page)
            if len(page) < 1000:
                return result

    data = {'decks': rows('phonetic_decks'), 'cards': rows('phonetic_cards')}
    if args.snapshot:
        args.snapshot.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    if args.compare:
        before = json.loads(args.compare.read_text())
        assert before['decks'] == data['decks'], 'deck metadata changed'
        old = {c['id']: c for c in before['cards']}
        current = {c['id']: c for c in data['cards']}
        assert old.keys() == current.keys(), 'card identifiers/count changed'
        for card_id, card in old.items():
            for field, value in card.items():
                if field not in {'updated_at', 'proficiency_level', 'example_sentence', 'example_translation'}:
                    assert current[card_id].get(field) == value, f'original {field} changed for {card_id}'
        print(f'Original fields and identifiers unchanged for {len(old)} public cards.')
    complete = sum(bool(c.get('example_sentence', '').strip() and c.get('example_translation', '').strip()) for c in data['cards'])
    if args.require_examples:
        assert complete == len(data['cards']), f'only {complete} cards have complete example pairs'
        decks = {d['id']: d for d in data['decks']}
        for card in data['cards']:
            lang = decks[card['deck_id']]['lang'].lower().replace('_', '-').split('-')[0]
            allowed = {'A1','A2','B1','B2','C1','C2'} if lang in {'en','es','fr','de','pt','it'} else {'N5','N4','N3','N2','N1'} if lang == 'ja' else {'1','2','3','4','5','6'} if lang == 'ko' else {None}
            assert card.get('proficiency_level') in allowed, f'invalid level for {card["deck_id"]}'
    print(json.dumps({'decks': len(data['decks']), 'cards': len(data['cards']), 'complete_examples': complete,
                      'per_deck': dict(sorted(collections.Counter(c['deck_id'] for c in data['cards']).items()))}, ensure_ascii=False))


if __name__ == '__main__':
    main()
