---
layout: post
title: "testing/synctest: O Jeito Certo de Testar Código Concorrente em Go"
subtitle: "Testando goroutines e timers sem sleep, sem testes flakey e sem fake clock gerenciado na mão."
author: otavio_celestino
date: 2026-06-07 08:00:00 -0300
categories: [Go, Testing, Concurrency]
tags: [go, golang, testing, synctest, concorrencia, goroutines, timers, tdd]
comments: true
image: "/assets/img/posts/2026-06-07-go-synctest-testing-concurrent-code.png"
lang: pt-BR
youtube_videos:
  - id: "BeTQmkPlWZ0"
    title: "Synctest GoLang"
---

E aí, pessoal!

Testar código concorrente em Go sempre foi chato. Você escreve uma goroutine, e de repente o teste precisa de um `time.Sleep` pra esperar ela terminar. O sleep é curto demais na máquina lenta do CI e o teste flake. Você aumenta o sleep. Agora a suite demora pra caramba.

O pacote `testing/synctest`, estável desde o Go 1.25, resolve exatamente isso. Ele te dá um ambiente controlado onde goroutines e timers se comportam de forma determinista, sem nenhum tempo real passar.

---

## O problema das abordagens comuns

Imagine um cache que expira entradas depois de um timeout:

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

Testando a expiração do jeito ingênuo:

```go
func TestCacheExpiration(t *testing.T) {
    c := &Cache{items: make(map[string]item)}
    c.Set("key", "value", 100*time.Millisecond)

    time.Sleep(200 * time.Millisecond) // flakey em máquinas lentas

    _, ok := c.Get("key")
    if ok {
        t.Fatal("esperava key expirada")
    }
}
```

Esse teste adiciona 200ms na sua suite, e ainda flake quando a máquina está carregada. Não é um bom teste.

---

## Como o synctest funciona

O `testing/synctest` cria um ambiente isolado chamado de bubble. Dentro da bubble:

- Todas as goroutines compartilham um **clock falso** que começa num ponto fixo no tempo
- `time.Sleep`, `time.After`, `time.NewTimer` e similares não usam tempo real
- O clock falso só avanca quando **todas as goroutines dentro da bubble estao bloqueadas**

Isso significa que voce pode testar codigo que dorme por horas em microssegundos de tempo real.

O pacote tem duas funcoes:

```go
func Test(t *testing.T, f func(t *testing.T)) // executa f numa nova bubble
func Wait()                                    // espera ate todas as goroutines da bubble estarem bloqueadas
```

---

## Reescrevendo o teste com synctest

```go
func TestCacheExpiration(t *testing.T) {
    synctest.Test(t, func(t *testing.T) {
        c := &Cache{items: make(map[string]item)}
        c.Set("key", "value", 100*time.Millisecond)

        time.Sleep(200 * time.Millisecond) // sleep falso, nenhum tempo real passa

        _, ok := c.Get("key")
        if ok {
            t.Fatal("esperava key expirada")
        }
    })
}
```

O teste roda em microssegundos. O `time.Sleep` dentro da bubble avanca o clock falso, entao o `time.Now()` dentro do `Get` ve o tempo certo. Sem flakiness, sem espera.

---

## Testando goroutines com Wait

`Wait` e util quando voce inicia goroutines dentro da bubble e precisa deixar elas terminarem antes de fazer as assertions.

Imagine um worker que processa jobs em background:

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
        time.Sleep(50 * time.Millisecond) // simula processamento
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

Testando:

```go
func TestWorkerProcessaJobs(t *testing.T) {
    synctest.Test(t, func(t *testing.T) {
        w := NewWorker()

        w.Submit("job-1")
        w.Submit("job-2")
        w.Submit("job-3")

        synctest.Wait() // espera ate todas as goroutines da bubble estarem bloqueadas

        results := w.Results()
        if len(results) != 3 {
            t.Fatalf("esperava 3 resultados, got %d", len(results))
        }
    })
}
```

O `synctest.Wait()` bloqueia ate que cada goroutine da bubble esteja bloqueada em receive de channel, timer ou similar. Nesse ponto, os tres jobs ja foram processados e a assertion e segura.

Sem synctest, esse teste precisaria de um `time.Sleep` ou de um mecanismo de sincronizacao mais complexo so pra deixar a assertion estavel.

---

## Exemplo real: retry com backoff

Logica de retry e um caso classico onde os testes sao dolorosos por causa dos sleeps entre tentativas:

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

