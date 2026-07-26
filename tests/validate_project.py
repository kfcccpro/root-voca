import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
schedule = json.loads((ROOT / 'data' / 'voca_schedule.json').read_text(encoding='utf-8'))
content = json.loads((ROOT / 'data' / 'learning_units.json').read_text(encoding='utf-8'))

assert schedule['app_name'] == '18day_root'
assert schedule['totals']['new_days'] == 18
assert len(schedule['days']) == 18
assert schedule['totals']['roots'] == 360
assert schedule['totals']['headwords'] == 1410
assert schedule['totals']['blocks'] == 72
assert len(content['units']) == 360
assert sum(len(u['words']) for u in content['units']) == 1410

seen_units = []
for expected_day, day in enumerate(schedule['days'], 1):
    assert day['new_day'] == expected_day
    assert len(day['blocks']) == 4
    assert 70 <= day['words'] <= 88
    assert day['unit_start'] <= day['unit_end']
    block_units = []
    block_words = 0
    for expected_block, block in enumerate(day['blocks'], 1):
        assert block['block'] == expected_block
        assert block['unit_start'] <= block['unit_end']
        block_units.extend(range(block['unit_start'], block['unit_end'] + 1))
        block_words += block['words']
    assert block_units == list(range(day['unit_start'], day['unit_end'] + 1))
    assert block_words == day['words']
    seen_units.extend(range(day['unit_start'], day['unit_end'] + 1))

assert seen_units == list(range(1, 361))

app_js = (ROOT / 'app.js').read_text(encoding='utf-8')
index = (ROOT / 'index.html').read_text(encoding='utf-8')
css = (ROOT / 'styles.css').read_text(encoding='utf-8')
mail = (ROOT / 'netlify' / 'functions' / 'send-day-report.mjs').read_text(encoding='utf-8')

required_js = [
    "const APP_KEY = '18dayRootStateV7'",
    "const APP_NAME = '18day_root'",
    'function openMailGate',
    'async function sendCompletionReport',
    'function finalizeDayRecord',
    '메일 전송 성공 전에는 DAY 완료로 기록되지 않습니다',
    "report.requiresCompletion = true",
    'function logEvent',
    'function scheduleInitialD1',
    'function renderSpacedReview',
    'function renderMiniSetReward',
    'wrong-compare-card',
    'D3_DUE',
    'D6_DUE',
]
for token in required_js:
    assert token in app_js, token

required_html = [
    '<title>18day_root V7</title>',
    'id="mailGateModal"',
    '관리자에게 완료 보고 보내기',
]
for token in required_html:
    assert token in index, token

assert '.mail-gate-overlay' in css
assert '.mail-send-button' in css
assert '.error-origin-badge' in css
assert '.continuous-day-card' in css
assert '.wrong-compare-card' in css
assert '.admin-system-grid' in css
assert '.mini-reward-panel' in css
assert '.segment-track' in css
assert 'DAY 전체 연속 학습' in index
assert 'id="blockList" class="segment-track"' in index
assert '18day_root' in mail

print('VALIDATION_OK')
print('days=18 roots=360 words=1410 blocks=72')
print('day_word_counts=' + ','.join(str(d['words']) for d in schedule['days']))
