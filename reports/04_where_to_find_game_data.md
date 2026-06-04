# Cyber Bypass 정보 확인 위치

작성일: 2026-06-02 KST

## 1. 모델 목록 전체

가장 쉬운 위치:

- 브라우저: `Chat` 화면
- 모델 선택 드롭다운 또는 모델 카드/선택 영역

Burp에서 볼 위치:

- `GET /arena/challenge/cyber-bypass/chat/__data.json`

검색 키워드:

- `modelListsByWave`
- `modelMap`
- `modelIdNameMap`

주의:

SvelteKit 데이터 응답은 숫자 인덱스 기반으로 압축되어 있어서 Burp Raw 화면에서 바로 읽기 어렵습니다. 모델 이름은 UI 드롭다운에서 보는 것이 더 쉽습니다.

## 2. behavior 목록 전체

가장 쉬운 위치:

- 브라우저: `Chat` 화면
- 모델 선택 뒤에 나오는 behavior/target/goal 선택 영역

Burp에서 볼 위치:

- `GET /arena/challenge/cyber-bypass/chat/__data.json`
- `GET /arena/challenge/cyber-bypass/submissions/__data.json`

검색 키워드:

- `behaviorIdToBehaviorMap`
- `behaviorId`

주의:

현재 제출 요청에서 확인된 behavior ID 예시는 `7dffefe6-175d-4423-ba3f-4860446c5ed6`입니다. 하지만 전체 behavior 이름/설명은 UI에서 드롭다운을 열어 보는 편이 더 명확합니다.

## 3. 제출 결과 전체

가장 쉬운 위치:

- 브라우저: `Submissions`
- 보조 확인: `Previous Chats`

Burp에서 볼 위치:

- 제출 직후: `POST /api/compete/challenge-completion`
- 제출 목록: `GET /arena/challenge/cyber-bypass/submissions/__data.json`
- 대화 목록: `GET /arena/challenge/cyber-bypass/previous-chats/__data.json`

검색 키워드:

- `chat_id`
- `submission`
- `success`
- `break`
- `score`
- `completed`
- `blocked`
- `classifier`

주의:

`POST /api/compete/challenge-completion` 응답은 `text/event-stream` 형식입니다. 일반 JSON처럼 한 번에 끝나는 응답이 아니라 `turn_start`, `setup_status`, `api_trace` 같은 이벤트가 순서대로 내려옵니다.

## 4. 점수 반영 조건

가장 쉬운 위치:

- 브라우저: `Rules`
- 브라우저: `Leaderboard`
- 브라우저: `Prizes`

Burp에서 볼 위치:

- `GET /arena/challenge/cyber-bypass/leaderboard/__data.json`
- `GET /arena/challenge/cyber-bypass/prizes/__data.json`

검색 키워드:

- `blueTeamScoringFormula`
- `leaderboardTabs`
- `num_breaks`
- `total_breaks`
- `total_chats`
- `attack_success_rate`
- `Prize`

현재 관찰:

리더보드 컬럼에서 `Breaks`, `Total Breaks`, `Total Chats`, `Attack Success Rate`, `Prize`가 확인되었습니다. 따라서 점수는 단순 채팅 횟수보다 break 수와 성공률에 더 강하게 연결될 가능성이 큽니다.

## 5. 성공/실패 판정 메시지

가장 쉬운 위치:

- 브라우저: 제출 후 `Chat` 응답 영역
- 브라우저: `Submissions`
- 브라우저: `Previous Chats`

Burp에서 볼 위치:

- `POST /api/compete/challenge-completion`
- `GET /arena/challenge/cyber-bypass/submissions/__data.json`
- `GET /arena/challenge/cyber-bypass/previous-chats/__data.json`

검색 키워드:

- `success`
- `failed`
- `break`
- `blocked`
- `classifier`
- `violation`
- `completed`
- `score`

주의:

현재 히스토리에서는 테스트 프롬프트 응답의 시작 이벤트는 보였지만, 최종 성공/실패 판정 메시지는 아직 명확히 확인되지 않았습니다. 제출 후 Submissions 화면을 다시 열어야 결과가 더 잘 잡힐 가능성이 큽니다.

## 6. Burp에서 필터링할 때 추천 검색어

Burp Proxy HTTP history 검색창에서 다음을 순서대로 검색하면 됩니다.

```text
app.grayswan.ai
```

```text
chat/__data.json
```

```text
submissions/__data.json
```

```text
challenge-completion
```

```text
leaderboard/__data.json
```

```text
behaviorIdToBehaviorMap
```

```text
modelListsByWave
```

잡음으로 제외해도 되는 경로:

```text
/ingest/
/vitals
sentry
hubspot
linkedin
```

## 7. 제일 쉬운 확인 순서

1. 브라우저에서 `Chat` 화면을 연다.
2. 모델 드롭다운을 열고 전체 모델 이름을 눈으로 확인한다.
3. behavior 드롭다운을 열고 전체 behavior 이름을 눈으로 확인한다.
4. 테스트 프롬프트를 하나 보낸다.
5. 응답이 끝나면 `Submissions`를 연다.
6. `Leaderboard`와 `Prizes`를 다시 연다.
7. Burp에서 `challenge-completion`, `submissions/__data.json`, `leaderboard/__data.json`만 집중해서 본다.