Sem synctest, testar 5 tentativas com 1 segundo de backoff significa 4 segundos de sleep no teste. Com synctest:

```go
func TestRetrySuccedeNaTerceiraAttempt(t *testing.T) {
    synctest.Test(t, func(t *testing.T) {
        tentativas := 0
        fn := func() error {
            tentativas++
            if tentativas < 3 {
                return errors.New("não pronto")
            }
            return nil
        }

        err := Retry(context.Background(), fn, 5, 1*time.Second)
        if err != nil {
            t.Fatalf("erro inesperado: %v", err)
        }
        if tentativas != 3 {
            t.Fatalf("esperava 3 tentativas, got %d", tentativas)
        }
    })
}

func TestRetryRespeitaCancelamentoDeContexto(t *testing.T) {
    synctest.Test(t, func(t *testing.T) {
        ctx, cancel := context.WithTimeout(context.Background(), 2500*time.Millisecond)
        defer cancel()

        tentativas := 0
        fn := func() error {
            tentativas++
            return errors.New("sempre falha")
        }

        err := Retry(ctx, fn, 10, 1*time.Second)
        if !errors.Is(err, context.DeadlineExceeded) {
            t.Fatalf("esperava DeadlineExceeded, got %v", err)
        }
        // com 2.5s de timeout e 1s de backoff, esperamos 3 tentativas
        if tentativas != 3 {
            t.Fatalf("esperava 3 tentativas, got %d", tentativas)
        }
    })
}
```

Os dois testes rodam na hora. O timeout de 2.5 segundos e os backoffs de 1 segundo sao todos falsos, gerenciados pelo clock da bubble.

---

## Testando debounce

Debounce e outro padrao onde o synctest brilha. Voce pode verificar exatamente quantas vezes a funcao dispara sem nenhum timing de relogio real:

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

        time.Sleep(200 * time.Millisecond) // avanca o clock falso

        synctest.Wait()

        if count != 1 {
            t.Fatalf("esperava 1 chamada, got %d", count)
        }
    })
}
```

---

## O que o synctest não resolve

Algumas coisas pra ter em mente:

**Goroutines externas ficam fora da bubble.** Se o seu codigo inicia goroutines antes da chamada de `synctest.Test`, ou por mecanismos que escapam da bubble, elas não sao controladas pelo clock falso.

**So funcoes de tempo da stdlib sao afetadas.** Se voce usa uma abstracao de clock de terceiros, o synctest não a controla. Voce precisaria injetar o clock manualmente como antes.

**A bubble não substitui o race detector.** Rode os testes com `-race` normalmente. O synctest torna o timing deterministico, mas não previne data races.

---

## Como usar

`testing/synctest` faz parte da stdlib desde o Go 1.25. Sem mudancas de import path, sem build tags. So importar:

```go
import "testing/synctest"
```

Se voce esta no Go 1.24, estava disponivel como experimento via `GOEXPERIMENT=synctest`.

---

## Conclusao

O `testing/synctest` remove a maior parte da dor de testar codigo concorrente em Go. O padrao e simples: envolva o teste em `synctest.Test`, use `synctest.Wait` onde precisar deixar as goroutines estabilizarem, e deixa o clock falso cuidar de todo o timing.

Os exemplos de retry e debounce ja cobrem uma boa parte dos padroes concorrentes que as pessoas tem dificuldade de testar de forma limpa. Se voce tem codigo com `time.After`, `time.Sleep`, ou goroutines que processam coisas de forma assincrona, vale adotar esse pacote.

Eu tambem falei sobre esse tema no meu canal do YouTube, caso queira ver na pratica:

{% include embed/youtube.html id="BeTQmkPlWZ0" %}

---

## Referencias

- [Documentacao do pacote testing/synctest](https://pkg.go.dev/testing/synctest)
- [Testando codigo concorrente com testing/synctest - Go Blog](https://go.dev/blog/synctest)
- [Testing Time and other asynchronicities - Go Blog](https://go.dev/blog/testing-time)
- [The Synctest Package - Applied Go](https://appliedgo.net/spotlight/go-1.25-the-synctest-package/)
- [Simpler and Faster Concurrent Testing with synctest - Calhoun.io](https://www.calhoun.io/simpler-faster-concurrent-testing-with-synctest/)
- [Go's synctest is amazing - Oblique Security](https://oblique.security/blog/go-synctest/)
- [A maioria dos servicos Go não precisam ser concorrentes](/go-concorrencia-prematura-problemas/)
- [Go Concurrency Patterns - Go Blog](https://go.dev/blog/pipelines)
