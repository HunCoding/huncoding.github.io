---
layout: post
title: "Go Iterators: Range Over Functions the Right Way"
subtitle: "Since Go 1.23, you can range over your own types. Here is how to write clean iterators and stop returning slices you did not need."
author: otavio_celestino
date: 2026-04-14 08:00:00 -0300
categories: [Go, Language]
tags: [go, golang, iterators, range, iter, seq, generics]
comments: true
image: "/assets/img/posts/2026-04-14-go-iterators-range-over-functions-en.png"
lang: en
original_post: "/go-iterators-range-over-functions/"
---

Hey everyone!

Before Go 1.23, whenever you needed to iterate over a custom type, you had roughly three options: return a slice, expose a channel, or accept a callback function. All of them have tradeoffs. Slices allocate everything upfront. Channels carry goroutine overhead. Callbacks are awkward to read.

Since Go 1.23, there is a better way. You can write iterator functions that work directly with `for range`, just like slices and maps do.

---

## The two iterator signatures

The `iter` package defines two types you need to know:

```go
type Seq[V any]     func(yield func(V) bool)
type Seq2[K, V any] func(yield func(K, V) bool)
```

`Seq` yields a single value per iteration. `Seq2` yields a key-value pair, like ranging over a map or a slice with index.

The `yield` function is called once per element. If the caller breaks out of the loop, `yield` returns `false` and the iterator should stop. If it returns `true`, keep going.

---

## Writing your first iterator

Say you have a `Stack` type and want to range over it:

```go
type Stack[T any] struct {
    items []T
}

func (s *Stack[T]) Push(v T) {
    s.items = append(s.items, v)
}

func (s *Stack[T]) All() iter.Seq[T] {
    return func(yield func(T) bool) {
        for _, v := range s.items {
            if !yield(v) {
                return
            }
        }
    }
}
```

Using it:

```go
s := &Stack[int]{}
s.Push(1)
s.Push(2)
s.Push(3)

for v := range s.All() {
    fmt.Println(v)
}
```

That is it. No slice allocation, no goroutine, no callback syntax. It reads exactly like ranging over a built-in type.

The `if !yield(v) { return }` check handles the case where the caller breaks early:

```go
for v := range s.All() {
    if v == 2 {
        break // yield returns false, iterator stops cleanly
    }
    fmt.Println(v)
}
```

---

## Seq2: iterating with index

When you need the position alongside the value, use `Seq2`:

```go
func (s *Stack[T]) Indexed() iter.Seq2[int, T] {
    return func(yield func(int, T) bool) {
        for i, v := range s.items {
            if !yield(i, v) {
                return
            }
        }
    }
}
```

```go
for i, v := range s.Indexed() {
    fmt.Printf("%d: %v\n", i, v)
}
```

---

## A practical example: database rows

This is where iterators get genuinely useful. Instead of loading all rows into a slice, you stream them:

```go
func QueryUsers(db *sql.DB, query string) iter.Seq2[*User, error] {
    return func(yield func(*User, error) bool) {
        rows, err := db.Query(query)
        if err != nil {
            yield(nil, err)
            return
        }
        defer rows.Close()

        for rows.Next() {
            var u User
            if err := rows.Scan(&u.ID, &u.Name, &u.Email); err != nil {
                if !yield(nil, err) {
                    return
                }
                continue
            }
            if !yield(&u, nil) {
                return
            }
        }
    }
}
```

Using it:

```go
for user, err := range QueryUsers(db, "SELECT id, name, email FROM users") {
    if err != nil {
        log.Printf("scan error: %v", err)
        continue
    }
    fmt.Println(user.Name)
}
```

No intermediate slice. Rows are scanned and processed one at a time. And if you break early, the iterator returns, `rows.Close()` runs via defer, and nothing leaks.

---

## Another practical example: paginated API

APIs that paginate are a natural fit for iterators:

```go
func FetchOrders(client *http.Client, baseURL string) iter.Seq2[Order, error] {
    return func(yield func(Order, error) bool) {
        page := 1
        for {
            orders, hasMore, err := fetchPage(client, baseURL, page)
            if err != nil {
                yield(Order{}, err)
                return
            }

            for _, o := range orders {
                if !yield(o, nil) {
                    return
                }
            }

            if !hasMore {
                return
            }
            page++
        }
    }
}
```

The caller does not know or care about pagination:

```go
for order, err := range FetchOrders(client, "https://api.example.com/orders") {
    if err != nil {
        break
    }
    process(order)
}
```

---

## Pull iterators: when you need manual control

Push iterators (the default) let the iterator drive. Sometimes you need to drive from the outside. The `iter.Pull` and `iter.Pull2` functions convert any `Seq` into a pull-based iterator:

```go
next, stop := iter.Pull(s.All())
defer stop()

first, ok := next()
second, ok2 := next()

fmt.Println(first, second)
```

This is useful when you need to look ahead, compare two iterators in lockstep, or integrate with external state machines.

Always call `stop()` when you are done, even if you consumed all elements. The `defer` handles that cleanly.

---

## Composing iterators

One thing that becomes natural once you adopt this pattern is composing iterators. The standard library already does this with `slices.All`, `maps.All`, and `slices.Values`:

```go
// From any slice
for i, v := range slices.All(mySlice) {
    fmt.Println(i, v)
}

// From map keys and values
for k, v := range maps.All(myMap) {
    fmt.Println(k, v)
}
```

You can write your own adapters too. A simple filter:

```go
func Filter[V any](seq iter.Seq[V], keep func(V) bool) iter.Seq[V] {
    return func(yield func(V) bool) {
        for v := range seq {
            if keep(v) {
                if !yield(v) {
                    return
                }
            }
        }
    }
}
```

```go
evens := Filter(slices.Values(numbers), func(n int) bool {
    return n%2 == 0
})

for n := range evens {
    fmt.Println(n)
}
```

---

## When to use this

Iterators make sense when:

- Your type has elements that should be traversed without exposing internal structure
- You are streaming data from a database, file, or API
- Loading everything into a slice first wastes memory
- You want callers to be able to break early without goroutine cleanup

They are not necessary when you are just iterating over a slice you already have, or when the collection is small and allocation does not matter.

---

## Conclusion

Range over functions is one of those features that changes how you think about certain problems once you start using it. The pattern is simple once you get it: write a function that accepts `yield`, call it with each element, and stop if it returns false.

The database rows example alone is worth adopting this. Streaming rows through a clean `for range` loop, with early exit handled automatically, is much better than the alternatives.

---

## References

- [iter package documentation](https://pkg.go.dev/iter)
- [Range over functions: Go spec](https://go.dev/ref/spec#For_range)
- [Go 1.23 release notes](https://go.dev/doc/go1.23)
- [slices.All, slices.Values](https://pkg.go.dev/slices)
- [Range over functions in Go - Ardan Labs](https://www.ardanlabs.com/blog/2024/04/range-over-functions-in-go.html)
