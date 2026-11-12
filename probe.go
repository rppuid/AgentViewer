package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// runProbe 는 집 PC에서 한 번 실행해, 수집기가 의존할 실제 데이터 형태를 확인한다.
// 값은 가리고 구조(키, 타입, 짧은 열거형 값)만 출력한다.
func runProbe() {
	home, _ := os.UserHomeDir()
	fmt.Println("# agentviewer probe", time.Now().Format(time.RFC3339))

	sock := os.Getenv("HERDR_SOCKET_PATH")
	if sock == "" {
		sock = filepath.Join(home, ".config/herdr/herdr.sock")
	}
	probeHerdr(sock)

	codex := os.Getenv("CODEX_HOME")
	if codex == "" {
		codex = filepath.Join(home, ".codex")
	}
	probeFiles("claude", filepath.Join(home, ".claude/projects"), home)
	probeFiles("codex", filepath.Join(codex, "sessions"), home)
	probeFiles("antigravity", filepath.Join(home, ".gemini/antigravity-cli"), home)
}

// ---- herdr 소켓 ----

func probeHerdr(sock string) {
	fmt.Printf("\n## herdr socket: %s\n", sock)
	var firstPane string
	for _, m := range []string{"ping", "agent.list", "pane.list", "session.snapshot"} {
		res, err := herdrCall(sock, m)
		if err != nil {
			fmt.Printf("%s: 실패: %v\n", m, err)
			if m == "ping" {
				return
			}
			continue
		}
		if firstPane == "" {
			firstPane = findString(res, "pane_id")
		}
		fmt.Printf("%s:\n%s\n", m, shape(res, 3000))
	}

	types := []string{"pane.agent_status_changed", "pane.agent_detected", "pane.created", "pane.exited"}
	fmt.Println("\n### 구독 A: pane_id 없이 (10초 대기 — 그 사이 에이전트에 말을 걸어 보세요)")
	if !herdrSubscribe(sock, types, "") && firstPane != "" {
		fmt.Printf("\n### 구독 B: pane_id=%s 지정 (10초 대기)\n", firstPane)
		herdrSubscribe(sock, types[:1], firstPane)
	}
}

func herdrCall(sock, method string) (any, error) {
	c, err := net.DialTimeout("unix", sock, 3*time.Second)
	if err != nil {
		return nil, err
	}
	defer c.Close()
	c.SetDeadline(time.Now().Add(5 * time.Second))
	fmt.Fprintf(c, `{"id":"probe","method":%q,"params":{}}`+"\n", method)
	line, err := bufio.NewReaderSize(c, 1<<20).ReadBytes('\n')
	if err != nil && len(line) == 0 {
		return nil, err
	}
	var v any
	if err := json.Unmarshal(line, &v); err != nil {
		return nil, err
	}
	return v, nil
}

// herdrSubscribe 는 구독이 받아들여졌는지 여부를 돌려준다.
func herdrSubscribe(sock string, types []string, pane string) bool {
	c, err := net.DialTimeout("unix", sock, 3*time.Second)
	if err != nil {
		fmt.Println("실패:", err)
		return false
	}
	defer c.Close()
	subs := make([]map[string]string, 0, len(types))
	for _, t := range types {
		s := map[string]string{"type": t}
		if pane != "" {
			s["pane_id"] = pane
		}
		subs = append(subs, s)
	}
	req, _ := json.Marshal(map[string]any{"id": "sub", "method": "events.subscribe", "params": map[string]any{"subscriptions": subs}})
	c.SetDeadline(time.Now().Add(10 * time.Second))
	c.Write(append(req, '\n'))

	accepted := false
	r := bufio.NewReaderSize(c, 1<<20)
	for i := 0; i < 20; i++ {
		line, err := r.ReadBytes('\n')
		if len(line) > 0 {
			var v any
			if json.Unmarshal(line, &v) == nil {
				fmt.Println(shape(v, 1500))
				if m, ok := v.(map[string]any); ok && i == 0 && m["error"] == nil {
					accepted = true
				}
			}
		}
		if err != nil {
			break
		}
	}
	return accepted
}

// ---- 세션 기록 파일 ----

