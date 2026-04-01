---
layout: post
title: "Distributing a Go CLI with GoReleaser"
subtitle: "How to build, package and ship a Go CLI for Linux, macOS and Windows with binaries, Homebrew and automated GitHub Releases"
author: otavio_celestino
date: 2026-04-01 08:00:00 -0300
categories: [Go, CLI, DevOps, Tools]
tags: [go, golang, goreleaser, cli, cobra, homebrew, github-actions, release]
comments: true
image: "/assets/img/posts/2026-04-01-go-cli-goreleaser-distributing-cli.png"
lang: en
original_post: "/go-cli-goreleaser-distribuindo-cli/"
---

Hey everyone!

You finished writing a CLI in Go. It works on your machine. Then someone asks: "where do I download it?"

If the answer is "clone the repo and run `go install`", you lost half your audience right there. Users who do not know Go do not know what to do with that. Users who do know Go do not want to do it for every new tool they install.

In this post you will build a real CLI, configure GoReleaser and have a pipeline that generates binaries for Linux, macOS and Windows automatically on every GitHub tag. With one extra step, it also publishes to Homebrew.

---

## The CLI we are going to ship

We will build `chk`, a tool that checks the status of HTTP endpoints and shows status code and latency. Simple enough that the post does not get lost in the tool itself, useful enough that you would actually want to install it.

```bash
$ chk https://api.github.com https://google.com
200    45ms    https://api.github.com
200    112ms   https://google.com
```

---

## Setting up the project

```bash
mkdir chk && cd chk
go mod init github.com/yourusername/chk
go get github.com/spf13/cobra@latest
```

Project structure:

```
chk/
  main.go
  cmd/
    root.go
  go.mod
  go.sum
```

---

## Building the CLI with Cobra

```go
// main.go
package main

import "github.com/yourusername/chk/cmd"

var version = "dev"

func main() {
	cmd.SetVersion(version)
	cmd.Execute()
}
```

```go
// cmd/root.go
package cmd

import (
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/spf13/cobra"
)

var (
	timeout int
	Version string
)

var rootCmd = &cobra.Command{
	Use:   "chk [urls...]",
	Short: "Checks the status of HTTP endpoints",
	Args:  cobra.MinimumNArgs(1),
	Run:   run,
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

func SetVersion(v string) {
	Version = v
	rootCmd.Version = v
}

func init() {
	rootCmd.Flags().IntVarP(&timeout, "timeout", "t", 5, "timeout in seconds")
}

func run(cmd *cobra.Command, args []string) {
	client := &http.Client{
		Timeout: time.Duration(timeout) * time.Second,
	}

	for _, url := range args {
		start := time.Now()
		resp, err := client.Get(url)
		elapsed := time.Since(start)

		if err != nil {
			fmt.Printf("ERR    %-8s  %s\n", elapsed.Round(time.Millisecond), url)
			continue
		}
		resp.Body.Close()

		fmt.Printf("%-3d    %-8s  %s\n", resp.StatusCode, elapsed.Round(time.Millisecond), url)
	}
}
```

Test it locally:

```bash
go run . https://api.github.com
# 200    44ms      https://api.github.com
```

---

## The problem with manual releases

Without GoReleaser, shipping a Go CLI for three platforms looks like this:

```bash
GOOS=linux   GOARCH=amd64 go build -o chk-linux-amd64 .
GOOS=darwin  GOARCH=amd64 go build -o chk-darwin-amd64 .
GOOS=darwin  GOARCH=arm64 go build -o chk-darwin-arm64 .
GOOS=windows GOARCH=amd64 go build -o chk-windows-amd64.exe .

tar -czf chk-linux-amd64.tar.gz chk-linux-amd64
tar -czf chk-darwin-amd64.tar.gz chk-darwin-amd64
# ...

# create the GitHub release
# upload each file
# write the changelog manually
# update the Homebrew formula
```

That is before any automation. With GoReleaser, the same result comes from a single `git tag`.

---

## Installing GoReleaser

```bash
go install github.com/goreleaser/goreleaser/v2@latest
```

Generate the initial config:

```bash
goreleaser init
```

---

## Configuring .goreleaser.yaml

