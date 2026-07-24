from __future__ import annotations

import csv
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import fitz

BASE = Path(__file__).resolve().parents[1]
PDF = Path('/mnt/data/능률보카 어원편_260714_175558.pdf')
HEADWORDS_CSV = BASE / 'data' / 'headwords.csv'
ROOT_UNITS_JSON = BASE / 'data' / 'root_units.json'
OUTPUT = BASE / 'data' / 'learning_units.json'
WEB_OUTPUT = BASE / 'webapp' / 'data' / 'learning_units.json'

PHONETIC_CHARS = re.compile(r'[\ue000-\uf8ff]')
KOREAN = re.compile(r'[가-힣]')
ENGLISH_EXAMPLE = re.compile(r"^\s*\d+\s+[\"“‘']?[A-Za-z](?![가-힣])")
NUMBERED_KOREAN = re.compile(r'^\s*\d+\s+[가-힣(【]')


def read_csv(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


def clean_text(text: str) -> str:
    text = text.replace('\u00ad', '').replace('\ufeff', '')
    text = PHONETIC_CHARS.sub('', text)
    text = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    text = re.sub(r'^\[\s*\]\s*', '', text)
    return text


def line_records(page: fitz.Page) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    data = page.get_text('dict')
    for block in data.get('blocks', []):
        for line in block.get('lines', []):
            spans = line.get('spans', [])
            raw = ''.join(s.get('text', '') for s in spans)
            text = clean_text(raw)
            if not text:
                continue
            x0, y0, x1, y1 = line['bbox']
            rows.append({
                'x': round(float(x0), 1),
                'y': round(float(y0), 1),
                'x1': round(float(x1), 1),
                'y1': round(float(y1), 1),
                'text': text,
                'spans': [{
                    'text': clean_text(s.get('text', '')),
                    'font': s.get('font', ''),
                    'size': round(float(s.get('size', 0)), 1),
                } for s in spans],
            })
    return sorted(rows, key=lambda r: (r['y'], r['x']))


def has_bold_english(row: dict[str, Any]) -> bool:
    for s in row['spans']:
        if ('Bd' in s['font'] or 'Bold' in s['font']) and re.search(r'[A-Za-z]', s['text']):
            return True
    return False


def normalized_word(word: str) -> str:
    return re.sub(r'\s+', ' ', word.strip()).lower()


def select_root_meaning(rows: list[dict[str, Any]], root_y: float, root_x: float) -> str:
    candidates = [
        r['text'] for r in rows
        if abs(r['y'] - root_y) <= 5.0 and r['x'] > root_x + 45 and KOREAN.search(r['text'])
    ]
    return ' '.join(candidates).strip()


def compact_quiz_meaning(value: str) -> str:
    value = clean_text(value)
    # Remove English-only usage labels such as ((+ in)) before stripping
    # ordinary English synonyms. This prevents quiz labels such as ((+ )).
    value = re.sub(r'\(\(.*?\+.*?\)\)', ' ', value)
    value = re.sub(r"\b[A-Za-z][A-Za-z,;/' -]*\b", " ", value)
    value = re.sub(r'\(\(\s*\+\s*\)\)', ' ', value)
    value = re.sub(r'\[\s*\]', ' ', value)
    value = re.sub(r'\(\s*\)', ' ', value)
    value = re.sub(r'\s+', ' ', value).strip(' ;,')
    return value


def select_suffix_meaning(rows: list[dict[str, Any]], start_y: float, stop_y: float) -> str:
    candidates: list[str] = []
    for r in rows:
        t = r['text']
        if not (start_y <= r['y'] < stop_y and r['x'] < 115 and KOREAN.search(t)):
            continue
        if '+' in t or re.search(r'[A-Za-z]', t) or len(t) > 24:
            continue
        if t not in candidates:
            candidates.append(t)
    return ' · '.join(candidates[:2])


def classify_segment(segment: list[dict[str, Any]], word_y: float) -> dict[str, Any]:
    importance = ''
    for r in segment:
        if word_y - 12 <= r['y'] <= word_y + 4 and '★' in r['text']:
            importance = '★★' if '★★' in r['text'] else '★'
            break

    formula: list[str] = []
    steps: list[str] = []
    meanings: list[str] = []
    related: list[str] = []
    examples: list[str] = []
    notes: list[str] = []

    for r in segment:
        t = r['text']
        if t in {'★', '★★'} or t.startswith('DAY '):
            continue
        if r['x'] < 205 and (' + ' in t or '(=' in t or '어미' in t) and not t.startswith('→'):
            formula.append(t)
            continue
        if r['x'] < 210 and (t.startswith('→') or t.startswith('⇨')):
            steps.append(t)
            continue
        if r['x'] >= 185 and ENGLISH_EXAMPLE.match(t):
            examples.append(t)
            continue
        if examples and r['x'] >= 185 and not KOREAN.search(t) and not ENGLISH_EXAMPLE.match(t):
            # Continuation of a wrapped English example. A repeated bold headword
            # inside the sentence should not prevent line joining.
            if (
                re.search(r'[A-Za-z]', t)
                and not t.startswith(('plus +', 'more with', 'VOCA VS. VOCA', '·', '※', 'cf.'))
                and '⏖' not in t
                and not re.match(r'^\d+[-–]\s', t)
            ):
                examples[-1] = f"{examples[-1]} {t}".strip()
                continue
        if r['x'] >= 185 and KOREAN.search(t):
            # The first compact lines around the headword are the principal meanings.
            if r['y'] <= word_y + 34 and not has_bold_english(r):
                meanings.append(t)
            elif has_bold_english(r) or '★' in t:
                related.append(t)
            elif t.startswith('·') or t.startswith('※') or t.startswith('cf.'):
                notes.append(t)
            elif not meanings:
                meanings.append(t)
            else:
                related.append(t)
            continue
        if t.startswith(('·', '※', 'cf.')):
            notes.append(t)

    # Remove exact duplicates while keeping order.
    examples = [re.sub(r'\s+VOCA VS\. VOCA.*$', '', value).strip() for value in examples]

    def dedupe(values: list[str]) -> list[str]:
        seen: set[str] = set()
        out: list[str] = []
        for value in values:
            value = clean_text(value)
            if value and value not in seen:
                seen.add(value)
                out.append(value)
        return out

    return {
        'importance': importance,
        'meanings': dedupe(meanings),
        'etymology_formula': dedupe(formula),
        'etymology_steps': dedupe(steps),
        'related': dedupe(related),
        'examples': dedupe(examples),
        'notes': dedupe(notes),
    }


def main() -> None:
    if not PDF.exists():
        raise FileNotFoundError(PDF)

    headwords = read_csv(HEADWORDS_CSV)
    units = json.loads(ROOT_UNITS_JSON.read_text(encoding='utf-8'))

    for row in headwords:
        row['day'] = int(row['day'])
        row['page'] = int(row['page'])
        row['x'] = float(row['x'])
        row['y'] = float(row['y'])

    headwords.sort(key=lambda r: (r['page'], r['y'], r['x']))

    doc = fitz.open(PDF)
    pages: dict[int, list[dict[str, Any]]] = {}

    def get_rows(page_no: int) -> list[dict[str, Any]]:
        if page_no not in pages:
            pages[page_no] = line_records(doc[page_no - 1])
        return pages[page_no]

    unit_out: list[dict[str, Any]] = []
    hw_cursor = 0

    for index, unit in enumerate(units):
        root_page = int(unit['root_page'])
        root_y = float(unit['root_y'])
        root_x = float(unit['root_x'])
        next_unit = units[index + 1] if index + 1 < len(units) else None
        end_page = int(next_unit['root_page']) if next_unit else 403
        end_y = float(next_unit['start_y']) if next_unit else 9999.0

        expected_words = [normalized_word(w) for w in unit['words']]
        unit_hw_start = hw_cursor
        unit_word_rows = headwords[hw_cursor:hw_cursor + len(expected_words)]
        actual_words = [normalized_word(r['word']) for r in unit_word_rows]
        if actual_words != expected_words:
            raise RuntimeError(f"Unit {unit['id']} word mismatch: {actual_words!r} != {expected_words!r}")
        hw_cursor += len(unit_word_rows)

        if unit.get('type') == 'suffix':
            local_stop = end_y if end_page == root_page else 720
            root_meaning = select_suffix_meaning(get_rows(root_page), float(unit.get('start_y', root_y - 40)), local_stop)
        else:
            root_meaning = select_root_meaning(get_rows(root_page), root_y, root_x)
        words_out: list[dict[str, Any]] = []

        for wi, word_row in enumerate(unit_word_rows):
            page_no = word_row['page']
            start_y = word_row['y'] - 13
            global_word_index = unit_hw_start + wi
            next_word_row = headwords[global_word_index + 1] if global_word_index + 1 < len(headwords) else None
            if next_word_row and next_word_row['page'] == page_no:
                # Use the next headword, even when it belongs to the next ROOT.
                # On comparison-style suffix pages the next suffix heading can
                # appear before the current word's example, so ROOT coordinates
                # would cut off valid examples.
                stop_y = next_word_row['y'] - 13
            elif next_unit and int(next_unit['root_page']) == page_no:
                stop_y = max(float(next_unit['start_y']) - 2, word_row['y'] + 24)
            else:
                stop_y = 718

            rows = [r for r in get_rows(page_no) if start_y <= r['y'] < stop_y and r['y'] < 720]
            info = classify_segment(rows, word_row['y'])
            primary_meaning = ''
            for candidate in info['meanings']:
                if compact_quiz_meaning(candidate):
                    primary_meaning = candidate
                    break
            if not primary_meaning and info['meanings']:
                primary_meaning = info['meanings'][0]
            words_out.append({
                'id': f"u{unit['id']}-w{wi + 1}",
                'word': word_row['word'],
                'source_page': page_no,
                'importance': info['importance'],
                'meanings': info['meanings'],
                'meaning': primary_meaning,
                'quiz_meaning': compact_quiz_meaning(primary_meaning),
                'etymology_formula': info['etymology_formula'],
                'etymology_steps': info['etymology_steps'],
                'related': info['related'],
                'examples': info['examples'],
                'notes': info['notes'],
            })

        # Source-grounded correction of section labels that are visually
        # positioned beside the suffix rather than on the same text line.
        unit_id = int(unit['id'])
        root_meaning = re.sub(r'\s*·\s*·\s*', '·', root_meaning).strip(' ·')
        fixed_root_meanings = {
            46: '행위자·지칭',
            48: '행위·성질·상태', 49: '행위·성질·상태',
            50: '행위·성질·상태', 51: '행위·성질·상태',
            52: '행위·성질·상태', 53: '행위·성질·상태',
            54: '행위·성질·상태', 55: '행위·성질·상태',
            56: '행위·성질·상태', 57: '행위·성질·상태',
            61: '작은 것을 가리키는', 62: '작은 것을 가리키는',
            95: '가능성·능력·적합성',
            108: '동사형 접미사 · …화하다·…하게 만들다·…되게 하다',
            109: '동사형 접미사 · …화하다·…하게 만들다·…되게 하다',
            110: '동사형 접미사 · …화하다·…하게 만들다·…되게 하다',
            111: '동사형 접미사 · …화하다·…하게 만들다·…되게 하다',
            112: '동사형 접미사 · 반복적인 행동을 하다',
        }
        if 63 <= unit_id <= 94 and words_out:
            # Pages 91-95 compare suffixes by the resulting adjective meaning.
            root_meaning = f"형용사형 접미사 · {words_out[0]['quiz_meaning']}"
        root_meaning = fixed_root_meanings.get(unit_id, root_meaning)

        unit_out.append({
            'id': unit['id'],
            'source_day': unit['source_day'],
            'page_start': unit['page_start'],
            'page_end': unit['page_end'],
            'root': unit['root'],
            'source_roots': unit.get('source_roots', [unit['root']]),
            'root_meaning': root_meaning,
            'type': unit['type'],
            'word_count': len(words_out),
            'words': words_out,
        })

    metrics = {
        'units': len(unit_out),
        'words': sum(len(u['words']) for u in unit_out),
        'words_with_meaning': sum(bool(w['meaning']) for u in unit_out for w in u['words']),
        'words_with_formula': sum(bool(w['etymology_formula']) for u in unit_out for w in u['words']),
        'words_with_steps': sum(bool(w['etymology_steps']) for u in unit_out for w in u['words']),
        'words_with_example': sum(bool(w['examples']) for u in unit_out for w in u['words']),
        'roots_with_meaning': sum(bool(u['root_meaning']) for u in unit_out),
    }
    output = {
        'schema_version': 2,
        'source': {
            'title': '능률VOCA 어원편',
            'pdf_pages': len(doc),
            'learning_pages': '18-402',
            'extraction_note': 'PDF의 글꼴·좌표 구조를 이용한 자동 추출 결과. 원문 페이지를 함께 보존합니다.',
        },
        'metrics': metrics,
        'units': unit_out,
    }
    text = json.dumps(output, ensure_ascii=False, indent=2)
    OUTPUT.write_text(text, encoding='utf-8')
    WEB_OUTPUT.write_text(text, encoding='utf-8')
    print(json.dumps(metrics, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
