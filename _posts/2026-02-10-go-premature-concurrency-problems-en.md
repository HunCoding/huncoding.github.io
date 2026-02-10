---
layout: post
title: "Most Go Services Don't Need to Be Concurrent"
subtitle: "Why premature concurrency creates hard-to-debug bugs, misleading metrics, and non-deterministic code"
author: otavio_celestino
date: 2026-02-10 08:00:00 -0300
categories: [Go, Performance, Back-end, Architecture]
tags: [go, concurrency, performance, single-threaded, queues, bottlenecks, premature-optimization]
comments: true
image: "/assets/img/posts/2026-02-10-go-premature-concurrency-problems.png"
lang: en
original_post: "/go-premature-concurrency-problems/"
---
Hey everyone!

Most Go services don't need to be concurrent.

I'm not saying Go shouldn't use goroutines or channels. I'm saying that **premature concurrency** - adding goroutines, mutexes, and channels without a real need - is one of the biggest problems I see in production Go code.

## The Thesis

Premature concurrency creates:

1. **Hard-to-debug bugs** (race conditions, deadlocks)
2. **Misleading metrics** (throughput seems high, but latency explodes)
3. **Non-deterministic code** (different behavior on each execution)

And worst of all: **it often reduces the real system throughput**.

## Case 1: Concurrency Reduces Throughput

Let's start with a practical example. Imagine a service that processes HTTP requests and needs to perform some operations:

```go
type Service struct {
    mu sync.RWMutex
    data map[string]int
}

func (s *Service) HandleRequest(w http.ResponseWriter, r *http.Request) {
    var wg sync.WaitGroup
    
    wg.Add(3)
    
    go func() {
        defer wg.Done()
        s.mu.Lock()
        s.data["counter"]++
        s.mu.Unlock()
    }()
    
    go func() {
        defer wg.Done()
        s.mu.RLock()
        _ = s.data["counter"]
        s.mu.RUnlock()
    }()
    
    go func() {
        defer wg.Done()
        time.Sleep(10 * time.Millisecond)
    }()
    
    wg.Wait()
    w.WriteHeader(http.StatusOK)
}
```

**Problems**:
- Overhead of creating goroutines for small tasks
- Mutex contention (all goroutines competing)
- Unnecessary context switching
- Complex code for something simple

```go
type Service struct {
    data map[string]int
}

func (s *Service) HandleRequest(w http.ResponseWriter, r *http.Request) {
    s.data["counter"]++
    _ = s.data["counter"]
    time.Sleep(10 * time.Millisecond)
    
    w.WriteHeader(http.StatusOK)
}
```

Advantages:
- No locks, no race conditions
- Deterministic code
- Easier to debug
- Usually faster for small operations

## When Parallelism Becomes a Bottleneck

### Real Example: Data Processing

Let's see a real case where parallelism **reduces** performance:

```go
func ProcessDataConcurrent(items []Item) []Result {
    results := make([]Result, len(items))
    var wg sync.WaitGroup
    var mu sync.Mutex
    
    for i, item := range items {
        wg.Add(1)
        go func(idx int, it Item) {
            defer wg.Done()
            result := processItem(it)
            
            mu.Lock()
            results[idx] = result
            mu.Unlock()
        }(i, item)
    }
    
    wg.Wait()
    return results
}

func processItem(item Item) Result {
    time.Sleep(100 * time.Microsecond)
    return Result{Value: item.Value * 2}
}
```

**Benchmark**:

```go
func BenchmarkConcurrent(b *testing.B) {
    items := make([]Item, 1000)
    for i := range items {
        items[i] = Item{Value: i}
    }
    
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        ProcessDataConcurrent(items)
    }
}

func BenchmarkSequential(b *testing.B) {
    items := make([]Item, 1000)
    for i := range items {
        items[i] = Item{Value: i}
    }
    
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        ProcessDataSequential(items)
    }
}
```

**Typical results**:

```
BenchmarkConcurrent-8     500   2500000 ns/op   120000 B/op    1000 allocs/op
BenchmarkSequential-8    2000    500000 ns/op       0 B/op       0 allocs/op
```

The sequential version is 5x faster.

Why?
- Overhead of creating 1000 goroutines
- Mutex contention (all competing)
- Constant context switching
- Cache misses (data scattered across threads)

