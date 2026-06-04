# Behavior Worklogs

이 폴더는 게임 진행 중 생기는 시도와 판단을 남기는 곳이다.

## 구조

- `00_overall/01_master_log.md`
  - 종합로그.
  - behavior 전환, 전체 판단, 후보 우선순위, 세션 인수인계용 결론을 기록한다.
  - 개별 payload, 긴 응답 전문, 반복 실험 세부 내용은 여기에 길게 쓰지 않는다.

- `NN_behavior_slug/01_attempt_log.md`
  - behavior별 로그.
  - 해당 behavior에서 한 실제 시도, 모델 응답, block/refusal 여부, 다음에 바꿀 점을 기록한다.
  - 같은 실수를 반복하지 않기 위한 세부 기록은 여기에 남긴다.

- `99_templates/01_behavior_attempt_log_template.md`
  - 새 behavior 로그를 만들 때 복사해서 쓰는 템플릿.

## 기록 원칙

- 새 행동을 하면 behavior별 로그에 먼저 남긴다.
- behavior를 바꾸거나 전략 판단이 바뀌면 종합로그에도 한 줄 요약을 남긴다.
- 원문 criteria와 분석은 `behavior_catalog/`에 둔다.
- 네트워크 캡처와 SSE 원문은 `captures/`에 둔다.
- 종합로그는 짧게, behavior별 로그는 자세히 쓴다.
