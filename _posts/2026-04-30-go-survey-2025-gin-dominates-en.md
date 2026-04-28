---
layout: post
title: "Go Survey 2025: Gin Still Leads and more data about the language use"
subtitle: "What the official Go Developer Survey and JetBrains analysis reveal about frameworks, logging, errors and the real state of the ecosystem in 2026"
author: otavio_celestino
date: 2026-04-28 08:00:00 -0300
categories: [Go, Community, Ecosystem]
tags: [go, golang, survey, gin, slog, zap, generics, ecosystem, frameworks]
comments: true
image: "/assets/img/posts/2026-04-28-go-survey-2025-gin-dominates.png"
lang: en
original_post: "/go-survey-2025-gin-domina/"
---

Hey everyone!

In January 2026, the Go Developer Survey 2025 was officially published on the Go blog. In November 2025, JetBrains published their annual Go ecosystem analysis based on GoLand usage data. The two landed within months of each other and together form the most complete picture we have ever had of what Go developers are actually using day to day.

The short answer: Gin still leads by a wide margin, slog became the structured logging standard, generics exploded in adoption, and error handling remains the community's top complaint. But there is a lot of relevant detail behind each of those points.

Let me walk through what the data shows, section by section.

---

## Web frameworks: Gin at 48%, but the landscape shifted

Gin holds the lead at 48% adoption among survey respondents, up from 41% in 2020. That is consistent growth over five years, not stagnation.

| Framework | 2025 Adoption | Trend |
|---|---|---|
| Gin | 48% | Growing |
| net/http + ServeMux | ~22% | Stable/growing |
| Echo | ~14% | Growing |
| Fiber | ~11% | Growing fast |
| Chi | ~8% | Stable |
| Gorilla Mux | ~5% | Declining |

What changed since 2020 is not Gin's position but what is growing behind it. Fiber gained significant traction among developers coming from Node.js who want something with an Express-like API but compiled and fast. Echo remains the choice for teams that want robust middleware without Gin's footprint.

The most relevant data point here is the growth of plain `net/http` with Go 1.22's new `ServeMux`. Starting with Go 1.22, `ServeMux` accepts HTTP methods directly in the route (`GET /users/{id}`) and named path parameters. That eliminated the main argument for using a lightweight framework like Chi. Part of the community that was reaching for Chi because of that reason came back to the stdlib.

The JetBrains analysis confirms this movement: new projects are more likely to use the stdlib than they were two years ago, especially for internal services where Gin's performance does not justify the extra dependency.

But Gin keeps dominating externally-facing APIs, larger team projects, and situations where team learning curve matters. It has extensive documentation, examples everywhere, and any Go developer you hire has probably already used it.

---

## Logging: slog won, but zap still has its place

This was one of the clearest results from the 2025 cycle. `slog`, added to the stdlib in Go 1.21 (August 2023), reached consensus as the structured logging standard for new projects. Two years was enough for the ecosystem to absorb the change.

Logrus was declared in "maintenance mode" by maintainers: no new features planned. For legacy projects using Logrus there is no urgency to migrate, but nobody is starting a new project with it.

The performance comparison that circulates most in the community:

| Library | Performance | Notes |
|---|---|---|
| zerolog | ~280 ns/op | Fastest, less ergonomic API |
| zap | ~420 ns/op | Fast, zero-allocation, verbose API |
| slog (stdlib) | ~650 ns/op | Stdlib, good ergonomics, integrable |
| Logrus | ~2800 ns/op | Legacy, maintenance mode |

The gap between zap and slog (420 vs 650 ns/op) looks large in percentage terms, but in practice logging is rarely the bottleneck in a Go service. For 90% of use cases, slog is fast enough and you gain the advantage of having no external dependency.

The use case that still justifies zap: services with very high log volume per request where every nanosecond in the hot path matters, or teams that already have extensive logging code in zap and do not want the migration cost.

slog also has a structural advantage: because it is stdlib, other libraries started exporting handlers compatible with `slog.Handler`. The integration ecosystem became more cohesive than it was when each library had its own logging system.

---

## Error handling: still the biggest complaint

The Go Developer Survey 2025 confirms what previous surveys already showed: error handling remains the top complaint from Go developers, even after the addition of generics in Go 1.18.

The `if err != nil` pattern is not going away. The community discussion evolved from "when are we getting try/catch" to "how do we better organize the code we already have." But the frustration persists.

What the data shows in detail:

- Developers working in large codebases report that error boilerplate dominates code readability
- The proposal to add `errors.Join` (Go 1.20) was well received but does not solve the core problem
- Error wrapping with `%w` became standard, but consistency in applying it is still irregular across teams

The irony is that generics, which was the most requested feature before it shipped, did not solve the error problem and created new friction points around type complexity. Error handling stays at the top of the list of friction points.

There are proposals in progress in the community to address this more fundamentally, but the Go team has been conservative about changing something so central to the language's ergonomics. The community expectation is that Go 1.26 or 1.27 will bring some concrete improvement, but nothing is confirmed.

