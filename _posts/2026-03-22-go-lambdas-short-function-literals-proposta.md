---
layout: post
title: "Go e lambdas: oito anos de discussão na issue #21498"
subtitle: "Short function literals, verbosidade de callbacks e por que a comunidade ainda debate sintaxe leve para funções anônimas"
author: otavio_celestino
date: 2026-03-23 08:00:00 -0300
categories: [Go, Linguagem, Comunidade]
tags: [go, golang, lambda, function-literal, proposal, golang-issue-21498, syntax, generics]
comments: true
image: "/assets/img/posts/2026-03-22-go-lambdas-short-function-literals-proposta.png"
lang: pt-BR
---

E aí, pessoal!

Em agosto de 2017, o [@neild](https://github.com/neild) abriu uma proposta no repositório oficial do Go com um título simples: [**proposal: spec: short function literals**](https://github.com/golang/go/issues/21498). A ideia é permitir uma forma mais curta de função anônima quando o compilador já consegue inferir os tipos pelo contexto.

Quase uma década depois, essa discussão segue viva. A issue acumulou um volume gigante de comentários, passou por revisão do comitê de mudanças de linguagem, gerou várias propostas de sintaxe, e ainda não fechou em um formato final.

Não é difícil entender por que o assunto não morre:

- Go usa callbacks o tempo todo
- generics aumentou o uso de funções de ordem superior
- literais `func(...)` ficaram mais frequentes em código de produção
- e muita gente sente que repete tipo demais sem ganho real de legibilidade

---

## Antes de tudo: Go já tem "lambdas"

Sim, Go já tem função anônima:

```go
sum := func(a, b int) int { return a + b }
fmt.Println(sum(1, 2))
```

Então quando alguém diz "Go vai ganhar lambdas", na prática está falando de outra coisa:

- não é criar conceito novo de função anônima
- é adicionar sintax para casos em que o tipo já é conhecido
- principalmente quando uma API já espera um callback com assinatura fixa

Esse ponto é importante porque evita dois extremos:

- "isso muda tudo" (não muda)
- "isso não muda nada" (muda ergonomia em pontos bem comuns)

---

## O problema que a #21498 tenta resolver de verdade

Hoje, quando você passa uma função anônima para algo que **já sabe** a assinatura, você ainda precisa escrever tipos explícitos na maioria dos casos:

```go
sort.Slice(people, func(i, j int) bool {
	return people[i].Age < people[j].Age
})
```

Os tipos de `i` e `j` já estão implícitos na assinatura esperada por `sort.Slice`. Ainda assim você precisa declarar `int` e `bool` de novo.

Em APIs pequenas isso quase não incomoda. O problema aparece quando o projeto cresce e você tem:

- sort custom em muitos lugares
- pipelines de transformação
- middleware de HTTP/gRPC
- wrappers de infra
- funções utilitárias genéricas

A proposta não fixa uma sintaxe definitiva. Ela descreve uma forma de literal de função cuja tipagem viria do contexto. Em termos da issue, seria algo sem tipo default, parecido com casos como `nil` sem contexto.

Na própria discussão aparecem exemplos clássicos:

- callbacks em estilo RPC (ex.: popular um request em uma chamada)
- `errgroup.Group.Go(func() error { ... })`, onde a assinatura `func() error` é óbvia

Aqui está o ponto-chave: o target type já existe, o compilador já conhece, mas o código exige repetição sintática.

---

## Por que esse tema voltou forte agora

Essa discussão começou em 2017, mas ganhou mais peso com a evolução do ecossistema:

1. **Generics em Go**  
   Hoje é mais comum criar funções utilitárias parametrizadas que recebem callbacks.

2. **Bibliotecas mais declarativas**  
   Em vez de tudo ser loop manual, vemos mais APIs no estilo "passe uma função".

3. **Código de plataforma e infraestrutura**  
   Times grandes usam mais wrappers para retries, tracing, telemetry, validação e política de erro.

4. **Leitura de código em escala**  
   Em bases enormes, pequenas fricções repetidas viram custo real de manutenção.

---

## Exemplos práticos onde a verbosidade pesa

### 1) Sorting e ranking com regras de negócio

```go
sort.Slice(users, func(i, j int) bool {
	if users[i].Score == users[j].Score {
		return users[i].CreatedAt.Before(users[j].CreatedAt)
	}
	return users[i].Score > users[j].Score
})
```

É legível, funciona, e todo mundo entende. Mas repete tipo e assinatura mesmo quando a API já define isso.

### 2) Concurrency com `errgroup`

```go
g, ctx := errgroup.WithContext(ctx)

for _, id := range ids {
	id := id
	g.Go(func() error {
		return svc.Process(ctx, id)
	})
}

if err := g.Wait(); err != nil {
	return err
}
```

Nesse caso a assinatura `func() error` fica se repetindo no projeto inteiro.

### 3) Funções genéricas de transformação

```go
func Map[T any, R any](in []T, fn func(T) R) []R {
	out := make([]R, 0, len(in))
	for _, v := range in {
		out = append(out, fn(v))
	}
	return out
}

names := Map(users, func(u User) string {
	return u.Name
})
```

Com APIs assim, o padrão `func(x T) R` aparece o tempo todo.

Nada disso quebra o desenvolvimento. A discussão é se dá para deixar esse trecho mais enxuto **sem sacrificar clareza**.

---

## O debate real: ergonomia vs simplicidade da linguagem

Esse não é um debate "progresso vs conservadorismo". Os dois lados têm argumentos válidos.

### Argumentos de quem apoia short literals

- reduz repetição de tipos já inferíveis
- deixa callbacks curtos mais legíveis
- melhora ergonomia para APIs modernas com funções como parâmetro
- aproxima Go de uma experiência comum em outras linguagens sem mudar o modelo de execução

### Argumentos de quem critica

- adiciona nova gramática e aumenta complexidade mental
- pode criar mais de um "jeito correto" de escrever a mesma coisa
- risco de cair em estilo excessivamente funcional e menos explícito
- mudanças de linguagem em Go carregam custo de tooling, documentação e ensino por muitos anos

O ponto sensível é este: Go sempre preferiu sacrificar "conveniência sintática" para preservar consistência. A pergunta da #21498 é até onde esse limite pode ir sem descaracterizar a linguagem.

---

## O que precisaria estar bem definido para a proposta ser aceita

Se essa mudança entrar algum dia, ela precisa fechar lacunas importantes:

### 1) Regras exatas de inferência

Quando o compilador pode inferir parâmetros e retorno com segurança?  
Quando deve rejeitar por ambiguidade?

### 2) Escopo de uso

A sintaxe curta seria permitida:

- só em argumentos de função?
- também em atribuição para variável de tipo função?
- em retorno de função?

Quanto maior o escopo, maior a chance de casos confusos.

### 3) Interação com `gofmt` e ferramentas

Go vive de tooling consistente. Uma mudança dessas só funciona com:

- formatação inequívoca no `gofmt`
- suporte estável em `gopls`
- mensagens de erro claras no compilador

### 4) Legibilidade em code review

Mesmo que compile, a forma curta precisa melhorar leitura no review de PR, não apenas reduzir caracteres.

---

## Minha leitura da #21498

Esse debate é saudável para o ecossistema. Ele força a comunidade a responder uma pergunta de engenharia, não de torcida:

**o quanto de ergonomia sintática vale adicionar em troca de mais complexidade na linguagem?**

Se a resposta for "sim", precisa ser com uma sintaxe muito cuidadosa e escopo controlado.  
Se a resposta for "não", a discussão ainda foi útil porque deixou mais claro onde a verbosidade atual realmente dói.

De qualquer forma, a issue #21498 já virou um caso clássico de como o Go decide mudanças profundas: aberto, público, lento e com alto padrão de cautela.

---

## Onde acompanhar e o que esperar

- Issue oficial: [golang/go#21498](https://github.com/golang/go/issues/21498) (labels `Proposal`, `LanguageChange`, `Review`)

Se algo for aceito na spec, você vai ver primeiro em:

- proposta aprovada no tracker oficial
- release notes de uma versão concreta
- post técnico no ecossistema oficial do Go

Até lá, trate qualquer manchete de "Go ganhou lambdas" como discussão em andamento, não como feature já disponível.

---

## Conclusão

O tema de lambdas em Go é menos sobre moda e mais sobre design de linguagem sob restrição. A proposta #21498 não discute "adicionar poder" ao runtime, e sim cortar ruído sintático em pontos repetitivos do dia a dia.

Para quem escreve Go, a melhor postura hoje é:

- entender o problema real da proposta
- acompanhar a discussão sem ansiedade
- continuar escrevendo código explícito e consistente

Se você curte esse tipo de assunto, comenta qual lado te convence mais: manter o estilo atual pela simplicidade, ou aceitar uma forma curta para callbacks contextualmente tipados.

## Referências

- [proposal: spec: short function literals · Issue #21498 · golang/go](https://github.com/golang/go/issues/21498)
