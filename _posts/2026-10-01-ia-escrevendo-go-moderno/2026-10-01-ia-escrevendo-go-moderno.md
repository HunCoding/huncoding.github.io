---
layout: post
title: "Como evitar que a IA escreva Go de 2020"
subtitle: "A JetBrains lançou Modern Go Guidelines para ensinar agentes de IA a usar as features mais recentes da linguagem"
author: otavio_celestino
date: 2026-10-01 08:00:00 +0200
categories: [Go, IA, Ferramentas]
tags: [go, golang, ia, ai, goland, jetbrains, go-fix, modernize, llm, agentes]
comments: true
image: "/assets/img/posts/2026-10-01-ai-writing-modern-go.png"
lang: pt-BR
---

E aí, pessoal!

Quem usa IA para escrever código Go já deve ter notado um padrão irritante: o código gerado funciona, mas parece ter saído de 2020. O agente não sabe que `slices.Contains` existe, usa loops manuais onde caberia `min`/`max`, e escreve `sync.WaitGroup.Add(1)` + `defer wg.Done()` quando o `wg.Go` do Go 1.25 seria a forma correta hoje.

O problema tem uma explicação simples: os modelos são treinados com dados históricos. A maioria do código Go na internet foi escrita antes das versões mais recentes da linguagem, então padrões antigos dominam o treinamento. Mesmo que o modelo conheça as novidades, sem um sinal explícito ele tende a usar o que viu mais.

A JetBrains atacou esse problema de dois ângulos com o GoLand 2026.2 e o Go 1.27.

---

## O que é o Modern Go Guidelines

