---
layout: post
title: "Go and lambdas: eight years of debate around issue #21498"
subtitle: "Short function literals, callback verbosity, and why the community still debates lighter syntax for anonymous functions"
author: otavio_celestino
date: 2026-03-22 08:00:00 -0300
categories: [Go, Language, Community]
tags: [go, golang, lambda, function-literal, proposal, golang-issue-21498, syntax, generics]
comments: true
image: "/assets/img/posts/2026-03-22-go-lambdas-short-function-literals-proposta.png"
lang: en
original_post: "/go-lambdas-short-function-literals-proposta/"
---

Hey everyone!

Back in August 2017, [@neild](https://github.com/neild) opened a proposal in the official Go repository with a simple title: [**proposal: spec: short function literals**](https://github.com/golang/go/issues/21498). The idea is to allow a shorter form for anonymous functions when the compiler can already infer types from context.

Almost a decade later, the debate is still active. The issue has accumulated a huge number of comments, went through language change review, generated multiple syntax alternatives, and still has no final accepted form.

It is not hard to see why this topic keeps coming back:

- Go uses callbacks all the time
- generics increased the use of higher-order functions
- `func(...)` literals became more common in production code
- many developers feel they keep repeating type information without real readability gains

---

## First things first: Go already has "lambdas"

Yes, Go already has anonymous functions:

```go
sum := func(a, b int) int { return a + b }
fmt.Println(sum(1, 2))
```

So when people say "Go is getting lambdas", they are usually talking about something else:

- it is not a new anonymous-function concept
- it is syntax sugar for cases where type information is already known
- especially when an API already expects a callback with a fixed signature

This matters because it avoids two extremes:

- "this changes everything" (it does not)
- "this changes nothing" (it does change ergonomics in common spots)

---

## What problem issue #21498 is actually trying to solve

Today, when you pass an anonymous function to something that **already knows** the signature, you still need explicit parameter and return types in most cases:

```go
sort.Slice(people, func(i, j int) bool {
	return people[i].Age < people[j].Age
})
```

Types for `i` and `j` are already implied by `sort.Slice`, but you still repeat `int` and `bool`.

In small APIs this is usually fine. The friction appears at scale:

- custom sorting in many places
- transformation pipelines
- HTTP/gRPC middleware layers
- infrastructure wrappers
- generic utility functions

The proposal does not enforce a final syntax yet. It describes a function literal form whose type comes from surrounding context. In issue terms, this would be similar to values with no default type context, like `nil` in certain situations.

The discussion itself frequently references use cases such as:

- RPC-style callbacks (for request population)
- `errgroup.Group.Go(func() error { ... })`, where `func() error` is already obvious

The core point is this: the target type already exists, the compiler already knows it, yet code still requires repeated type declarations.

---

## Why this topic gained momentum again

The debate started in 2017, but ecosystem changes made it more relevant:

1. **Generics in Go**  
   It is now more common to create utility APIs that accept function parameters.

2. **More declarative libraries**  
   Instead of manual loops everywhere, we increasingly see APIs built around callbacks.

3. **Platform and infrastructure code growth**  
   Large teams use wrappers for retries, tracing, telemetry, validation, and error policies.

4. **Code reading at scale**  
   Small repeated frictions become meaningful maintenance cost in large codebases.

---

## Practical examples where verbosity hurts

### 1) Sorting and ranking with business rules

```go
sort.Slice(users, func(i, j int) bool {
	if users[i].Score == users[j].Score {
		return users[i].CreatedAt.Before(users[j].CreatedAt)
	}
	return users[i].Score > users[j].Score
})
```

This is readable and explicit, but still repeats signature details that are already known by the API.

### 2) Concurrency with `errgroup`

```go
g, ctx := errgroup.WithContext(ctx)

for _, id := range ids {
	id := id
	g.Go(func() error {
		return svc.Process(ctx, id)
	})
}

if err := g.Wait(); err != nil {
	return err
}
```

Here, `func() error` repeats all over the codebase.

### 3) Generic transformation helpers

```go
func Map[T any, R any](in []T, fn func(T) R) []R {
	out := make([]R, 0, len(in))
	for _, v := range in {
		out = append(out, fn(v))
	}
	return out
}

names := Map(users, func(u User) string {
	return u.Name
})
```

With APIs like this, `func(x T) R` patterns are everywhere.

None of this blocks development. The question is whether this can be made shorter **without sacrificing clarity**.

---

## The real debate: ergonomics vs language simplicity

This is not "progress vs conservatism". Both sides have valid engineering arguments.

### Arguments in favor of short literals

- less repetition of inferable types
- cleaner syntax for short callbacks
- better ergonomics for modern callback-heavy APIs
- closer to patterns developers already know from other languages, without changing Go runtime semantics

### Arguments against short literals

- introduces new grammar and increases cognitive load
- may create multiple "correct" styles for the same pattern
- can push code toward overly functional style and lower explicitness
- language changes in Go carry long-term tooling, docs, and teaching costs

The sensitive point is this: Go traditionally sacrifices syntax convenience to preserve consistency. Issue #21498 asks how far that tradeoff can move without changing the language identity.

---

## What would need to be clearly specified for acceptance

If this lands one day, key gaps must be resolved:

### 1) Exact inference rules

When can the compiler infer parameter and return types safely?  
When should it reject ambiguous cases?

### 2) Scope of usage

Would short literals be allowed:

- only as function arguments?
- also in assignment to typed function variables?
- in return values?

Broader scope means more edge cases.

### 3) Interaction with `gofmt` and tooling

Go depends on consistent tooling. A change like this needs:

- unambiguous formatting in `gofmt`
- stable support in `gopls`
- clear compiler diagnostics

### 4) Readability during code review

Even if it compiles, short syntax must improve review readability, not just reduce characters.

---

## My take on #21498

This debate is healthy for the ecosystem. It forces an engineering question, not a fan-club question:

**how much syntax ergonomics is worth adding in exchange for more language complexity?**

If the answer is "yes", syntax must be carefully scoped and highly predictable.  
If the answer is "no", the debate is still valuable because it maps where current verbosity actually hurts.

Either way, issue #21498 has become a classic example of how Go handles deep language changes: open, public, slow, and intentionally conservative.

---

## Where to track updates

- Official issue: [golang/go#21498](https://github.com/golang/go/issues/21498) (labels `Proposal`, `LanguageChange`, `Review`)
- Context article: [Go Is Finally Getting Lambdas - 8 Years in the Making](https://pub.huizhou92.com/go-is-finally-getting-lambdas-8-years-in-the-making-a2559a65443f)

If this is ever accepted, you will first see it in:

- accepted proposal updates in the official tracker
- release notes for a concrete Go version
- technical posts from the official Go ecosystem

Until then, treat "Go got lambdas" headlines as ongoing discussion, not shipped feature.

---

## Conclusion

The lambda discussion in Go is less about trends and more about constrained language design. Proposal #21498 is not about adding runtime power. It is about reducing syntax noise in repetitive callback-heavy code.

For production Go teams, the best stance today is:

- understand the real problem the proposal targets
- follow the discussion without hype
- keep writing explicit, consistent, review-friendly code

If you like this kind of topic, leave your take: keep the current explicit style for simplicity, or adopt short literals for context-typed callbacks?

## References

- [proposal: spec: short function literals · Issue #21498 · golang/go](https://github.com/golang/go/issues/21498)
- [Go Is Finally Getting Lambdas - 8 Years in the Making (Medium / The Ordinary Programmer)](https://pub.huizhou92.com/go-is-finally-getting-lambdas-8-years-in-the-making-a2559a65443f)
