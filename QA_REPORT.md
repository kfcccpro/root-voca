# root_18day V7.17 검수 보고서

검수일: 2026-07-27 · 기준본: V7.16 · 검증 환경: 헤드리스 크로미움 131

## 1. 무결성
| 항목 | 결과 |
|---|---|
| `index.html` = `root_18day_SINGLE_FILE.html` | 일치 |
| 본문 내장 JS = `tests/app_extracted.js` | 일치 |
| 본문 내장 JSON = `tests/embeddedSchedule.json` / `embeddedContent.json` | 일치 |
| JavaScript 구문 검사 | 통과 |
| Netlify Function 모듈 로드 | 통과 |
| `FILE_HASHES.sha256` | 전 파일 일치 |

## 2. 데이터
| 항목 | 값 |
|---|---|
| DAY | 18 |
| ROOT(유닛) | 360 (id 1~360 연속, 누락·중복 0) |
| 표제어 | 1,410 |
| 블록 | 72 (일정 선언값 = 실제 단어 수 합계) |
| quiz_meaning 결함 | **0** (V7.15에서 441건 정제 / 내용 복원 31건) |

## 3. 브라우저 검증
| 시나리오 | 결과 |
|---|---|
| 관리자 PIN 미인증 진입 차단 | 통과 |
| 오답 PIN(`1111`) 거부 + 오류 문구 | 통과 |
| 정답 PIN(`2007`) 진입 | 통과 |
| 관리자 화면 이탈 시 세션 잠금 복구 | 통과 |
| 메일 게이트 중 PIN 경유 관리자 진입 | 통과 |
| 메일 1차 실패 → 재전송 안내만 | 통과 (대체 UI 숨김 유지) |
| 메일 2차 실패 → 대체 경로 노출 | 통과 |
| 오프라인 완료 버튼 클릭 → 관리자 PIN 요구 | 통과 (완료되지 않음) |
| 오답 PIN 입력 → 거부, DAY 미완료 유지 | 통과 |
| PIN 취소 → DAY 미완료 유지 | 통과 |
| 관리자 PIN(2007) 승인 → DAY 완료 | 통과 (`completedDays=[1]`, `offlineApprovedBy=admin-pin`, 보류 1건) |
| 온라인 복귀 자동 재전송 → 정식 완료 승격 | 통과 (`mailConfirmedAt` 기록, `forced=false`) |
| 전송 성공 시 정상 완료 경로 | 통과 (대체 UI 미노출) |
| V7.13/7.14 기록 복원 (DAY·블록·단어 중단 지점) | 통과 |
| 손상 저장소 → 안전백업 자동 복구 | 통과 |
| 실행 중 uncaught JavaScript 오류 | 0건 |

## 4. 타이밍
| 항목 | 값 |
|---|---|
| 당일 오답 정답 확인 | 3,000ms |
| 예약 복습 인지 화면 NEXT 활성화 | 4,000ms |
| 인지 화면 진행 막대 | 제거됨 |

## 5. 자동 검수 (`node tests/qa_test.js`)
**43개 항목 전부 통과 · failed: []**

V7.17 신규 항목
- `offline_completion_requires_pin` — 오프라인 완료의 관리자 PIN 필수 여부
- `curriculum_source_faithful` — 원문 대조 교정 반영 확인

V7.16 항목
- `admin_pin_gate` — PIN 해시 존재 및 평문 상수 부재
- `primary_wrong_hold_3s` / `wrong_hold_3s` — 3,000ms
- `cognition_4s_no_meter` — 4,000ms + 진행 막대 부재
- `mail_recipient_server_side` — 수신 주소 서버 고정
- `admin_reachable_during_gate` — 게이트 중 관리자 진입 가능

## 6. 알려진 제약
- 4자리 PIN 해시는 브라우저에서 약 25ms 만에 전수 대입 복원 가능. 억제책 수준.
- 진도는 출처별 localStorage 저장. 도메인 변경 시 자동 이전되지 않음.
- 실제 관리자 메일함 수신은 배포 환경의 Resend/EmailJS 자격 증명에 의존하므로
  배포 직후 실제 DAY 보고 1건의 수신 확인이 필요합니다.
