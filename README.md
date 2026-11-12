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
./agentviewer -mock
```

`http://127.0.0.1:7318` 에서 열린다. 외부에서는 Tailscale 로 내보낸다.

```bash
tailscale serve --bg --https=7318 http://127.0.0.1:7318
```

## 집 PC 데이터 확인

실제 수집기를 붙이기 전에 herdr 소켓과 세션 기록 파일의 실제 형태를 한 번 확인한다.
값은 가리고 구조만 출력하지만, 공유하기 전에 한 번 훑어볼 것.

```bash
./agentviewer probe > probe.txt
```

## 구조

| 파일 | 역할 |
|---|---|
| `hub.go` | 공통 이벤트 규격, 현재 상태 스냅샷, SSE 스트림 (`/events`) |
| `mock.go` | 모의 이벤트 재생 (`-mock`). 뷰어가 없으면 멈춘다 |
| `probe.go` | 집 PC 데이터 형태 확인 (`probe`) |
| `web/` | 뷰어. 빌드 단계 없는 순수 JS + Canvas 2D, 실행 파일에 내장 |

## 진행 상황

- [x] 공통 이벤트 규격, 모의 재생, 마을 뷰어
- [ ] herdr 소켓 연동 (패널 상태)
- [ ] Claude / Codex / Antigravity 세션 파일 추적
- [ ] 클라우드 세션 연동
