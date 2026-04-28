---
layout: post
title: "Vetores, distância e busca semântica em Go"
subtitle: "Como transformar palavras em números, medir similaridade com cosseno e construir um motor de busca semântica do zero"
author: otavio_celestino
date: 2026-05-28 08:00:00 -0300
categories: [Go, IA, LLM]
tags: [go, golang, llm, word2vec, embeddings, cosine-similarity, semantic-search, nlp]
comments: true
image: "/assets/img/posts/2026-05-28-llm-do-zero-vetores-busca-semantica.png"
lang: pt-BR
series: "LLM do Zero em Go"
series_order: 2
---

E aí, pessoal!

Na semana passada, aprendemos que computadores não leem palavras. Eles leem tokens, e tokens são IDs numéricos. O BPE pega um texto e devolve uma sequência de inteiros. Isso resolve o problema de representação discreta: qualquer texto vira números.

Mas há um problema. O ID 42 não é "mais próximo" do ID 43 do que do ID 1000. São números inteiros sem nenhuma relação geométrica entre si. Se "rei" tem ID 42 e "rainha" tem ID 43, isso não diz nada sobre a relação entre essas palavras. O modelo não consegue inferir que rei e rainha pertencem ao mesmo domínio semântico só porque os IDs estão próximos.

Precisamos de geometria. Precisamos de vetores.

