package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

// 실제 수집기.
//
//   - herdr 소켓의 agent.list 를 주기적으로 읽어 패널별 에이전트와 상태(working/blocked/done)를 얻는다.
//     상태 전환이 의뢰 시작(quest)과 완료(victory)를 결정한다.
//   - 각 패널에 해당하는 세션 기록 파일을 끝에서부터 따라 읽어 의뢰 내용, 도구 호출, 대화,
//     서브에이전트를 채운다.
//
// 뷰어가 접속해 있지 않으면 파일은 읽지 않고 herdr 상태만 드물게 확인한다.

const (
	pollEvery   = 2 * time.Second
	resolveTick = 5 // 몇 번째 폴링마다 기록 파일을 다시 찾을지
	placeholder = "작업 중"
)

var guildOfAgent = map[string]string{
	"claude": "claude", "codex": "codex",
	"agy": "antigravity", "antigravity": "antigravity", "antigravity_cli": "antigravity", "gemini": "antigravity",
}

type herdrAgent struct {
	Agent  string `json:"agent"`
	Status string `json:"agent_status"`
	PaneID string `json:"pane_id"`
	Cwd    string `json:"cwd"`
}

type pane struct {
	herdrAgent
	guild      string
	questing   bool
	questText  string
	prompt     string // 기록에서 읽은 가장 최근 사용자 요청
	main       *tailer
	subs       map[string]*tailer // 서브에이전트 기록 파일 경로 → tailer
	activeSubs map[string]bool    // 고용 중인 서브에이전트 actor id
	attachedAt time.Time
}

type collector struct {
	hub    *Hub
	sock   string
	home   string
	panes  map[string]*pane
	metas  map[string]codexMeta // codex 기록 파일 경로 → 첫 줄 정보
	idle   bool
	downAt time.Time
}

