---
layout: post
title: "Vectors, distance and semantic search in Go"
subtitle: "How to turn words into numbers, measure similarity with cosine distance, and build a semantic search engine from scratch"
author: otavio_celestino
date: 2026-05-28 08:00:00 -0300
categories: [Go, AI, LLM]
tags: [go, golang, llm, word2vec, embeddings, cosine-similarity, semantic-search, nlp]
comments: true
image: "/assets/img/posts/2026-05-28-llm-do-zero-vectors-semantic-search.png"
lang: en
original_post: "/llm-do-zero-vetores-busca-semantica/"
series: "LLM from Scratch in Go"
series_order: 2
---

Hey everyone!

Last week we learned that computers do not read words. They read tokens, and tokens are numeric IDs. BPE takes a text and returns a sequence of integers. That solves the discrete representation problem: any text becomes numbers.

But there is a problem. ID 42 is not "closer to" ID 43 than to ID 1000. These are plain integers with no geometric relationship between them. If "king" has ID 42 and "queen" has ID 43, that tells you nothing about the relationship between those words. The model cannot infer that king and queen belong to the same semantic domain just because their IDs are adjacent.

We need geometry. We need vectors.

This post covers videos 05 through 07 of the LLM from Scratch series. The full code is at [github.com/otavi/llm-do-zero](https://github.com/otavi/llm-do-zero).

---

## What word embeddings are

An embedding is a function that maps a discrete token to a point in a continuous vector space of fixed dimension.

In practical terms: instead of representing "king" as the integer 42, we represent it as a vector of 256 floats, for example `[0.31, -0.17, 0.82, ...]`. That vector lives in a high-dimensional space where position carries meaning.

Word2Vec, published by Mikolov et al. in 2013, was the work that made this widely known. They trained a shallow neural network on a large corpus and showed that the resulting vectors captured semantic relationships in a striking way:

```
vector("king") - vector("man") + vector("woman") ≈ vector("queen")
```

This was not programmed explicitly. It emerged from training. The model learned that "king" and "queen" relate the same way "man" and "woman" do, because those words appear in similar contexts in the corpus.

In our project, the embedding table is a matrix where each row is the vector for one token:

```go
// Token embedding table in our project
// internal/model/embedding.go
type Embedding struct {
    Token    *tensor.Tensor  // shape: (VocabSize, EmbedDim)
    Position *tensor.Tensor  // shape: (ContextLen, EmbedDim)
}
```

The `Token` matrix has one row per token in the vocabulary. Given a token ID, the corresponding row IS the embedding of that token. If the vocabulary has 8192 tokens and the embedding dimension is 256, the `Token` matrix has shape `(8192, 256)` and occupies 8192 * 256 * 8 bytes = 16 MB in float64.

The `tensor.Tensor` we use in the project stores data in a flat float64 slice, with row and column access:

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

Fetching the embedding for a token is a single call to `embeddingTable.Row(tokenID)`. The result is a slice pointing directly into the tensor's internal data, with no copy.

---

## Cosine distance

Now that we have vectors, we need to measure how similar two vectors are.

The first idea would be Euclidean distance: the standard geometric distance between two points in a space. The problem is that Euclidean distance conflates magnitude with direction. If one vector is simply twice another (same semantic meaning, different scale), Euclidean distance reports them as different.

Cosine similarity solves this. It measures the angle between two vectors, regardless of their length:

```
cos(θ) = (A · B) / (|A| × |B|)
```

Where `A · B` is the dot product and `|A|`, `|B|` are the Euclidean norms.

The result falls in the range [-1, 1]:
- 1: vectors point in the same direction (semantically identical)
- 0: vectors are orthogonal (semantically unrelated)
- -1: vectors point in opposite directions (semantically opposite)

The implementation in Go:

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

The loop computes all three required quantities in a single pass over the vector. This matters: if vectors have 512 dimensions and you have a vocabulary of 50,000 tokens, each search runs this loop 50,000 times. One pass beats three.

Why check if the norm is zero? A vector of zeros has norm zero, and dividing by zero is undefined. In practice, embedding vectors are rarely zero after training, but during random initialization a component can be small enough that the norm becomes zero in floating-point. The check prevents NaN.

---

## Building a semantic search engine

With cosine similarity in hand, we can build a semantic search engine. The idea is straightforward: given a query vector, find the K tokens whose vectors are closest to the query.

First, the data structures:

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

The search function iterates over the entire vocabulary, computes the similarity of each token with the query, sorts, and returns the top-K:

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

To use the search engine with random embeddings (for demonstration):

```go
package main

import (
    "fmt"

    "github.com/otavi/llm-do-zero/internal/search"
    "github.com/otavi/llm-do-zero/internal/tensor"
)

func main() {
    vocab := []string{
        "king", "queen", "man", "woman", "prince", "princess",
        "dog", "cat", "animal", "computer", "keyboard", "monitor",
    }
    vocabSize := len(vocab)
    embedDim := 8

    // In production, these embeddings come from a trained model.
    // Here we initialize with random values to demonstrate the structure.
    embeddings := tensor.New(vocabSize, embedDim)
    embeddings.RandNormal(0, 1)

    engine := search.New(vocab, embeddings)

    // Search for tokens similar to the vector of "king" (index 0)
    queryVec := embeddings.Row(0)
    results := engine.Search(queryVec, 5)

    fmt.Println("Tokens most similar to 'king':")
    for _, r := range results {
        fmt.Printf("  %-12s  score: %.4f\n", r.Word, r.Score)
    }
}
```

With random embeddings, the output has no semantic meaning (the token most similar to "king" might be "keyboard"). With trained embeddings, the results reflect the structure of the corpus.

This search engine has O(N * D) complexity where N is vocabulary size and D is embedding dimension. For large vocabularies (50k+ tokens) and high dimensions (768+), this gets slow. In production, approximate indexes like HNSW or FAISS flat indexes are used. For our series, linear search is sufficient.

---

## Why trained vectors work

What makes embedding vectors capture semantic meaning?

The answer lies in the **distributional hypothesis**, formulated by linguist J.R. Firth in 1957: "You shall know a word by the company it keeps."

The intuition is that words appearing in similar contexts have similar meanings. "Doctor" and "physician" frequently appear in the same kinds of sentences (patient, hospital, diagnosis, prescription). "King" and "queen" appear with (monarch, crown, palace, throne). The model learns this statistically.

Word2Vec operationalizes this hypothesis in two ways:

**Skip-gram**: given a word, predict the surrounding words. The neural network learns vectors that maximize the probability of the context words.

**CBOW (Continuous Bag of Words)**: given the context, predict the center word. The inverse of skip-gram.

In both cases, training forces words with similar contexts to have nearby vectors in the embedding space.

In our LLM, the embedding table is not pre-trained with Word2Vec. It is randomly initialized and trained alongside the rest of the model through backpropagation. The `tensor.Tensor` in our project has a `Grad` field for exactly this:

```go
type Tensor struct {
    Data []float64
    Grad []float64  // gradients accumulated during the backward pass
    Rows int
    Cols int
}
```

During training, gradients flow back to the embedding table and adjust the vectors of each token that appeared in the input sequence. With billions of updates over a large corpus, the vectors absorb the statistical structure of the text.

---

## Vector analogies

The most famous property of embeddings is vector arithmetic. The classic example:

```
vector("king") - vector("man") + vector("woman") ≈ vector("queen")
```

Read this as: take the vector for "king", subtract the concept of "man", add the concept of "woman". The result should be approximately the vector for "queen".

This works because the embedding space learns to encode relationships as consistent vector offsets. The difference between "king" and "queen" in vector space is approximately the same as the difference between "actor" and "actress", or "father" and "mother".

The vector operations in Go:

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

To find "queen" from "king", "man", and "woman":

```go
// Assuming we have the indices in the vocabulary
kingVec   := embeddings.Row(idxKing)
manVec    := embeddings.Row(idxMan)
womanVec  := embeddings.Row(idxWoman)

// king - man + woman
queryVec := VectorAdd(VectorSub(kingVec, manVec), womanVec)

// Search for the token closest to the result
results := engine.Search(queryVec, 5)
// The first result should be "queen" (excluding the tokens used in the query)
```

To be clear: this works well in embeddings trained on a large corpus. With random embeddings or a small corpus, vector arithmetic produces meaningless results.

Other analogies that work in well-trained embeddings:

```
Paris - France + Italy ≈ Rome           (capitals)
running - run + swim ≈ swimming         (verb conjugation)
bigger - big + small ≈ smaller          (antonyms)
```

The accuracy of these analogies is used as a benchmark to evaluate embedding quality. The Google Analogies dataset has 19,544 test pairs.

---

## Embeddings in our project

In our LLM, there are two types of embeddings: token and position.

The **token embedding** maps token IDs to vectors, as we saw above.

The **position embedding** maps a token's position in the sequence to a vector. Why is this necessary? Because the attention operation (which we will cover in future posts) is position-invariant by default. Without position embeddings, "the cat chased the mouse" and "the mouse chased the cat" would produce the same intermediate representations.

The forward pass of the embedding layer sums the two:

```go
// internal/model/embedding.go

// Forward computes the sum of token embedding + position embedding
// for a sequence of token IDs.
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

The output has shape `(seqLen, embedDim)` and feeds the rest of the model. Each row is the representation of a token at that position, combining semantic identity (token embedding) and positional information (position embedding).

After this step, the project's `tensor.MatMul` handles the linear transformations in subsequent layers:

```go
// MatMul computes C = A x B, parallelized over rows of A
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

The inner loop uses the `i-k-j` pattern instead of the more intuitive `i-j-k`. The difference is cache locality: in the `i-k-j` pattern, `b.Data[k*b.Cols+j]` traverses memory sequentially in the innermost loop, resulting in far fewer cache misses. On large matrices (256x256 or bigger) this produces a measurable difference in execution time.

---

## Why random initialization works

It is worth explaining why we can initialize embeddings randomly and expect training to produce something useful.

At the start, vectors are Gaussian noise: `RandNormal(0, 1)`. Loss will be high, gradients will be large, and updates will start pushing vectors in directions that reduce loss.

At each training step, tokens that appeared in the input sequence receive gradient updates. Tokens appearing in similar contexts receive similar gradients. With enough iterations over the corpus, vectors converge to a configuration where the geometry reflects the statistical structure of the text.

This requires no explicit supervision over meaning. The training signal is simply: "predict the next token correctly." Semantic structure emerges as a consequence.

---

## What comes next

We now have two solid components: a BPE tokenizer that converts text into IDs, and an embedding layer that converts IDs into vectors.

In the next post in the series we will implement the Markov chain model as the simplest possible language model. Before getting into neural networks, the Markov model will clearly show what it means to "predict the next token given a context window", and why this simple approach has limitations that motivate neural networks.

---

## References

- [Word2Vec: Efficient Estimation of Word Representations in Vector Space - Mikolov et al. 2013](https://arxiv.org/abs/1301.3781)
- [GloVe: Global Vectors for Word Representation - Pennington et al. 2014](https://nlp.stanford.edu/pubs/glove.pdf)
- [fastText: Enriching Word Vectors with Subword Information - Bojanowski et al. 2017](https://arxiv.org/abs/1607.04606)
- [Distributed Representations of Words and Phrases - Mikolov et al. 2013](https://arxiv.org/abs/1310.4546)
- [The Distributional Hypothesis - Sahlgren 2008](https://www.diva-portal.org/smash/get/diva2:1041938/FULLTEXT01.pdf)
- [Google Analogies Dataset (word2vec evaluation)](https://code.google.com/archive/p/word2vec/)
- [math package in Go](https://pkg.go.dev/math)
- [sort package in Go](https://pkg.go.dev/sort)
- [The Illustrated Word2Vec - Jay Alammar](https://jalammar.github.io/illustrated-word2vec/)
