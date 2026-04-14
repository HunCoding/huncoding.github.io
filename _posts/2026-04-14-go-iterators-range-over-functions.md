---
layout: post
title: "Go Iterators: Range Over Functions do Jeito Certo"
subtitle: "Desde o Go 1.23, você pode fazer range nos seus próprios tipos. Veja como escrever iterators limpos e parar de retornar slices que você não precisava."
author: otavio_celestino
date: 2026-04-14 08:00:00 -0300
categories: [Go, Language]
tags: [go, golang, iterators, range, iter, seq, generics]
comments: true
image: "/assets/img/posts/2026-04-14-go-iterators-range-over-functions-en.png"
lang: pt-BR
---

E aí, pessoal!

Antes do Go 1.23, quando você precisava iterar sobre um tipo customizado, tinha basicamente três opções: retornar um slice, expor um channel ou aceitar uma função de callback. Todas têm problemas. Slices alocam tudo de uma vez. Channels têm overhead de goroutine. Callbacks ficam estranhos de ler.

Desde o Go 1.23, tem um jeito melhor. Você pode escrever funções iterator que funcionam direto com `for range`, igual slices e maps.

---

## As duas assinaturas de iterator

O pacote `iter` define dois tipos que você precisa conhecer:

```go
type Seq[V any]     func(yield func(V) bool)
type Seq2[K, V any] func(yield func(K, V) bool)
```

`Seq` produz um valor por iteração. `Seq2` produz um par chave-valor, como quando você faz range em um map ou slice com índice.

A função `yield` é chamada uma vez por elemento. Se o caller sair do loop com `break`, `yield` retorna `false` e o iterator deve parar. Se retornar `true`, continua.

---

## Escrevendo seu primeiro iterator

Digamos que você tem um tipo `Stack` e quer fazer range nele:

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

Usando:

```go
s := &Stack[int]{}
s.Push(1)
s.Push(2)
s.Push(3)

for v := range s.All() {
    fmt.Println(v)
}
```

Sem alocação de slice, sem goroutine, sem sintaxe de callback. Lê exatamente como fazer range num tipo built-in.

O `if !yield(v) { return }` cuida do caso onde o caller para antes:

```go
for v := range s.All() {
    if v == 2 {
        break // yield retorna false, iterator para limpo
    }
    fmt.Println(v)
}
```

---

## Seq2: iterando com índice

Quando você precisa da posição junto com o valor, usa `Seq2`:

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

## Exemplo prático: linhas do banco de dados

É aqui que os iterators ficam genuinamente úteis. Em vez de carregar todas as linhas em um slice, você faz streaming:

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

Usando:

```go
for user, err := range QueryUsers(db, "SELECT id, name, email FROM users") {
    if err != nil {
        log.Printf("erro no scan: %v", err)
        continue
    }
    fmt.Println(user.Name)
}
```

Sem slice intermediário. As linhas são escaneadas e processadas uma a uma. E se você der `break` no meio, o iterator retorna, o `rows.Close()` roda pelo defer e nada vaza.

---

## Outro exemplo prático: API paginada

APIs com paginação são um caso natural para iterators:

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

O caller não sabe nem se importa com paginação:

```go
for order, err := range FetchOrders(client, "https://api.example.com/orders") {
    if err != nil {
        break
    }
    process(order)
}
```

---

## Pull iterators: quando você precisa de controle manual

Push iterators (o padrão) deixam o iterator dirigir. Às vezes você precisa dirigir de fora. As funções `iter.Pull` e `iter.Pull2` convertem qualquer `Seq` num iterator de pull:

```go
next, stop := iter.Pull(s.All())
defer stop()

first, ok := next()
second, ok2 := next()

fmt.Println(first, second)
```

Útil quando você precisa olhar à frente, comparar dois iterators em paralelo, ou integrar com máquinas de estado externas.

Sempre chame `stop()` quando terminar, mesmo que tenha consumido todos os elementos. O `defer` cuida disso.

---

## Compondo iterators

Uma coisa que vira natural quando você adota esse padrão é compor iterators. A stdlib já faz isso com `slices.All`, `maps.All` e `slices.Values`:

```go
// De qualquer slice
for i, v := range slices.All(meuSlice) {
    fmt.Println(i, v)
}

// De um map
for k, v := range maps.All(meuMap) {
    fmt.Println(k, v)
}
```

Você também pode escrever seus próprios adaptadores. Um filter simples:

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
pares := Filter(slices.Values(numeros), func(n int) bool {
    return n%2 == 0
})

for n := range pares {
    fmt.Println(n)
}
```

---

## Quando usar

Iterators fazem sentido quando:

- Seu tipo tem elementos que devem ser percorridos sem expor a estrutura interna
- Você está fazendo streaming de dados de banco, arquivo ou API
- Carregar tudo em um slice primeiro desperdiça memória
- Você quer que o caller possa dar `break` sem precisar limpar goroutines

Não é necessário quando você já tem um slice pequeno ou quando a alocação não importa.

---

## Conclusão

Range over functions é uma daquelas features que muda como você pensa em certos problemas. O padrão é simples: escreva uma função que aceita `yield`, chame ela com cada elemento, e pare se retornar false.

O exemplo das linhas do banco sozinho já justifica adotar isso. Streaming de rows num `for range` limpo, com saída antecipada gerenciada automaticamente, é bem melhor que as alternativas.

---

## Referências

- [Documentação do pacote iter](https://pkg.go.dev/iter)
- [Range over functions: Go spec](https://go.dev/ref/spec#For_range)
- [Go 1.23 release notes](https://go.dev/doc/go1.23)
- [slices.All, slices.Values](https://pkg.go.dev/slices)
- [Range over functions in Go - Ardan Labs](https://www.ardanlabs.com/blog/2024/04/range-over-functions-in-go.html)