func runCollector(ctx context.Context, hub *Hub, sock string) {
	home, _ := os.UserHomeDir()
	if sock == "" {
		sock = os.Getenv("HERDR_SOCKET_PATH")
	}
	if sock == "" {
		sock = filepath.Join(home, ".config/herdr/herdr.sock")
	}
	c := &collector{hub: hub, sock: sock, home: home, panes: map[string]*pane{}, metas: map[string]codexMeta{}}
	t := time.NewTicker(pollEvery)
	defer t.Stop()
	for n := 0; ; n++ {
		c.tick(n)
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

func (c *collector) tick(n int) {
	watching := c.hub.Subs() > 0
	if !watching && n%resolveTick != 0 {
		return
	}
	agents, err := herdrAgents(c.sock)
	if err != nil {
		if time.Since(c.downAt) > time.Minute {
			log.Printf("herdr 에 연결하지 못했습니다: %v", err)
			c.downAt = time.Now()
		}
		return
	}

	seen := map[string]bool{}
	sort.Slice(agents, func(i, j int) bool { return agents[i].PaneID < agents[j].PaneID })
	rank := map[string]int{} // 같은 종류·같은 폴더의 패널이 여럿일 때 기록 파일을 나눠 갖기 위한 순번
	for _, a := range agents {
		guild := guildOfAgent[a.Agent]
		if guild == "" || a.PaneID == "" {
			continue
		}
		seen[a.PaneID] = true
		p := c.panes[a.PaneID]
		if p != nil && p.guild != guild { // 같은 패널에서 다른 에이전트가 시작됨
			c.drop(p)
			p = nil
		}
		if p == nil {
			p = &pane{guild: guild, subs: map[string]*tailer{}, activeSubs: map[string]bool{}}
			p.herdrAgent = a
			p.Status = ""
			c.panes[a.PaneID] = p
			name := filepath.Base(a.Cwd)
			if name == "." || name == "/" || name == "" {
				name = a.Agent
			}
			c.emit(p, "join", Event{Name: name})
		}
		p.Cwd = a.Cwd
		key := guild + "\x00" + a.Cwd
		if guild == "antigravity" {
			key = guild
		}
		r := rank[key]
		rank[key]++

		if watching {
			wake := a.Status == "working" && p.Status != "working"
			if c.idle || p.main == nil || wake || n%resolveTick == 0 {
				c.attach(p, r, c.idle)
			}
			c.read(p)
		}
		c.transition(p, a.Status)
	}
	for id, p := range c.panes {
		if !seen[id] {
			c.drop(p)
		}
	}
	c.idle = !watching
}

func (c *collector) emit(p *pane, kind string, e Event) {
	e.Kind, e.Guild, e.Session = kind, p.guild, p.PaneID
	if e.Actor == "" {
		e.Actor = p.PaneID
	}
	c.hub.Publish(e)
}

func (c *collector) drop(p *pane) {
	c.emit(p, "leave", Event{})
	delete(c.panes, p.PaneID)
}

// transition 은 herdr 상태 변화를 의뢰 시작·완료로 옮긴다.
func (c *collector) transition(p *pane, status string) {
	busy := status == "working" || status == "blocked"
	if busy && !p.questing {
		p.questing = true
		p.questText = p.prompt
		if p.questText == "" {
			p.questText = placeholder
		}
		c.emit(p, "quest", Event{Text: p.questText})
	}
	if status != p.Status {
		c.emit(p, "status", Event{Status: status})
	}
	if !busy && p.questing {
		p.questing = false
		for actor := range p.activeSubs {
			c.emit(p, "dismiss", Event{Actor: actor})
		}
		p.activeSubs = map[string]bool{}
		p.prompt = ""
		c.emit(p, "victory", Event{})
	}
	p.Status = status
}

// ---- 기록 파일 찾기 ----

var nonAlnum = regexp.MustCompile(`[^a-zA-Z0-9]`)

func newest(pattern string) []string {
	files, _ := filepath.Glob(pattern)
	type f struct {
		path string
		mod  time.Time
	}
	fs := make([]f, 0, len(files))
	for _, path := range files {
		if st, err := os.Stat(path); err == nil && !st.IsDir() {
			fs = append(fs, f{path, st.ModTime()})
		}
	}
	sort.Slice(fs, func(i, j int) bool { return fs[i].mod.After(fs[j].mod) })
	out := make([]string, len(fs))
	for i := range fs {
		out[i] = fs[i].path
	}
	return out
}

type codexMeta struct{ id, cwd, parent string }

func (c *collector) codexMeta(path string) codexMeta {
	if m, ok := c.metas[path]; ok {
		return m
	}
	var m codexMeta
	if fh, err := os.Open(path); err == nil {
		line, _ := bufio.NewReaderSize(fh, 1<<20).ReadBytes('\n')
		fh.Close()
		var v struct {
			Payload struct {
				ID     string `json:"id"`
				Cwd    string `json:"cwd"`
				Parent string `json:"parent_thread_id"`
			} `json:"payload"`
		}
		if json.Unmarshal(line, &v) == nil {
			m = codexMeta{v.Payload.ID, v.Payload.Cwd, v.Payload.Parent}
		}
	}
	if len(c.metas) > 2000 {
		c.metas = map[string]codexMeta{}
	}
	c.metas[path] = m
	return m
}

func (c *collector) codexFiles() []string {
	var all []string
	now := time.Now()
	for d := 0; d < 3; d++ {
		day := now.AddDate(0, 0, -d).Format("2006/01/02")
		all = append(all, newest(filepath.Join(c.home, ".codex/sessions", day, "rollout-*.jsonl"))...)
	}
	return all
}

// attach 는 패널에 맞는 기록 파일을 찾아 붙인다. reset 이면 이미 붙은 파일도 끝으로 건너뛴다.
func (c *collector) attach(p *pane, rank int, reset bool) {
	var path string
	switch p.guild {
	case "claude":
		dir := filepath.Join(c.home, ".claude/projects", nonAlnum.ReplaceAllString(p.Cwd, "-"))
		if fs := newest(filepath.Join(dir, "*.jsonl")); rank < len(fs) {
			path = fs[rank]
		}
	case "codex":
		i := 0
		for _, f := range c.codexFiles() {
			if m := c.codexMeta(f); m.cwd == p.Cwd && m.parent == "" {
				if i == rank {
					path = f
					break
				}
				i++
			}
		}
	case "antigravity":
		if fs := newest(filepath.Join(c.home, ".gemini/antigravity-cli/brain/*/.system_generated/logs/transcript_full.jsonl")); rank < len(fs) {
			path = fs[rank]
		}
	}
	if path == "" {
		return
	}
	if p.main == nil || p.main.path != path || reset {
		p.main = tailFromEnd(path, func(line []byte) {
			// 붙기 전의 기록에서는 가장 최근 요청만 알아 둔다
			parseLine(p.guild, line, p.PaneID, &sink{prompt: func(s string) { p.prompt = s }})
		})
		p.subs = map[string]*tailer{}
		p.attachedAt = time.Now()
	}

	// 서브에이전트 기록: 붙은 뒤에 새로 생긴 파일만 처음부터 읽는다
	var kids []string
	switch p.guild {
	case "claude":
		kids = newest(filepath.Join(strings.TrimSuffix(path, ".jsonl"), "subagents", "agent-*.jsonl"))
	case "codex":
		main := c.codexMeta(path)
		for _, f := range c.codexFiles() {
			if m := c.codexMeta(f); main.id != "" && m.parent == main.id {
				kids = append(kids, f)
			}
		}
	}
	for _, k := range kids {
		if _, ok := p.subs[k]; ok || len(p.subs) >= 16 {
			continue
		}
		t := &tailer{path: k}
		if st, err := os.Stat(k); err == nil && st.ModTime().Before(p.attachedAt.Add(-5*time.Second)) {
			t.off = st.Size() // 이미 끝난 예전 서브에이전트
		}
		p.subs[k] = t
	}
}

// read 는 새로 쓰인 줄을 이벤트로 바꿔 내보낸다.
func (c *collector) read(p *pane) {
	if p.main == nil {
		return
	}
	p.main.read(func(line []byte) {
		parseLine(p.guild, line, p.PaneID, c.sinkFor(p, p.PaneID, ""))
	})
	for path, t := range p.subs {
		id := strings.TrimSuffix(filepath.Base(path), ".jsonl")
		if len(id) > 28 {
			id = id[len(id)-28:]
		}
		actor := p.PaneID + "/" + id
		role := ""
		if p.guild == "codex" {
			role = "review"
		}
		t.read(func(line []byte) { parseLine(p.guild, line, actor, c.sinkFor(p, actor, role)) })
	}
}

// sinkFor 는 파서가 알려 주는 일을 Hub 이벤트로 옮긴다. actor 가 패널과 다르면 서브에이전트다.
func (c *collector) sinkFor(p *pane, actor, role string) *sink {
	sub := actor != p.PaneID
	hire := func(r string) {
		if !sub || p.activeSubs[actor] {
			return
		}
		if r == "" {
			r = role
		}
		p.activeSubs[actor] = true
		c.emit(p, "hire", Event{Actor: actor, Name: r, Role: r})
	}
	return &sink{
		prompt: func(s string) {
			if sub {
				return
			}
			p.prompt = s
			if p.questing && s != p.questText { // 의뢰가 먼저 시작되고 내용이 나중에 도착한 경우
				p.questText = s
				c.emit(p, "quest", Event{Text: s})
			}
		},
		say:  func(s string) { hire(""); c.emit(p, "say", Event{Actor: actor, Text: s}) },
		tool: func(name, detail string) { hire(""); c.emit(p, "tool", Event{Actor: actor, Tool: name, Text: detail}) },
		fail: func() { no := false; c.emit(p, "result", Event{Actor: actor, OK: &no}) },
		hire: func(a, r string) {
			if a == "" {
				hire(r)
				return
			}
			a = p.PaneID + "/" + a
			if !p.activeSubs[a] {
				p.activeSubs[a] = true
				c.emit(p, "hire", Event{Actor: a, Name: r, Role: r})
			}
		},
		done: func() {
			if sub && p.activeSubs[actor] {
				delete(p.activeSubs, actor)
				c.emit(p, "dismiss", Event{Actor: actor})
			}
		},
	}
}

// ---- herdr 소켓 ----

func herdrAgents(sock string) ([]herdrAgent, error) {
	conn, err := net.DialTimeout("unix", sock, 2*time.Second)
	if err != nil {
		return nil, err
	}
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(3 * time.Second))
	fmt.Fprint(conn, `{"id":"av","method":"agent.list","params":{}}`+"\n")
	line, err := bufio.NewReaderSize(conn, 1<<16).ReadBytes('\n')
	if err != nil && len(line) == 0 {
		return nil, err
	}
	var v struct {
		Result struct {
			Agents []herdrAgent `json:"agents"`
		} `json:"result"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(line, &v); err != nil {
		return nil, err
	}
	if v.Error != nil {
		return nil, fmt.Errorf("agent.list: %s", v.Error.Message)
	}
	return v.Result.Agents, nil
}

// ---- 파일 따라 읽기 ----

type tailer struct {
	path string
	off  int64
	rem  []byte // 아직 줄바꿈이 오지 않은 조각
}

const (
	readMax = 4 << 20
	lineMax = 8 << 20
	backMax = 256 << 10
)

// tailFromEnd 는 파일 끝에서 시작하되, 끝부분을 history 에 한 번 보여 준다.
func tailFromEnd(path string, history func(line []byte)) *tailer {
	t := &tailer{path: path}
	fh, err := os.Open(path)
	if err != nil {
		return t
	}
	defer fh.Close()
	st, err := fh.Stat()
	if err != nil {
		return t
	}
	t.off = st.Size()
	start := t.off - backMax
	if start < 0 {
		start = 0
	}
	buf := make([]byte, t.off-start)
	if _, err := fh.ReadAt(buf, start); err != nil {
		return t
	}
	lines := strings.Split(string(buf), "\n")
	if start > 0 && len(lines) > 0 {
		lines = lines[1:] // 잘린 첫 줄
	}
	for _, l := range lines {
		if l != "" {
			history([]byte(l))
		}
	}
	return t
}

func (t *tailer) read(fn func(line []byte)) {
	fh, err := os.Open(t.path)
	if err != nil {
		return
	}
	defer fh.Close()
	st, err := fh.Stat()
	if err != nil {
		return
	}
	if st.Size() < t.off { // 파일이 새로 쓰였다
		t.off, t.rem = st.Size(), nil
		return
	}
	n := st.Size() - t.off
	if n == 0 {
		return
	}
	if n > readMax {
		n = readMax
	}
	buf := make([]byte, n)
	if _, err := fh.ReadAt(buf, t.off); err != nil {
		return
	}
	t.off += n
	data := append(t.rem, buf...)
	for {
		i := bytes.IndexByte(data, '\n')
		if i < 0 {
			break
		}
		if i > 0 {
			fn(data[:i])
		}
		data = data[i+1:]
	}
	if len(data) > lineMax {
		data = nil
	}
	t.rem = append([]byte(nil), data...)
}
