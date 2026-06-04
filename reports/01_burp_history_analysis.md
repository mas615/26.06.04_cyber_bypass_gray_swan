# Burp 히스토리 분석 보고서 - Gray Swan Arena Cyber Bypass

작성일: 2026-06-02 KST  
분석 범위: Burp Proxy에 이미 남아 있던 HTTP 히스토리만 확인했습니다. 요청 재전송, 스캔, 퍼징, 능동 공격 테스트는 수행하지 않았습니다.

## 1. 분석 대상

Burp 히스토리에서 확인된 정보보안 게임 관련 트래픽은 다음과 같습니다.

- 대상 호스트: `app.grayswan.ai`
- 챌린지 경로: `/arena/challenge/cyber-bypass`
- 챌린지 이름: `Cyber Bypass`
- 설명: `Prompt models to hack while evading offensive cyber classifiers`
- 제출 요청에서 확인된 챌린지 ID: `6a16d21f730038fc66159d6f`

Sentry, HubSpot, LinkedIn 광고, Stytch, Pylon, 분석 수집 엔드포인트 트래픽도 함께 잡혀 있었지만, 게임 로직 분석에서는 제외했습니다.

## 2. 트래픽 요약

확인한 Burp 히스토리 기준 요약입니다.

- 파싱한 HTTP 항목: 192개
- `app.grayswan.ai` 관련 게임 트래픽: 15개
- WebSocket 히스토리: 관찰되지 않음
- 주요 프로토콜: HTTP/2
- 주요 세션 지표: `gs_stytch_session`, `gs_stytch_session_jwt`, `guest_session_id` 등 쿠키 기반 세션

세션 쿠키와 토큰 원문 값은 보고서에 저장하지 않았습니다.

## 3. 주요 애플리케이션 흐름

이 게임은 SvelteKit 기반 애플리케이션으로 보입니다. 페이지 상태는 `__data.json` 엔드포인트로 불러오고, 사용자 동작은 API 또는 SvelteKit action 라우트로 전송됩니다.

| 메서드 | 경로 | 용도 |
|---|---|---|
| GET | `/arena/challenge/cyber-bypass/leaderboard` | 리더보드 페이지 로드 |
| GET | `/arena/challenge/cyber-bypass/chat/__data.json` | 챌린지/채팅 상태 조회 |
| POST | `/arena?/update-user-details` | 표시 이름, 유입 경로, 규칙 동의 저장 |
| GET | `/arena/challenge/cyber-bypass/leaderboard/__data.json` | 챌린지 메타데이터와 리더보드 데이터 |
| GET | `/arena/challenge/cyber-bypass/previous-chats/__data.json` | 이전 채팅 목록 |
| GET | `/arena/challenge/cyber-bypass/submissions/__data.json` | 사용자 제출 목록 |
| GET | `/arena/challenge/cyber-bypass/prizes/__data.json` | 상금/브레이크 요약 |
| GET | `/api/arena/challenges/6a16d21f730038fc66159d6f/starter-customizations` | 시작 커스터마이징 그룹 |
| GET | `/api/arena/customizations?type=script-tool` | 스크립트 도구 커스터마이징 목록 |
| GET | `/api/arena/customizations?type=system-prompt` | 시스템 프롬프트 커스터마이징 목록 |
| GET | `/api/arena/customizations?type=llm-tool` | LLM 도구 커스터마이징 목록 |
| POST | `/api/compete/challenge-completion` | 챌린지 메시지/제출 시도 |

## 4. 관찰된 게임 구조

`chat/__data.json` 응답에는 다음과 같은 상태 필드가 포함되어 있었습니다.

- `challengeInfo`
- `modelListsByWave`
- `modelMap`
- `modelIdNameMap`
- `behaviorIdToBehaviorMap`
- `chatsCount`
- `submissionsCount`
- `hasChallengeStarted`
- `hasChallengeCompleted`
- `tokenLimit`
- `formRequirements`
- `energyState`
- `energyConfig`
- 메시지/제출 비용 관련 필드

클라이언트 데이터 구조 안에는 관리자 관련 플래그도 보였습니다.

- `isAdmin`
- `canDeanonymize`
- `canViewTestPrompts`
- `isPlatformAdmin`
- `hasEditAccess`
- `adminPotemkinToken`