O GoLand team publicou o repositório [Modern Go Guidelines](https://github.com/JetBrains/go-modern-guidelines) como um conjunto de skills para agentes de IA. A ideia é dar ao agente um contexto explícito sobre as features disponíveis na versão do Go do seu projeto, para que ele escreva código adequado ao que você pode compilar, não ao que ele viu mais vezes no treinamento.

O sistema usa o mesmo princípio de progressive disclosure que vimos no post sobre Agent Skills do Genkit: você não despeja todas as guidelines de uma vez no contexto. O agente recebe uma lista curta, e só vai buscar os detalhes quando precisar.

O repositório cobre features e padrões desde o Go 1.0 até o Go 1.27.

---

## Como funciona na prática

O plugin instala uma CLI chamada `go-modern-guidelines` e uma skill `use-modern-go` que ensina o agente quando e como usar a ferramenta.

No Claude Code, por exemplo:

```
/plugin marketplace add JetBrains/go-modern-guidelines
/plugin install modern-go-guidelines
/use-modern-go
```

A partir daí, antes de editar um arquivo Go, o agente roda:

```bash
go-modern-guidelines list --file-path ./internal/worker/worker.go
```

A saída é uma lista curta de guidelines aplicáveis à versão do Go do projeto:

```
sync_waitgroup_go: Use wg.Go when spawning goroutines tracked by a sync.WaitGroup.
testing_t_context: Use t.Context() when a test function needs a context tied to the test lifetime.
json_omitzero: Use omitzero on JSON-tagged bool, numeric, struct, and time fields whose zero value should be omitted.
```

Se o agente não conhece uma feature ou precisa de exemplos, ele pede os detalhes:

```bash
go-modern-guidelines explain generic_methods
```

E recebe um before/after concreto:

```
generic_methods:
  Since: Go 1.27

  Before:
    type Set[T comparable] map[T]struct{}
    func Map[T comparable, U any](s Set[T], f func(T) U) []U { ... }
    names := Map(users, func(user User) string { return user.Name })

  After:
    type Set[T comparable] map[T]struct{}
    func (s Set[T]) Map[U any](f func(T) U) []U { ... }
    names := users.Map(func(user User) string { return user.Name })
```

O sistema respeita o `go.mod`. Se o projeto declara `go 1.25`, o agente recebe guidelines até o 1.25 e não vai sugerir `errors.AsType`, que chegou no 1.26. Menos tokens sendo consumidos com contexto irrelevante, e sem risco de o agente gerar código que não compila no seu projeto.

---

## go fix como inspeção no editor

O segundo ângulo é o `go fix`. Desde o Go 1.18 o toolchain inclui modernizers: transformações automáticas que substituem padrões antigos por equivalentes mais modernos. No Go 1.27 esse conjunto cresceu com novos casos.

O problema com o `go fix` na linha de comando é que você precisa rodar explicitamente, geralmente em batch, fora do contexto onde encontrou o código que precisa ser atualizado.

O GoLand 2026.2 integrou todos os modernizers do `go fix` como inspeções no editor. Você vê a sugestão inline, ao lado do código afetado, com o diff da mudança proposta antes de aplicar. E pode aplicar em todo o projeto de uma vez pelo Problems tool window.

Há também uma opção para usar o `go fix` como pre-commit check. Antes de cada commit, o IDE roda os modernizers e aplica as atualizações automaticamente. Times que adotam isso mantêm a base de código alinhada com as recomendações do Go conforme novas releases chegam, sem esforço manual.

---

## Exemplos de guidelines do Go 1.27

Para dar concretude ao que a IA passa a usar com as guidelines ativas, alguns exemplos do que cobre o Go 1.27:

**Métodos genéricos** (novidade do Go 1.27):

```go
// antes: função genérica no nível do pacote
func Filter[T any](s []T, f func(T) bool) []T { ... }
filtered := Filter(items, predicate)

// depois: método genérico no tipo
func (s Slice[T]) Filter(f func(T) bool) Slice[T] { ... }
filtered := items.Filter(predicate)
```

**`strings.CutLast` e `bytes.CutLast`** (Go 1.27):

```go
// antes
idx := strings.LastIndex(s, sep)
before, after := s[:idx], s[idx+len(sep):]

// depois
before, after, found := strings.CutLast(s, sep)
```

**`sync.WaitGroup.Go`** (Go 1.25):

```go
// antes
var wg sync.WaitGroup
wg.Add(1)
go func() {
    defer wg.Done()
    doWork()
}()

// depois
var wg sync.WaitGroup
wg.Go(func() {
    doWork()
})
```

**`slices.Contains`** em vez de loop manual:

```go
// antes
found := false
for _, v := range items {
    if v == target {
        found = true
        break
    }
}

// depois
found := slices.Contains(items, target)
```

---

## O que isso resolve

O problema central que a JetBrains endereçou é que agentes de IA e tooling para modernização de código viviam em mundos separados. O `go fix` cuidava do código existente, os agentes geravam código novo, e nenhum dos dois sabia o que o outro estava fazendo.

O Modern Go Guidelines fecha o lado da geração: o agente passa a escrever código atual desde o início. O `go fix` integrado ao editor fecha o lado do código existente: você vê e corrige padrões antigos no contexto onde trabalha, não em uma etapa separada de batch.

Para times que usam Claude Code, Cursor ou Copilot em projetos Go, o plugin resolve um atrito real. O agente para de gerar código que vai acender avisos do `go fix` dois minutos depois que você aceitar o diff.

---

Você tem esse problema com código Go gerado por IA no seu projeto? Me conta nos comentários.

Até o próximo post!

**Referências:**
- [Ready for Go 1.27 on Day One — JetBrains Blog](https://blog.jetbrains.com/go/2026/08/20/ready-for-go-1-27-on-day-one/)
- [Help AI Coding Agents Write Up-To-Date Code With Modern Golang Skills — JetBrains Blog](https://blog.jetbrains.com/go/2026/08/24/help-ai-coding-agents-write-up-to-date-code-with-modern-golang-skills/)
- [Modern Go Guidelines — GitHub](https://github.com/JetBrains/go-modern-guidelines)
