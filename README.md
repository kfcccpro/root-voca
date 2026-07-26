# 18day_root V7 통합 업그레이드

영어 어원 학습, 선택형 진단, 즉시 오답 교정, D+1·조건부 D+3·D+6 분산복습, 관리자 완료 메일을 하나의 연속 흐름으로 연결한 18DAY 학습 웹앱입니다.

## 핵심 기능

- 18DAY · 360 ROOT · 1,410 표제어
- DAY당 4개 내부 집중구간, 학습자에게는 한 번의 진입만 요구
- 6문항 미니세트 자동 보상
- 어원 순차 나타내기와 최종 뜻 은폐
- 숫자키 1~4, 숫자패드, 마우스, 태블릿·스마트폰 터치
- 오답 직후 `내 선택 ↔ 실제 정답` 비교
- 오답 즉시 철자 회상 최대 2회
- 영구 오답노트 DB 구조
- D0 → D+1 → 조건부 D+3 → D+6 복습
- 반복 오답 집중 케어 상태
- 영어→뜻과 뜻→영어 방향별 숙달 기록
- 문항별 eventId 로그와 저장 revision
- 주 저장본 + 이전 revision 안전백업
- 실제 활성 학습시간 측정
- 관리자 완료 메일 성공 후 DAY 완료
- DAY 18 이후 최대 6일간 `과정 후 기억 확인`
- 관리자 기능 자가점검

## 실행

정적 서버에서 프로젝트 루트를 실행합니다.

```bash
python -m http.server 8000
```

브라우저에서 `http://localhost:8000`을 엽니다.

## GitHub Pages

저장소 최상위에 `index.html`, `app.js`, `styles.css`, `data/`가 보이도록 업로드하면 화면과 로컬 진도는 작동합니다.

GitHub Pages에서는 Netlify Functions 기반 메일 발송이 작동하지 않습니다.

## Netlify

`netlify.toml`과 `netlify/functions/send-day-report.mjs`가 포함되어 있습니다.

필수 환경변수:

```text
RESEND_API_KEY
REPORT_FROM_EMAIL
```

실제 관리자 메일 발송이 성공해야 DAY가 최종 완료됩니다.

## 저장 구조

현재 V7 구현 범위:

```text
메모리
→ localStorage 주 저장본
→ 이전 revision 안전백업
→ JSON 수동 백업
```

다음 DB 연결 단계에서 온라인 DB, 저장 후 재조회 검증, PC·태블릿 다기기 병합을 활성화할 수 있도록 `eventId`, `revision`, `deviceId`, 방향별 숙달 구조를 이미 반영했습니다.

## 주요 파일

```text
index.html
app.js
styles.css
data/voca_schedule.json
data/learning_units.json
data/root_units.json
netlify/functions/send-day-report.mjs
18DAY_ROOT_FINAL_INTEGRATED_SYSTEM_SPEC_v2.md
tests/validate_project.py
tests/browser_test_v7.py
```
