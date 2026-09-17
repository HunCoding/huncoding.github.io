---
layout: post
title: "The Go dev team proposal for 1.28: Set, ordered Map, and generic heap in the stdlib"
subtitle: "The Go Collections Working Group proposed a series of new collection types for the standard library"
author: otavio_celestino
date: 2026-09-17 08:00:00 +0200
categories: [Go, stdlib]
tags: [go, golang, generics, collections, set, map, heap, stdlib]
comments: true
image: "/assets/img/posts/2026-09-17-go-colecoes-genericas-stdlib.png"
lang: en
original_post: "/go-colecoes-genericas-stdlib/"
---

Hey everyone!

Go has always been minimal in the standard library when it comes to data structures. Slices and maps are the building blocks, and for a long time that was enough. But since generics arrived in Go 1.18 and iterators in Go 1.23, it became clear that real collection types in the stdlib were possible without sacrificing the language's ergonomics.

The Go Collections Working Group was formed in late 2025 with exactly that goal. And this is not just any working group: it is the core Go development team itself. Jonathan Amsterdam, Alan Donovan, Robert Griesemer, Daniel Martí, Roger Peppe, Keith Randall, and Ian Lance Taylor are all part of the language's core team. In September 2026 they published the umbrella proposal [#80590](https://github.com/golang/go/issues/80590) for Go 1.28 covering several new packages.

Here is what is being proposed and what it means in practice.

---

## What is missing today

Go has `container/heap`, `container/list`, and `container/ring`. But it does not have:

- A native Set type (the convention is `map[T]bool` or `map[T]struct{}`)
- A map with custom hashing (useful when the key type is not comparable)
- An ordered map (for range queries)
- A generic heap (the current API requires implementing an interface with `Less`, `Swap`, and `Len` methods)

The proposal covers all of this.

---

## container/set.Set[T]

The most anticipated type. A Set of comparable elements, internally represented as `map[T]struct{}`. The proposal is for it to become the standard Set in new Go APIs.

```go
import "container/set"

s1 := set.Of("go", "rust", "python")
s2 := set.Of("go", "kotlin", "swift")

fmt.Println(s1.Contains("go"))       // true
fmt.Println(s1.Len())                // 3

// set operations
union := s1.Union(s2)
inter := s1.Intersection(s2)
diff  := s1.Difference(s2)

fmt.Println(union)  // {go, rust, python, kotlin, swift}
fmt.Println(inter)  // {go}
fmt.Println(diff)   // {rust, python}
```

Each operation has a `-With` variant that mutates the receiver instead of creating a new set, useful when allocation matters:

```go
s1.UnionWith(s2)
s1.IntersectionWith(s2)
```

The group decided to keep both variants separate after bad experiences with the `math/big.Int` API, where a single method that sometimes mutates and sometimes does not created confusion and bugs.

---

## container/hash.Map[K,V] and container/hash.Set[T]

For cases where the key is not comparable (slices, maps, interfaces with custom comparison) or where the compiler's default comparison is not appropriate, there is `container/hash`:

```go
import "container/hash"

// hash.Map with custom hasher
m := hash.NewMap[[]byte, string](bytesHasher)
m.Set([]byte("key"), "value")
v, ok := m.Get([]byte("key"))

// hash.Set
s := hash.NewSet[[]byte](bytesHasher)
s.Insert([]byte("go"))
s.Insert([]byte("golang"))
fmt.Println(s.Contains([]byte("go"))) // true
```

The `Hasher` is a standard interface introduced in Go 1.27 via `hash/maphash.Hasher` that lets you express hash functions and equivalence relations for arbitrary types.

---

## container/ordered.Map[K,V]

A map with ordering. The current implementation uses a balanced binary tree, but the interface does not depend on that.

The pattern today for iterating over a map in order is to build a `map[K]V`, collect the keys into a slice, and sort. That works fine in most cases, but when you need range queries (all values with key between X and Y), an ordered map performs much better:

