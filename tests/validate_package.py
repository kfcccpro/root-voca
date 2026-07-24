from __future__ import annotations

import csv
import hashlib
import json
import re
import shutil
import subprocess
from collections import Counter
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]


def load(rel: str):
    return json.loads((BASE / rel).read_text(encoding='utf-8'))


def sha(rel: str) -> str:
    return hashlib.sha256((BASE / rel).read_bytes()).hexdigest()


def read_csv(rel: str):
    with (BASE / rel).open(encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


units = load('data/root_units.json')
content = load('data/learning_units.json')
schedule = load('data/voca18_schedule.json')
headwords_csv = read_csv('data/headwords.csv')

# 1. Source/data integrity
assert len(units) == 360, len(units)
assert [u['id'] for u in units] == list(range(1, 361))
assert sum(len(u['words']) for u in units) == 1410
assert len(content['units']) == 360
assert content['schema_version'] == 2
assert content['metrics']['words'] == 1410
assert content['metrics']['words_with_meaning'] == 1410
assert content['metrics']['words_with_example'] == 1410
assert content['metrics']['roots_with_meaning'] == 360

csv_words = [row['word'] for row in headwords_csv]
raw_words = [word for unit in units for word in unit['words']]
assert raw_words == csv_words, 'headwords.csv and root_units.json order differ'

word_ids: list[str] = []
source_pages: list[int] = []
for raw, enriched in zip(units, content['units']):
    assert raw['id'] == enriched['id']
    assert raw['root'] == enriched['root']
    assert enriched['root_meaning'].strip(), (raw['id'], raw['root'])
    assert raw['words'] == [w['word'] for w in enriched['words']]
    assert enriched['word_count'] == len(enriched['words'])
    for word in enriched['words']:
        assert word['meaning'].strip(), (enriched['root'], word['word'])
        assert word['quiz_meaning'].strip(), (enriched['root'], word['word'])
        assert re.search(r'[가-힣…]', word['quiz_meaning']), (word['word'], word['quiz_meaning'])
        assert not re.search(r'[\x00-\x1f\x7f-\x9f]', word['quiz_meaning'])
        assert word['examples'], (enriched['root'], word['word'])
        for example in word['examples']:
            assert re.match(r'^\d+\s', example), (word['word'], example)
            assert 'VOCA VS. VOCA' not in example
            assert '⏖' not in example and '※in' not in example
        word_ids.append(word['id'])
        source_pages.append(int(word['source_page']))

assert len(word_ids) == len(set(word_ids)) == 1410
assert min(source_pages) >= 18 and max(source_pages) <= 402

# Repeated strings are valid repeated entries in the source's suffix/root sections.
duplicates = {word for word, count in Counter(w.lower() for w in raw_words).items() if count > 1}
assert duplicates == {'social', 'literal', 'literate', 'active', 'civilize', 'justify'}, duplicates

# 2. 18DAY/72-block partition integrity
assert schedule['schema_version'] == 2
assert schedule['totals']['roots'] == 360
assert schedule['totals']['headwords'] == 1410
assert len(schedule['days']) == 18

expected_unit = 1
total_roots = total_words = 0
all_block_ranges: list[tuple[int, int]] = []
for expected_day_no, day in enumerate(schedule['days'], 1):
    assert day['new_day'] == expected_day_no
    assert day['unit_start'] == expected_unit
    assert day['unit_end'] >= day['unit_start']
    expected_unit = day['unit_end'] + 1
    assert len(day['blocks']) == 4
    assert sum(block['roots'] for block in day['blocks']) == day['roots']
    assert sum(block['words'] for block in day['blocks']) == day['words']
    assert 50 <= day['estimated_minutes'] <= 57, day

    block_unit = day['unit_start']
    for block_no, block in enumerate(day['blocks'], 1):
        assert block['block'] == block_no
        assert block['unit_start'] == block_unit
        assert block['unit_end'] >= block['unit_start']
        assert block['roots'] >= 1 and block['words'] >= 1
        assert 10 <= block['estimated_minutes'] <= 17, block
        block_unit = block['unit_end'] + 1
        all_block_ranges.append((block['unit_start'], block['unit_end']))
    assert block_unit - 1 == day['unit_end']

    actual = units[day['unit_start'] - 1:day['unit_end']]
    assert len(actual) == day['roots']
    assert sum(len(unit['words']) for unit in actual) == day['words']
    total_roots += day['roots']
    total_words += day['words']

assert expected_unit == 361
assert total_roots == 360
assert total_words == 1410
assert len(all_block_ranges) == 72

# 3. Deployment-copy and source-code integrity
assert sha('data/root_units.json') == sha('webapp/data/root_units.json')
assert sha('data/learning_units.json') == sha('webapp/data/learning_units.json')
assert sha('data/voca18_schedule.json') == sha('webapp/data/voca18_schedule.json')

app_js = (BASE / 'webapp/app.js').read_text(encoding='utf-8')
html = (BASE / 'webapp/index.html').read_text(encoding='utf-8')
mail_js = (BASE / 'netlify/functions/send-day-report.mjs').read_text(encoding='utf-8')
assert "const SCHEMA_VERSION = 3" in app_js
assert "vocaRoot18StateV3" in app_js
assert "sk01197375068@gmail.com" in app_js and "sk01197375068@gmail.com" in html
assert "exportProgress" in app_js and 'id="exportProgress"' in html
assert "importProgressFile" in app_js and 'id="importProgressFile"' in html
assert "accuracy === null" in mail_js

node = shutil.which('node')
if node:
    subprocess.run([node, '--check', str(BASE / 'webapp/app.js')], check=True, capture_output=True)
    subprocess.run([node, '--check', str(BASE / 'netlify/functions/send-day-report.mjs')], check=True, capture_output=True)

print('VALIDATION_OK')
print(json.dumps({
    'root_units': len(units),
    'headwords': total_words,
    'source_days': 60,
    'new_days': len(schedule['days']),
    'blocks': len(all_block_ranges),
    'root_meaning_coverage': content['metrics']['roots_with_meaning'],
    'meaning_coverage': content['metrics']['words_with_meaning'],
    'example_coverage': content['metrics']['words_with_example'],
    'formula_coverage': content['metrics']['words_with_formula'],
    'etymology_step_coverage': content['metrics']['words_with_steps'],
    'duplicate_source_entries': sorted(duplicates),
    'default_report_email': 'sk01197375068@gmail.com',
    'state_schema': 3,
}, ensure_ascii=False, indent=2))
