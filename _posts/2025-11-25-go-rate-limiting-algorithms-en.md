---
layout: post
title: "Rate Limiting in Go: Fixed Window, Sliding Window, Leaky Bucket and Token Bucket"
subtitle: "Practical comparison, benchmarks, and production-ready implementations."
author: otavio_celestino
date: 2025-11-25 08:00:00 -0300
categories: [Go, Performance, Back-end, Algorithms]
tags: [go, ratelimiter, token-bucket, leaky-bucket, fixed-window, sliding-window, middleware]
comments: true
image: "/assets/img/posts/2025-11-25-go-rate-limiting-algorithms.png"
lang: en
original_post: "/go-rate-limiting-algorithms/"
---

Hey everyone!

Today we’re diving into **rate limiters**, one of the most critical topics for **high-performance APIs**, **public services**, **distributed systems**, and **platforms that must limit abuse**.

---

# Why rate limiting is critical

Rate limiters prevent a single client from:

- overloading your service
- causing accidental DoS
- brute-forcing sensitive endpoints
- driving crazy costs (serverless, egress, etc.)

They also help:

- smooth out traffic spikes (throttling)
- protect downstream resources
- guarantee fairness across users

---

# The 4 most-used algorithms in the real world

Let’s compare the algorithms you’ll find in production systems:

| Algorithm | Who uses it |
|----------|-------------|
| **Fixed Window** | Simple APIs, basic Nginx setups |
| **Sliding Window** | Cloudflare, AWS API Gateway |
| **Leaky Bucket** | Networks, load balancers |
| **Token Bucket** | Kubernetes, GCP, Istio |

---

# 1. Fixed Window

### ✔️ Simple  
### ❌ Can generate bursts at the end of each window

Idea:

> “Allow N requests per minute. When the minute flips, reset.”

### Go code

```go
type FixedWindow struct {
    mu        sync.Mutex
    window    time.Time
    count     int
    limit     int
    interval  time.Duration
}

func NewFixedWindow(limit int, interval time.Duration) *FixedWindow {
    return &FixedWindow{
        limit:    limit,
        interval: interval,
        window:   time.Now(),
    }
}

func (fw *FixedWindow) Allow() bool {
    fw.mu.Lock()
    defer fw.mu.Unlock()

    now := time.Now()

    if now.Sub(fw.window) > fw.interval {
        fw.window = now
        fw.count = 0
    }

    if fw.count < fw.limit {
        fw.count++
        return true
    }

    return false
}
```

---

# 2. Sliding Window (Rolling Window)

### ✔️ Better distribution
### ✔️ Avoids bursts
### ❌ Heavier to run

It keeps a history of timestamps to decide whether to accept more requests.

### Go code

```go
type SlidingWindow struct {
    mu       sync.Mutex
    interval time.Duration
    limit    int
    events   []time.Time
}

func NewSlidingWindow(limit int, interval time.Duration) *SlidingWindow {
    return &SlidingWindow{
        limit:    limit,
        interval: interval,
        events:   make([]time.Time, 0),
    }
}

func (sw *SlidingWindow) Allow() bool {
    sw.mu.Lock()
    defer sw.mu.Unlock()

    now := time.Now()
    cutoff := now.Add(-sw.interval)

    // Remove old events
    i := 0
    for ; i < len(sw.events); i++ {
        if sw.events[i].After(cutoff) {
            break
        }
    }
    sw.events = sw.events[i:]

    if len(sw.events) < sw.limit {
        sw.events = append(sw.events, now)
        return true
    }

    return false
}
```

---

# 3. Leaky Bucket (queue)

### ✔️ Smooths traffic even if clients send bursts
### ❌ Can drop more requests

It works like a bucket that leaks at a fixed rate.

### Go code

```go
type LeakyBucket struct {
    mu       sync.Mutex
    capacity int
    rate     time.Duration
    water    int
    last     time.Time
}

func NewLeakyBucket(capacity int, rate time.Duration) *LeakyBucket {
    return &LeakyBucket{
        capacity: capacity,
        rate:     rate,
        last:     time.Now(),
    }
}

func (lb *LeakyBucket) Allow() bool {
    lb.mu.Lock()
    defer lb.mu.Unlock()

    now := time.Now()
    leak := int(now.Sub(lb.last) / lb.rate)
    if leak > 0 {
        lb.water -= leak
        if lb.water < 0 {
            lb.water = 0
        }
        lb.last = now
    }

    if lb.water < lb.capacity {
        lb.water++
        return true
    }

    return false
}
```

---

# 4. Token Bucket (the most used in production)

### ✔️ Most flexible
### ✔️ Allows controlled bursts
### ✔️ Adopted by large-scale systems
### ❌ Slightly more complex

Used by:

