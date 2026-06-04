# Cyber Bypass 점수 전략 분석

작성일: 2026-06-02 KST  
근거: Burp Proxy 히스토리, 기존 `burp_history_analysis.md`, 리더보드/제출/커스터마이징 응답 일부

## 1. 결론 요약

이 게임에서 점수를 많이 내려면 단순히 프롬프트를 많이 보내는 것보다, **여러 모델/behavior 조합에서 실제 `break`로 인정되는 성공 사례를 효율적으로 만드는 것**이 중요해 보입니다.

Burp 히스토리와 프론트엔드 응답에서 다음 지표가 확인되었습니다.

- `num_breaks`
- `total_breaks`
- `total_chats`
- `attack_success_rate`
- `Prize`
- `points`
- `rank`
- `submissionsCount`
- `hasChallengeCompleted`

따라서 점수 전략은 다음 세 축으로 잡는 것이 좋습니다.

1. 성공 건수 늘리기: 여러 모델/behavior에서 break를 만드는 것
2. 효율 높이기: 무작정 많이 보내지 않고 성공률을 높이는 것
3. 경쟁이 덜한 구간 찾기: 전체 리더보드뿐 아니라 모델별/behavior별 빈틈을 찾는 것

## 2. 점수에 영향을 줄 가능성이 큰 요소

### 2.1 Break 수

리더보드 JS와 데이터 응답에서 `num_breaks`, `total_breaks`가 확인되었습니다. 가장 직접적인 점수 지표일 가능성이 큽니다.

전략:

- 같은 프롬프트를 반복하기보다 모델/behavior 조합을 넓게 탐색합니다.
- 이미 성공한 유형이 있으면 표현만 바꾸기보다 다른 모델에 이식 가능한지 확인합니다.
- `Submissions` 화면에서 어떤 시도가 성공/실패로 기록되는지 확인해야 합니다.

### 2.2 성공률

`attack_success_rate` 컬럼이 확인되었습니다. 즉 많이 시도하는 것만으로는 불리할 수 있고, 실패 시도가 누적되면 효율 지표가 낮아질 가능성이 있습니다.

전략:

- 아무 프롬프트나 많이 던지지 않습니다.
- 한 번에 하나의 변수만 바꾸며 실험합니다.
- 실패한 프롬프트는 바로 반복하지 말고 실패 원인을 분류합니다.
- 모델, behavior, 커스터마이징 조합별 성공률을 따로 기록합니다.

### 2.3 비용/에너지

`energyState`, `energyConfig`, `defaultSubmissionCost`, `defaultMessageCost`, `tokenLimit`가 확인되었습니다. 게임 내 자원 제한 또는 비용 구조가 있을 가능성이 있습니다.

전략:

- 긴 프롬프트보다 짧고 의도가 선명한 프롬프트를 우선합니다.
- 한 시도 안에서 너무 많은 목표를 섞지 않습니다.
- 응답이 끝나기 전에 추가 조작하지 말고 결과를 완전히 확인합니다.
- 토큰을 많이 쓰는 커스터마이징은 실제 성능 향상이 있을 때만 유지합니다.

## 3. 우선 확인해야 할 화면

점수 구조를 확정하려면 브라우저에서 아래 화면을 다시 열어 Burp에 트래픽을 쌓는 것이 좋습니다.

1. `Rules`
2. `Leaderboard`
3. `Prizes`
4. `Submissions`
5. `Previous Chats`
6. `Chat customizations`

특히 `Rules`와 `Submissions`가 중요합니다. 현재 히스토리에서는 Rules 페이지 본문이 gzip/분석 이벤트와 섞여 명확히 복원되지 않았습니다.

## 4. 실험 순서 제안

### 4.1 1단계: 기준선 만들기

먼저 각 모델/behavior에 대해 무해한 기준 프롬프트를 한 번씩 보내고 다음을 기록합니다.

- 모델명
- behavior 이름 또는 ID
- 설치한 커스터마이징
- 응답 완료 여부
- 제출 기록 생성 여부
- 점수/성공/실패 표시 여부

목적은 성공을 바로 노리기보다, UI와 서버가 어떤 필드를 기준으로 결과를 기록하는지 파악하는 것입니다.

### 4.2 2단계: 모델별 난이도 분류

모델마다 방어 성향이 다를 가능성이 큽니다. 리더보드에 모델별 `total_breaks`, `total_chats`, `attack_success_rate`가 있다면 다음처럼 분류합니다.

