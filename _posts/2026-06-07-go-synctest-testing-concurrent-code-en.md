---
layout: post
title: "testing/synctest: The Right Way to Test Concurrent Go Code"
subtitle: "Testing goroutines and timers without sleeping, flaky assertions, or fake clocks you manage yourself."
author: otavio_celestino
date: 2026-06-07 08:00:00 -0300
categories: [Go, Testing, Concurrency]
tags: [go, golang, testing, synctest, concurrency, goroutines, timers, tdd]
comments: true
image: "/assets/img/posts/2026-06-07-go-synctest-testing-concurrent-code.png"
lang: en
original_post: "/go-synctest-testando-codigo-concorrente/"
youtube_videos:
  - id: "BeTQmkPlWZ0"
    title: "Synctest GoLang"
---

Hey everyone!

Testing concurrent code in Go has always been uncomfortable. You write a goroutine, and suddenly your test needs a `time.Sleep` to wait for it. Then the sleep is too short on a slow CI machine and the test flakes. You add more sleep. Now the test suite takes forever.

The `testing/synctest` package, stable since Go 1.25, solves exactly this. It gives you a controlled environment where goroutines and timers behave deterministically, without any real time passing.

---

## The problem with the usual approaches

Say you have a cache that expires entries after a timeout:

```go
type Cache struct {
    mu    sync.Mutex
    items map[string]item
}

type item struct {
    value     string
    expiresAt time.Time
}

func (c *Cache) Set(key, value string, ttl time.Duration) {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.items[key] = item{
        value:     value,
        expiresAt: time.Now().Add(ttl),
    }
}

func (c *Cache) Get(key string) (string, bool) {
    c.mu.Lock()
    defer c.mu.Unlock()
    it, ok := c.items[key]
    if !ok || time.Now().After(it.expiresAt) {
        return "", false
    }
    return it.value, true
}
```

Testing expiration the naive way:

```go
func TestCacheExpiration(t *testing.T) {
    c := &Cache{items: make(map[string]item)}
    c.Set("key", "value", 100*time.Millisecond)

    time.Sleep(200 * time.Millisecond) // flaky on slow machines

    _, ok := c.Get("key")
    if ok {
        t.Fatal("expected key to be expired")
    }
}
```

This test adds 200ms to your suite, and it still flakes when the machine is loaded. It is not a good test.

---

## How synctest works

`testing/synctest` creates an isolated environment called a bubble. Inside the bubble:

- All goroutines share a **fake clock** that starts at a fixed point in time
- `time.Sleep`, `time.After`, `time.NewTimer`, and similar calls do not use real time
- The fake clock only advances when **all goroutines inside the bubble are blocked**

This means you can test code that sleeps for hours in milliseconds of real time.

The package has two functions:

```go
func Test(t *testing.T, f func(t *testing.T)) // runs f in a new bubble
func Wait()                                    // waits until all goroutines in the bubble are blocked
```

---

## Rewriting the test with synctest

```go
func TestCacheExpiration(t *testing.T) {
    synctest.Test(t, func(t *testing.T) {
        c := &Cache{items: make(map[string]item)}
        c.Set("key", "value", 100*time.Millisecond)

        time.Sleep(200 * time.Millisecond) // fake sleep, no real time passes

        _, ok := c.Get("key")
        if ok {
            t.Fatal("expected key to be expired")
        }
    })
}
```

The test runs in microseconds. The `time.Sleep` inside the bubble advances the fake clock, so `time.Now()` in `Get` sees the right time. No flakiness, no waiting.

---

## Testing goroutines with Wait

`Wait` is useful when you start goroutines inside the bubble and need to let them finish before asserting.

Say you have a worker that processes jobs in the background:

```go
type Worker struct {
    jobs    chan string
    results []string
    mu      sync.Mutex
}

func NewWorker() *Worker {
    w := &Worker{jobs: make(chan string, 10)}
    go w.run()
    return w
}

func (w *Worker) run() {
    for job := range w.jobs {
        time.Sleep(50 * time.Millisecond) // simulate processing
        w.mu.Lock()
        w.results = append(w.results, job)
        w.mu.Unlock()
    }
}

func (w *Worker) Submit(job string) {
    w.jobs <- job
}

func (w *Worker) Results() []string {
    w.mu.Lock()
    defer w.mu.Unlock()
    return append([]string{}, w.results...)
}
```

Testing it:

```go
func TestWorkerProcessesJobs(t *testing.T) {
    synctest.Test(t, func(t *testing.T) {
        w := NewWorker()

        w.Submit("job-1")
        w.Submit("job-2")
        w.Submit("job-3")

        synctest.Wait() // wait until all goroutines in the bubble are blocked

        results := w.Results()
        if len(results) != 3 {
            t.Fatalf("expected 3 results, got %d", len(results))
        }
    })
}
```

`synctest.Wait()` blocks until every goroutine in the bubble is blocked on a channel receive, timer, or similar. At that point, all three jobs have been processed and the assertion is safe.