Este post cobre os vídeos 05 ao 07 da série LLM do Zero. O código completo está em [github.com/otavi/llm-do-zero](https://github.com/otavi/llm-do-zero).

---

## O que são word embeddings

Um embedding é uma função que mapeia um token discreto para um ponto num espaço vetorial contínuo de dimensão fixa.

Em termos práticos: em vez de representar "rei" como o inteiro 42, representamos como um vetor de 256 floats, por exemplo `[0.31, -0.17, 0.82, ...]`. Esse vetor vive num espaço de alta dimensão onde a posição carrega significado.

O Word2Vec, publicado por Mikolov et al. em 2013, foi o trabalho que tornou isso amplamente conhecido. Eles treinaram uma rede neural rasa num corpus enorme e mostraram que os vetores resultantes capturavam relações semânticas de forma surpreendente:

```
vetor("rei") - vetor("homem") + vetor("mulher") ≈ vetor("rainha")
```

Isso não foi programado explicitamente. Emergiu do treinamento. O modelo aprendeu que "rei" e "rainha" se relacionam da mesma forma que "homem" e "mulher" porque essas palavras aparecem em contextos similares no corpus.

No nosso projeto, a tabela de embeddings é uma matriz onde cada linha é o vetor de um token:

```go
// Tabela de embeddings de tokens no nosso projeto
// internal/model/embedding.go
type Embedding struct {
    Token    *tensor.Tensor  // shape: (VocabSize, EmbedDim)
    Position *tensor.Tensor  // shape: (ContextLen, EmbedDim)
}
```

A matriz `Token` tem uma linha por token do vocabulário. Dado um ID de token, a linha correspondente É o embedding daquele token. Se o vocabulário tem 8192 tokens e a dimensão de embedding é 256, a matriz `Token` tem shape `(8192, 256)` e ocupa 8192 * 256 * 8 bytes = 16 MB em float64.

O `tensor.Tensor` que usamos no projeto armazena os dados em um slice flat de float64, com acesso por linha e coluna:

```go
// internal/tensor/tensor.go
type Tensor struct {
    Data []float64
    Grad []float64
    Rows int
    Cols int
}

func (t *Tensor) Row(i int) []float64 {
    return t.Data[i*t.Cols : (i+1)*t.Cols]
}
```

Buscar o embedding de um token é só chamar `embeddingTable.Row(tokenID)`. O resultado é um slice que aponta diretamente para os dados internos do tensor, sem cópia.

---

## Distância cosseno

Agora que temos vetores, precisamos medir o quão similares dois vetores são.

A primeira ideia seria usar distância euclidiana: a distância geométrica normal entre dois pontos num espaço. O problema é que a distância euclidiana confunde magnitude com direção. Se um vetor for simplesmente o dobro de outro (mesmo significado semântico, escala diferente), a distância euclidiana vai indicar que são diferentes.

A similaridade por cosseno resolve isso. Ela mede o ângulo entre dois vetores, independente do comprimento de cada um:

```
cos(θ) = (A · B) / (|A| × |B|)
```

Onde `A · B` é o produto escalar e `|A|`, `|B|` são as normas euclidianas.

O resultado está no intervalo [-1, 1]:
- 1: vetores apontam na mesma direção (semanticamente idênticos)
- 0: vetores são ortogonais (semanticamente não relacionados)
- -1: vetores apontam em direções opostas (semanticamente opostos)

A implementação em Go:

```go
package tensor

import "math"

func CosineSimilarity(a, b []float64) float64 {
    var dot, normA, normB float64
    for i := range a {
        dot += a[i] * b[i]
        normA += a[i] * a[i]
        normB += b[i] * b[i]
    }
    if normA == 0 || normB == 0 {
        return 0
    }
    return dot / (math.Sqrt(normA) * math.Sqrt(normB))
}
```

O loop computa as três quantidades necessárias numa única passagem pelo vetor. Isso é importante: se os vetores tiverem 512 dimensões e você tiver um vocabulário de 50 mil tokens, cada busca vai executar esse loop 50 mil vezes. Uma passagem é melhor que três.

Por que verificar se a norma é zero? Um vetor de zeros tem norma zero, e dividir por zero é indefinido. Na prática, vetores de embedding raramente são zero depois do treinamento, mas na inicialização aleatória pode acontecer de um componente ser suficientemente pequeno que a norma seja zero em ponto flutuante. A checagem evita NaN.

---

## Construindo um motor de busca semântica

Com cosine similarity em mãos, podemos construir um motor de busca semântica. A ideia é simples: dado um vetor de query, encontrar os K tokens cujos vetores são mais próximos da query.

Primeiro, as estruturas de dados:

```go
package search

import (
    "sort"

    "github.com/otavi/llm-do-zero/internal/tensor"
)

type Result struct {
    Word  string
    Score float64
}

type SemanticSearch struct {
    vocab      []string
    embeddings *tensor.Tensor // shape: (VocabSize, EmbedDim)
}

func New(vocab []string, embeddings *tensor.Tensor) *SemanticSearch {
    return &SemanticSearch{
        vocab:      vocab,
        embeddings: embeddings,
    }
}
```

A função de busca itera pelo vocabulário inteiro, computa a similaridade de cada token com a query, ordena e retorna os top-K:

```go
func (s *SemanticSearch) Search(queryVec []float64, topK int) []Result {
    type scored struct {
        word  string
        score float64
    }
    results := make([]scored, len(s.vocab))
    for i, word := range s.vocab {
        vec := s.embeddings.Row(i)
        results[i] = scored{word, tensor.CosineSimilarity(queryVec, vec)}
    }
    sort.Slice(results, func(i, j int) bool {
        return results[i].score > results[j].score
    })
    out := make([]Result, min(topK, len(results)))
    for i := range out {
        out[i] = Result{Word: results[i].word, Score: results[i].score}
    }
    return out
}
```

Para usar o motor de busca com embeddings aleatórios (para demonstração):

```go
package main

import (
    "fmt"

    "github.com/otavi/llm-do-zero/internal/search"
    "github.com/otavi/llm-do-zero/internal/tensor"
)

func main() {
    vocab := []string{
        "rei", "rainha", "homem", "mulher", "principe", "princesa",
        "cachorro", "gato", "animal", "computador", "teclado", "monitor",
    }
    vocabSize := len(vocab)
    embedDim := 8

    // Em producao, esses embeddings viriam de um modelo treinado.
    // Aqui inicializamos com valores aleatorios para demonstrar a estrutura.
    embeddings := tensor.New(vocabSize, embedDim)
    embeddings.RandNormal(0, 1)

    engine := search.New(vocab, embeddings)

    // Buscar tokens similares ao vetor do token "rei" (indice 0)
    queryVec := embeddings.Row(0)
    results := engine.Search(queryVec, 5)

    fmt.Println("Tokens mais similares a 'rei':")
    for _, r := range results {
        fmt.Printf("  %-12s  score: %.4f\n", r.Word, r.Score)
    }
}
```

Com embeddings aleatórios a saída não terá significado semântico (o token mais similar a "rei" pode ser "teclado"). Com embeddings treinados, os resultados passam a refletir a estrutura do corpus.

Esse motor de busca tem complexidade O(N * D) onde N é o tamanho do vocabulário e D é a dimensão do embedding. Para vocabulários grandes (50k+ tokens) e dimensões altas (768+), isso fica lento. Em produção usam-se índices aproximados como HNSW ou Flat com FAISS. Para a nossa série, busca linear é suficiente.

---

## Por que vetores treinados funcionam

O que faz com que vetores de embedding capturem significado semântico?

A resposta está na **hipótese distribucional**, formulada pelo linguista J.R. Firth em 1957: "You shall know a word by the company it keeps." Em português: você conhece uma palavra pelas palavras que a acompanham.

A intuição é que palavras que aparecem em contextos similares têm significados similares. "Médico" e "doutor" aparecem com frequência nas mesmas frases (paciente, hospital, diagnóstico, receita). "Rei" e "rainha" aparecem com (monarca, coroa, palácio, trono). O modelo aprende isso estatisticamente.

O Word2Vec operacionaliza essa hipótese de duas formas:

**Skip-gram**: dado uma palavra, prever as palavras ao redor. A rede neural aprende vetores que maximizam a probabilidade das palavras de contexto.

**CBOW (Continuous Bag of Words)**: dado o contexto, prever a palavra central. Inverso do skip-gram.

Em ambos os casos, o treinamento força palavras com contextos similares a terem vetores próximos no espaço de embedding.

No nosso LLM, a tabela de embedding não é pré-treinada com Word2Vec. Ela é inicializada aleatoriamente e treinada junto com o resto do modelo via backpropagation. O `tensor.Tensor` do nosso projeto tem um campo `Grad` para isso:

```go
type Tensor struct {
    Data []float64
    Grad []float64  // gradientes acumulados durante o backward pass
    Rows int
    Cols int
}
```

Durante o treinamento, o gradiente flui até a tabela de embedding e ajusta os vetores de cada token que apareceu na sequência de entrada. Com bilhões de atualizações ao longo de um corpus grande, os vetores absorvem a estrutura estatística do texto.

---

## Analogias vetoriais

A relação mais famosa dos embeddings é a aritmética vetorial. O exemplo clássico:

```
vetor("rei") - vetor("homem") + vetor("mulher") ≈ vetor("rainha")
```

Leia isso como: pegue o vetor de "rei", subtraia o conceito de "homem", adicione o conceito de "mulher". O resultado deve ser aproximadamente o vetor de "rainha".

Isso funciona porque o espaço de embedding aprende a codificar relações como deslocamentos vetoriais consistentes. A diferença entre "rei" e "rainha" no espaço vetorial é aproximadamente a mesma que a diferença entre "ator" e "atriz", ou "pai" e "mae".

As operações vetoriais em Go:

```go
func VectorAdd(a, b []float64) []float64 {
    result := make([]float64, len(a))
    for i := range a {
        result[i] = a[i] + b[i]
    }
    return result
}

func VectorSub(a, b []float64) []float64 {
    result := make([]float64, len(a))
    for i := range a {
        result[i] = a[i] - b[i]
    }
    return result
}
```

Para encontrar "rainha" a partir de "rei", "homem" e "mulher":

```go
// Assumindo que temos os indices no vocabulario
reiVec    := embeddings.Row(idxRei)
homemVec  := embeddings.Row(idxHomem)
mulherVec := embeddings.Row(idxMulher)

// rei - homem + mulher
queryVec := VectorAdd(VectorSub(reiVec, homemVec), mulherVec)

// Buscar o token mais proximo do resultado
results := engine.Search(queryVec, 5)
// O primeiro resultado deve ser "rainha" (excluindo os tokens usados na query)
```

Importante: isso funciona bem em embeddings treinados num corpus grande. Com embeddings aleatórios ou num corpus pequeno, a aritmética vetorial não vai produzir resultados significativos.

Outras analogias que funcionam em embeddings bem treinados:

```
Paris - França + Itália ≈ Roma          (capitais)
correndo - correr + nadar ≈ nadando     (conjugação verbal)
maior - grande + pequeno ≈ menor        (antônimos)
```

A precisão dessas analogias é usada como benchmark para avaliar a qualidade de embeddings. O dataset Google Analogies tem 19.544 pares de teste.

---

## Embeddings no nosso projeto

No nosso LLM, há dois tipos de embedding: token e posição.

O **token embedding** mapeia IDs de tokens para vetores, como vimos acima.

O **position embedding** mapeia a posição de um token na sequência para um vetor. Por que isso é necessário? Porque a operação de atenção (que veremos nos próximos posts) é invariante à posição por padrão. Sem position embeddings, "o gato caçou o rato" e "o rato caçou o gato" produziriam as mesmas representações intermediárias.

O forward pass da camada de embedding soma os dois:

```go
// internal/model/embedding.go

// Forward computa a soma de token embedding + position embedding
// para uma sequencia de token IDs.
func (e *Embedding) Forward(tokenIDs []int) *tensor.Tensor {
    seqLen := len(tokenIDs)
    embedDim := e.Token.Cols

    out := tensor.New(seqLen, embedDim)
    for pos, id := range tokenIDs {
        tokRow := e.Token.Row(id)
        posRow := e.Position.Row(pos)
        outRow := out.Row(pos)
        for d := 0; d < embedDim; d++ {
            outRow[d] = tokRow[d] + posRow[d]
        }
    }
    return out
}
```

A saída tem shape `(seqLen, embedDim)` e é o que alimenta o resto do modelo. Cada linha é a representação do token naquela posição, combinando identidade semântica (token embedding) e informação posicional (position embedding).

Depois desse passo, o `tensor.MatMul` do projeto entra em cena para as transformações lineares nas camadas seguintes:

```go
// MatMul computa C = A x B, paralelizado sobre as linhas de A
func MatMul(a, b *Tensor) *Tensor {
    c := New(a.Rows, b.Cols)
    numWorkers := runtime.NumCPU()
    if numWorkers > a.Rows {
        numWorkers = a.Rows
    }
    var wg sync.WaitGroup
    rowsPerWorker := (a.Rows + numWorkers - 1) / numWorkers
    for w := 0; w < numWorkers; w++ {
        start := w * rowsPerWorker
        end := start + rowsPerWorker
        if end > a.Rows {
            end = a.Rows
        }
        wg.Add(1)
        go func(start, end int) {
            defer wg.Done()
            for i := start; i < end; i++ {
                for k := 0; k < a.Cols; k++ {
                    aik := a.Data[i*a.Cols+k]
                    for j := 0; j < b.Cols; j++ {
                        c.Data[i*c.Cols+j] += aik * b.Data[k*b.Cols+j]
                    }
                }
            }
        }(start, end)
    }
    wg.Wait()
    return c
}
```

O loop interno usa o padrão `i-k-j` em vez do mais intuitivo `i-j-k`. A diferença é cache locality: no padrão `i-k-j`, `b.Data[k*b.Cols+j]` percorre memória de forma sequencial no loop mais interno, resultando em muito menos cache misses. Em matrizes grandes (256x256 ou maior) isso faz diferença mensurável no tempo de execução.

---

## Por que a inicialização aleatória funciona

Vale explicar por que podemos inicializar os embeddings aleatoriamente e esperar que o treinamento produza algo útil.

No início, os vetores são ruído gaussiano: `RandNormal(0, 1)`. A loss vai ser alta, os gradientes vão ser grandes, e as atualizações vão começar a empurrar os vetores em direções que reduzem a loss.

A cada passo de treinamento, os tokens que apareceram na sequência de entrada recebem atualizações de gradiente. Tokens que aparecem em contextos similares recebem gradientes similares. Com iterações suficientes no corpus, os vetores convergem para uma configuração onde a geometria reflete a estrutura estatística do texto.

Isso não requer nenhuma supervisão explícita sobre significado. O sinal de treinamento é simplesmente: "preveja o próximo token corretamente." A estrutura semântica emerge como consequência.

---

## O que vem a seguir

Agora temos dois componentes sólidos: um tokenizador BPE que converte texto em IDs, e uma camada de embedding que converte IDs em vetores.

No próximo post da série vamos implementar o modelo de Markov como o modelo de linguagem mais simples possível. Antes de entrar em redes neurais, o modelo de Markov vai mostrar claramente o que significa "prever o próximo token dada uma janela de contexto", e por que essa abordagem simples tem limitações que motivam as redes neurais.

---

## Referências

- [Word2Vec: Efficient Estimation of Word Representations in Vector Space - Mikolov et al. 2013](https://arxiv.org/abs/1301.3781)
- [GloVe: Global Vectors for Word Representation - Pennington et al. 2014](https://nlp.stanford.edu/pubs/glove.pdf)
- [fastText: Enriching Word Vectors with Subword Information - Bojanowski et al. 2017](https://arxiv.org/abs/1607.04606)
- [Distributed Representations of Words and Phrases - Mikolov et al. 2013](https://arxiv.org/abs/1310.4546)
- [A Probabilistic Theory of Pattern Recognition - Devroye, Gyorfi, Lugosi (hipotese distribucional)](https://link.springer.com/book/10.1007/978-1-4612-0711-5)
- [The Distributional Hypothesis - Sahlgren 2008](https://www.diva-portal.org/smash/get/diva2:1041938/FULLTEXT01.pdf)
- [Google Analogies Dataset (word2vec evaluation)](https://code.google.com/archive/p/word2vec/)
- [math package em Go](https://pkg.go.dev/math)
- [sort package em Go](https://pkg.go.dev/sort)
- [The Illustrated Word2Vec - Jay Alammar](https://jalammar.github.io/illustrated-word2vec/)
