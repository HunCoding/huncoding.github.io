---
layout: post
title: "Markov Chain: the first predictive model and its limits"
subtitle: "Generating text with transition probabilities in Go, and understanding why this is not enough for real language"
author: otavio_celestino
date: 2026-06-11 08:00:00 -0300
categories: [Go, AI, LLM]
tags: [go, golang, llm, markov, nlp, text-generation, probability]
comments: true
image: "/assets/img/posts/2026-06-11-llm-do-zero-markov-chain.png"
lang: en
original_post: "/llm-do-zero-cadeia-de-markov/"
series: "LLM from Scratch in Go"
series_order: 3
---

Hey everyone!

This is the third post in the **LLM from Scratch in Go** series. The previous posts covered building a BPE tokenizer from zero (post 1) and implementing word vectors with semantic search (post 2). This post covers videos 08 and 09 of the series.

Before neural networks took over natural language processing, Markov chains were the main tool for text generation. Understanding them is not just historical context: they expose exactly why we need more powerful models. And implementing one in Go takes about 80 lines of code.

---

## What is a Markov Chain

A Markov chain is a probabilistic model where the next state depends only on the current state, not on any earlier history. This is the **Markov property**.

Formally: given the current state `s_t`, the probability of the next state `s_{t+1}` is:

```
P(s_{t+1} | s_t, s_{t-1}, ..., s_1) = P(s_{t+1} | s_t)
```

For text, this means: given a set of recent words, which word is most likely to come next? The model knows nothing about what came before the current window.

### The transition matrix

The core of a Markov chain is the transition table. Each entry represents: "when the current state is X, what is the probability that the next is Y?"

Consider this simplified corpus:

```
the cat ate the fish
the cat slept
the dog ate the bone
```

For an order-1 chain (a single token as state), the partial transition table looks like:

```
Current state | Next      | Count | Probability
--------------+-----------+-------+-------------
"the"         | "cat"     |   2   |    0.40
"the"         | "fish"    |   1   |    0.20
"the"         | "dog"     |   1   |    0.20
"the"         | "bone"    |   1   |    0.20
"cat"         | "ate"     |   1   |    0.50
"cat"         | "slept"   |   1   |    0.50
"ate"         | "the"     |   2   |    1.00
```

To generate text: start at a state, sample the next token according to the probabilities, that token becomes the new state, repeat.

### Order 1 vs. order 2

The **order** of the chain defines how many tokens form the state:

- **Order 1 (unigram)**: the state is a single word. Context is minimal.
- **Order 2 (bigram)**: the state is two consecutive words. Generated text is more locally coherent.
- **Order 3 (trigram)**: the state is three words. Even more coherent, but the state space explodes.

With order 2, the state `("cat", "ate")` leads to different transitions than `("dog", "ate")`. The chain can distinguish contexts that order 1 cannot.

---

## Go implementation

Let us implement a configurable-order Markov chain in plain Go. The structure is straightforward: a map from state (N-token string) to next-token counts.

```go
package main

import (
    "bufio"
    "fmt"
    "math/rand"
    "os"
    "strings"
)

// MarkovChain stores transition probabilities as a map from state to next-word counts.
type MarkovChain struct {
    order       int
    transitions map[string]map[string]int
    totals      map[string]int
}

func NewMarkovChain(order int) *MarkovChain {
    return &MarkovChain{
        order:       order,
        transitions: make(map[string]map[string]int),
        totals:      make(map[string]int),
    }
}

// key returns a string key from a slice of tokens.
func key(tokens []string) string {
    return strings.Join(tokens, " ")
}

// Train builds the transition table from a corpus of tokens.
func (m *MarkovChain) Train(tokens []string) {
    for i := 0; i+m.order < len(tokens); i++ {
        state := key(tokens[i : i+m.order])
        next := tokens[i+m.order]
        if m.transitions[state] == nil {
            m.transitions[state] = make(map[string]int)
        }
        m.transitions[state][next]++
        m.totals[state]++
    }
}

// NextWord samples the next word given the current state.
func (m *MarkovChain) NextWord(state string) (string, bool) {
    counts, ok := m.transitions[state]
    if !ok {
        return "", false
    }
    total := m.totals[state]
    r := rand.Intn(total)
    var cumulative int
    for word, count := range counts {
        cumulative += count
        if r < cumulative {
            return word, true
        }
    }
    return "", false
}

// Generate produces up to maxWords tokens starting from seed.
func (m *MarkovChain) Generate(seed []string, maxWords int) []string {
    result := make([]string, 0, len(seed)+maxWords)
    result = append(result, seed...)

    for range maxWords {
        start := len(result) - m.order
        if start < 0 {
            break
        }
        state := key(result[start:])
        next, ok := m.NextWord(state)
        if !ok {
            break
        }
        result = append(result, next)
    }
    return result[len(seed):]
}

func tokenize(text string) []string {
    var tokens []string
    scanner := bufio.NewScanner(strings.NewReader(text))
    scanner.Split(bufio.ScanWords)
    for scanner.Scan() {
        tokens = append(tokens, strings.ToLower(scanner.Text()))
    }
    return tokens
}

func main() {
    corpus, _ := os.ReadFile("data/train.txt")
    tokens := tokenize(string(corpus))

    mc := NewMarkovChain(2)
    mc.Train(tokens)

    seed := []string{"the", "model"}
    generated := mc.Generate(seed, 50)
    fmt.Println(strings.Join(append(seed, generated...), " "))
}
```

