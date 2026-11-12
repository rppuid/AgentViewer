package main

import (
	"bytes"
	"encoding/json"
	"strings"
)

// sink 는 기록 한 줄에서 알아낸 일을 받는 곳이다. 쓰지 않는 항목은 nil 로 둔다.
type sink struct {
	prompt func(text string)         // 사용자 요청
	say    func(text string)         // 에이전트의 말
	tool   func(name, detail string) // 도구 호출
	fail   func()                    // 도구 실패
	hire   func(actor, role string)  // 서브에이전트 시작 (actor 가 비면 이 기록의 주인)
	done   func()                    // 이 기록의 주인이 일을 마침
}

func (s *sink) onPrompt(t string) {
	if s.prompt != nil && t != "" {
		s.prompt(t)
	}
}
func (s *sink) onSay(t string) {
	if s.say != nil && t != "" {
		s.say(t)
	}
}
func (s *sink) onTool(n, d string) {
	if s.tool != nil && n != "" {
		s.tool(n, d)
	}
}
func (s *sink) onFail() {
	if s.fail != nil {
		s.fail()
	}
}
func (s *sink) onHire(a, r string) {
	if s.hire != nil {
		s.hire(a, r)
	}
}
func (s *sink) onDone() {
	if s.done != nil {
		s.done()
	}
}

func parseLine(guild string, line []byte, actor string, s *sink) {
	switch guild {
	case "claude":
		parseClaude(line, s)
	case "codex":
		parseCodex(line, s)
	case "antigravity":
		parseAgy(line, actor, s)
	}
}

// clip 은 여러 줄 글을 한 줄로 줄이고 n 글자에서 자른다.
func clip(s string, n int) string {
	s = strings.Join(strings.Fields(s), " ")
	if r := []rune(s); len(r) > n {
		return string(r[:n-1]) + "…"
	}
	return s
}

// tail2 는 경로의 마지막 두 마디만 남긴다.
func tail2(p string) string {
	parts := strings.Split(strings.TrimRight(p, "/"), "/")
	if len(parts) > 2 {
		parts = parts[len(parts)-2:]
	}
	return strings.Join(parts, "/")
}

// detailOf 는 도구 입력에서 화면에 보여 줄 한 조각을 고른다.
func detailOf(in map[string]any) string {
	for _, k := range []string{"file_path", "path", "notebook_path", "AbsolutePath", "TargetFile"} {
		if v, ok := in[k].(string); ok && v != "" {
			return clip(tail2(v), 70)
		}
	}
	for _, k := range []string{"toolSummary", "description", "command", "CommandLine", "pattern", "query", "Query", "url", "Url", "subagent_type", "TypeName", "prompt"} {
		if v, ok := in[k].(string); ok && v != "" {
			return clip(v, 70)
		}
	}
	return ""
}

// ---- Claude Code: ~/.claude/projects/<폴더>/<세션>.jsonl ----

var (
	claudeUser      = []byte(`"type":"user"`)
	claudeAssistant = []byte(`"type":"assistant"`)
)

func parseClaude(line []byte, s *sink) {
	if !bytes.Contains(line, claudeUser) && !bytes.Contains(line, claudeAssistant) {
		return // 첨부·요청 기록 같은 큰 줄은 풀지 않는다
	}
	var v struct {
		Type    string `json:"type"`
		IsMeta  bool   `json:"isMeta"`
		Agent   string `json:"attributionAgent"`
		Message struct {
			Content    json.RawMessage `json:"content"`
			StopReason string          `json:"stop_reason"`
		} `json:"message"`
	}
	if json.Unmarshal(line, &v) != nil || v.IsMeta {
		return
	}
	var blocks []struct {
		Type    string         `json:"type"`
		Text    string         `json:"text"`
		Name    string         `json:"name"`
		Input   map[string]any `json:"input"`
		IsError bool           `json:"is_error"`
	}
	var plain string
	if json.Unmarshal(v.Message.Content, &plain) != nil {
		json.Unmarshal(v.Message.Content, &blocks)
	}

	switch v.Type {
	case "user":
		for _, b := range blocks {
			if b.Type == "tool_result" && b.IsError {
				s.onFail()
			}
			if b.Type == "text" && plain == "" {
				plain = b.Text
			}
		}
		t := strings.TrimSpace(plain)
		if t != "" && !strings.HasPrefix(t, "<") && !strings.HasPrefix(t, "[Request interrupted") && !strings.HasPrefix(t, "Caveat:") {
			s.onPrompt(clip(t, 160))
		}
	case "assistant":
		if v.Agent != "" {
			s.onHire("", v.Agent)
		}
		for _, b := range blocks {
			switch b.Type {
			case "text":
				s.onSay(clip(b.Text, 160))
			case "tool_use":
				s.onTool(b.Name, detailOf(b.Input))
			}
		}
		if v.Message.StopReason == "end_turn" {
			s.onDone()
		}
	}
}

