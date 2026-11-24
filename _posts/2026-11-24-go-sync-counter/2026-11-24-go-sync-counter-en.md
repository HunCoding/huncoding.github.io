---
layout: post
title: "sync.Counter is coming in Go 1.28... and we should have had it years ago"
subtitle: "A counter 100x faster than atomic.Int64, with an API decision that looks wrong but is actually right"
author: otavio_celestino
date: 2026-11-24 08:00:00 -0300
categories: [Go, Performance, Stdlib]
tags: [go, golang, performance, concurrency, atomic, sync, stdlib, go1.28]
comments: true
lang: en
image: "/assets/img/posts/2026-11-24-go-sync-counter.png"
original_post: "/go-sync-counter/"
---

Hey everyone!

In early November 2026, the Go team accepted a proposal that has been on the wishlist of high-performance Go developers for years: `sync.Counter`. It's landing in Go 1.28.

The proposal is simple on the surface: a generic counter you increment from any goroutine without worrying about contention. But the implementation details and, especially, the API choices are what make this addition interesting.

## The problem everyone knows but nobody talks about

You have a Go service. You need to count processed requests, bytes sent, errors by type. You use an `atomic.Int64`. It works.

It works until you're running on a machine with many cores and have hundreds of goroutines incrementing the same counter simultaneously. Then things fall apart.

The problem is that `atomic.Int64.Add` requires hardware-level mutual exclusion. When a goroutine executes an `Add`, it needs all other CPU caches to invalidate that memory address, wait for the operation to be confirmed, then release the bus. Under low concurrency, this is transparent. Under high concurrency, you start seeing the nanoseconds pile up: what was 2ns becomes 20ns, then 200ns.

The solution is well known. You keep a slice of counters — one per CPU, or one per GOMAXPROCS — and each goroutine only increments its own. To read the total, you sum them all. Prometheus does this. VictoriaMetrics does this. Dozens of internal projects you've seen do this. The problem is each one does it differently, none integrate with Go's profiling ecosystem, and you have to decide how many shards to maintain.

## What the proposal solves

`sync.Counter[T]` solves all of this in a standardized way:

```go
var requests sync.Counter[int64]

// from any goroutine:
requests.Add(1)

// to read:
total := requests.Value()
```

The implementation uses internal shards — one per P (per `GOMAXPROCS`) — and each goroutine only increments the shard for the P it's running on. No shared bus, no cache misses, no contention.

The numbers from the proposal: **~2ns per operation** vs **~200ns for an `atomic.Int64`** under high contention on many-core machines. A hundred times faster.

## The API decision that looks wrong

Here's where it gets interesting. `Value()` **does not return a consistent snapshot**.

If you call `Value()` while other goroutines are incrementing the counter, the returned value may be any partial sum of the shards at that moment. It may be a value that never existed simultaneously across all shards. There is no happens-before relationship between `Add` and `Value`.

Reading the proposal for the first time, this looks like a bug. Why would you add a type to the stdlib with such weak semantics?

But think about the real use case. You're counting requests per second. Counting bytes sent by a load balancer. Counting errors in a distributed service. In all these cases, what you want is a **good estimate** with **minimal cost** — not an exact snapshot of the universe at a specific instant.

A consistent `Value()` would require stopping all shards to do the read, or using an additional synchronization mechanism. That would increase `Value()` latency proportionally to the number of P's. For metrics, that's not worth it: you already accept that the counter value changed between when you read it and when you displayed it.

The proposal documents this explicitly: *"Value returns an approximate sum of all Adders."* Approximate. If you need an exact, strongly consistent value, `atomic.Int64` is still the right tool.

## Why it took so long

This is the part that strikes me. This solution isn't new. The CPU-sharded counter pattern has been in production in dozens of Go projects. One of the references in the proposal is the `expvar` package — which has existed in Go since 2009 and uses a simplified variant of the same pattern.

When the proposal was accepted, one of the reviewers wrote: *"We wish we had this years ago."*

Why didn't we have it years ago? Part of the answer is that Go generics only really arrived in 1.18, and a `Counter[T]` without generics would be less ergonomic (you'd need separate `Counter32` and `Counter64`, or use `interface{}`). But a non-generic version could have been added much earlier.

The other part of the answer is cultural: the Go team has historically preferred not to add things to the stdlib that you could write in 20 lines. The argument has always been that the stdlib should be small and stable. But this ignores the coordination value: when something enters the stdlib, the entire ecosystem converges on one implementation, Go's profiling tools can instrument it, and you don't have to evaluate which of five external packages is least bad.

`sync.Counter` is a case where waiting cost more than adding it would have. How many counter contention bugs ran in production while this pattern stayed outside the stdlib? How many junior developers wrote `atomic.Int64` where they should have used something like this, without knowing the contention was there?

## What changes in practice

For most Go projects, `sync.Counter` will be a natural upgrade in the right use cases. Rule of thumb:

- **Use `sync.Counter`** when you're counting high-frequency, high-concurrency events (requests, bytes, operations), and an approximate read is sufficient — which is the case for most internal metrics.
- **Use `atomic.Int64`** when you need an exact value with strong happens-before semantics — like a sequential ID or a position index in a shared buffer.

Go 1.28 doesn't have a confirmed release date yet, but with the proposal accepted and in the milestone, it should arrive in mid-2027.

In the meantime, if you have counters with visible contention in pprof today, the [`golang.org/x/sync`](https://pkg.go.dev/golang.org/x/sync) package often previews functionality before it enters the stdlib. Or you can implement the pattern manually — the core idea fits in 30 lines.

But finally having this in the stdlib is going to be good. A bit late, but better now than never.

Cheers!
