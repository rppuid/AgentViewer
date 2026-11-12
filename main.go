// agentviewer: herdr 위에서 도는 에이전트들의 활동을 도트 RPG 마을로 보여주는 수집기 겸 웹 서버.
package main

import (
	"context"
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
)

//go:embed web
var webFS embed.FS

func main() {
	if len(os.Args) > 1 && os.Args[1] == "probe" {
		runProbe()
		return
	}

	addr := flag.String("addr", "127.0.0.1:7318", "listen address (tailscale serve로 내보낼 로컬 주소)")
	mock := flag.Bool("mock", false, "실제 에이전트 대신 모의 이벤트를 재생")
	flag.Parse()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	hub := NewHub()
	if *mock {
		go runMock(ctx, hub)
	} else {
		fmt.Fprintln(os.Stderr, "실제 수집기는 아직 연결되지 않았습니다. -mock 으로 실행하거나 `agentviewer probe` 결과를 먼저 확인하세요.")
	}

	static, err := fs.Sub(webFS, "web")
	if err != nil {
		log.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.Handle("/events", hub)
	mux.Handle("/", http.FileServer(http.FS(static)))

	srv := &http.Server{Addr: *addr, Handler: mux}
	go func() {
		<-ctx.Done()
		srv.Close()
	}()
	log.Printf("http://%s", *addr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
