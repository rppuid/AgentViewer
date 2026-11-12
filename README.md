# AgentViewer

herdr 위에서 도는 Claude · Codex · Antigravity 에이전트의 활동을 도트 RPG 마을로 보여주는 뷰어.
Go 실행 파일 하나가 수집과 화면 서빙을 모두 맡는다 (모의 모드 기준 상주 메모리 약 10MB).

## 실행

```bash
brew install go
```

```bash
go build -o agentviewer .
```

```bash
./agentviewer
```

`http://127.0.0.1:7318` 에서 열린다. herdr 에 떠 있는 Claude · Codex · Antigravity 패널을 읽어 보여준다.
herdr 없이 화면만 보려면 `./agentviewer -mock`, 외부에서는 Tailscale 로 내보낸다.

```bash
tailscale serve --bg --https=7318 http://127.0.0.1:7318
```

## 데이터 출처

| 출처 | 얻는 것 |
|---|---|
| herdr 소켓 `agent.list` (2초마다) | 패널별 에이전트 종류와 상태. 상태 전환이 의뢰 시작·완료를 정한다 |
| `~/.claude/projects/<폴더>/<세션>.jsonl` 과 `subagents/` | 요청 내용, 도구 호출, 대화, 서브에이전트 |
| `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | 요청 내용, 명령 실행, 대화, 검토 스레드 |
| `~/.gemini/antigravity-cli/brain/<id>/.system_generated/logs/transcript_full.jsonl` | 요청 내용, 도구 호출, 서브에이전트 |

뷰어가 접속해 있지 않으면 파일은 읽지 않는다. 형태가 바뀌었을 때는 `./agentviewer probe > probe.txt` 로 확인한다.

## 구조

| 파일 | 역할 |
|---|---|
| `hub.go` | 공통 이벤트 규격, 현재 상태 스냅샷, SSE 스트림 (`/events`) |
| `collector.go` | herdr 상태 확인, 기록 파일 찾기와 따라 읽기 |
| `parse.go` | Claude · Codex · Antigravity 기록 한 줄을 이벤트로 해석 |
| `mock.go` | 모의 이벤트 재생 (`-mock`). 뷰어가 없으면 멈춘다 |
| `probe.go` | 집 PC 데이터 형태 확인 (`probe`) |
| `web/` | 뷰어. 빌드 단계 없는 순수 JS + Canvas 2D, 실행 파일에 내장 |

## 진행 상황

- [x] 공통 이벤트 규격, 모의 재생, 마을 뷰어
- [x] herdr 소켓 연동 (패널 상태)
- [x] Claude / Codex / Antigravity 세션 파일 추적
- [ ] 클라우드 세션 연동
