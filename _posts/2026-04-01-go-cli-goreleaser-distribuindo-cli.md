---
layout: post
title: "Distribuindo uma CLI em Go com GoReleaser"
subtitle: "Como criar, empacotar e entregar uma CLI Go para Linux, macOS e Windows com binários, Homebrew e GitHub Releases automatizados"
author: otavio_celestino
date: 2026-04-01 08:00:00 -0300
categories: [Go, CLI, DevOps, Ferramentas]
tags: [go, golang, goreleaser, cli, cobra, homebrew, github-actions, release]
comments: true
image: "/assets/img/posts/2026-04-01-go-cli-goreleaser-distributing-cli.png"
lang: pt-BR
---

E aí, pessoal!

Você terminou de escrever uma CLI em Go. Funciona na sua máquina. Agora alguém pede: "onde baixo isso?"

Se a resposta for "clone o repo e roda `go install`", você perdeu metade da audiência na hora. Usuário que não conhece Go não sabe o que fazer com isso. Usuário que conhece Go não quer fazer isso pra cada ferramenta nova que instala.

Neste post você vai construir uma CLI real, configurar o GoReleaser e ter um pipeline que gera binários para Linux, macOS e Windows automaticamente a cada tag no GitHub. Com um passo a mais, publica no Homebrew também.

---

## A CLI que vamos distribuir

Vamos construir o `chk`, uma ferramenta que checa o status de endpoints HTTP e mostra código de status e latência. Simples o suficiente para o post não se perder na lógica da ferramenta, útil o suficiente para você querer instalar de verdade.

```bash
$ chk https://api.github.com https://google.com
200    45ms    https://api.github.com
200    112ms   https://google.com
```

---

## Criando o projeto

```bash
mkdir chk && cd chk
go mod init github.com/seuusuario/chk
go get github.com/spf13/cobra@latest
```

Estrutura do projeto:

```
chk/
  main.go
  cmd/
    root.go
  go.mod
  go.sum
```

---

## Implementando a CLI com Cobra

```go
// main.go
package main

import "github.com/seuusuario/chk/cmd"

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
	Short: "Checa o status de endpoints HTTP",
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
	rootCmd.Flags().IntVarP(&timeout, "timeout", "t", 5, "timeout em segundos")
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

Testa localmente:

```bash
go run . https://api.github.com
# 200    44ms      https://api.github.com
```

---

## O problema do release manual

Sem GoReleaser, o processo de release de uma CLI Go para três plataformas é assim:

```bash
GOOS=linux   GOARCH=amd64 go build -o chk-linux-amd64 .
GOOS=darwin  GOARCH=amd64 go build -o chk-darwin-amd64 .
GOOS=darwin  GOARCH=arm64 go build -o chk-darwin-arm64 .
GOOS=windows GOARCH=amd64 go build -o chk-windows-amd64.exe .

tar -czf chk-linux-amd64.tar.gz chk-linux-amd64
tar -czf chk-darwin-amd64.tar.gz chk-darwin-amd64
# ...

# criar release no GitHub
# fazer upload de cada arquivo
# escrever changelog na mão
# atualizar formula do Homebrew
```

Isso antes de qualquer automação. Com GoReleaser, o mesmo resultado sai de um `git tag`.

---

## Instalando o GoReleaser

```bash
go install github.com/goreleaser/goreleaser/v2@latest
```

Gera a config inicial:

```bash
goreleaser init
```

---

## Configurando o .goreleaser.yaml

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

Testa o build local sem publicar:

```bash
goreleaser build --snapshot --clean
```

O resultado fica em `dist/`:

```
dist/
  chk_linux_amd64/chk
  chk_darwin_amd64/chk
  chk_darwin_arm64/chk
  chk_windows_amd64/chk.exe
```

---

## GitHub Actions para release automático

Cria o arquivo `.github/workflows/release.yml`:

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

O `GITHUB_TOKEN` já está disponível automaticamente no GitHub Actions. Não precisa criar nenhum secret manualmente.

---

## Publicando no Homebrew

Para que usuários de macOS e Linux possam instalar com `brew install`, você precisa de um repositório de fórmulas separado.

Cria um repositório público no GitHub chamado `homebrew-tap`.

Adiciona a seção no `.goreleaser.yaml`:

```yaml
brews:
  - name: chk
    repository:
      owner: seuusuario
      name: homebrew-tap
    homepage: "https://github.com/seuusuario/chk"
    description: "Checa o status de endpoints HTTP"
    commit_author:
      name: goreleaserbot
      email: bot@goreleaser.com
```

Para o GoReleaser conseguir escrever nesse repositório, cria um Personal Access Token com permissão `repo` e adiciona como secret no repositório:

```
Settings > Secrets and variables > Actions > New repository secret
Nome: HOMEBREW_TAP_TOKEN
Valor: <seu token>
```

Atualiza o workflow para passar o token:

```yaml
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  HOMEBREW_TAP_TOKEN: ${{ secrets.HOMEBREW_TAP_TOKEN }}
```

E referencia no `.goreleaser.yaml`:

```yaml
brews:
  - repository:
      token: "{{ .Env.HOMEBREW_TAP_TOKEN }}"
```

---

## Fazendo o primeiro release

Com tudo configurado, o release inteiro sai de dois comandos:

```bash
git tag v0.1.0
git push origin v0.1.0
```

O GitHub Actions dispara, o GoReleaser roda e em alguns minutos você tem:

- binários para Linux, macOS (amd64 + arm64) e Windows
- `checksums.txt` para verificação de integridade
- GitHub Release criado automaticamente com changelog gerado a partir dos commits
- fórmula do Homebrew atualizada no repositório `homebrew-tap`

Quem usa macOS ou Linux instala assim:

```bash
brew install seuusuario/tap/chk
```

Quem não usa Homebrew baixa o binário direto do GitHub Releases e coloca no PATH.

---

## O que você ganha de graça

Com essa configuração, cada novo `git tag` gera:

- build para 6 combinações de OS e arquitetura (linux/amd64, linux/arm64, darwin/amd64, darwin/arm64, windows/amd64, windows/arm64)
- arquivos comprimidos (.tar.gz para Unix, .zip para Windows)
- `checksums.txt` com hash SHA256 de cada arquivo
- GitHub Release com changelog baseado nos commits desde a última tag
- fórmula Homebrew atualizada automaticamente

O changelog é gerado a partir dos commits. Se você seguir Conventional Commits (`feat:`, `fix:`, `docs:`), ele agrupa automaticamente por categoria.

---

## Conclusão

GoReleaser elimina o trabalho manual de release que ninguém quer fazer. O setup inicial leva menos de uma hora e a partir daí cada versão nova sai com um `git tag`.

Para uma CLI Go que você quer distribuir de verdade, esse pipeline é o mínimo razoável. Quem usa macOS instala pelo Homebrew. Quem usa Linux pega o binário direto. E você não precisa tocar em nada disso depois que está configurado.

---

## Referências

- [GoReleaser: documentação oficial](https://goreleaser.com/intro/)
- [goreleaser/goreleaser no GitHub](https://github.com/goreleaser/goreleaser)
- [spf13/cobra no GitHub](https://github.com/spf13/cobra)
- [GitHub Actions: quickstart](https://docs.github.com/en/actions/writing-workflows/quickstart)
- [Homebrew: criando um tap](https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap)