```yaml
# .goreleaser.yaml
version: 2

before:
  hooks:
    - go mod tidy

builds:
  - env:
      - CGO_ENABLED=0
    goos:
      - linux
      - darwin
      - windows
    goarch:
      - amd64
      - arm64
    ldflags:
      - -s -w -X main.version={{.Version}}

archives:
  - formats:
      - tar.gz
    name_template: "{{ .ProjectName }}_{{ .Os }}_{{ .Arch }}"
    format_overrides:
      - goos: windows
        formats:
          - zip

checksum:
  name_template: "checksums.txt"

changelog:
  sort: asc
  filters:
    exclude:
      - "^docs:"
      - "^test:"
      - "^ci:"
```

Test the local build without publishing:

```bash
goreleaser build --snapshot --clean
```

The output lands in `dist/`:

```
dist/
  chk_linux_amd64/chk
  chk_darwin_amd64/chk
  chk_darwin_arm64/chk
  chk_windows_amd64/chk.exe
```

---

## GitHub Actions for automated releases

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - "v*"

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-go@v5
        with:
          go-version: stable

      - uses: goreleaser/goreleaser-action@v6
        with:
          version: latest
          args: release --clean
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

The `GITHUB_TOKEN` is available automatically in GitHub Actions. You do not need to create any secrets manually.

---

## Publishing to Homebrew

For macOS and Linux users to install with `brew install`, you need a separate formula repository.

Create a public GitHub repository called `homebrew-tap`.

Add the section to `.goreleaser.yaml`:

```yaml
brews:
  - name: chk
    repository:
      owner: yourusername
      name: homebrew-tap
    homepage: "https://github.com/yourusername/chk"
    description: "Checks the status of HTTP endpoints"
    commit_author:
      name: goreleaserbot
      email: bot@goreleaser.com
```

For GoReleaser to write to that repository, create a Personal Access Token with `repo` permission and add it as a secret:

```
Settings > Secrets and variables > Actions > New repository secret
Name: HOMEBREW_TAP_TOKEN
Value: <your token>
```

Update the workflow to pass the token:

```yaml
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  HOMEBREW_TAP_TOKEN: ${{ secrets.HOMEBREW_TAP_TOKEN }}
```

And reference it in `.goreleaser.yaml`:

```yaml
brews:
  - repository:
      token: "{{ .Env.HOMEBREW_TAP_TOKEN }}"
```

---

## Cutting the first release

With everything configured, the entire release comes down to two commands:

```bash
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions triggers, GoReleaser runs and within a few minutes you have:

- binaries for Linux, macOS (amd64 + arm64) and Windows
- `checksums.txt` for integrity verification
- GitHub Release created automatically with a changelog generated from commits
- Homebrew formula updated in the `homebrew-tap` repository

macOS and Linux users install it like this:

```bash
brew install yourusername/tap/chk
```

Everyone else downloads the binary from GitHub Releases and drops it in their PATH.

---

## What you get for free

With this setup, every `git tag` produces:

- builds for 6 OS and architecture combinations (linux/amd64, linux/arm64, darwin/amd64, darwin/arm64, windows/amd64, windows/arm64)
- compressed archives (.tar.gz for Unix, .zip for Windows)
- `checksums.txt` with SHA256 hash for each file
- GitHub Release with a changelog based on commits since the last tag
- Homebrew formula updated automatically

The changelog is generated from commits. If you follow Conventional Commits (`feat:`, `fix:`, `docs:`), it groups them automatically by category.

---

## Conclusion

GoReleaser removes the manual release work that nobody wants to do. The initial setup takes less than an hour and from that point every new version ships with a `git tag`.

For a Go CLI you actually want to distribute, this pipeline is the reasonable minimum. macOS users install via Homebrew. Linux users grab the binary directly. And you do not need to touch any of it after the initial setup.

---

## References

- [GoReleaser: official documentation](https://goreleaser.com/intro/)
- [goreleaser/goreleaser on GitHub](https://github.com/goreleaser/goreleaser)
- [spf13/cobra on GitHub](https://github.com/spf13/cobra)
- [GitHub Actions: quickstart](https://docs.github.com/en/actions/writing-workflows/quickstart)
- [Homebrew: creating a tap](https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap)