func probeFiles(label, root, home string) {
	fmt.Printf("\n## %s: %s\n", label, strings.Replace(root, home, "~", 1))
	type file struct {
		path string
		mod  time.Time
		size int64
	}
	var files []file
	exts := map[string]int{}
	filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		exts[filepath.Ext(p)]++
		if strings.HasSuffix(p, ".jsonl") {
			if info, err := d.Info(); err == nil {
				files = append(files, file{p, info.ModTime(), info.Size()})
			}
		}
		return nil
	})
	if len(exts) == 0 {
		fmt.Println("파일 없음")
		return
	}
	fmt.Println("확장자별 파일 수:", exts)
	sort.Slice(files, func(i, j int) bool { return files[i].mod.After(files[j].mod) })

	// 최근 파일 2개 + (있다면) 서브에이전트 파일 1개
	picked := files
	if len(picked) > 2 {
		picked = picked[:2]
		for _, f := range files[2:] {
			if strings.Contains(strings.ToLower(f.path), "subagent") {
				picked = append(picked, f)
				break
			}
		}
	}
	for _, f := range picked {
		fmt.Printf("\n### %s (%d bytes, %s 전 수정)\n", strings.Replace(f.path, home, "~", 1), f.size, time.Since(f.mod).Round(time.Second))
		probeJSONL(f.path)
	}
}

func probeJSONL(path string) {
	fh, err := os.Open(path)
	if err != nil {
		fmt.Println("열기 실패:", err)
		return
	}
	defer fh.Close()
	r := bufio.NewReaderSize(fh, 1<<20)
	seen := map[string]bool{}
	lines := 0
	for {
		line, err := r.ReadBytes('\n')
		if len(bytes.TrimSpace(line)) > 0 {
			lines++
			var v any
			if json.Unmarshal(line, &v) == nil {
				var parts []string
				typeSig(v, "", 0, &parts)
				sig := strings.Join(parts, " ")
				if !seen[sig] && len(seen) < 30 {
					seen[sig] = true
					fmt.Printf("- [%s]\n  %s\n", sig, shape(v, 1500))
				}
			}
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			fmt.Println("읽기 실패:", err)
			break
		}
	}
	fmt.Printf("(총 %d줄, 서로 다른 형태 %d가지)\n", lines, len(seen))
}

// typeSig 는 줄의 종류를 구분하기 위해 깊이 3까지의 "type"/"role" 값을 모은다.
func typeSig(v any, path string, depth int, out *[]string) {
	if depth > 3 {
		return
	}
	switch x := v.(type) {
	case map[string]any:
		keys := make([]string, 0, len(x))
		for k := range x {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			if s, ok := x[k].(string); ok && (k == "type" || k == "role" || k == "subtype") {
				*out = append(*out, path+k+"="+s)
			} else {
				typeSig(x[k], path+k+".", depth+1, out)
			}
		}
	case []any:
		for i, e := range x {
			if i >= 3 {
				break
			}
			typeSig(e, path, depth+1, out)
		}
	}
}

// ---- 출력 가리기 ----

func shape(v any, max int) string {
	b, _ := json.Marshal(redact(v))
	if len(b) > max {
		return string(b[:max]) + " …"
	}
	return string(b)
}

func redact(v any) any {
	switch x := v.(type) {
	case string:
		if len(x) <= 24 && !strings.ContainsAny(x, "/\\ \n@") {
			return x
		}
		return fmt.Sprintf("<str:%d>", len(x))
	case []any:
		out := make([]any, 0, 4)
		for i, e := range x {
			if i >= 3 {
				out = append(out, fmt.Sprintf("<+%d more>", len(x)-3))
				break
			}
			out = append(out, redact(e))
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(x))
		for k, e := range x {
			out[k] = redact(e)
		}
		return out
	}
	return v
}

func findString(v any, key string) string {
	switch x := v.(type) {
	case map[string]any:
		if s, ok := x[key].(string); ok {
			return s
		}
		for _, e := range x {
			if s := findString(e, key); s != "" {
				return s
			}
		}
	case []any:
		for _, e := range x {
			if s := findString(e, key); s != "" {
				return s
			}
		}
	}
	return ""
}
