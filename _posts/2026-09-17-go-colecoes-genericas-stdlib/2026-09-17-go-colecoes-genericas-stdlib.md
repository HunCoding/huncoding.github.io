---
layout: post
title: "Proposta do time do Go para 1.28: Set, Map ordenado e heap genérico na stdlib"
subtitle: "O Go Collections Working Group propôs uma série de novos tipos de coleção para a biblioteca padrão"
author: otavio_celestino
date: 2026-09-17 08:00:00 +0200
categories: [Go, stdlib]
tags: [go, golang, generics, collections, set, map, heap, stdlib]
comments: true
image: "/assets/img/posts/2026-09-17-go-colecoes-genericas-stdlib.png"
lang: pt-BR
---

E aí, pessoal!

O Go sempre foi minimalista na biblioteca padrão quando o assunto é estruturas de dados. Slice e map são os tijolos de construção, e por muito tempo isso foi suficiente. Mas desde que generics chegaram no Go 1.18 e iteradores no Go 1.23, ficou claro que era possível ter tipos de coleção de verdade na stdlib sem abrir mão da ergonomia da linguagem.

O Go Collections Working Group foi formado no final de 2025 exatamente para isso. E não é qualquer grupo: é o próprio time de desenvolvimento do Go. Jonathan Amsterdam, Alan Donovan, Robert Griesemer, Daniel Martí, Roger Peppe, Keith Randall e Ian Lance Taylor fazem parte do core da linguagem. Em setembro de 2026 eles publicaram a proposta umbrella [#80590](https://github.com/golang/go/issues/80590) para o Go 1.28 com vários pacotes novos.

Vou cobrir o que está sendo proposto e o que isso significa na prática.

---

## O que está faltando hoje

Go tem `container/heap`, `container/list` e `container/ring`. Mas não tem:

- Tipo Set nativo (a convenção é usar `map[T]bool` ou `map[T]struct{}`)
- Map com hash customizado (útil quando o tipo de chave não é comparável)
- Map ordenado (para range queries)
- Heap genérico (a API atual exige implementar uma interface com métodos `Less`, `Swap` e `Len`, o que é trabalhoso)

A proposta cobre tudo isso.

---

## container/set.Set[T]

O tipo mais esperado. Um Set de elementos comparáveis, representado internamente como `map[T]struct{}`. A proposta é que ele se torne o Set padrão em novas APIs Go.

```go
import "container/set"

s1 := set.Of("go", "rust", "python")
s2 := set.Of("go", "kotlin", "swift")

fmt.Println(s1.Contains("go"))       // true
fmt.Println(s1.Len())                // 3

// operações de conjunto
union := s1.Union(s2)
inter := s1.Intersection(s2)
diff  := s1.Difference(s2)

fmt.Println(union)  // {go, rust, python, kotlin, swift}
fmt.Println(inter)  // {go}
fmt.Println(diff)   // {rust, python}
```

Cada operação tem uma variante `-With` que muta o receptor ao invés de criar um novo set, útil quando alocação importa:

```go
s1.UnionWith(s2)      // muta s1
s1.IntersectionWith(s2)
```

O grupo decidiu manter as duas variantes separadas depois de experiências ruins com a API do `math/big.Int`, onde um único método que ora muta ora não muta gerou confusão e bugs.

---

## container/hash.Map[K,V] e container/hash.Set[T]

Para casos onde a chave não é comparável (slices, maps, interfaces com comparação personalizada) ou onde a comparação padrão do compilador não serve, há o `container/hash`:

```go
import "container/hash"

// hash.Map com hasher customizado
m := hash.NewMap[[]byte, string](bytesHasher)
m.Set([]byte("chave"), "valor")
v, ok := m.Get([]byte("chave"))

// hash.Set
s := hash.NewSet[[]byte](bytesHasher)
s.Insert([]byte("go"))
s.Insert([]byte("golang"))
fmt.Println(s.Contains([]byte("go"))) // true
```

O `Hasher` é uma interface padrão introduzida no Go 1.27 via `hash/maphash.Hasher` que permite expressar funções de hash e relações de equivalência para tipos arbitrários.

---

## container/ordered.Map[K,V]

Map com ordenação. A implementação atual usa árvore binária balanceada, mas a interface não depende disso.

O padrão hoje para iterar em ordem sobre um map é construir um `map[K]V`, coletar as chaves num slice e ordenar. Funciona bem na maioria dos casos, mas quando você precisa de range queries (todos os valores com chave entre X e Y), um map ordenado performa muito melhor:

```go
import "container/ordered"

m := ordered.NewMap[string, int]()
m.Set("banana", 3)
m.Set("abacate", 1)
m.Set("caju", 5)
m.Set("manga", 2)

// iteração já vem em ordem
for k, v := range m.All() {
    fmt.Printf("%s: %d\n", k, v)
}
// abacate: 1
// banana: 3
// caju: 5
// manga: 2
```

---

## container/heap/v2.Heap

A API atual do heap exige que você implemente `heap.Interface`:

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

Com `container/heap/v2`:

```go
import heapv2 "container/heap/v2"

h := heapv2.New(func(a, b int) bool { return a < b })
h.Push(5)
h.Push(1)
h.Push(3)

fmt.Println(h.Pop()) // 1
fmt.Println(h.Pop()) // 3
```

Muito menos boilerplate.

---

## container/mapset

Para quem tem código existente que usa `map[T]bool` ou `map[T]struct{}` e não pode mudar a API, o pacote `container/mapset` oferece funções helper com a mesma semântica das operações de `container/set.Set`:

```go
import "container/mapset"

a := map[string]struct{}{"go": {}, "rust": {}}
b := map[string]struct{}{"go": {}, "python": {}}

union := mapset.Union(a, b)
inter := mapset.Intersection(a, b)
```

Facilita a migração incremental.

---

## Interfaces abstratas de coleção

A proposta define internamente interfaces genéricas (`_AbstractCollection`, `_AbstractMap`, `_AbstractSet`) que garantem consistência entre os tipos, mas não as exporta ainda. O plano é acumular experiência com os tipos concretos primeiro.

Isso permite escrever funções genéricas que funcionam com qualquer implementação de Set:

```go
// exemplo interno da proposta
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

O F-bounded polymorphism (constraints que referenciam a própria interface) resolve o "binary method problem": o método `Union(S) S` de dois tipos de Set distintos seria incompatível numa interface comum convencional, mas com esse padrão funciona.

---

## Status e timeline

A proposta foi aberta em setembro de 2026 com milestone Go 1.28. Alguns pacotes já têm CLs associados em revisão. O `container/set.Set` tem o CL 745441, `container/hash.Map` tem o CL 612217, e o `container/hash.Set` tem o CL 741160.

A expectativa é que pelo menos `container/set` e `container/heap/v2` cheguem no Go 1.28. Os demais dependem do andamento das revisões.

---

## O que muda no dia a dia

Para a maioria dos casos o impacto mais imediato vai ser `container/set.Set`. Hoje, sets em Go são `map[string]struct{}` com `_, ok := m[k]` para verificar presença. Com `container/set`:

```go
// antes
langs := map[string]struct{}{"go": {}, "rust": {}}
_, temGo := langs["go"]

// depois
langs := set.Of("go", "rust")
temGo := langs.Contains("go")
```

Mais legível, com operações de conjunto que hoje exigem loops manuais e código propenso a bugs.

O `container/ordered.Map` vai ser útil em casos específicos onde range queries importam. O heap genérico elimina um dos boilerplates mais chatos da stdlib.

---

Você já sentiu falta de alguma dessas estruturas em Go? Me conta nos comentários.

Até o próximo post!

**Referências:**
- [proposal: container/...: generic collection types #80590](https://github.com/golang/go/issues/80590)
- [container/set.Set proposal #69230](https://github.com/golang/go/issues/69230)
- [container/ordered.Map proposal #60630](https://github.com/golang/go/issues/60630)
- [container/heap/v2 proposal #77397](https://github.com/golang/go/issues/77397)