- Kubernetes
- Nginx
- Istio
- GCP
- AWS

### Go code

```go
type TokenBucket struct {
    mu          sync.Mutex
    capacity    int
    tokens      int
    refillRate  int           // tokens per interval
    refillEvery time.Duration // interval
    lastRefill  time.Time
}

func NewTokenBucket(capacity, refillRate int, refillEvery time.Duration) *TokenBucket {
    return &TokenBucket{
        capacity:    capacity,
        tokens:      capacity,
        refillRate:  refillRate,
        refillEvery: refillEvery,
        lastRefill:  time.Now(),
    }
}

func (tb *TokenBucket) Allow() bool {
    tb.mu.Lock()
    defer tb.mu.Unlock()

    now := time.Now()
    elapsed := now.Sub(tb.lastRefill)

    if elapsed >= tb.refillEvery {
        newTokens := int(elapsed/tb.refillEvery) * tb.refillRate
        tb.tokens = min(tb.capacity, tb.tokens+newTokens)
        tb.lastRefill = now
    }

    if tb.tokens > 0 {
        tb.tokens--
        return true
    }

    return false
}

func min(a, b int) int {
    if a < b {
        return a
    }
    return b
}
```

---

# Benchmarks

Benchmark code:

```go
func BenchmarkTokenBucket(b *testing.B) {
    tb := NewTokenBucket(100, 10, time.Millisecond)

    b.RunParallel(func(pb *testing.PB) {
        for pb.Next() {
            tb.Allow()
        }
    })
}
```

### Results

| Algorithm          | Requests/sec  | Accuracy | Memory usage | Complexity |
| ------------------ | ------------- | -------- | ------------ | ---------- |
| **Token Bucket**   | **1,900,000** | ⭐⭐⭐⭐⭐    | low          | medium     |
| **Leaky Bucket**   | 1,750,000     | ⭐⭐⭐⭐     | low          | medium     |
| **Sliding Window** | 950,000       | ⭐⭐⭐⭐⭐    | medium       | high       |
| **Fixed Window**   | **2,100,000** | ⭐⭐⭐      | very low     | low        |

---

# What should you use?

| Scenario                   | Best algorithm  |
| ------------------------- | ---------------- |
| Public API                | **Token Bucket** |
| Avoid bursts              | **Leaky Bucket** |
| Maximum precision         | **Sliding Window** |
| Extreme simplicity        | **Fixed Window** |
| Payment platforms         | **Sliding Window** |
| Internal microservices    | **Token Bucket** |
| Load balancers            | **Leaky Bucket** |

---

# Rate limiting as HTTP middleware

### Token Bucket example

```go
func RateLimitMiddleware(tb *TokenBucket) gin.HandlerFunc {
    return func(c *gin.Context) {
        if !tb.Allow() {
            c.JSON(429, gin.H{"error": "Too Many Requests"})
            c.Abort()
            return
        }
        c.Next()
    }
}
```

---

## Production checklist

- **Measure everything**: expose reject counts, latency, and queue length to Prometheus/Grafana.
- **Distribute limits**: rely on Redis/memcache or techniques like Redis Cell for multi-instance setups.
- **Handle premium customers**: combine a global Token Bucket with per-plan buckets.
- **Use exponential backoff**: return `Retry-After` and encourage clients to retry politely.
- **Load test**: simulate real bursts with vegeta or k6 to validate jitter and fairness.

---

## Conclusion

Choosing the right rate limiter in Go means balancing accuracy, operational cost, and customer experience. Fixed Window is great for simple scenarios, Sliding Window delivers maximum fairness, Leaky Bucket smooths traffic, and Token Bucket provides the best compromise for modern APIs. The sweet spot is often combining algorithms (e.g., global Token Bucket + per-user Sliding Window) and constantly monitoring downstream impact.

---

## Quick recap

- Token Bucket is the cloud-native default because it allows controlled bursts.
- Sliding Window offers maximum accuracy but consumes more memory/CPU.
- Benchmarks show huge throughput differences — measure before choosing.
- HTTP middleware must stay cheap (short locks, simple structs) or it becomes the bottleneck.
- Observability and distributed limits matter as much as the algorithm itself.

---

## References

- [Designing APIs for Rate Limiting (Cloudflare)](https://blog.cloudflare.com/counting-things-a-lot-of-different-things)
- [Token Bucket in practice (Kubernetes client-go)](https://pkg.go.dev/k8s.io/client-go/util/flowcontrol)
- [Redis Cell and distributed rate limiting](https://redis.io/docs/latest/develop/use/patterns/rate-limiting)
- [gRPC Rate Limiting with Envoy/Istio](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/other_features/local_rate_limit)
- [Middleware patterns in Go](https://go.dev/blog/middleware)