For now, the practice most adopted in mature teams is creating domain-specific error types with `errors.As`, consistent wrapping with `fmt.Errorf("%w", err)`, and centralized checking in the outermost handler possible.

---

## Generics: from 12% to 73% in three years

The most striking jump in the 2025 data: 73% of new Go projects use generics, compared to 12% in 2022, shortly after the Go 1.18 release.

| Year | New projects using generics |
|---|---|
| 2022 (launch) | 12% |
| 2023 | 31% |
| 2024 | 58% |
| 2025 | 73% |

The growth followed the classic feature adoption pattern: initial hesitation while the community learns the limits, accelerated growth when the library ecosystem starts using it, and consolidation when it becomes the default for new projects.

The use cases where generics appeared most in the projects analyzed by JetBrains:

- Collection utility functions (`Map`, `Filter`, `Reduce`) that previously existed per specific type
- Repositories and DAOs with generic types reducing duplication
- Result wrapper types like `Result[T]` and `Optional[T]`
- HTTP clients with typed generic responses

What the data also shows is that generics with complex constraints still cause confusion. Most productive uses are relatively simple: `[T any]` or `[T comparable]`. When code starts having nested constraints and type parameters on type parameters, readability drops and some teams are stepping back to more explicit code.

The emerging consensus: generics are very worthwhile for libraries and shared utilities. For specific business code, Go's explicitness without generics is often more readable.

---

## Where Go is actually used

The 2025 survey confirms what previous editions already suggested: Go is an infrastructure and backend language, and that is deepening.

| Area of use | Respondents |
|---|---|
| Infrastructure / DevOps / SRE | ~46% |
| APIs and web services | ~41% |
| CLI tools | ~32% |
| Distributed systems | ~28% |
| Data processing | ~19% |
| ML / AI (integration) | ~11% |

Nearly half of respondents work directly with infrastructure. Go became the de facto language for writing Kubernetes controllers, operators, monitoring agents, system daemons, and platform tooling.

This has implications for how general popularity data should be read. Go does not compete with Python in the scripting and automation space, nor with JavaScript on the frontend. It competes with Rust and C++ in systems, and with Java/Kotlin in service backends. In those specific spaces, Go is very well positioned.

The database data is also relevant:

| Data access layer | Adoption |
|---|---|
| database/sql (stdlib) | ~54% |
| sqlc | ~21% |
| GORM | ~18% |
| sqlx | ~14% |
| Bun | ~8% |

`database/sql` is still the majority, but `sqlc` is growing consistently. The sqlc model, where you write SQL and it generates typed Go code, resonates well with developers who want full control over queries without the overhead of an ORM. GORM lost share over the last few years, though it remains popular in projects that need quick database abstraction.

---

## The TIOBE drop and what it actually means

Go fell from 7th to 16th on the TIOBE Index in January 2026. That data circulated with some alarm, but it deserves context.

TIOBE measures popularity by search volume related to a language. When a language becomes established infrastructure, search volume drops because common problems are answered, documentation is mature, and developers need to search less. That is the opposite of decline.

The most accurate analogy: C and C++ fluctuate a lot on TIOBE, but nobody argues that operating systems and firmware will stop being written in those languages. Go is on the same path of "infrastructurization."

Go 1.25 (August 2025) brought two items that illustrate the language's direction well:

1. GOMAXPROCS fix for containerized environments: Go 1.25 resolved the long-standing problem of Go not correctly respecting container CPU limits. In Kubernetes environments, GOMAXPROCS was being set based on the host's CPUs, not the container's, causing oversubscription. This fix was expected for years and shipped alongside utilities for automatic adjustment.

2. `testing/synctest` graduated from experimental: the package for testing concurrent code left experimental and entered the official stdlib. Testing goroutines and channels became significantly more ergonomic.

Neither of these will move the TIOBE needle. But they show that Go is solving the real problems of its primary users, which are infrastructure teams running on Kubernetes.

Multi-module repos also showed up as a growing trend in the survey: larger teams are organizing codebases into multiple Go modules within the same repository, a pattern that Go tooling supports but that has its management complications. The growth indicates that the average size of Go projects is increasing.

---

## References

- [Go Developer Survey 2025 Results](https://go.dev/blog/survey2025) - go.dev/blog, published January 21, 2026
- [JetBrains Go Ecosystem Analysis 2025](https://blog.jetbrains.com/go/2025/11/10/go-language-trends-ecosystem-2025/) - blog.jetbrains.com, published November 10, 2025
- [Go 1.25 Release Notes](https://go.dev/doc/go1.25) - go.dev
- [Go 1.22 Release Notes - ServeMux enhancements](https://go.dev/doc/go1.22) - go.dev
- [slog package documentation](https://pkg.go.dev/log/slog) - pkg.go.dev
- [testing/synctest package](https://pkg.go.dev/testing/synctest) - pkg.go.dev
- [sqlc documentation](https://docs.sqlc.dev) - docs.sqlc.dev
- [Logrus maintenance mode announcement](https://github.com/sirupsen/logrus#maintenance-mode) - github.com/sirupsen/logrus
