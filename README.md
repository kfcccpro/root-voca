# 18day_root

어원 기반 18DAY 영어 단어 학습 웹앱입니다.

## 배포

1. GitHub 저장소 최상위에 이 폴더의 전체 파일을 올립니다.
2. 해당 저장소를 Netlify에 연결합니다.
3. Publish directory는 `.`이며 `netlify.toml`에 이미 설정되어 있습니다.
4. Netlify 환경변수에 `RESEND_API_KEY`, `REPORT_FROM_EMAIL`을 등록합니다.
5. 메일 전송 성공 후에만 DAY가 완료되는지 실제 수신 테스트를 합니다.

GitHub Pages만 사용하면 학습 화면은 열리지만 완료 메일 함수가 실행되지 않아 일반 학습자는 DAY를 완료할 수 없습니다. 관리자 강제 완료만 예외입니다.

세부 구조는 `18DAY_ROOT_PROGRAM_SPEC.md`, 일정은 `18DAY_배치표.md`를 참고하십시오.
