---
layout: post
title: "A Maioria dos Serviços em Go Não Precisa Ser Concorrente"
subtitle: "Por que concorrência prematura cria bugs difíceis, métricas enganosas e código não determinístico"
author: otavio_celestino
date: 2026-02-10 08:00:00 -0300
categories: [Go, Performance, Back-end, Architecture]
tags: [go, concurrency, performance, single-threaded, queues, bottlenecks, premature-optimization]
comments: true
image: "/assets/img/posts/2026-02-10-go-premature-concurrency-problems.png"
lang: pt-BR
original_post: "/go-concorrencia-prematura-problemas/"
---
E aí, pessoal!

A maioria dos serviços em Go não precisa ser concorrente.

Não estou dizendo que Go não deve usar goroutines ou channels. Estou dizendo que **concorrência prematura**, adicionar goroutines, mutexes e channels sem necessidade real, é um dos maiores problemas que vejo em código Go em produção.

## A Tese

Concorrência prematura cria:

1. **Bugs difíceis de debugar** (race conditions, deadlocks)
2. **Métricas enganosas** (throughput parece alto, mas latência explode)
3. **Código não determinístico** (comportamento diferente a cada execução)

E o pior: **muitas vezes reduz o throughput real do sistema**.

## Caso 1: Concorrência Reduz Throughput

Vamos começar com um exemplo prático. Imagine um serviço que processa requisições HTTP e precisa fazer algumas operações:

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

**Problemas**:
- Overhead de criar goroutines para tarefas pequenas
- Contention no mutex (todas as goroutines competindo)
- Context switching desnecessário
- Código complexo para algo simples

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

**Vantagens**:
- Sem locks, sem race conditions
- Código determinístico
- Mais fácil de debugar
- Geralmente mais rápido para operações pequenas

## Quando paralelismo vira problema

### Exemplo Real: Processamento de Dados

Vamos ver um caso real onde paralelismo **reduz** performance:

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

**Resultados típicos**:

```
BenchmarkConcurrent-8     500   2500000 ns/op   120000 B/op    1000 allocs/op
BenchmarkSequential-8    2000    500000 ns/op       0 B/op       0 allocs/op
```

A versão sequencial é 5x mais rápida.

Por quê?
- Overhead de criar 1000 goroutines
- Contention no mutex (todas competindo)
- Context switching constante
- Cache misses (dados espalhados entre threads)

## Caso 2: Métricas Enganosas

Concorrência pode fazer o **throughput parecer alto**, mas a **latência real é bem diferente**:

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

Problemas:
- Latência p95/p99 sobe: Jobs podem ficar na fila esperando worker disponível
- Métricas: Throughput total parece alto, mas usuários sentem lentidão
- Contention: 100 goroutines competindo por recursos
- Memory pressure: 100 goroutines = mais GC, mais overhead

Métricas típicas:
- Throughput: 10.000 req/s (parece ótimo)
- Latência p50: 5ms (ok)
- Latência p95: 500ms (usuários reclamam)
- Latência p99: 2s (catastrófico)

## Single-Threaded + Filas

A alternativa: **Single-threaded processing com filas externas**.

### Arquitetura

```
[Load Balancer] → [N Instâncias Single-Threaded] → [Queue (Kafka/RabbitMQ)] → [Worker Single-Threaded]
```

**Cada instância**:
- Processa uma requisição por vez
- Sem locks, sem race conditions
- Comportamento determinístico
- Fácil de debugar

**Escala horizontalmente**:
- 10 instâncias = 10x throughput
- Cada instância é simples e previsível

### Implementação

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

Para I/O bloqueante (DB, APIs externas):

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

Para processamento assíncrono:

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

Vamos comparar abordagens reais:

### Teste 1: API Simples (CRUD)

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

Resultados (1000 requisições concorrentes):

```
Concurrent:  50.000 req/s, p95: 25ms, p99: 100ms
Simple:     200.000 req/s, p95:  2ms, p99:   5ms
```

Single-threaded é 4x mais rápido.

### Teste 2: Processamento de Batch

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

Resultados (10.000 items, processamento rápido ~100μs cada):

```
Concurrent: 2.5s total, 4000 items/s
Sequential: 1.0s total, 10000 items/s
```

Sequencial é 2.5x mais rápido.

## Quando Concorrência Faz Sentido

Concorrência **é útil** quando:

### 1. I/O Bloqueante Real

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

I/O bloqueante permite que outras goroutines usem CPU enquanto esperam.

### 2. CPU-Bound com Carga Grande

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

Carga grande justifica overhead de goroutines.

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

Não bloqueia request principal.

## Quando NÃO Usar Concorrência

### Operações Pequenas e Rápidas

```go
go func() {
    counter++
}()
```

Overhead de goroutine é maior que tempo de execução.

### Acessos a Estruturas Compartilhadas

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

Contention no mutex é maior que benefício do paralelismo.

### Processamento Sequencial com Dependências

```go
go step1()
go step2()
go step3()
```

Use sequencial ou pipeline explícito.

## Arquitetura Recomendada

### Para APIs HTTP

```
[Load Balancer]
    ↓
[N Instâncias Single-Threaded]
    ↓ (para processamento pesado)
[Queue (Kafka/RabbitMQ)]
    ↓
[Workers Single-Threaded]
```

Cada instância:
- Uma goroutine principal (HTTP server)
- Processa requests sequencialmente
- Para I/O, usa context com timeout
- Para trabalho pesado, envia para fila

### Para Processamento de Dados

```
[Producer] → [Queue] → [N Workers Single-Threaded] → [Result]
```

Cada worker:
- Consome da fila
- Processa item sequencialmente
- Sem locks, sem race conditions

## Conclusão

A maioria dos serviços em Go não precisa ser concorrente.

Concorrência é uma ferramenta poderosa, mas como todas as ferramentas, deve ser usada quando necessário.

Lembre-se: 
- Goroutines são baratas, mas não são de graça
- Mutexes resolvem problemas, mas criam contention
- Concorrência pode reduzir performance se mal aplicada

## Referências e Leitura Adicional

- [Go Concurrency Patterns](https://go.dev/blog/pipelines)
- [Don't communicate by sharing memory; share memory by communicating](https://go.dev/blog/codelab-share)
- [The Go Memory Model](https://go.dev/ref/mem)
- [Concorrência vs Paralelismo em Go: Mitos de Performance](/concorrencia-vs-paralelismo-go-mitos-performance/)
- [Comparação de Routers HTTP em Go: Benchmarks de Performance](/comparacao-routers-go-performance-benchmark/)
- [Context como Sistema Nervoso em Go](/context-nervous-system-go/)
- [Profiling Go Programs](https://go.dev/blog/pprof)
- [Concurrency is not Parallelism (Rob Pike)](https://blog.golang.org/waza-talk)