With a few megabytes of English text as the corpus, the output might look like:

```
the model is trained on a large dataset of text that contains
the information we need to process in parallel with the other
components the model is not able to handle the long-range
dependencies that appear in natural language the model is
trained on a large dataset of text that contains the
```

Notice: each word pair looks plausible locally, but after 20 tokens the text is already looping. The model has no idea it is repeating itself, because it has no memory beyond the last two words.

---

## N-grams and chain order

The order choice defines the balance between local coherence and data coverage.

### The sparsity problem

With a vocabulary of 50,000 words:

```go
// Order 1: ~50k possible states
// Order 2: ~50k² states -> sparse already at normal corpus sizes
// Order 3: ~50k³ states -> almost entirely unseen
```

Working through the numbers:

- Order 1: 50,000 states. Coverable with a few megabytes of text.
- Order 2: 2.5 billion possible states. A 1GB corpus starts covering a reasonable fraction.
- Order 3: 125 trillion possible states. No real corpus comes close to covering this.

Most trigrams you encounter in new text were never seen during training. The model simply does not know what to do and stops generating.

### Comparing in practice

Let us train chains of different orders on the same corpus and count how many unique states each learns:

```go
package main

import (
    "fmt"
    "os"
)

func main() {
    corpus, _ := os.ReadFile("data/train.txt")
    tokens := tokenize(string(corpus))

    for _, order := range []int{1, 2, 3} {
        mc := NewMarkovChain(order)
        mc.Train(tokens)
        fmt.Printf("Order %d: %d unique states\n", order, len(mc.transitions))
    }
}
```

Typical output with 10MB of text:

```
Order 1: 48,231 unique states
Order 2: 892,041 unique states
Order 3: 2,847,193 unique states
```

Order 3 already produces almost 3 million states from 10MB. And the majority of those states were seen only once, meaning the transition probabilities are based on a single observation. That is not statistics: it is memorization of specific examples.

Pushing order beyond 3 or 4 on normal text produces results that appear very locally coherent because the model is, in practice, reproducing entire passages from the training corpus.

---

## The fundamental limit of the local approach

The Markov property is both the strength and the problem of the model. It makes computation tractable, but it cuts off exactly the kind of dependency that natural language requires.

### Long-range dependencies

Consider these sentences:

```
"The cat that chased the mouse was hungry."
"The cats that chased the mice were hungry."
```

In the first case, the verb "was" needs to agree with "cat", which appears 5 tokens earlier. In the second, "were" needs to agree with "cats", also 5 tokens back.

An order-2 chain sees only `("mouse", "was")` or `("mouse", "were")` and has to choose. Without access to the actual subject of the clause, there is no systematic way to make the right choice.

Even longer examples:

```
"The scientist who developed the vaccine that ended the disease that
killed thousands of people in the past decade received the award."
```

The verb "received" needs to agree with "scientist", which is 20 tokens back. A Markov chain of any reasonable order cannot reach that far.

### Pronouns and references

Consider:

```
"Maria went to the market. She bought fruit."
```

The pronoun "she" refers to "Maria", which is in the previous sentence. An order-2 chain that sees `("She", "bought")` does not know who "she" is. It cannot know, because the information is outside the window.

In longer texts, pronouns can refer to entities mentioned paragraphs earlier. The model ignores all of that structure entirely.

### Narrative intent

```
"It was the best of times, it was the worst of times"
```

Dickens' structural repetition exists for a narrative reason. A Markov chain can learn that `("was", "the")` leads to `("best", "of")` or `("worst", "of")`, but it has no understanding that both structures coexist because the author is building a deliberate contrast.

The model has no representation of intent, theme, or narrative structure. It only has local co-occurrence counts.

---

## Perplexity: measuring how lost the model is

How do you compare language models objectively? The standard metric is **perplexity**.

Perplexity measures, on average, how many equally probable options the model considers at each step. Lower is better.

Formal definition:

```
PP = exp(H)

where H is the average per-token cross-entropy:
H = -(1/N) * sum(log P(token_i | context_i))
```

