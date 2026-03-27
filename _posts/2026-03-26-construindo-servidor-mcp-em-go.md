---
layout: post
title: "Construindo um servidor MCP em Go do zero"
subtitle: "Como criar um servidor MCP em Go que qualquer agente de IA consegue usar como ferramenta"
author: otavio_celestino
date: 2026-03-26 08:00:00 -0300
categories: [Go, AI, MCP, Ferramentas]
tags: [go, golang, mcp, model-context-protocol, ai, agents, claude, llm, tools]
comments: true
image: "/assets/img/posts/2026-03-26-building-mcp-server-in-go-en.png"
lang: pt-BR
---

E aí, pessoal!

Se você usa Claude, Cursor ou qualquer agente de IA no dia a dia, provavelmente já quis que ele pudesse acessar seu banco de dados, ler arquivos do seu projeto ou chamar uma API interna. O problema é que cada ferramenta tinha jeito diferente de integrar, e você acabava preso na interface que o agente oferecia.

O MCP resolve isso. E você vai construir um servidor em Go que funciona com Claude Desktop, Cursor e qualquer cliente compatível.

---

## O que é MCP

MCP (Model Context Protocol) é um protocolo aberto criado pela Anthropic em novembro de 2024. A OpenAI adotou em março de 2025, e em dezembro de 2025 o protocolo foi doado para a Linux Foundation. Hoje é o padrão de fato para conectar agentes de IA a ferramentas externas.

A ideia central é simples: você cria um servidor que expõe capacidades, e qualquer cliente MCP compatível consegue usar essas capacidades sem que você precise integrar com cada agente separadamente.

---

## Os três conceitos do protocolo

O MCP organiza o que um servidor pode oferecer em três tipos:

**Tools** são funções que o agente pode chamar. Recebem argumentos, executam alguma coisa e devolvem um resultado. São o caso mais comum.

**Resources** são dados que o agente pode ler. Arquivos, registros de banco, URLs, qualquer coisa que possa ser representada como conteúdo.

**Prompts** são templates de prompt que o servidor disponibiliza para o cliente reusar.

Neste post o foco é em Tools, que cobre a maioria dos casos práticos.

---

## Configurando o projeto

O SDK oficial em Go ainda está em desenvolvimento. A biblioteca mais usada em produção é a `mark3labs/mcp-go`, que implementa a spec `2025-11-05`.

```bash
mkdir mcp-servidor && cd mcp-servidor
go mod init github.com/seuusuario/mcp-servidor
go get github.com/mark3labs/mcp-go@latest
```

Estrutura do projeto:

```
mcp-servidor/
  main.go
  tools/
    fetch.go
    files.go
    search.go
  go.mod
  go.sum
```

---

## O servidor mais simples possível

Antes de adicionar qualquer ferramenta, o servidor mínimo fica assim:

```go
package main

import (
    "fmt"
    "os"

    "github.com/mark3labs/mcp-go/server"
)

func main() {
    s := server.NewMCPServer(
        "meu-servidor",
        "1.0.0",
        server.WithToolCapabilities(false),
    )

    if err := server.ServeStdio(s); err != nil {
        fmt.Fprintf(os.Stderr, "erro: %v\n", err)
        os.Exit(1)
    }
}
```

O `ServeStdio` é o transporte padrão para integrar com Claude Desktop e Cursor. O servidor lê de stdin e escreve em stdout usando o protocolo JSON-RPC do MCP.

---

## Adicionando ferramentas reais

Vamos criar três ferramentas que você usaria no dia a dia.

### Ferramenta 1: buscar conteúdo de uma URL

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
        mcp.WithDescription("Busca o conteúdo de uma URL via HTTP GET"),
        mcp.WithString("url",
            mcp.Required(),
            mcp.Description("A URL para buscar"),
        ),
    )
}

func FetchURLHandler(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
    url, ok := req.Params.Arguments["url"].(string)
    if !ok || url == "" {
        return mcp.NewToolResultError("parametro url obrigatorio"), nil
    }

    resp, err := http.Get(url)
    if err != nil {
        return mcp.NewToolResultError(fmt.Sprintf("erro ao buscar url: %v", err)), nil
    }
    defer resp.Body.Close()

    body, err := io.ReadAll(resp.Body)
    if err != nil {
        return mcp.NewToolResultError(fmt.Sprintf("erro ao ler resposta: %v", err)), nil
    }

    return mcp.NewToolResultText(string(body)), nil
}
```

### Ferramenta 2: ler arquivo local

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
        mcp.WithDescription("Le o conteudo de um arquivo local"),
        mcp.WithString("path",
            mcp.Required(),
            mcp.Description("Caminho absoluto ou relativo do arquivo"),
        ),
    )
}

func ReadFileHandler(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
    path, ok := req.Params.Arguments["path"].(string)
    if !ok || path == "" {
        return mcp.NewToolResultError("parametro path obrigatorio"), nil
    }

    content, err := os.ReadFile(path)
    if err != nil {
        return mcp.NewToolResultError(fmt.Sprintf("erro ao ler arquivo: %v", err)), nil
    }

    return mcp.NewToolResultText(string(content)), nil
}
```