Without synctest, this test would need either a `time.Sleep` or a more complex synchronization mechanism just to make the assertion stable.

---

## A real example: retry with backoff

Retry logic is a classic case where tests are painful because of the sleeps between attempts:

```go
func Retry(ctx context.Context, fn func() error, maxAttempts int, backoff time.Duration) error {
    var err error
    for i := range maxAttempts {
        err = fn()
        if err == nil {
            return nil
        }
        if i < maxAttempts-1 {
            select {
            case <-ctx.Done():
                return ctx.Err()
            case <-time.After(backoff):
            }
        }
    }
    return err
}
```

Without synctest, testing 5 retries with 1 second backoff means 4 seconds of sleep in the test. With synctest:

```go
func TestRetrySucceedsOnThirdAttempt(t *testing.T) {
    synctest.Test(t, func(t *testing.T) {
        attempts := 0
        fn := func() error {
            attempts++
            if attempts < 3 {
                return errors.New("not ready")
            }
            return nil
        }

        err := Retry(context.Background(), fn, 5, 1*time.Second)
        if err != nil {
            t.Fatalf("unexpected error: %v", err)
        }
        if attempts != 3 {
            t.Fatalf("expected 3 attempts, got %d", attempts)
        }
    })
}

func TestRetryRespectsContextCancellation(t *testing.T) {
    synctest.Test(t, func(t *testing.T) {
        ctx, cancel := context.WithTimeout(context.Background(), 2500*time.Millisecond)
        defer cancel()

        attempts := 0
        fn := func() error {
            attempts++
            return errors.New("always fails")
        }

        err := Retry(ctx, fn, 10, 1*time.Second)
        if !errors.Is(err, context.DeadlineExceeded) {
            t.Fatalf("expected DeadlineExceeded, got %v", err)
        }
        // with 2.5s timeout and 1s backoff, we expect 3 attempts
        if attempts != 3 {
            t.Fatalf("expected 3 attempts, got %d", attempts)
        }
    })
}
```

Both tests run instantly. The 2.5 second timeout and the 1 second backoffs are all fake, handled by the bubble's clock.

---

## Testing debounce

Debounce is another pattern where synctest shines. You can verify exactly how many times the function fires without any wall-clock timing:

```go
func Debounce(fn func(), delay time.Duration) func() {
    var timer *time.Timer
    return func() {
        if timer != nil {
            timer.Stop()
        }
        timer = time.AfterFunc(delay, fn)
    }
}
```

```go
func TestDebounce(t *testing.T) {
    synctest.Test(t, func(t *testing.T) {
        count := 0
        debounced := Debounce(func() { count++ }, 100*time.Millisecond)

        debounced()
        debounced()
        debounced()

        time.Sleep(200 * time.Millisecond) // advance fake clock

        synctest.Wait()

        if count != 1 {
            t.Fatalf("expected 1 call, got %d", count)
        }
    })
}
```

---

## What synctest does not solve

A few things to keep in mind:

**External goroutines are outside the bubble.** If your code starts goroutines before `synctest.Test` is called, or starts them via mechanisms that escape the bubble (like `go func()` in a global init), they are not controlled by the fake clock.

**Only standard library time functions are affected.** If you use a third-party clock abstraction, synctest does not control it. You would need to inject the clock manually as before.

**The bubble does not replace race detection.** Run tests with `-race` as usual. synctest makes timing deterministic but does not prevent data races.

---

## Enabling it

`testing/synctest` is part of the standard library since Go 1.25. No import path changes, no build tags. Just import it:

```go
import "testing/synctest"
```

If you are on Go 1.24, it was available as an experiment under `GOEXPERIMENT=synctest`.

---

## Conclusion

`testing/synctest` removes most of the pain from testing concurrent Go code. The pattern is simple: wrap your test in `synctest.Test`, use `synctest.Wait` where you need to let goroutines settle, and let the fake clock handle all the timing.

The retry and debounce examples alone cover a large portion of the concurrent patterns people struggle to test cleanly. If you have code with `time.After`, `time.Sleep`, or goroutines that process things asynchronously, this package is worth adopting.

I also covered this topic on my YouTube channel if you want to see it in action:

{% include embed/youtube.html id="BeTQmkPlWZ0" %}

---

## References

- [testing/synctest package documentation](https://pkg.go.dev/testing/synctest)
- [Testing concurrent code with testing/synctest - Go Blog](https://go.dev/blog/synctest)
- [Testing Time and other asynchronicities - Go Blog](https://go.dev/blog/testing-time)
- [The Synctest Package - Applied Go](https://appliedgo.net/spotlight/go-1.25-the-synctest-package/)
- [Simpler and Faster Concurrent Testing with synctest - Calhoun.io](https://www.calhoun.io/simpler-faster-concurrent-testing-with-synctest/)
- [Go's synctest is amazing - Oblique Security](https://oblique.security/blog/go-synctest/)
- [Most Go Services Don't Need to Be Concurrent](/go-premature-concurrency-problems/)
- [Go Concurrency Patterns - Go Blog](https://go.dev/blog/pipelines)