다만 캡처된 상태에서는 이 값들이 권한 상승으로 바로 이어지는 형태로 보이지는 않았습니다. 현재 단계에서는 풍부한 클라이언트 상태 노출로 보는 것이 맞고, 실제 권한 경계 문제 여부는 서버 측 검증 테스트가 필요합니다. 이번 분석에서는 그런 능동 테스트는 하지 않았습니다.

## 5. 제출 요청 구조

캡처된 제출 요청은 다음과 같습니다.

- 엔드포인트: `POST /api/compete/challenge-completion`
- Content-Type: `application/json`
- 응답 상태: `200`
- 모델명: `Earth Capybara Legendary`
- Challenge ID: `6a16d21f730038fc66159d6f`
- Behavior ID: `7dffefe6-175d-4423-ba3f-4860446c5ed6`
- `systemPromptInjection`: `null`
- 설치된 커스터마이징 ID: `...ac06`부터 `...ac0a`로 끝나는 항목들이 포함됨
- 응답은 `chat_id`로 시작했지만, Burp MCP 출력 제한 때문에 전체 응답은 잘려 있었습니다.

캡처된 메시지는 무해한 한국어 테스트 문장이었고, 해당 응답 조각만으로는 브레이크 성공 여부나 점수 결과를 확인할 수 없었습니다.

## 6. 커스터마이징 표면

애플리케이션은 API를 통해 커스터마이징 목록을 제공합니다.

- `type=script-tool`
- `type=system-prompt`
- `type=llm-tool`

응답 일부에서 확인된 예시는 다음과 같습니다.

- 스크립트 도구: `List files`
- 시스템 프롬프트: `Concise operator mode`
- 시스템 프롬프트: `Skeptical evidence-first mode`
- LLM 도구: `Summarize output`

이 커스터마이징 기능은 게임의 의도된 메커니즘으로 보입니다. 보안 학습 관점에서는 어떤 도구와 프롬프트가 챌린지 실행 환경에 설치되는지에 영향을 주므로 중요한 분석 지점입니다.

## 7. 초기 보안 관찰 사항

- WebSocket 트래픽은 관찰되지 않았고, 현재까지는 HTTP/API 중심 흐름으로 보입니다.
- 인증/세션은 Stytch 기반 인프라를 사용하는 것으로 보입니다.
- 챌린지와 사용자 상태가 SvelteKit 데이터 응답에 상당히 많이 포함되어 있습니다.
- 제출 엔드포인트는 쿠키와 `Origin`/`Referer`를 사용합니다. 캡처된 헤더 이름 기준으로 별도의 CSRF 토큰 헤더는 보이지 않았습니다. 단, 이는 관찰 사항일 뿐 CSRF 취약점 확인은 아닙니다.
- `previous-chats`와 `submissions`는 캡처 시점에 비어 있거나 거의 비어 있었습니다.
- `prizes` 응답에서는 `totalBreaks`와 비어 있는 `brokenModels` 구조가 확인되었습니다.

## 8. 다음에 브라우저에서 해볼 조작

Burp 캡처를 켠 상태로 아래 동작을 해보면 2차 분석에 필요한 트래픽이 더 잘 쌓일 것 같습니다.

1. 챌린지의 `Rules` 페이지/탭을 열고 완전히 로드될 때까지 기다리기
2. 메인 `Chat` 화면에서 모델/behavior 드롭다운을 각각 한 번씩 열어보기
3. system prompt, script tool, LLM tool 커스터마이징 패널 열어보기
4. 무해한 테스트 프롬프트를 하나 더 보내고 모델 응답이 끝날 때까지 기다리기
5. 응답 후 `Previous Chats`, `Submissions`, `Leaderboard`, `Prizes` 다시 열기
6. UI에 `Submit`, `Appeal`, `Break details`, `View transcript`, `Score` 같은 버튼이 있으면 한 번씩 열어보기

안전한 범위 유지를 위해, 게임 규칙과 허용 범위를 확인하기 전에는 실제 공격 지시문이나 우회 목적 페이로드는 사용하지 않는 것이 좋습니다.

## 9. 다음 분석에서 볼 것

위 브라우저 조작을 마친 뒤 "다시 봐줘"라고 말해주면, 새로 쌓인 Burp 히스토리를 기준으로 다음 항목을 2차 분석하겠습니다.

- 제출부터 결과 수신까지의 전체 흐름
- 점수 산정 또는 완료 조건
- 모델/behavior 매핑
- 커스터마이징 ID가 요청에 미치는 영향
- 클라이언트 상태를 서버가 과도하게 신뢰하는지 여부
