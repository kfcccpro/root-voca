# root_18day V7.15 검수 보고서

검수일: 2026-07-27 · 기준본: V7.14

## 1. 무결성
| 항목 | 결과 |
|---|---|
| `index.html` = `root_18day_SINGLE_FILE.html` | 일치 |
| 본문 내장 JS = `tests/app_extracted.js` | 일치 |
| 본문 내장 JSON = `tests/embeddedSchedule.json` / `embeddedContent.json` | 일치 |
| JavaScript 구문 검사 | 통과 |
| Netlify Function 구문 검사 | 통과 |
| FILE_HASHES.sha256 | 전 파일 일치 |

## 2. 데이터
| 항목 | 값 |
|---|---|
| DAY | 18 |
| ROOT(유닛) | 360 (id 1~360 연속, 누락·중복 0) |
| 표제어 | 1,410 |
| 블록 | 72 (일정 선언값 = 실제 단어 수 합계) |
| quiz_meaning 결함 | 0 (교정 441건 / 내용 복원 31건) |

## 3. 실기기(헤드리스 크로미움) 검증
| 시나리오 | 결과 |
|---|---|
| DAY 1 96스텝 전 과정 완주 (ROOT→단어→블록복습→철자) | 통과, 런타임 에러 0 |
| 메일 1차 실패 → 재전송 안내만 노출 | 통과 |
| 메일 2차 실패 → 대체 경로 노출 | 통과 |
| 게이트 중 관리자 화면 진입 | 통과 |
| 관리자 → 홈 복귀 시 게이트 재오픈 | 통과 |
| 오프라인 저장 후 DAY 완료 → 다음 DAY 진행 | 통과 (completedDays=[1], pendingReports=1) |
| 온라인 복귀 후 자동 재전송 → 정식 완료 승격 | 통과 (forced=false, mailConfirmedAt 기록) |
| 전송 성공 시 정상 완료 경로 | 통과 (대체 UI는 노출되지 않음) |
| V7.13/7.14 기록 복원 (DAY·블록·단어 중단 지점) | 통과 |
| 손상 저장소 → 안전백업 자동 복구 | 통과 |
| 자가점검 | 13개 항목 전부 통과 |

## 4. 자동 검수 (`node tests/qa_test.js`)
37개 항목 전부 통과 · failed: []

신규 항목
- `offline_completion_path` — 오프라인 대체 완료 함수 존재
- `mail_fallback_gate` — 실패 카운터 기반 대체 경로 게이팅
- `pending_report_promotion` — 보류 보고서 성공 시 정식 완료 승격
- `admin_reachable_during_gate` — 게이트 중 관리자 진입 가능
- `quiz_meaning_clean` — 1,410개 문항 뜻 데이터 결함 0

## 5. 저장 용량
18DAY 전 과정 완료 + 오답 이력 최대 시나리오에서 약 0.4MB.
현재본 + 안전백업 + 복구 스냅샷 3벌을 고려해도 브라우저 한도(약 5MB) 내입니다.

## 6. 알려진 제약
- 진도는 출처(origin)별 localStorage에 저장되므로 도메인·경로가 바뀌면 자동 복원되지 않습니다.
- 관리자 화면에는 별도 비밀번호가 없습니다. 학생 배포 시 이를 감안하십시오.
