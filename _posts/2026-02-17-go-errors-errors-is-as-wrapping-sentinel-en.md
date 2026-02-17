---
layout: post
title: "Errors in Go: errors.Is, errors.As, Wrapping, and Sentinel Errors"
subtitle: "How to model, propagate, and check errors idiomatically in APIs and libraries"
author: otavio_celestino
date: 2026-02-17 08:00:00 -0300
categories: [Go, Best Practices, APIs, Engineering]
tags: [go, errors, errors.Is, errors.As, wrapping, sentinel-errors, best-practices, api-design]
comments: true
image: "/assets/img/posts/2026-02-17-go-errors-errors-is-as-wrapping-sentinel.png"
lang: en
original_post: "/go-erros-errors-is-as-wrapping-sentinel/"
---

Hey everyone!

In Go, **errors are values**. There are no exceptions: you return `error` and the caller decides what to do. This model is simple, but it requires knowing how to **create**, **propagate**, and **check** errors consistently. Otherwise they turn into lost strings or logs that don't help in production.

In this post we'll look at **sentinel errors**, **wrapping with `%w`**, **`errors.Is`**, **`errors.As`**, and **patterns for APIs and libs** that make code easier to debug and handle.

If you prefer video, check out [this video on YouTube](https://www.youtube.com/watch?v=0TExBobc-MU) where I explain Go errors in practice.

{% include embed/youtube.html id="0TExBobc-MU" %}

---

## 1) Why errors are values in Go

Go has no `try/catch`. The rule is: **function returns `error`, caller handles it**. That means:

- Handling is **explicit** at each layer (or you propagate consciously).
- Errors can be **compared** and **checked** without tricks.
- You can **add context** to the error when propagating (wrapping) without losing the original error.

For this to work well, you need: **sentinel errors** for known conditions, **wrapping** for context, and **`errors.Is`** / **`errors.As`** for checking. Let's go step by step.

---

## 2) Sentinel errors

**Sentinel errors** are errors defined as variables (usually at package level) and used to represent a **specific condition** that the caller may want to handle.

```go
package store

import "errors"

var (
    ErrNotFound   = errors.New("store: resource not found")
    ErrConflict   = errors.New("store: conflict")
    ErrValidation = errors.New("store: validation failed")
)

func (s *Store) GetByID(ctx context.Context, id string) (*Resource, error) {
    r, err := s.db.Query(ctx, id)
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            return nil, ErrNotFound
        }
        return nil, err
    }
    return r, nil
}
```

Callers can branch on the sentinel:

```go
resource, err := store.GetByID(ctx, id)
if err != nil {
    if errors.Is(err, store.ErrNotFound) {
        return nil, nil // or 404
    }
    return nil, err
}
```

**When to use:** for domain or contract conditions that the caller needs to distinguish (e.g. "not found", "conflict", "unauthorized"). Avoid creating a sentinel for every message. Use only when the flow or API response actually changes.

---

## 3) Wrapping with `%w`

**Wrapping** is adding context to an error when propagating it while **keeping** the original error in the chain. In Go you do this with `fmt.Errorf` and the `%w` verb (since Go 1.13).

```go
func (s *Service) GetUser(ctx context.Context, id string) (*User, error) {
    user, err := s.repo.FindByID(ctx, id)
    if err != nil {
        return nil, fmt.Errorf("get user %s: %w", id, err)
    }
    return user, nil
}
```

The caller can still use `errors.Is` and `errors.As` on the returned error because the original `err` stays in the chain. Use `%w` once per level. Don't wrap the same error again in the same package without adding new context.

**Wrong:** losing the original error (don't use `%v` when you want inspection):

```go
return nil, fmt.Errorf("get user: %v", err) // errors.Is(err, ErrNotFound) won't work
```

**Right:** preserve with `%w`:

```go
return nil, fmt.Errorf("get user %s: %w", id, err) // chain intact
```

---

## 4) errors.Is

`errors.Is(err, target)` checks whether `err` is exactly `target` or whether, at some point in the wrap chain, the error matches `target`. It's the recommended way to check sentinels.

```go
resource, err := store.GetByID(ctx, id)
if err != nil {
    if errors.Is(err, store.ErrNotFound) {
        return nil, nil
    }
    if errors.Is(err, store.ErrConflict) {
        return nil, ErrConflictResponse
    }
    return nil, err
}
```

It works with wrapped errors:

```go
// somewhere: return nil, fmt.Errorf("loading resource: %w", store.ErrNotFound)
if errors.Is(err, store.ErrNotFound) {
    // still true
}
```

Use `errors.Is` whenever you want to compare against a known value (sentinel). Don't use `err == store.ErrNotFound` when there's wrapping. It can fail.

---

## 5) errors.As

`errors.As(err, &target)` walks the error chain and, if it finds an error that **matches the type** of `target`, assigns it to `target` and returns `true`. Use it for errors that carry **data** (structs, codes, fields).

```go
type ValidationError struct {
    Field   string
    Message string
}

func (e *ValidationError) Error() string {
    return fmt.Sprintf("validation: %s: %s", e.Field, e.Message)
}

func ValidateUser(u *User) error {
    if u.Email == "" {
        return &ValidationError{Field: "email", Message: "required"}
    }
    return nil
}
```

The caller can extract the type and use the fields:

```go
if err := ValidateUser(user); err != nil {
    var verr *ValidationError
    if errors.As(err, &verr) {
        return fmt.Sprintf("field %s: %s", verr.Field, verr.Message)
    }
    return err.Error()
}
```

**When to use:** when the error needs to carry structured information (invalid field, business code). For simple conditions with no extra data, sentinel + `errors.Is` is enough.

---

## 6) Patterns for APIs and libraries

### In libraries (low level)

- **Return sentinels** for conditions the caller should distinguish (e.g. `ErrNotFound`).
- Don't wrap errors you return yourself. Let the caller add context if they want.
- For dependency errors (e.g. `sql.ErrNoRows`), translate to your own sentinels when it makes sense (e.g. `ErrNotFound`) and return directly, without unnecessary wrapping.

```go
// Lib: direct return
if errors.Is(err, sql.ErrNoRows) {
    return nil, ErrNotFound
}
return nil, err
```

### In application layers (services, handlers)

- **Wrap** when propagating, with useful context: `fmt.Errorf("get user %s: %w", id, err)`.
- **Define sentinels** in the domain (e.g. `ErrUserNotFound`, `ErrDuplicateEmail`) and use `errors.Is` in handlers to decide HTTP status or response.

### Custom types vs sentinels

| Situation                      | Recommendation        |
|--------------------------------|------------------------|
| Known condition, no data      | Sentinel + `Is`        |
| Error with data (field, code)  | Custom type + `As`     |
| Just a message to the caller  | `fmt.Errorf` with `%w` |

---

## 7) Full example: API with repository

```go
import (
    "context"
    "database/sql"
    "encoding/json"
    "errors"
    "fmt"
    "net/http"
)

// Package domain or store
var ErrNotFound = errors.New("resource not found")

type User struct{ ID, Email string } // simplified for the example

type ValidationError struct {
    Field string
    Msg  string
}

func (e *ValidationError) Error() string { return e.Field + ": " + e.Msg }

// Repository: returns sentinels, no wrap
func (r *Repo) FindByID(ctx context.Context, id string) (*User, error) {
    var u User
    err := r.db.GetContext(ctx, &u, "SELECT * FROM users WHERE id = $1", id)
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            return nil, ErrNotFound
        }
        return nil, err
    }
    return &u, nil
}

// Service: wrap when propagating
func (s *Service) GetUser(ctx context.Context, id string) (*User, error) {
    user, err := s.repo.FindByID(ctx, id)
    if err != nil {
        return nil, fmt.Errorf("get user %s: %w", id, err)
    }
    return user, nil
}

// HTTP handler: Is and As for response
func (h *Handler) GetUser(w http.ResponseWriter, r *http.Request) {
    user, err := h.svc.GetUser(r.Context(), r.PathValue("id"))
    if err != nil {
        if errors.Is(err, ErrNotFound) {
            http.Error(w, "user not found", http.StatusNotFound)
            return
        }
        var valErr *ValidationError
        if errors.As(err, &valErr) {
            http.Error(w, valErr.Msg, http.StatusBadRequest)
            return
        }
        http.Error(w, "internal error", http.StatusInternalServerError)
        return
    }
    json.NewEncoder(w).Encode(user)
}
```

---

## 8) What to avoid

- Don't use `err == sentinel` when there's wrapping. Prefer `errors.Is(err, sentinel)`.
- Don't use `%v` for the inner error if you want the caller to use `Is`/`As`. Use `%w`.
- Don't create too many sentinels. Reserve them for conditions the caller actually handles differently.
- Don't put volatile or sensitive data in error types that may be logged (avoid passwords, tokens).

---

## Conclusion

A good error model in Go combines:

1. **Sentinel errors** for conditions the caller needs to identify (`errors.Is`).
2. **Wrapping with `%w`** in application layers to add context without losing the chain.
3. **Custom types** when the error needs to carry data (`errors.As`).
4. **Clear rules** in APIs and libs: sentinels where it makes sense, wrap in the application, without overdoing it in the same layer.

That makes errors easier to log and handle in handlers and clients. To go deeper, the post [Why `context.Context` is the nervous system of modern Go](/por-que-context-e-o-sistema-nervoso-do-go/) shows how context and cancellation fit into flows that return errors.

See you next time!

---

## References

- **[Package errors](https://pkg.go.dev/errors)** – Official documentation for the `errors` package (errors.Is, errors.As, wrapping).
- **[Working with Errors in Go 1.13](https://go.dev/blog/go1.13-errors)** – Go Blog post on error wrapping and `%w` (Go 1.13).
- **[Effective Go, Errors section](https://go.dev/doc/effective_go#errors)** – Error handling in the official guide.
- **[Errors are values](https://go.dev/blog/errors-are-values)** – Go Blog post (Rob Pike) on errors as values.
- **[Don't just check errors, handle them gracefully](https://dave.cheney.net/2016/04/27/dont-just-check-errors-handle-them-gracefully)** – Dave Cheney on sentinel errors, wrapping, and best practices.
- **[Go Code Review Comments, Error strings](https://go.dev/wiki/CodeReviewComments#error-strings)** – Conventions for error messages and handling.
