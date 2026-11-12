package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

// Event 는 모든 수집 출처(herdr, 세션 파일, 모의)가 공통으로 내보내는 이벤트다.
//
// Kind:
//
//	join    세션 시작 (Actor == Session, 길드장)
//	leave   세션 종료
//	hire    서브에이전트 시작 (Actor = 서브에이전트 ID)
//	dismiss 서브에이전트 종료
//	quest   사용자 프롬프트 (몬스터 등장)
//	tool    도구 호출 시작 (공격)
//	result  도구 호출 결과 (OK=false 면 반격)
//	say     에이전트 메시지
//	status  idle | working | blocked
//	victory 응답 완료 (몬스터 처치)
type Event struct {
	Seq     int64  `json:"seq"`
	T       int64  `json:"t"`
	Kind    string `json:"kind"`
	Guild   string `json:"guild,omitempty"` // claude | codex | antigravity
	Session string `json:"session,omitempty"`
	Actor   string `json:"actor,omitempty"`
	Name    string `json:"name,omitempty"`
	Role    string `json:"role,omitempty"`
	Tool    string `json:"tool,omitempty"`
	OK      *bool  `json:"ok,omitempty"`
	Status  string `json:"status,omitempty"`
	Text    string `json:"text,omitempty"`
}

// ActorState 는 새로 접속한 뷰어가 현재 장면을 복원하는 데 필요한 최소 상태다.
type ActorState struct {
	Guild   string `json:"guild"`
	Session string `json:"session"`
	Actor   string `json:"actor"`
	Name    string `json:"name"`
	Role    string `json:"role,omitempty"`
	Status  string `json:"status,omitempty"`
	Quest   string `json:"quest,omitempty"`
	QuestT  int64  `json:"questT,omitempty"` // 의뢰 시작 시각(ms)
	Hits    int    `json:"hits,omitempty"`   // 의뢰 이후 도구 호출 수
}

const recentMax = 80

type Hub struct {
	mu     sync.Mutex
	seq    int64
	wins   int
	actors map[string]*ActorState
	order  []string // 등장 순서 유지
	recent []Event
	subs   map[chan []byte]struct{}
}

func NewHub() *Hub {
	return &Hub{actors: map[string]*ActorState{}, subs: map[chan []byte]struct{}{}}
}

// Subs 는 접속 중인 뷰어 수. 0이면 수집 출처가 일을 멈춰도 된다.
func (h *Hub) Subs() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.subs)
}

func (h *Hub) Publish(e Event) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.seq++
	e.Seq = h.seq
	e.T = time.Now().UnixMilli()
	h.apply(e)

	h.recent = append(h.recent, e)
	if len(h.recent) > recentMax {
		h.recent = append(h.recent[:0], h.recent[len(h.recent)-recentMax:]...)
	}

	b, _ := json.Marshal(e)
	for ch := range h.subs {
		select {
		case ch <- b:
		default: // 느린 뷰어는 끊는다. 다시 접속하면 스냅샷으로 복원된다.
			delete(h.subs, ch)
			close(ch)
		}
	}
}

func (h *Hub) apply(e Event) {
	switch e.Kind {
	case "join", "hire":
		if _, ok := h.actors[e.Actor]; !ok {
			h.order = append(h.order, e.Actor)
		}
		h.actors[e.Actor] = &ActorState{Guild: e.Guild, Session: e.Session, Actor: e.Actor, Name: e.Name, Role: e.Role}
	case "dismiss":
		h.remove(func(a *ActorState) bool { return a.Actor == e.Actor })
	case "leave":
		h.remove(func(a *ActorState) bool { return a.Session == e.Session })
	case "quest":
		if a := h.actors[e.Session]; a != nil {
			a.Quest, a.QuestT, a.Hits = e.Text, e.T, 0
		}
	case "tool":
		if a := h.actors[e.Session]; a != nil {
			a.Hits++
		}
	case "victory":
		h.wins++
		if a := h.actors[e.Session]; a != nil {
			a.Quest, a.QuestT, a.Hits = "", 0, 0
		}
	case "status":
		if a := h.actors[e.Actor]; a != nil {
			a.Status = e.Status
		}
	}
}

func (h *Hub) remove(match func(*ActorState) bool) {
	kept := h.order[:0]
	for _, id := range h.order {
		if a := h.actors[id]; a != nil && match(a) {
			delete(h.actors, id)
			continue
		}
		kept = append(kept, id)
	}
	h.order = kept
}

func (h *Hub) snapshot() []byte {
	actors := make([]*ActorState, 0, len(h.order))
	for _, id := range h.order {
		actors = append(actors, h.actors[id])
	}
	b, _ := json.Marshal(map[string]any{"actors": actors, "recent": h.recent, "wins": h.wins})
	return b
}

// ServeHTTP 는 SSE 스트림이다. 먼저 snapshot 이벤트를 한 번 보내고 이후 실시간 이벤트를 보낸다.
func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	fl, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")

	ch := make(chan []byte, 128)
	h.mu.Lock()
	snap := h.snapshot()
	h.subs[ch] = struct{}{}
	h.mu.Unlock()
	defer func() {
		h.mu.Lock()
		delete(h.subs, ch)
		h.mu.Unlock()
	}()

	fmt.Fprintf(w, "event: snapshot\ndata: %s\n\n", snap)
	fl.Flush()

	ping := time.NewTicker(25 * time.Second)
	defer ping.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case b, ok := <-ch:
			if !ok {
				return
			}
			fmt.Fprintf(w, "data: %s\n\n", b)
			fl.Flush()
		case <-ping.C:
			fmt.Fprint(w, ": ping\n\n")
			fl.Flush()
		}
	}
}
