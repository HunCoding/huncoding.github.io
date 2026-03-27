---
layout: post
title: "Building an MCP Server in Go from Scratch"
subtitle: "How to create an MCP server in Go that any AI agent can use as a tool"
author: otavio_celestino
date: 2026-03-26 08:00:00 -0300
categories: [Go, AI, MCP, Tools]
tags: [go, golang, mcp, model-context-protocol, ai, agents, claude, llm, tools]
comments: true
image: "/assets/img/posts/2026-03-26-building-mcp-server-in-go-en.png"
lang: en
original_post: "/construindo-servidor-mcp-em-go/"
---

Hey everyone!

If you use Claude, Cursor, or any AI agent day-to-day, you have probably wanted it to access your database, read files from your project, or call an internal API. The problem is that every tool had a different integration approach, and you ended up locked into whatever interface the agent offered.

MCP fixes that. And you are going to build a server in Go that works with Claude Desktop, Cursor, and any compatible MCP client.

---

## What is MCP

MCP (Model Context Protocol) is an open protocol created by Anthropic in November 2024. OpenAI adopted it in March 2025, and in December 2025 the protocol was donated to the Linux Foundation. It is now the de facto standard for connecting AI agents to external tools.

The core idea is straightforward: you create a server that exposes capabilities, and any compatible MCP client can use those capabilities without you having to integrate with each agent separately.

---

## The three concepts of the protocol

MCP organizes what a server can offer into three types:

**Tools** are functions the agent can call. They receive arguments, execute something, and return a result. This is the most common case.

**Resources** are data the agent can read. Files, database records, URLs, anything that can be represented as content.

**Prompts** are prompt templates the server makes available for clients to reuse.

This post focuses on Tools, which covers the majority of practical use cases.

---

## Setting up the project

The official Go SDK is still under development. The most widely used library in production is `mark3labs/mcp-go`, which implements spec version `2025-11-05`.

```bash
mkdir mcp-server && cd mcp-server
go mod init github.com/youruser/mcp-server
go get github.com/mark3labs/mcp-go@latest
```

Project structure:

```
mcp-server/
  main.go
  tools/
    fetch.go
    files.go
    search.go
  go.mod
  go.sum
```

---

## The simplest possible server

Before adding any tools, the minimal server looks like this:

```go
package main

import (
    "fmt"
    "os"

    "github.com/mark3labs/mcp-go/server"
)

func main() {
    s := server.NewMCPServer(
        "my-server",
        "1.0.0",
        server.WithToolCapabilities(false),
    )

    if err := server.ServeStdio(s); err != nil {
        fmt.Fprintf(os.Stderr, "error: %v\n", err)
        os.Exit(1)
    }
}
```

`ServeStdio` is the standard transport for integrating with Claude Desktop and Cursor. The server reads from stdin and writes to stdout using the MCP JSON-RPC protocol.

---

## Adding real tools

Let us create three tools you would actually use day-to-day.

### Tool 1: fetch URL content

```go
// tools/fetch.go
package tools

import (
    "context"
    "fmt"
    "io"
    "net/http"

    "github.com/mark3labs/mcp-go/mcp"
)

func FetchURLTool() mcp.Tool {
    return mcp.NewTool("fetch_url",
        mcp.WithDescription("Fetches the content of a URL via HTTP GET"),
        mcp.WithString("url",
            mcp.Required(),
            mcp.Description("The URL to fetch"),
        ),
    )
}

func FetchURLHandler(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
    url, ok := req.Params.Arguments["url"].(string)
    if !ok || url == "" {
        return mcp.NewToolResultError("url parameter is required"), nil
    }

    resp, err := http.Get(url)
    if err != nil {
        return mcp.NewToolResultError(fmt.Sprintf("error fetching url: %v", err)), nil
    }
    defer resp.Body.Close()

    body, err := io.ReadAll(resp.Body)
    if err != nil {
        return mcp.NewToolResultError(fmt.Sprintf("error reading response: %v", err)), nil
    }

    return mcp.NewToolResultText(string(body)), nil
}
```

### Tool 2: read local file

```go
// tools/files.go
package tools

import (
    "context"
    "fmt"
    "os"

    "github.com/mark3labs/mcp-go/mcp"
)

func ReadFileTool() mcp.Tool {
    return mcp.NewTool("read_file",
        mcp.WithDescription("Reads the content of a local file"),
        mcp.WithString("path",
            mcp.Required(),
            mcp.Description("Absolute or relative path to the file"),
        ),
    )
}

func ReadFileHandler(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
    path, ok := req.Params.Arguments["path"].(string)
    if !ok || path == "" {
        return mcp.NewToolResultError("path parameter is required"), nil
    }

    content, err := os.ReadFile(path)
    if err != nil {
        return mcp.NewToolResultError(fmt.Sprintf("error reading file: %v", err)), nil
    }

    return mcp.NewToolResultText(string(content)), nil
}
```

### Tool 3: search text in files