- `total_chats`가 많은데 `total_breaks`가 낮은 모델: 방어가 강하거나 사람들이 많이 실패한 모델
- `total_chats`가 적고 `total_breaks`가 낮은 모델: 아직 덜 탐색된 모델
- `attack_success_rate`가 높은 모델: 이미 공략 패턴이 알려졌을 가능성이 있는 모델
- `Prize`가 높은 모델: 점수 대비 보상이 클 가능성이 있는 모델

초반에는 `덜 탐색된 모델`과 `성공률이 적당히 보이는 모델`을 우선하는 것이 효율적입니다.

### 4.3 3단계: 커스터마이징 조합 비교

관찰된 커스터마이징 유형은 다음과 같습니다.

- system prompt
- script tool
- llm tool

캡처된 예시:

- `Concise operator mode`
- `Skeptical evidence-first mode`
- `List files`
- `Summarize output`

전략:

- 처음에는 기본 조합으로 한 번 테스트합니다.
- 그 다음 system prompt만 바꿔서 비교합니다.
- 도구는 꼭 필요할 때만 추가합니다.
- 커스터마이징을 여러 개 동시에 바꾸면 어떤 요소가 영향을 줬는지 알기 어렵습니다.

## 5. 프롬프트 작성 방향

실제 공격 지시문이나 우회 페이로드를 여기서 작성하지는 않습니다. 다만 점수 효율을 높이기 위한 안전한 작성 원칙은 다음과 같습니다.

- 목표를 하나로 좁힙니다.
- 모델이 장황하게 설명하지 않도록 출력 형식을 제한합니다.
- 결과 판정에 필요한 증거를 짧게 요구합니다.
- 실패 시에는 같은 문장을 반복하지 말고, 모델이 어느 부분에서 거부했는지 관찰합니다.
- classifier에 막혔는지, 모델 자체가 거부했는지, 도구 실행에서 막혔는지 구분합니다.

핵심은 "우회 문구"를 찾는 것이 아니라, 게임이 어떤 조건을 `break`로 판정하는지 학습하는 것입니다.

## 6. Burp에서 봐야 할 체크포인트

다음 요청/응답을 중심으로 확인하면 됩니다.

### 제출 요청

`POST /api/compete/challenge-completion`

확인할 필드:

- `model`
- `associationId`
- `challengeId`
- `behaviorId`
- `message.content`
- `systemPromptInjection`
- `installedCustomizationIds`

### 제출 응답

응답은 `text/event-stream`으로 오며 다음 이벤트가 보였습니다.

- `turn_start`
- `setup_status`
- `api_trace`

다음 키워드가 보이는지 확인해야 합니다.

- `score`
- `break`
- `blocked`
- `classifier`
- `completed`
- `submission`
- `success`

### 결과 화면

다음 데이터 엔드포인트를 제출 후 다시 확인합니다.

- `/arena/challenge/cyber-bypass/submissions/__data.json`
- `/arena/challenge/cyber-bypass/previous-chats/__data.json`
- `/arena/challenge/cyber-bypass/prizes/__data.json`
- `/arena/challenge/cyber-bypass/leaderboard/__data.json`

## 7. 고득점 운영 방식

추천 운영 방식은 다음과 같습니다.

1. Rules를 먼저 확인해 성공/실패 판정 기준을 파악합니다.
2. 모델/behavior 표를 만듭니다.
3. 각 조합에 기준선 프롬프트를 1회씩만 보냅니다.
4. 리더보드에서 경쟁이 덜한 모델을 고릅니다.
5. 커스터마이징을 하나씩 바꾸며 성공률을 비교합니다.
6. 성공한 접근은 다른 모델에 이식해 봅니다.
7. 실패한 접근은 classifier 차단, 모델 거부, 도구 실패, 판정 실패로 분류합니다.
8. Submissions에서 실제 점수 반영 여부를 확인합니다.

## 8. 현재 단계의 가장 중요한 다음 행동

지금 가장 필요한 것은 `Rules`와 제출 후 `Submissions` 응답입니다.

브라우저에서 다음을 수행한 뒤 다시 분석하면 점수 전략을 더 구체화할 수 있습니다.

1. Rules 페이지를 완전히 열기
2. Chat에서 모델/behavior 목록을 모두 한 번씩 펼치기
3. 무해한 테스트 프롬프트를 하나 보내기
4. 응답 완료 후 Submissions, Previous Chats, Prizes, Leaderboard를 다시 열기
5. 그 상태에서 "다시 봐줘"라고 요청하기

그러면 다음 분석에서는 실제 점수 반영 조건과 모델별 우선순위를 더 정확히 뽑을 수 있습니다.