Reference values:
- Human-level English: ~20-30 perplexity on typical text
- Well-trained order-2 Markov chain: 100-200 on test data
- GPT-2 (2019): ~35 on WikiText-103
- GPT-4: under 10 on standard benchmarks

Go implementation:

```go
import "math"

func Perplexity(mc *MarkovChain, tokens []string) float64 {
    var logProb float64
    var count int
    for i := 0; i+mc.order < len(tokens); i++ {
        state := key(tokens[i : i+mc.order])
        next := tokens[i+mc.order]
        total := mc.totals[state]
        if total == 0 {
            logProb += -10 // unknown state penalty
        } else {
            p := float64(mc.transitions[state][next]) / float64(total)
            if p == 0 {
                p = 1e-10 // smoothing to avoid log(0)
            }
            logProb += math.Log(p)
        }
        count++
    }
    return math.Exp(-logProb / float64(count))
}
```

The key point: perplexity is calculated on data the model **did not see** during training. Calculating it on training data tells you nothing: the model can simply memorize the data and achieve perplexity 1.

To use it:

```go
func main() {
    corpus, _ := os.ReadFile("data/train.txt")
    testData, _ := os.ReadFile("data/test.txt")

    trainTokens := tokenize(string(corpus))
    testTokens := tokenize(string(testData))

    for _, order := range []int{1, 2, 3} {
        mc := NewMarkovChain(order)
        mc.Train(trainTokens)
        pp := Perplexity(mc, testTokens)
        fmt.Printf("Order %d: perplexity = %.2f\n", order, pp)
    }
}
```

Typical output:

```
Order 1: perplexity = 892.41
Order 2: perplexity = 312.18
Order 3: perplexity = 187.93
```

Higher orders produce lower perplexity on test data, but only up to a point. At order 4 or 5, perplexity starts climbing again because data sparsity dominates.

---

## Backoff and smoothing

NLP researchers spent decades trying to fix the problems with Markov chains. Two techniques are worth knowing.

### Laplace smoothing

The simplest problem: states that were never seen have zero probability, which breaks the cross-entropy calculation. Laplace smoothing adds 1 to all counts, eliminating zeros:

```go
// Instead of:
p := float64(mc.transitions[state][next]) / float64(total)

// With Laplace smoothing (add-1):
vocabSize := float64(len(allTokens))
p := (float64(mc.transitions[state][next]) + 1) / (float64(total) + vocabSize)
```

This fixes the zero probability problem but distorts the estimates for rare states. If a state was seen only 3 times, adding 1 to every vocabulary alternative (50,000 words) produces completely wrong probabilities.

### Backoff (Katz and Kneser-Ney)

A more elegant idea: when the model does not find an order-N state, it "backs off" to an order-(N-1) state.

If the trigram `("ate", "the", "fish")` was never seen, try the bigram `("the", "fish")`. If that was also not seen, try the unigram `("fish")`. If nothing works, distribute probability uniformly across the vocabulary.

Kneser-Ney is the most sophisticated version of this backoff and was for a long time the state of the art for n-gram language models. It reduces perplexity by 20-30% compared to plain Katz backoff.

Even so, these techniques only alleviate symptoms. The fundamental problem, the inability to model long-range dependencies, remains.

---

## What comes next

The failure of Markov chains is instructive: it shows exactly what capabilities we need to build.

A useful language model needs to:

1. Represent tokens as dense vectors, not discrete symbols (we already built this in post 2).
2. Have some form of memory that is not just the last N tokens.
3. Learn which parts of the context are relevant for predicting the next token, instead of treating all context tokens the same way.

Point 3 is what attention solves. But before we get there, we need to understand the basic building blocks: a single neuron, then a feedforward network, then gradient descent to find the right weights without manual count tables.

In the next post we will build the first neuron in Go, implement a simple feedforward network, and show how gradient descent finds the right weights. That is the inflection point of the series: from counts to learned representations.

---

## References

- [Andrei Markov - Extension of the Law of Large Numbers (1906)](https://en.wikipedia.org/wiki/Andrey_Markov)
- [Shannon, Claude - A Mathematical Theory of Communication (1948)](https://people.math.harvard.edu/~ctm/home/text/others/shannon/entropy/entropy.pdf)
- [Jurafsky & Martin - Speech and Language Processing (3rd ed., free online)](https://web.stanford.edu/~jurafsky/slp3/)
- [Kneser-Ney Smoothing - detailed explanation](https://en.wikipedia.org/wiki/Kneser%E2%80%93Ney_smoothing)
- [NLTK - N-grams in Python (conceptual reference)](https://www.nltk.org/api/nltk.lm.html)
- [LLM from Scratch series repository](https://github.com/otavi/llm-do-zero)