// ---- Codex: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl ----

var codexEvent = []byte(`"type":"event_msg"`)

func parseCodex(line []byte, s *sink) {
	if !bytes.Contains(line, codexEvent) {
		return
	}
	var v struct {
		Type    string `json:"type"`
		Payload struct {
			Type string `json:"type"`
			Item struct {
				Type    string `json:"type"`
				Kind    string `json:"kind"`
				Query   string `json:"query"`
				Content []struct {
					Text string `json:"text"`
				} `json:"content"`
				Command   []string `json:"command"`
				ExitCode  *int     `json:"exit_code"`
				ParsedCmd []struct {
					Type string `json:"type"`
					Name string `json:"name"`
					Cmd  string `json:"cmd"`
				} `json:"parsed_cmd"`
			} `json:"item"`
		} `json:"payload"`
	}
	if json.Unmarshal(line, &v) != nil || v.Type != "event_msg" {
		return
	}
	switch v.Payload.Type {
	case "task_started":
		s.onHire("", "")
	case "task_complete":
		s.onDone()
	case "item_completed":
		it := v.Payload.Item
		text := ""
		for _, c := range it.Content {
			if strings.TrimSpace(c.Text) != "" {
				text = c.Text
				break
			}
		}
		switch it.Type {
		case "UserMessage":
			s.onPrompt(clip(text, 160))
		case "AgentMessage":
			s.onSay(clip(text, 160))
		case "Reasoning":
		case "CommandExecution":
			name, detail := "Bash", ""
			if len(it.ParsedCmd) > 0 {
				pc := it.ParsedCmd[0]
				switch pc.Type {
				case "read":
					name = "Read"
				case "search", "list_files":
					name = "Grep"
				}
				detail = pc.Name
				if detail == "" {
					detail = pc.Cmd
				}
			}
			if detail == "" && len(it.Command) > 0 {
				detail = it.Command[len(it.Command)-1]
			}
			s.onTool(name, clip(detail, 70))
			if it.ExitCode != nil && *it.ExitCode != 0 {
				s.onFail()
			}
		default:
			if strings.HasPrefix(it.Kind, "web") {
				s.onTool("WebSearch", clip(it.Query, 70))
			} else {
				s.onTool(it.Type, "")
			}
		}
	}
}

// ---- Antigravity CLI: ~/.gemini/antigravity-cli/brain/<id>/.system_generated/logs/transcript_full.jsonl ----

var agyTools = []struct{ match, name string }{
	{"command", "Bash"}, {"search", "Grep"}, {"grep", "Grep"}, {"find", "Grep"}, {"list", "Grep"},
	{"browser", "WebFetch"}, {"url", "WebFetch"}, {"web", "WebSearch"},
	{"write", "Edit"}, {"replace", "Edit"}, {"edit", "Edit"}, {"create", "Write"},
	{"view", "Read"}, {"read", "Read"},
}

func parseAgy(line []byte, actor string, s *sink) {
	var v struct {
		Type      string `json:"type"`
		Source    string `json:"source"`
		Content   string `json:"content"`
		Step      int    `json:"step_index"`
		ToolCalls []struct {
			Name string         `json:"name"`
			Args map[string]any `json:"args"`
		} `json:"tool_calls"`
	}
	if json.Unmarshal(line, &v) != nil {
		return
	}
	switch v.Type {
	case "USER_INPUT":
		s.onPrompt(clip(v.Content, 160))
	case "GENERIC":
		if v.Source == "MODEL" {
			s.onSay(clip(v.Content, 160))
		}
	case "PLANNER_RESPONSE":
		for i, tc := range v.ToolCalls {
			if tc.Name == "invoke_subagent" {
				role, _ := tc.Args["TypeName"].(string)
				s.onHire("agy-"+itoa(v.Step)+"-"+itoa(i), role)
				continue
			}
			name := tc.Name
			for _, t := range agyTools {
				if strings.Contains(strings.ToLower(tc.Name), t.match) {
					name = t.name
					break
				}
			}
			s.onTool(name, detailOf(tc.Args))
		}
	}
}

func itoa(n int) string {
	b, _ := json.Marshal(n)
	return string(b)
}
