package main

import (
	"context"
	"fmt"
	"math/rand"
	"time"
)

var (
	mockQuests = []string{
		"로그인 버그 고쳐줘", "결제 모듈 리팩터링", "테스트가 왜 깨지는지 찾아줘", "다크 모드 추가",
		"API 응답 속도 개선", "README 최신화", "배포 스크립트 점검", "검색 기능 구현",
	}
	mockRoles    = []string{"Explore", "Plan", "code-review", "general-purpose", "web-fetch", "debugger"}
	mockTools    = []string{"Read", "Edit", "Bash", "Grep", "WebSearch", "Write"}
	mockFiles    = []string{"src/auth.ts", "api/server.go", "web/app.js", "README.md", "tests/login.test.ts", "npm test", "go build ./..."}
	mockSaysLead = []string{
		"원인 찾았다. 세션 만료 처리가 빠져 있었네.", "관련 파일부터 훑어볼게.",
		"테스트 돌려서 확인한다.", "거의 다 됐어. 검증만 남았다.", "구조는 대충 파악했어.",
	}
	mockSaysSub = []string{
		"보고드립니다. 관련 파일 세 곳을 찾았습니다.", "확인 결과 문제없습니다.",
		"의심되는 부분을 발견했습니다.", "조사를 마쳤습니다. 정리해서 올리겠습니다.", "추가로 살펴볼 곳이 있습니다.",
	}
)

func runMock(ctx context.Context, hub *Hub) {
	sessions := []struct{ guild, name string }{
		{"claude", "AgentViewer"}, {"claude", "ssamflow-web"}, {"codex", "api-server"}, {"antigravity", "docs-site"},
	}
	for i, s := range sessions {
		go mockSession(ctx, hub, s.guild, fmt.Sprintf("mock-%d", i), s.name, rand.New(rand.NewSource(int64(i)+time.Now().UnixNano())))
	}
	<-ctx.Done()
}

func mockSession(ctx context.Context, hub *Hub, guild, id, name string, rng *rand.Rand) {
	// 뷰어가 없으면 아무것도 만들지 않는다.
	wait := func(min, max float64) bool {
		d := time.Duration((min + rng.Float64()*(max-min)) * float64(time.Second))
		for {
			select {
			case <-ctx.Done():
				return false
			case <-time.After(d):
			}
			if hub.Subs() > 0 {
				return true
			}
			d = time.Second
		}
	}
	pick := func(xs []string) string { return xs[rng.Intn(len(xs))] }
	ev := func(kind string, e Event) {
		e.Kind, e.Guild, e.Session = kind, guild, id
		if e.Actor == "" {
			e.Actor = id
		}
		hub.Publish(e)
	}

	ev("join", Event{Name: name})
	for n := 0; ; n++ {
		if !wait(2, 9) {
			return
		}
		ev("quest", Event{Text: pick(mockQuests)})
		ev("status", Event{Status: "working"})

		party := []string{id}
		maxSubs := 1
		if guild == "claude" {
			maxSubs = 3
		}
		for i := rng.Intn(maxSubs + 1); i > 0; i-- {
			if !wait(0.5, 1.5) {
				return
			}
			sub := fmt.Sprintf("%s-sub-%d-%d", id, n, i)
			role := pick(mockRoles)
			ev("hire", Event{Actor: sub, Name: role, Role: role})
			party = append(party, sub)
		}

		steps := 6 + rng.Intn(10)
		if rng.Float64() < 0.3 { // 가끔 긴 작업: 정예·보스로 자란다
			steps = 20 + rng.Intn(25)
		}
		for ; steps > 0; steps-- {
			if !wait(0.6, 2.2) {
				return
			}
			actor := pick(party)
			switch r := rng.Float64(); {
			case r < 0.15:
				if actor == id {
					ev("say", Event{Text: pick(mockSaysLead)})
				} else {
					ev("say", Event{Actor: actor, Text: pick(mockSaysSub)})
				}
			case r < 0.21 && actor == id:
				ev("status", Event{Status: "blocked"})
				if !wait(2.5, 5) {
					return
				}
				ev("status", Event{Status: "working"})
			default:
				ev("tool", Event{Actor: actor, Tool: pick(mockTools), Text: pick(mockFiles)})
				if !wait(0.3, 1.2) {
					return
				}
				ok := rng.Float64() > 0.12
				ev("result", Event{Actor: actor, OK: &ok})
			}
		}

		for _, sub := range party[1:] {
			ev("dismiss", Event{Actor: sub})
		}
		ev("say", Event{Text: "다 끝냈어. 정리해 뒀다."})
		ev("victory", Event{})
		ev("status", Event{Status: "idle"})
	}
}
