---
layout: post
title: "sync.Counter vai entrar no Go 1.28 — e deveríamos ter tido isso anos atrás"
subtitle: "Um contador 100x mais rápido que atomic.Int64, com uma decisão de API que parece errada mas é a correta"
author: otavio_celestino
date: 2026-11-24 08:00:00 -0300
categories: [Go, Performance, Stdlib]
tags: [go, golang, performance, concorrência, atomic, sync, stdlib, go1.28]
comments: true
image: "/assets/img/posts/2026-11-24-go-sync-counter.png"
lang: pt-BR
---

E aí, pessoal!

No começo de novembro de 2026, o time do Go aceitou uma proposta que estava há anos na lista de desejos de quem escreve serviços de alta performance: o `sync.Counter`. Vai entrar no Go 1.28.

A proposta é simples na superfície: um contador genérico que você incrementa de qualquer goroutine, sem precisar se preocupar com contenção. Mas os detalhes de implementação e, especialmente, as escolhas de API são o que tornam essa adição interessante.

## O problema que todo mundo conhece mas ninguém fala

Você tem um serviço em Go. Precisa contar requests processados, bytes enviados, erros por tipo. Você usa um `atomic.Int64`. Funciona.

Funciona até você estar rodando em uma máquina com muitos núcleos e ter centenas de goroutines incrementando o mesmo contador ao mesmo tempo. Daí a coisa desmorona.

O problema é que `atomic.Int64.Add` precisa de exclusão mútua no nível de hardware. Quando uma goroutine executa um `Add`, ela precisa que todas as caches das outras CPUs invalidem aquele endereço de memória, esperem a operação ser confirmada, e depois liberem o barramento. Em baixa concorrência, isso é transparente. Em alta concorrência, você começa a ver os nanosegundos se acumulando: o que era 2ns vira 20ns, depois 200ns.

A solução para isso é conhecida. Você mantém um slice de contadores — um por CPU, ou um por GOMAXPROCS — e cada goroutine incrementa só o seu. Para ler o total, você soma todos. O Prometheus faz isso. O VictoriaMetrics faz isso. Vários projetos internos que você já viu fazem isso. O problema é que cada um faz de um jeito diferente, nenhum se integra com o ecossistema de profiling do Go, e você precisa decidir quantos shards manter.

## O que a proposta resolve

`sync.Counter[T]` resolve tudo isso de forma padronizada:

```go
var requests sync.Counter[int64]

// em qualquer goroutine:
requests.Add(1)

// para ler:
total := requests.Value()
```

A implementação usa shards internos — um por P (por `GOMAXPROCS`) — e cada goroutine incrementa só o shard do P onde está rodando. Sem barramento compartilhado, sem cache misses, sem contention.

Os números da proposta: **~2ns por operação** contra **~200ns de um `atomic.Int64`** sob alta contenção em máquinas com muitos núcleos. Cem vezes mais rápido.

## A decisão de API que parece errada

Aqui é onde fica interessante. `Value()` **não retorna um snapshot consistente**.

Se você chamar `Value()` enquanto outras goroutines estão incrementando o contador, o valor retornado pode ser qualquer soma parcial dos shards naquele momento. Pode ser um valor que nunca existiu ao mesmo tempo em todos os shards. Não há happens-before entre `Add` e `Value`.

Lendo a proposta pela primeira vez, isso parece um bug. Por que você adicionaria um tipo na stdlib com uma semântica tão fraca?

Mas pensa no caso de uso real. Você está contando requests por segundo. Contando bytes enviados por um load balancer. Contando erros num serviço distribuído. Em todos esses casos, o que você quer é uma **estimativa boa** com **custo mínimo** — não uma fotografia exata do universo em um instante específico.

Um `Value()` consistente exigiria que você parasse todos os shards para fazer a leitura, ou usasse um mecanismo de sincronização adicional. Isso aumentaria a latência do `Value()` proporcionalmente ao número de P's. Para métricas, isso não vale a pena: você já aceita que o valor do contador mudou entre quando você leu e quando você exibiu.

A proposta documenta isso explicitamente: *"Value returns an approximate sum of all Adders."* Approximate. Se você precisa de um valor exato e consistente, `atomic.Int64` continua sendo a ferramenta certa.

## Por que demorou tanto

Essa é a parte que me chama atenção. Essa solução não é nova. O padrão de contador shardado por CPU existe em produção em dezenas de projetos Go. Uma das referências na proposta é o pacote `expvar` — que existe no Go desde 2009 e usa uma variante simplificada do mesmo padrão.

Quando a proposta foi aceita, um dos revisores escreveu: *"We wish we had this years ago."*

Por que não teve anos atrás? Parte da resposta é que Go generics só chegaram de verdade no 1.18, e um `Counter[T]` sem generics seria menos ergonômico (você teria que ter `Counter32` e `Counter64` separados, ou usar `interface{}`). Mas a versão não-genérica poderia ter entrado muito antes.

A outra parte da resposta é cultural: o time do Go historicamente preferiu não adicionar à stdlib coisas que você poderia escrever em 20 linhas. O argumento sempre foi que a stdlib deve ser pequena e estável. Mas isso ignora o valor de coordenação: quando algo entra na stdlib, todo o ecossistema converge para uma implementação, as ferramentas de profiling do Go podem instrumentá-la, e você não precisa avaliar qual dos cinco pacotes externos é menos ruim.

`sync.Counter` é um caso onde esperar custou mais do que adicionaria. Quantos bugs de contenção de contadores rodaram em produção enquanto esse padrão ficava fora da stdlib? Quantos desenvolvedores júnior escreveram `atomic.Int64` onde deveriam ter usado algo assim, sem saber que a contention estava lá?

## O que muda na prática

Para a maioria dos projetos Go, `sync.Counter` vai ser um upgrade natural nos casos de uso certos. Regra de bolso:

- **Use `sync.Counter`** quando você está contando eventos em alta frequência e concorrência (requests, bytes, operações), e uma leitura aproximada é suficiente — que é o caso da maioria das métricas internas.
- **Use `atomic.Int64`** quando você precisa de um valor exato com semântica forte de happens-before — como um ID sequencial ou um índice de posição num buffer compartilhado.

O Go 1.28 ainda não tem data definida, mas com a proposta aceita e no milestone, deve chegar em meados de 2027.

Enquanto isso, se você tem contadores com contenção visível no pprof hoje, o pacote [`golang.org/x/sync`](https://pkg.go.dev/golang.org/x/sync) costuma anteceder funcionalidades que entram na stdlib. Ou você pode implementar o padrão manualmente — a ideia principal cabe em 30 linhas.

Mas finalmente ter isso na stdlib vai ser bom. Com um pouco de atraso, mas melhor agora do que nunca.

Abraços!