## Case 2: Misleading Metrics

Concurrency can make **throughput seem high**, but **real latency explodes**:

```go
type HighPerformanceService struct {
    workers    int
    jobQueue   chan Job
    resultChan chan Result
}

func (s *HighPerformanceService) Start() {
    for i := 0; i < 100; i++ {
        go s.worker()
    }
}

func (s *HighPerformanceService) worker() {
    for job := range s.jobQueue {
        result := processJob(job)
        s.resultChan <- result
    }
}

func (s *HighPerformanceService) Process(job Job) Result {
    s.jobQueue <- job
    return <-s.resultChan
}
```

Problems:
- p95/p99 latency explodes: Jobs can queue up waiting for available worker
- Misleading metrics: Total throughput seems high, but users feel slowness
- Contention: 100 goroutines competing for resources
- Memory pressure: 100 goroutines = more GC, more overhead

Typical metrics:
- Throughput: 10,000 req/s (seems great)
- p50 latency: 5ms (ok)
- p95 latency: 500ms (users complain)
- p99 latency: 2s (catastrophic)

## Single-Threaded Design + Queues

The alternative: **Single-threaded processing with external queues**.

### Architecture

```
[Load Balancer] → [N Single-Threaded Instances] → [Queue (Kafka/RabbitMQ)] → [Single-Threaded Worker]
```

**Each instance**:
- Processes one request at a time
- No locks, no race conditions
- Deterministic behavior
- Easy to debug

**Scales horizontally**:
- 10 instances = 10x throughput
- No contention between instances
- Each instance is simple and predictable

### Implementation

```go
type SimpleService struct {
    data map[string]int
}

func (s *SimpleService) HandleRequest(w http.ResponseWriter, r *http.Request) {
    result := s.process(r)
    w.WriteHeader(http.StatusOK)
    json.NewEncoder(w).Encode(result)
}

func (s *SimpleService) process(r *http.Request) Result {
    return Result{Status: "ok"}
}
```

For blocking I/O (DB, external APIs):

```go
func (s *SimpleService) HandleRequest(w http.ResponseWriter, r *http.Request) {
    ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
    defer cancel()
    
    result, err := s.db.Query(ctx, "SELECT ...")
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    
    w.WriteHeader(http.StatusOK)
    json.NewEncoder(w).Encode(result)
}
```

For async processing:

```go
func (s *SimpleService) HandleRequest(w http.ResponseWriter, r *http.Request) {
    job := Job{Data: r.Body}
    
    if err := s.queue.Publish(ctx, job); err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    
    w.WriteHeader(http.StatusAccepted)
    json.NewEncoder(w).Encode(Response{Status: "queued"})
}

func (s *SimpleService) StartWorker() {
    for {
        job, err := s.queue.Consume(ctx)
        if err != nil {
            log.Printf("Error consuming: %v", err)
            continue
        }
        s.processJob(job)
    }
}
```

## Real Benchmarks

Let's compare real approaches:

### Test 1: Simple API (CRUD)

```go
type ConcurrentAPI struct {
    mu   sync.RWMutex
    data map[string]string
}

func (a *ConcurrentAPI) Get(key string) string {
    a.mu.RLock()
    defer a.mu.RUnlock()
    return a.data[key]
}

type SimpleAPI struct {
    data map[string]string
}

func (a *SimpleAPI) Get(key string) string {
    return a.data[key]
}
```

Results (1000 concurrent requests):

```
Concurrent:  50,000 req/s, p95: 25ms, p99: 100ms
Simple:     200,000 req/s, p95:  2ms, p99:   5ms
```

Single-threaded is 4x faster.

### Test 2: Batch Processing

```go
func ProcessBatchConcurrent(items []Item) {
    var wg sync.WaitGroup
    sem := make(chan struct{}, 100)
    
    for _, item := range items {
        wg.Add(1)
        sem <- struct{}{}
        go func(it Item) {
            defer wg.Done()
            defer func() { <-sem }()
            processItem(it)
        }(item)
    }
    wg.Wait()
}

func ProcessBatchSequential(items []Item) {
    for _, item := range items {
        processItem(item)
    }
}
```

Results (10,000 items, fast processing ~100μs each):

