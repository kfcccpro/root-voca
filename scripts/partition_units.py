from __future__ import annotations

import csv
import json
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
UNITS_PATH = BASE / 'data' / 'root_units.json'
OUT_JSON = BASE / 'data' / 'voca18_schedule.json'
OUT_CSV = BASE / 'data' / 'voca18_schedule.csv'
WEB_JSON = BASE / 'webapp' / 'data' / 'voca18_schedule.json'

units = json.loads(UNITS_PATH.read_text(encoding='utf-8'))
for u in units:
    u['word_count'] = len(u['words'])
    # First-pass estimate: ROOT/접사 전환비용 + 표제어 학습비용
    u['minutes'] = 0.75 + 0.5 * u['word_count']

N = len(units)
K = 18
prefix = [0.0]
for u in units:
    prefix.append(prefix[-1] + u['minutes'])

target = prefix[-1] / K
INF = 10**30
dp = [[INF] * (N + 1) for _ in range(K + 1)]
prev = [[None] * (N + 1) for _ in range(K + 1)]
dp[0][0] = 0.0

for k in range(1, K + 1):
    for i in range(k, N + 1):
        for j in range(max(k - 1, i - 34), i):
            count = i - j
            if count < 9 and k > 1:
                continue
            minutes = prefix[i] - prefix[j]
            cost = (minutes - target) ** 2
            cost += 0.08 * (count - N / K) ** 2
            # Prefer a boundary between original DAYs, but never split a unit.
            if i < N and units[i - 1]['source_day'] == units[i]['source_day']:
                cost += 1.5
            candidate = dp[k - 1][j] + cost
            if candidate < dp[k][i]:
                dp[k][i] = candidate
                prev[k][i] = j

parts = []
i = N
for k in range(K, 0, -1):
    j = prev[k][i]
    if j is None:
        raise RuntimeError((k, i))
    parts.append((j, i))
    i = j
parts.reverse()

alloc = []
for day_no, (a, b) in enumerate(parts, 1):
    day_units = units[a:b]
    total_words = sum(u['word_count'] for u in day_units)
    total_minutes = sum(u['minutes'] for u in day_units)
    source_days = sorted(set(u['source_day'] for u in day_units))

    # Split each DAY into four contiguous concentration blocks.
    q = [0.0]
    for u in day_units:
        q.append(q[-1] + u['minutes'])
    B = 4
    m = len(day_units)
    target_block = total_minutes / B
    bdp = [[INF] * (m + 1) for _ in range(B + 1)]
    bprev = [[None] * (m + 1) for _ in range(B + 1)]
    bdp[0][0] = 0.0
    for kk in range(1, B + 1):
        for ii in range(kk, m + 1):
            for jj in range(kk - 1, ii):
                minutes = q[ii] - q[jj]
                cost = (minutes - target_block) ** 2
                candidate = bdp[kk - 1][jj] + cost
                if candidate < bdp[kk][ii]:
                    bdp[kk][ii] = candidate
                    bprev[kk][ii] = jj
    block_parts = []
    ii = m
    for kk in range(B, 0, -1):
        jj = bprev[kk][ii]
        if jj is None:
            raise RuntimeError(('block', day_no, kk, ii))
        block_parts.append((jj, ii))
        ii = jj
    block_parts.reverse()

    blocks = []
    for block_no, (x, y) in enumerate(block_parts, 1):
        block_units = day_units[x:y]
        blocks.append({
            'block': block_no,
            'unit_start': block_units[0]['id'],
            'unit_end': block_units[-1]['id'],
            'root_start': block_units[0]['root'],
            'root_end': block_units[-1]['root'],
            'roots': len(block_units),
            'words': sum(u['word_count'] for u in block_units),
            'estimated_minutes': round(sum(u['minutes'] for u in block_units), 1),
        })

    alloc.append({
        'new_day': day_no,
        'unit_start': day_units[0]['id'],
        'unit_end': day_units[-1]['id'],
        'root_start': day_units[0]['root'],
        'root_end': day_units[-1]['root'],
        'roots': len(day_units),
        'words': total_words,
        'estimated_minutes': round(total_minutes, 1),
        'source_days': source_days,
        'source_day_range': f'{source_days[0]:02d}-{source_days[-1]:02d}' if len(source_days) > 1 else f'{source_days[0]:02d}',
        'blocks': blocks,
    })

output = {
    'schema_version': 2,
    'totals': {
        'roots': N,
        'headwords': sum(u['word_count'] for u in units),
        'estimated_first_pass_minutes': round(prefix[-1], 1),
        'new_days': 18,
    },
    'method': {
        'root_minutes': 0.75,
        'word_minutes': 0.5,
        'sequence_preserved': True,
        'root_unit_splitting': False,
        'suffix_variants_merged': True,
        'note': '시각적으로 한 묶음인 접미사 변이형(-er/-ee/-or 등)을 하나의 학습 단위로 병합한 뒤, 실제 표제어 수와 예상시간으로 균등 배치했습니다.',
    },
    'days': alloc,
}
text = json.dumps(output, ensure_ascii=False, indent=2)
OUT_JSON.write_text(text, encoding='utf-8')
WEB_JSON.write_text(text, encoding='utf-8')

with OUT_CSV.open('w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f)
    w.writerow(['new_day', 'source_day_range', 'unit_start', 'unit_end', 'root_start', 'root_end', 'roots', 'words', 'estimated_minutes', 'block_1', 'block_2', 'block_3', 'block_4'])
    for d in alloc:
        w.writerow([d['new_day'], d['source_day_range'], d['unit_start'], d['unit_end'], d['root_start'], d['root_end'], d['roots'], d['words'], d['estimated_minutes'], *[b['estimated_minutes'] for b in d['blocks']]])

print(json.dumps(output['totals'], ensure_ascii=False, indent=2))
for d in alloc:
    print(d['new_day'], d['source_day_range'], d['roots'], d['words'], d['estimated_minutes'], [b['estimated_minutes'] for b in d['blocks']])
