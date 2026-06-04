# Cyber Bypass 초심자용 구조 설명

작성일: 2026-06-02 KST  
근거: 현재 Burp Proxy 히스토리

## 1. 이 게임은 어떤 구조인가?

현재 확인된 구조는 일반적인 CTF처럼 `1번 문제`, `2번 문제`, `3번 문제`가 따로 있는 형태라기보다, **하나의 챌린지 안에서 여러 모델과 여러 behavior를 상대로 break를 만들어 점수를 얻는 방식**에 가깝습니다.

큰 구조는 다음과 같습니다.

```text
Gray Swan Arena
└─ Cyber Bypass 챌린지
   ├─ Rules
   ├─ Chat
   │  ├─ 모델 선택
   │  ├─ behavior 선택
   │  ├─ 커스터마이징 선택
   │  └─ 프롬프트 제출
   ├─ Previous Chats
   ├─ Submissions
   ├─ Leaderboard
   └─ Prizes
```

## 2. 지금 공개된 문제는 몇 개인가?

현재 Burp 히스토리에서 명확히 확인된 공개 챌린지는 **1개**입니다.

- 챌린지명: `Cyber Bypass`
- 경로: `/arena/challenge/cyber-bypass`
- 설명: `Prompt models to hack while evading offensive cyber classifiers`

다만 이 안에 여러 개의 하위 목표가 있습니다. 이 하위 목표는 전통적인 문제 번호가 아니라 다음 조합으로 나뉘는 것으로 보입니다.

```text
모델 × behavior × 커스터마이징 × 프롬프트
```

즉 "공개 문제 수"를 세는 방법이 두 가지입니다.

1. 챌린지 단위로 세면: 현재 확인된 것은 `Cyber Bypass` 1개
2. 실제 공략 대상 단위로 세면: 모델/behavior 조합 수만큼 여러 개

현재 Burp MCP 출력 제한 때문에 `modelMap`, `modelListsByWave`, `behaviorIdToBehaviorMap` 전체 목록은 아직 완전히 복원하지 못했습니다. 그래서 현재 공개된 모델/behavior 조합의 정확한 개수는 아직 확정하지 않았습니다.

## 3. 각 화면은 무슨 역할인가?

### Rules

게임 규칙을 설명하는 곳입니다. 가장 먼저 봐야 합니다.

여기서 확인해야 할 것:

- 무엇을 하면 성공인지
- 무엇이 금지되는지
- 점수 산정 기준
- 제출 제한 또는 비용
- 모델/behavior가 어떻게 평가되는지

### Chat

실제로 모델에게 프롬프트를 보내는 메인 화면입니다.

Chat 화면의 구성 요소:

- 대상 모델
- 대상 behavior
- 입력 프롬프트
- 선택한 커스터마이징
- 응답 스트림

Burp에서는 이 동작이 주로 다음 요청으로 보입니다.

```text
POST /api/compete/challenge-completion
```

### Previous Chats

이전에 보낸 대화 기록을 확인하는 화면입니다.

중요한 이유:

- 어떤 시도를 했는지 복기 가능
- 성공/실패 패턴을 비교 가능
- 같은 실수를 반복하지 않게 해줌

### Submissions

제출 결과를 확인하는 화면입니다.

중요한 이유:

- 실제 점수 반영 여부를 볼 가능성이 높음
- 성공한 break가 기록되는지 확인 가능
- 실패 이유나 판정 상태가 나올 수 있음

### Leaderboard

순위표입니다.

관찰된 컬럼/필드:

- `num_breaks`
- `total_breaks`
- `total_chats`
- `attack_success_rate`
- `Prize`
- `rank`

이 때문에 단순히 많이 시도하는 것보다, 성공률과 break 수가 중요해 보입니다.

### Prizes

상금 또는 모델별 보상 정보를 보여주는 화면으로 보입니다.

Burp 응답에서 `totalBreaks`, `brokenModels` 같은 구조가 보였습니다.

## 4. 요청 흐름을 아주 쉽게 보면

브라우저에서 페이지를 열면:

```text
GET /arena/challenge/cyber-bypass/chat/__data.json
```

이 요청으로 게임 상태를 받아옵니다.

예를 들면:

- 내 유저 정보
- 현재 점수
- 모델 목록
- behavior 목록
- 챌린지 정보
- 남은 자원/비용 정보

프롬프트를 보내면:

```text
POST /api/compete/challenge-completion
```

이 요청으로 서버에 다음 정보가 전달됩니다.

- 어떤 챌린지인지
- 어떤 모델을 선택했는지
- 어떤 behavior를 대상으로 하는지
- 내가 입력한 메시지
- 어떤 커스터마이징을 설치했는지

응답은 일반 JSON 한 번으로 끝나는 것이 아니라 `text/event-stream` 형태로 이어지는 것으로 보입니다.

즉 서버가 이런 식으로 진행 상황을 흘려보냅니다.

```text
turn_start
setup_status
api_trace
...
```

## 5. 이 게임에서 "문제 풀이"란 무엇인가?

현재 구조상 문제 풀이는 다음과 같습니다.

1. 목표 모델을 고른다.
2. 목표 behavior를 고른다.
3. 커스터마이징을 선택한다.
4. 프롬프트를 보낸다.
5. 모델 응답을 확인한다.
6. 서버가 이것을 break로 인정하는지 본다.
7. Submissions/Leaderboard에서 반영 여부를 확인한다.

즉 정답 문자열 하나를 맞히는 문제라기보다, **모델이 특정 보안 기준을 깨는 응답을 하도록 유도하고, 그 결과가 시스템에서 break로 판정되는지 확인하는 게임**으로 보는 것이 맞습니다.

## 6. 처음 접근할 때의 순서

처음에는 점수를 바로 노리기보다 구조를 이해해야 합니다.

추천 순서:

1. Rules를 읽는다.
2. Chat에서 모델 목록을 본다.
3. behavior 목록을 본다.
4. 커스터마이징 목록을 본다.
5. 무해한 테스트 프롬프트를 하나 보낸다.
6. 응답이 끝난 뒤 Submissions를 본다.
7. Leaderboard에서 어떤 지표가 바뀌는지 본다.

이렇게 하면 "내가 한 행동이 서버에서 어떻게 기록되는지"가 보입니다.

## 7. 지금 단계에서 부족한 정보

현재 Burp 히스토리만으로 부족한 정보는 다음입니다.

- Rules 본문 전체
- 모델 목록 전체
- behavior 목록 전체
- 제출 결과 전체
- 점수 반영 조건
- 성공/실패 판정 메시지

이 정보는 브라우저에서 각 화면을 실제로 열어야 Burp에 더 잘 잡힙니다.

## 8. 다음에 해볼 것

브라우저에서 다음을 해보면 다음 분석이 훨씬 쉬워집니다.

1. `Rules` 페이지를 열고 완전히 로드될 때까지 기다리기
2. `Chat` 화면에서 모델 드롭다운 열기
3. behavior 드롭다운 열기
4. 커스터마이징 패널 열기
5. 무해한 테스트 프롬프트 하나 보내기
6. 응답 완료 후 `Submissions`, `Previous Chats`, `Leaderboard`, `Prizes` 열기

그 다음 "다시 봐줘"라고 요청하면, Burp 히스토리 기준으로 공개된 모델/behavior 개수와 점수 구조를 더 정확히 정리할 수 있습니다.