```
Concurrent: 2.5s total, 4000 items/s
Sequential: 1.0s total, 10000 items/s
```

Sequential is 2.5x faster.

## When Concurrency Makes Sense

Concurrency **is useful** when:

### 1. Real Blocking I/O

```go
func FetchMultiple(urls []string) []Response {
    var wg sync.WaitGroup
    results := make([]Response, len(urls))
    
    for i, url := range urls {
        wg.Add(1)
        go func(idx int, u string) {
            defer wg.Done()
            resp, _ := http.Get(u)
            results[idx] = resp
        }(i, url)
    }
    
    wg.Wait()
    return results
}
```

Blocking I/O allows other goroutines to use CPU while waiting.

### 2. CPU-Bound with Large Load

```go
func ProcessImages(images []Image) {
    var wg sync.WaitGroup
    
    for _, img := range images {
        wg.Add(1)
        go func(i Image) {
            defer wg.Done()
            processHeavyImage(i)
        }(img)
    }
    
    wg.Wait()
}
```

Large load justifies goroutine overhead.

### 3. Background Workers

```go
func StartBackgroundWorker() {
    go func() {
        ticker := time.NewTicker(1 * time.Minute)
        for range ticker.C {
            cleanup()
        }
    }()
}
```

Doesn't block main request.

## When NOT to Use Concurrency

### Small and Fast Operations

```go
go func() {
    counter++
}()
```

Goroutine overhead is greater than execution time.

### Access to Shared Structures

```go
var mu sync.Mutex
var data map[string]int

go func() {
    mu.Lock()
    data["key"] = 1
    mu.Unlock()
}()

go func() {
    mu.Lock()
    _ = data["key"]
    mu.Unlock()
}()
```

Mutex contention is greater than parallelism benefit.

### Sequential Processing with Dependencies

```go
go step1()
go step2()
go step3()
```

Use sequential or explicit pipeline.

## Recommended Architecture

### For HTTP APIs

```
[Load Balancer]
    ↓
[N Single-Threaded Instances]
    ↓ (for heavy processing)
[Queue (Kafka/RabbitMQ)]
    ↓
[Single-Threaded Workers]
```

Each instance:
- One main goroutine (HTTP server)
- Processes requests sequentially
- For I/O, uses context with timeout
- For heavy work, sends to queue

### For Data Processing

```
[Producer] → [Queue] → [N Single-Threaded Workers] → [Result]
```

Each worker:
- Consumes from queue
- Processes item sequentially
- No locks, no race conditions

## Final Comparison

| Aspect | Premature Concurrency | Single-Threaded + Queues |
|--------|----------------------|--------------------------|
| **Throughput** | Seems high, but... | High and consistent |
| **p95/p99 Latency** | Explodes | Predictable |
| **Bugs** | Race conditions, deadlocks | Rare |
| **Debugging** | Hard (non-deterministic) | Easy (deterministic) |
| **Metrics** | Misleading | Accurate |
| **Complexity** | High | Low |
| **Scalability** | Vertical (contention) | Horizontal (instances) |

## Conclusion

Most Go services don't need to be concurrent.

Concurrency is a powerful tool, but like all tools, it should be used when needed, not by default.

Golden rule:
1. Start simple: Single-threaded, sequential
2. Measure: Use real benchmarks
3. Optimize only if needed: If latency/throughput is a real problem
4. Scale horizontally: Multiple simple instances are better than one complex instance

Remember: 
- Goroutines are cheap, but not free
- Mutexes solve problems, but create contention
- Concurrency can reduce performance if misapplied

## References and Further Reading

- [Go Concurrency Patterns](https://go.dev/blog/pipelines)
- [Don't communicate by sharing memory; share memory by communicating](https://go.dev/blog/codelab-share)
- [The Go Memory Model](https://go.dev/ref/mem)
- [Concurrency vs Parallelism in Go: Debunking Performance Myths](/concurrency-vs-parallelism-go-performance-myths/)
- [Go HTTP Routers Performance Comparison Benchmark](/comparacao-routers-go-performance-benchmark/)
- [Context as the Nervous System of Go Services](/context-nervous-system-go/)
- [Profiling Go Programs](https://go.dev/blog/pprof)
- [Concurrency is not Parallelism (Rob Pike)](https://blog.golang.org/waza-talk)