```go
import "container/ordered"

m := ordered.NewMap[string, int]()
m.Set("banana", 3)
m.Set("avocado", 1)
m.Set("cashew", 5)
m.Set("mango", 2)

// iteration already comes in order
for k, v := range m.All() {
    fmt.Printf("%s: %d\n", k, v)
}
// avocado: 1
// banana: 3
// cashew: 5
// mango: 2
```

---

## container/heap/v2.Heap

The current heap API requires implementing `heap.Interface`:

```go
type MinHeap []int

func (h MinHeap) Len() int           { return len(h) }
func (h MinHeap) Less(i, j int) bool { return h[i] < h[j] }
func (h MinHeap) Swap(i, j int)      { h[i], h[j] = h[j], h[i] }
func (h *MinHeap) Push(x any)        { *h = append(*h, x.(int)) }
func (h *MinHeap) Pop() any {
    old := *h
    n := len(old)
    x := old[n-1]
    *h = old[:n-1]
    return x
}
```

With `container/heap/v2`:

```go
import heapv2 "container/heap/v2"

h := heapv2.New(func(a, b int) bool { return a < b })
h.Push(5)
h.Push(1)
h.Push(3)

fmt.Println(h.Pop()) // 1
fmt.Println(h.Pop()) // 3
```

Much less boilerplate.

---

## container/mapset

For existing code that uses `map[T]bool` or `map[T]struct{}` and cannot change the API, the `container/mapset` package provides helper functions with the same semantics as `container/set.Set` operations:

```go
import "container/mapset"

a := map[string]struct{}{"go": {}, "rust": {}}
b := map[string]struct{}{"go": {}, "python": {}}

union := mapset.Union(a, b)
inter := mapset.Intersection(a, b)
```

This makes incremental migration easier.

---

## Abstract collection interfaces

The proposal defines internal generic interfaces (`_AbstractCollection`, `_AbstractMap`, `_AbstractSet`) that guarantee consistency across types, but does not export them yet. The plan is to gain experience with the concrete types first.

This makes it possible to write generic functions that work with any Set implementation:

```go
// internal example from the proposal
type _TakeSet[E any, S _TakeSet[E, S]] interface {
    All() iter.Seq[E]
    Delete(E) bool
}

func Take[S _TakeSet[E, S], E any](set S) (e E, found bool) {
    for e = range set.All() {
        found = true
        set.Delete(e)
        break
    }
    return
}
```

F-bounded polymorphism (constraints that reference the interface itself) solves the "binary method problem": a `Union(S) S` method on two different Set types would be incompatible in a conventional interface, but with this pattern it works.

---

## Status and timeline

The proposal was opened in September 2026 with a Go 1.28 milestone. Several packages already have CLs under review. `container/set.Set` has CL 745441, `container/hash.Map` has CL 612217, and `container/hash.Set` has CL 741160.

The expectation is that at least `container/set` and `container/heap/v2` will land in Go 1.28. The others depend on how the reviews go.

---

## What changes day to day

For most use cases, the most immediate impact will be `container/set.Set`. Today, sets in Go are `map[string]struct{}` with `_, ok := m[k]` to check membership. With `container/set`:

```go
// before
langs := map[string]struct{}{"go": {}, "rust": {}}
_, hasGo := langs["go"]

// after
langs := set.Of("go", "rust")
hasGo := langs.Contains("go")
```

More readable, with set operations that today require manual loops and error-prone code.

`container/ordered.Map` will be useful in specific cases where range queries matter. The generic heap eliminates one of the most tedious boilerplate patterns in the stdlib.

---

Have you ever missed any of these structures in Go? Tell me in the comments.

See you in the next post!

**References:**
- [proposal: container/...: generic collection types #80590](https://github.com/golang/go/issues/80590)
- [container/set.Set proposal #69230](https://github.com/golang/go/issues/69230)
- [container/ordered.Map proposal #60630](https://github.com/golang/go/issues/60630)
- [container/heap/v2 proposal #77397](https://github.com/golang/go/issues/77397)