### Ferramenta 3: buscar texto em arquivos

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
        mcp.WithDescription("Busca um texto em todos os arquivos de um diretorio"),
        mcp.WithString("directory",
            mcp.Required(),
            mcp.Description("Diretorio onde buscar"),
        ),
        mcp.WithString("pattern",
            mcp.Required(),
            mcp.Description("Texto para buscar"),
        ),
    )
}

func SearchCodeHandler(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
    dir, ok := req.Params.Arguments["directory"].(string)
    if !ok || dir == "" {
        return mcp.NewToolResultError("parametro directory obrigatorio"), nil
    }

    pattern, ok := req.Params.Arguments["pattern"].(string)
    if !ok || pattern == "" {
        return mcp.NewToolResultError("parametro pattern obrigatorio"), nil
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
        return mcp.NewToolResultError(fmt.Sprintf("erro ao buscar: %v", err)), nil
    }

    if len(matches) == 0 {
        return mcp.NewToolResultText("nenhum resultado encontrado"), nil
    }

    return mcp.NewToolResultText(strings.Join(matches, "\n")), nil
}
```

### Registrando tudo no servidor

```go
// main.go
package main

import (
    "fmt"
    "os"

    "github.com/mark3labs/mcp-go/server"
    "github.com/seuusuario/mcp-servidor/tools"
)

func main() {
    s := server.NewMCPServer(
        "meu-servidor",
        "1.0.0",
        server.WithToolCapabilities(false),
    )

    s.AddTool(tools.FetchURLTool(), tools.FetchURLHandler)
    s.AddTool(tools.ReadFileTool(), tools.ReadFileHandler)
    s.AddTool(tools.SearchCodeTool(), tools.SearchCodeHandler)

    if err := server.ServeStdio(s); err != nil {
        fmt.Fprintf(os.Stderr, "erro: %v\n", err)
        os.Exit(1)
    }
}
```

---

## Compilando o servidor

```bash
go build -o mcp-servidor .
```

O binario precisa estar acessivel para o Claude Desktop conseguir iniciar o processo.

---

## Registrando no Claude Desktop

O Claude Desktop inicia o servidor como um processo filho, se comunicando via stdin/stdout. A configuracao fica em:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Adicione seu servidor:

```json
{
  "mcpServers": {
    "meu-servidor": {
      "command": "/caminho/absoluto/mcp-servidor",
      "args": []
    }
  }
}
```

Reinicie o Claude Desktop. O icone de ferramentas no chat vai aparecer com as tres ferramentas registradas.

---

## Testando de verdade

Com o servidor registrado, voce pode pedir ao Claude:

- "Leia o arquivo /home/usuario/projeto/main.go e me explique o que ele faz"
- "Busque todos os lugares onde a funcao `ProcessOrder` e chamada no diretorio /home/usuario/projeto"
- "Busque o conteudo da URL https://api.github.com/repos/golang/go e me diga qual foi o ultimo commit"

O Claude vai chamar as ferramentas automaticamente quando entender que precisa delas. Voce ve as chamadas acontecendo em tempo real no chat.

---

## Adicionando autenticacao entre o cliente e o servidor

Em ambientes reais voce pode querer restringir quais ferramentas ficam disponiveis dependendo do contexto. Uma forma simples e verificar uma variavel de ambiente no inicio:

```go
func main() {
    token := os.Getenv("MCP_TOKEN")
    if token == "" {
        fmt.Fprintln(os.Stderr, "MCP_TOKEN nao definido")
        os.Exit(1)
    }

    s := server.NewMCPServer("meu-servidor", "1.0.0")
    // registra ferramentas...
    server.ServeStdio(s)
}
```

E no `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "meu-servidor": {
      "command": "/caminho/mcp-servidor",
      "env": {
        "MCP_TOKEN": "seu-token-aqui"
      }
    }
  }
}
```

---

## O que vem a seguir

Com essa base voce pode adicionar qualquer ferramenta:

- consultas a banco de dados Postgres ou SQLite
- chamadas a APIs internas com autenticacao
- execucao de scripts e comandos do sistema
- leitura de logs estruturados e agregacao de metricas

O protocolo tambem suporta transporte HTTP com SSE para servidores remotos, quando o servidor nao pode rodar localmente na maquina do usuario. A biblioteca `mcp-go` implementa os dois transportes.

---

## Conclusao

MCP e simples de implementar e resolve um problema real: conectar agentes de IA a ferramentas que voce ja tem, sem depender de integracoes proprietarias. O SDK em Go funciona, o protocolo e estavel, e a adocao pelos principais clientes ja aconteceu.

O servidor que voce construiu neste post ja e funcional. A partir daqui e so adicionar as ferramentas que fazem sentido para o seu contexto.

---

## Referencias

- [Model Context Protocol: especificacao oficial](https://modelcontextprotocol.io/specification/2025-11-05)
- [mark3labs/mcp-go no GitHub](https://github.com/mark3labs/mcp-go)
- [SDK oficial Go para MCP](https://github.com/modelcontextprotocol/go-sdk)
- [Claude Desktop: configurando servidores MCP](https://docs.anthropic.com/en/docs/claude-code/mcp)
- [MCP Roadmap 2026](http://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/)
