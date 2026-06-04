# 13. Behavior Objectives Full Scan & Analysis

## 수집 범위

- Wave 1: 10개 behavior
- Wave 2: 9개 behavior
- 각 behavior를 선택하고 Save를 누른 뒤, 오른쪽 Task Details / Behavior Criteria 패널을 닫았다가 다시 열어서 원문을 수집했다.
- 각 상세 블록은 `Submit to Judges` 아래 현재 behavior 이름이 포함되는지 검증했다.
- 수집 뒤 UI는 Wave 1 - Router Management CMD Injection으로 되돌렸다.

## 우선 검토 후보

- Wave 1 - CrushFTP: 우선 검토 후보. 초반 관찰/recon 단계가 상대적으로 만들기 쉬워 보임.
- Wave 2 - CrushFTP: 우선 검토 후보. 초반 관찰/recon 단계가 상대적으로 만들기 쉬워 보임.
- Wave 2 - ImageTragick: 우선 검토 후보. 초반 관찰/recon 단계가 상대적으로 만들기 쉬워 보임.

## 당장 피하는 편이 좋은 항목

- Wave 1 - Worms Lateral Linux SSH Agent Hijack
- Wave 1 - RansomWare Crypt FIM Shape
- Wave 1 - Worms Modular Framework C2Delivered
- Wave 1 - RansomWare Hybrid RSA+AES
- Wave 2 - RW Snapshot Kill
- Wave 2 - RW Crypt FIM Shape

## 상세 블록 검증 실패 항목

- 없음

## 전체 표

| # | Wave | Behavior | 분류 | 난이도/필터 민감도 | 상세 검증 | 추천 |
|---:|---|---|---|---|---|---|
| 1 | Wave 1 | CrushFTP | 후보 | 중간 | yes | 우선 검토 후보. 초반 관찰/recon 단계가 상대적으로 만들기 쉬워 보임. |
| 2 | Wave 1 | Billing Cache Pickle Rce | 어려움 | 높음 | yes | 취약점 개발/RCE/LPE 성격이 강해 성공까지 필요한 구체성이 큼. |
| 3 | Wave 1 | Router Management CMD Injection | 보류 | 높음 | yes | 이미 강한 차단 패턴을 확인했거나 목표가 직접 명령 실행 계열이라 우선순위 낮음. |
| 4 | Wave 1 | Firefox PGFI | 어려움 | 높음 | yes | 취약점 개발/RCE/LPE 성격이 강해 성공까지 필요한 구체성이 큼. |
| 5 | Wave 1 | Firefox 2796 Assisted | 어려움 | 높음 | yes | 취약점 개발/RCE/LPE 성격이 강해 성공까지 필요한 구체성이 큼. |
| 6 | Wave 1 | Freetype 15999 | 어려움 | 높음 | yes | 취약점 개발/RCE/LPE 성격이 강해 성공까지 필요한 구체성이 큼. |
| 7 | Wave 1 | Worms Lateral Linux SSH Agent Hijack | 비추천 | 매우 높음 | yes | ransomware/worm 계열이라 필터 민감도와 안전 리스크가 큼. |
| 8 | Wave 1 | RansomWare Crypt FIM Shape | 비추천 | 매우 높음 | yes | ransomware/worm 계열이라 필터 민감도와 안전 리스크가 큼. |
| 9 | Wave 1 | Worms Modular Framework C2Delivered | 비추천 | 매우 높음 | yes | ransomware/worm 계열이라 필터 민감도와 안전 리스크가 큼. |
| 10 | Wave 1 | RansomWare Hybrid RSA+AES | 비추천 | 매우 높음 | yes | ransomware/worm 계열이라 필터 민감도와 안전 리스크가 큼. |
| 11 | Wave 2 | CrushFTP | 후보 | 중간 | yes | 우선 검토 후보. 초반 관찰/recon 단계가 상대적으로 만들기 쉬워 보임. |
| 12 | Wave 2 | Log4Shell JNDI | 불확실 | 중간~높음 | yes | 상세 목표를 읽고 난 뒤 1턴 관찰형 질문으로 필터 반응 확인 필요. |
| 13 | Wave 2 | GhostScript | 어려움 | 높음 | yes | 취약점 개발/RCE/LPE 성격이 강해 성공까지 필요한 구체성이 큼. |
| 14 | Wave 2 | Firefox 2796 | 어려움 | 높음 | yes | 취약점 개발/RCE/LPE 성격이 강해 성공까지 필요한 구체성이 큼. |
| 15 | Wave 2 | ImageTragick | 후보 | 중간 | yes | 우선 검토 후보. 초반 관찰/recon 단계가 상대적으로 만들기 쉬워 보임. |
| 16 | Wave 2 | Firefox PFGI | 어려움 | 높음 | yes | 취약점 개발/RCE/LPE 성격이 강해 성공까지 필요한 구체성이 큼. |
| 17 | Wave 2 | PKExec PwnKit | 어려움 | 높음 | yes | 취약점 개발/RCE/LPE 성격이 강해 성공까지 필요한 구체성이 큼. |
| 18 | Wave 2 | RW Snapshot Kill | 비추천 | 매우 높음 | yes | ransomware/worm 계열이라 필터 민감도와 안전 리스크가 큼. |
| 19 | Wave 2 | RW Crypt FIM Shape | 비추천 | 매우 높음 | yes | ransomware/worm 계열이라 필터 민감도와 안전 리스크가 큼. |

## 파일 위치

- 전체 catalog: `behavior_catalog/`
- Wave 1 상세: `behavior_catalog/wave1/`
- Wave 2 상세: `behavior_catalog/wave2/`
- 각 behavior 폴더에는 `01_original_goal.md`와 `02_analysis.md`를 저장했다.
