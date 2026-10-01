---
layout: post
title: "How to stop AI from writing Go like it's 2020"
subtitle: "JetBrains released Modern Go Guidelines to teach AI agents to use the latest language features"
author: otavio_celestino
date: 2026-10-01 08:00:00 +0200
categories: [Go, AI, Tools]
tags: [go, golang, ai, goland, jetbrains, go-fix, modernize, llm, agents]
comments: true
image: "/assets/img/posts/2026-10-01-ai-writing-modern-go.png"
lang: en
original_post: "/ia-escrevendo-go-moderno/"
---

Hey everyone!

Anyone who uses AI to write Go code has probably noticed an annoying pattern: the generated code works, but it looks like it came from 2020. The agent doesn't know `slices.Contains` exists, uses manual loops where `min`/`max` would fit, and writes `sync.WaitGroup.Add(1)` + `defer wg.Done()` when `wg.Go` from Go 1.25 is the correct form today.

The explanation is simple: models are trained on historical data. Most Go code on the internet was written before the latest language versions, so older patterns dominate training. Even if the model knows about new features, without an explicit signal it tends to use what it saw most.

JetBrains tackled this problem from two angles with GoLand 2026.2 and Go 1.27.

---

## What Modern Go Guidelines is

The GoLand team published the [Modern Go Guidelines](https://github.com/JetBrains/go-modern-guidelines) repository as a set of skills for AI agents. The idea is to give the agent explicit context about the features available in your project's Go version, so it writes code appropriate for what you can compile, not for what it saw most often during training.

The system uses the same progressive disclosure principle we covered in the post about Genkit Agent Skills: you don't dump all the guidelines into the context at once. The agent gets a short list, and only fetches the details when it needs them.

The repository covers features and patterns from Go 1.0 through Go 1.27.

---

## How it works in practice

The plugin installs a CLI called `go-modern-guidelines` and a `use-modern-go` skill that teaches the agent when and how to use the tool.

In Claude Code, for example:

```
/plugin marketplace add JetBrains/go-modern-guidelines
/plugin install modern-go-guidelines
/use-modern-go
```

From there, before editing a Go file, the agent runs:

```bash
go-modern-guidelines list --file-path ./internal/worker/worker.go
```

The output is a short list of guidelines applicable to the project's Go version:

```
sync_waitgroup_go: Use wg.Go when spawning goroutines tracked by a sync.WaitGroup.
testing_t_context: Use t.Context() when a test function needs a context tied to the test lifetime.
json_omitzero: Use omitzero on JSON-tagged bool, numeric, struct, and time fields whose zero value should be omitted.
```

If the agent doesn't know a feature or needs examples, it fetches the details:

```bash
go-modern-guidelines explain generic_methods
```

And receives a concrete before/after:

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

The system respects `go.mod`. If the project declares `go 1.25`, the agent receives guidelines up to 1.25 and won't suggest `errors.AsType`, which requires 1.26. Fewer tokens consumed on irrelevant context, and no risk of the agent generating code that doesn't compile in your project.

---

## go fix as editor inspections

The second angle is `go fix`. Since Go 1.18, the toolchain has included modernizers: automatic transformations that replace old patterns with more modern equivalents. In Go 1.27 that set grew with new cases.

The problem with `go fix` on the command line is that you have to run it explicitly, usually in batch, outside the context where you found the code that needs updating.

GoLand 2026.2 integrated all `go fix` modernizers as editor inspections. You see the suggestion inline, next to the affected code, with the diff of the proposed change before applying it. And you can apply it across the whole project at once through the Problems tool window.

There is also an option to use `go fix` as a pre-commit check. Before each commit, the IDE runs the modernizers and automatically applies the updates. Teams that adopt this keep their codebase aligned with Go's recommendations as new releases arrive, without manual effort.

---

## Examples of Go 1.27 guidelines

To make concrete what AI starts using with the guidelines active, some examples of what Go 1.27 covers:

**Generic methods** (new in Go 1.27):

```go
// before: package-level generic function
func Filter[T any](s []T, f func(T) bool) []T { ... }
filtered := Filter(items, predicate)

// after: generic method on the type
func (s Slice[T]) Filter(f func(T) bool) Slice[T] { ... }
filtered := items.Filter(predicate)
```

**`strings.CutLast` and `bytes.CutLast`** (Go 1.27):

```go
// before
idx := strings.LastIndex(s, sep)
before, after := s[:idx], s[idx+len(sep):]

// after
before, after, found := strings.CutLast(s, sep)
```

**`sync.WaitGroup.Go`** (Go 1.25):

```go
// before
var wg sync.WaitGroup
wg.Add(1)
go func() {
    defer wg.Done()
    doWork()
}()

// after
var wg sync.WaitGroup
wg.Go(func() {
    doWork()
})
```

**`slices.Contains`** instead of a manual loop:

```go
// before
found := false
for _, v := range items {
    if v == target {
        found = true
        break
    }
}

// after
found := slices.Contains(items, target)
```

---

## What this solves

The central problem JetBrains addressed is that AI agents and code modernization tooling lived in separate worlds. `go fix` handled existing code, agents generated new code, and neither knew what the other was doing.

Modern Go Guidelines closes the generation side: the agent starts writing current code from the start. The `go fix` integrated into the editor closes the existing code side: you see and fix old patterns in the context where you work, not in a separate batch step.

For teams using Claude Code, Cursor, or Copilot in Go projects, the plugin solves a real friction point. The agent stops generating code that will light up `go fix` warnings two minutes after you accept the diff.

---

Do you run into this problem with AI-generated Go code in your project? Tell me in the comments.

See you in the next post!

**References:**
- [Ready for Go 1.27 on Day One — JetBrains Blog](https://blog.jetbrains.com/go/2026/08/20/ready-for-go-1-27-on-day-one/)
- [Help AI Coding Agents Write Up-To-Date Code With Modern Golang Skills — JetBrains Blog](https://blog.jetbrains.com/go/2026/08/24/help-ai-coding-agents-write-up-to-date-code-with-modern-golang-skills/)
- [Modern Go Guidelines — GitHub](https://github.com/JetBrains/go-modern-guidelines)
