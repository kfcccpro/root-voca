from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

BASE = Path(__file__).resolve().parents[1]
ROOTS = BASE / 'data' / 'roots.csv'
HEADWORDS = BASE / 'data' / 'headwords.csv'
OUTPUT = BASE / 'data' / 'root_units.json'
WEB_OUTPUT = BASE / 'webapp' / 'data' / 'root_units.json'


def read_csv(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


def key(page: int, y: float) -> tuple[int, float]:
    return page, y


def normalize_root(label: str) -> str:
    return label.replace('mono-uni-', 'mono-/uni-').replace('bi- du-twi-', 'bi-/du-/twi-')


def main() -> None:
    roots = read_csv(ROOTS)
    words = read_csv(HEADWORDS)
    for r in roots:
        r['day'] = int(r['day']); r['page'] = int(r['page']); r['x'] = float(r['x']); r['y'] = float(r['y'])
        r['root'] = normalize_root(r['root'])
    for w in words:
        w['day'] = int(w['day']); w['page'] = int(w['page']); w['x'] = float(w['x']); w['y'] = float(w['y'])
    roots.sort(key=lambda r: key(r['page'], r['y']))
    words.sort(key=lambda w: key(w['page'], w['y']))

    groups: list[dict[str, Any]] = []
    i = 0
    while i < len(roots):
        r = roots[i]
        members = [r]
        if r['type'] == 'suffix':
            j = i + 1
            while j < len(roots):
                nxt = roots[j]
                if nxt['type'] != 'suffix' or nxt['page'] != r['page']:
                    break
                if nxt['y'] - members[-1]['y'] > 22.5:
                    break
                members.append(nxt)
                j += 1
            i = j
        else:
            i += 1
        label = '/'.join(m['root'] for m in members)
        start_y = min(m['y'] for m in members) - (40.0 if r['type'] == 'suffix' else 0.0)
        groups.append({
            'source_day': r['day'],
            'root': label,
            'source_roots': [m['root'] for m in members],
            'type': r['type'],
            'start_page': r['page'],
            'start_y': round(start_y, 1),
            'heading_y': round(min(m['y'] for m in members), 1),
            'heading_x': round(min(m['x'] for m in members), 1),
        })

    # Assign every extracted headword to exactly one sequential learning unit.
    wi = 0
    units: list[dict[str, Any]] = []
    for idx, group in enumerate(groups):
        start = key(group['start_page'], group['start_y'])
        if idx + 1 < len(groups):
            nxt = groups[idx + 1]
            end = key(nxt['start_page'], nxt['start_y'])
        else:
            end = key(403, 9999)
        assigned: list[dict[str, Any]] = []
        while wi < len(words) and key(words[wi]['page'], words[wi]['y']) < start:
            wi += 1
        cursor = wi
        while cursor < len(words) and key(words[cursor]['page'], words[cursor]['y']) < end:
            assigned.append(words[cursor])
            cursor += 1
        wi = cursor
        page_end = assigned[-1]['page'] if assigned else group['start_page']
        units.append({
            'id': idx + 1,
            'source_day': group['source_day'],
            'page_start': group['start_page'],
            'page_end': page_end,
            'root': group['root'],
            'source_roots': group['source_roots'],
            'type': group['type'],
            'root_page': group['start_page'],
            'root_y': group['heading_y'],
            'root_x': group['heading_x'],
            'start_y': group['start_y'],
            'words': [w['word'] for w in assigned],
        })

    # Keep only actual learning units that contain at least one headword.
    # Empty labels are usually stacked variants already represented by a merged group.
    units = [u for u in units if u['words']]
    for idx, u in enumerate(units, 1):
        u['id'] = idx

    all_assigned = [word for u in units for word in u['words']]
    expected = [w['word'] for w in words]
    if all_assigned != expected:
        # Detect the first mismatch with useful context.
        for pos, (a, b) in enumerate(zip(all_assigned, expected)):
            if a != b:
                raise RuntimeError(f'Word assignment mismatch at {pos}: {a!r} != {b!r}')
        if len(all_assigned) != len(expected):
            raise RuntimeError(f'Word count mismatch: {len(all_assigned)} != {len(expected)}')

    text = json.dumps(units, ensure_ascii=False, indent=2)
    OUTPUT.write_text(text, encoding='utf-8')
    WEB_OUTPUT.write_text(text, encoding='utf-8')
    print(json.dumps({
        'units': len(units),
        'words': len(all_assigned),
        'suffix_units': sum(u['type'] == 'suffix' for u in units),
        'merged_suffix_groups': sum(len(u['source_roots']) > 1 for u in units),
    }, ensure_ascii=False, indent=2))
    for u in units:
        if 78 <= u['page_start'] <= 106:
            print(u['id'], u['root'], u['page_start'], u['words'])


if __name__ == '__main__':
    main()