```go
// tools/search.go
package tools

import (
    "context"
    "fmt"
    "os"
    "path/filepath"
    "strings"

    "github.com/mark3labs/mcp-go/mcp"
)

func SearchCodeTool() mcp.Tool {
    return mcp.NewTool("search_code",
        mcp.WithDescription("Searches for a text pattern in all files within a directory"),
        mcp.WithString("directory",
            mcp.Required(),
            mcp.Description("Directory to search in"),
        ),
        mcp.WithString("pattern",
            mcp.Required(),
            mcp.Description("Text to search for"),
        ),
    )
}

func SearchCodeHandler(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
    dir, ok := req.Params.Arguments["directory"].(string)
    if !ok || dir == "" {
        return mcp.NewToolResultError("directory parameter is required"), nil
    }

    pattern, ok := req.Params.Arguments["pattern"].(string)
    if !ok || pattern == "" {
        return mcp.NewToolResultError("pattern parameter is required"), nil
    }

    var matches []string

    err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
        if err != nil || info.IsDir() {
            return err
        }

        content, err := os.ReadFile(path)
        if err != nil {
            return nil
        }

        lines := strings.Split(string(content), "\n")
        for i, line := range lines {
            if strings.Contains(line, pattern) {
                matches = append(matches, fmt.Sprintf("%s:%d: %s", path, i+1, strings.TrimSpace(line)))
            }
        }

        return nil
    })

    if err != nil {
        return mcp.NewToolResultError(fmt.Sprintf("error searching: %v", err)), nil
    }

    if len(matches) == 0 {
        return mcp.NewToolResultText("no results found"), nil
    }

    return mcp.NewToolResultText(strings.Join(matches, "\n")), nil
}
```

### Registering everything on the server

```go
// main.go
package main

import (
    "fmt"
    "os"

    "github.com/mark3labs/mcp-go/server"
    "github.com/youruser/mcp-server/tools"
)

func main() {
    s := server.NewMCPServer(
        "my-server",
        "1.0.0",
        server.WithToolCapabilities(false),
    )

    s.AddTool(tools.FetchURLTool(), tools.FetchURLHandler)
    s.AddTool(tools.ReadFileTool(), tools.ReadFileHandler)
    s.AddTool(tools.SearchCodeTool(), tools.SearchCodeHandler)

    if err := server.ServeStdio(s); err != nil {
        fmt.Fprintf(os.Stderr, "error: %v\n", err)
        os.Exit(1)
    }
}
```

---

## Building the server

```bash
go build -o mcp-server .
```

The binary needs to be accessible so Claude Desktop can start the process.

---

## Registering in Claude Desktop

Claude Desktop starts the server as a child process, communicating via stdin/stdout. The configuration lives at:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Add your server:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "/absolute/path/to/mcp-server",
      "args": []
    }
  }
}
```

Restart Claude Desktop. The tools icon in the chat will appear with your three registered tools.

---

## Testing for real

With the server registered, you can ask Claude:

- "Read the file /home/user/project/main.go and explain what it does"
- "Find all places where the `ProcessOrder` function is called in /home/user/project"
- "Fetch the content from https://api.github.com/repos/golang/go and tell me what the last commit was"

Claude will call the tools automatically when it understands they are needed. You see the calls happening in real time in the chat.

---

## Adding authentication between client and server

In real environments you might want to restrict which tools are available depending on context. A simple approach is to check an environment variable at startup:

```go
func main() {
    token := os.Getenv("MCP_TOKEN")
    if token == "" {
        fmt.Fprintln(os.Stderr, "MCP_TOKEN not set")
        os.Exit(1)
    }

    s := server.NewMCPServer("my-server", "1.0.0")
    // register tools...
    server.ServeStdio(s)
}
```

And in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "/path/to/mcp-server",
      "env": {
        "MCP_TOKEN": "your-token-here"
      }
    }
  }
}
```

---

## What comes next

With this foundation you can add any tool:

- Postgres or SQLite database queries
- internal API calls with authentication
- script and system command execution
- structured log reading and metric aggregation

The protocol also supports HTTP with SSE transport for remote servers, when the server cannot run locally on the user's machine. The `mcp-go` library implements both transports.

---

## Conclusion

MCP is simple to implement and solves a real problem: connecting AI agents to tools you already have, without depending on proprietary integrations. The Go SDK works, the protocol is stable, and adoption by major clients has already happened.

The server you built in this post is already functional. From here, just add the tools that make sense for your context.

---

## References

- [Model Context Protocol: official specification](https://modelcontextprotocol.io/specification/2025-11-05)
- [mark3labs/mcp-go on GitHub](https://github.com/mark3labs/mcp-go)
- [Official Go SDK for MCP](https://github.com/modelcontextprotocol/go-sdk)
- [Claude Desktop: configuring MCP servers](https://docs.anthropic.com/en/docs/claude-code/mcp)
- [MCP Roadmap 2026](http://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/)
