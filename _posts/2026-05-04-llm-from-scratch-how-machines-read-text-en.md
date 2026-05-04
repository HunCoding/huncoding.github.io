---
layout: post
title: "LLM from Scratch in Go: How Machines Read Text"
subtitle: "From byte representation to BPE: building a tokenizer from scratch in Go with no external ML libraries"
author: otavio_celestino
date: 2026-05-04 08:00:00 -0300
categories: [Go, AI, LLM, Machine Learning]
tags: [go, golang, llm, tokenizer, bpe, encoding, utf-8, ai, machine-learning]
comments: true
image: "/assets/img/posts/2026-05-04-llm-from-scratch-how-machines-read-text.png"
lang: en
original_post: "/llm-do-zero-como-maquinas-leem-texto/"
series: "LLM from Scratch in Go"
series_order: 1
youtube_videos:
  - id: "zitZsJYivAM"
    title: "Vídeo 01 - O que é um LLM"
  - id: "XzYV67ozBWg"
    title: "Vídeo 02 - Como o computador lê texto"
  - id: "HMwEnFpHqV0"
    title: "Vídeo 03 - Implementando um tokenizador simples"
---

Hey everyone!

This is the first post in a series called **LLM from Scratch in Go**. The goal is straightforward: build a language model from zero, in Go, with no external machine learning libraries. No PyTorch, no HuggingFace, no ready-made wrappers. Just plain Go.

The series follows the videos on the channel covering: what is an LLM, how computers represent text, implementing a simple tokenizer, and implementing BPE (Byte Pair Encoding). This post covers videos 01 through 04.

Today the focus is on a problem nobody explains properly before throwing you into the middle of neural networks: how a computer reads text, and why that matters so much for building an LLM.

---

## What an LLM actually is

Before any code, it is worth having a clear mental model of what a Large Language Model is.

An LLM is not a database of answers. It is not a search engine. It is a mathematical model that, given a context of previous tokens, calculates the probability of each possible token being the next one.

That is everything. The central operation is:

```
P(next_token | previous_tokens)
```

Internally, this operation happens through matrices of floating-point numbers. The input text is converted into numeric vectors, those vectors pass through layers of transformations (matrix multiplications, activation functions, attention), and the output is a probability distribution over the vocabulary.

Text generation is **autoregressive**: the model generates one token, that token feeds back as context, the model generates the next one, and so on.

```
Input: "The cat"
Model computes: P("climbed" | "The cat") = 0.31
                P("slept"   | "The cat") = 0.28
                P("ate"     | "The cat") = 0.19
                ...
Chosen output: "climbed"

New input: "The cat climbed"
Model computes: P("the" | "The cat climbed") = 0.45
...
```

For all of this to work, text needs to become numbers. That is where tokenization comes in.

---

## How a computer sees text

Before talking about tokens, you need to understand how a computer represents text at its lowest level.

### Bits and bytes

A computer only understands bits: 0 or 1. We group 8 bits into one byte. A byte can represent 256 distinct values (0 through 255).

A character, therefore, needs to be mapped to one or more bytes. How we do that mapping is the **encoding** problem.

### ASCII: the beginning

ASCII (American Standard Code for Information Interchange) was created in the 1960s. It defines 128 characters using 7 bits. The first 32 are control characters (newline, tab, etc). The rest are letters of the English alphabet, digits, and punctuation.

```
Character | Decimal | Binary
----------+---------+---------
'A'       |   65    | 01000001
'B'       |   66    | 01000010
'a'       |   97    | 01100001
'0'       |   48    | 00110000
' '       |   32    | 00100000
```

This works well for English. But what about accented letters? The cedilla 'c'? ASCII does not have those characters.

### Latin-1 and the encoding chaos

Dozens of different encodings appeared to cover other languages. Latin-1 (ISO-8859-1) uses the full byte (256 values) and adds Western European characters in the 128 to 255 range. Windows created CP-1252. Other systems created other schemes.

The result: the same byte could mean different characters depending on which encoding you assumed. Opening a text file with the wrong encoding produced those sequences of garbled characters every developer has seen at some point.

### UTF-8: the encoding that won

UTF-8 solved the problem elegantly. It can represent any Unicode character (more than 1.1 million characters), and it does this with variable length: 1 to 4 bytes per character.

The encoding rules:

```
Unicode range       | Bytes | Binary format
--------------------+-------+------------------------------------------
U+0000 - U+007F    |   1   | 0xxxxxxx
U+0080 - U+07FF    |   2   | 110xxxxx 10xxxxxx
U+0800 - U+FFFF    |   3   | 1110xxxx 10xxxxxx 10xxxxxx
U+10000 - U+10FFFF |   4   | 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx
```

ASCII characters (0-127) are represented with exactly 1 byte, and that byte is identical to the original ASCII. This guarantees backward compatibility.

A practical example with the letter 'a' and its accented variant:

```
'a'  -> U+0061 -> 1 byte:  0x61         (97 in decimal)
'a'  -> U+00E3 -> 2 bytes: 0xC3 0xA3    (195, 163 in decimal)
```

And the Chinese character for "middle":

```
'中' -> U+4E2D -> 3 bytes: 0xE4 0xB8 0xAD
```

---

## Go and strings: what you need to know

Go has a specific relationship with text that catches a lot of people off guard.

**In Go, a string is an immutable sequence of bytes.** Not a sequence of characters. Bytes.

This has direct consequences:

```go
package main

import "fmt"

func main() {
    s := "Ola"

    // len() counts bytes, not characters
    fmt.Println(len("hello"))  // 5
    fmt.Println(len("Ola"))    // 5 (the accented 'a' uses 2 bytes)

    // indexing accesses bytes
    fmt.Printf("%x\n", s[0])  // 4f ('O')
    fmt.Printf("%x\n", s[2])  // c3 (first byte of the accented 'a')
    fmt.Printf("%x\n", s[3])  // a3 (second byte of the accented 'a')

    // range iterates over runes (Unicode code points)
    for i, r := range s {
        fmt.Printf("index %d: %c (U+%04X)\n", i, r, r)
    }
}
```

Output:

```
5
5
4f
c3
a3
index 0: O (U+004F)
index 2: l (U+006C)
index 3: a (U+00E3)
```

Notice: range jumps from index 2 to index 3. Index 2 is 'l', which occupies 1 byte. Index 3 is the accented 'a', which occupies 2 bytes, so the next character would be at index 5.

The `rune` type in Go is an alias for `int32`, and represents a Unicode code point. When you need to work with characters (not bytes), you use rune.

```go
package main

import (
    "fmt"
    "unicode/utf8"
)

func main() {
    s := "Hello, 世界"

    fmt.Println("Bytes:", len(s))
    fmt.Println("Runes:", utf8.RuneCountInString(s))

    // Converting to a slice of runes
    runes := []rune(s)
    fmt.Println("Third character:", string(runes[2]))
}
```

Output:

```
Bytes: 13
Runes: 9
Third character: l
```

This difference between bytes and runes is fundamental when building a tokenizer. Depending on how you iterate over the string, you get completely different results.

---

## Why we need tokens

An LLM operates on numbers. Matrices of floats, linear multiplications, activation functions. Raw text does not feed directly into those calculations.

We need a function that converts text into sequences of integers, and another that converts back. That process is tokenization.

The central concept is the **vocabulary**: a fixed set of tokens, each with a unique numeric ID. During training, the model learns a representation vector (embedding) for each ID in the vocabulary. During inference, the input text is converted to IDs, the IDs become vectors, and the calculations happen on those vectors.

The choice of how to define the vocabulary is what differentiates tokenization strategies. And that choice directly impacts model size, training quality, and the ability to handle new words.

Let us define the interface all our tokenizers will follow:

```go
type Tokenizer interface {
    Train(corpus string, vocabSize int)
    Encode(text string) []int
    Decode(ids []int) string
    VocabSize() int
}
```

`Train` builds the vocabulary from a corpus. `Encode` converts text to IDs. `Decode` converts IDs back to text. `VocabSize` returns how many tokens exist in the vocabulary.

---

## Simple word-level tokenizer

The most intuitive approach: each word is one token.

```go
package tokenizer

import (
    "sort"
    "strings"
)

type WordTokenizer struct {
    vocab   map[string]int
    reverse map[int]string
}

func (t *WordTokenizer) Train(corpus string, vocabSize int) {
    words := strings.Fields(corpus)
    freq := make(map[string]int)
    for _, w := range words {
        freq[strings.ToLower(w)]++
    }

    type entry struct {
        word  string
        count int
    }
    var entries []entry
    for w, c := range freq {
        entries = append(entries, entry{w, c})
    }
    sort.Slice(entries, func(i, j int) bool {
        return entries[i].count > entries[j].count
    })

    t.vocab = make(map[string]int)
    t.reverse = make(map[int]string)
    for i, e := range entries {
        if i >= vocabSize {
            break
        }
        t.vocab[e.word] = i
        t.reverse[i] = e.word
    }
}

func (t *WordTokenizer) Encode(text string) []int {
    words := strings.Fields(strings.ToLower(text))
    ids := make([]int, 0, len(words))
    for _, w := range words {
        if id, ok := t.vocab[w]; ok {
            ids = append(ids, id)
        } else {
            ids = append(ids, -1) // unknown token
        }
    }
    return ids
}

func (t *WordTokenizer) Decode(ids []int) string {
    words := make([]string, 0, len(ids))
    for _, id := range ids {
        if w, ok := t.reverse[id]; ok {
            words = append(words, w)
        } else {
            words = append(words, "<unk>")
        }
    }
    return strings.Join(words, " ")
}

func (t *WordTokenizer) VocabSize() int {
    return len(t.vocab)
}
```

Using the tokenizer:

```go
package main

import (
    "fmt"
    "tokenizer"
)

func main() {
    corpus := `the cat climbed the roof the cat came down
               the dog barked the cat ran the dog ran too
               the cat won the dog lost`

    tok := &tokenizer.WordTokenizer{}
    tok.Train(corpus, 10)

    ids := tok.Encode("the cat ran")
    fmt.Println("IDs:", ids)
    fmt.Println("Decode:", tok.Decode(ids))

    ids2 := tok.Encode("the duck flew")
    fmt.Println("IDs with unknown:", ids2)
    fmt.Println("Decode:", tok.Decode(ids2))
}
```

Output:

```
IDs: [0 1 5]
Decode: the cat ran
IDs with unknown: [0 -1 -1]
Decode: the <unk> <unk>
```

### The OOV problem

"duck" and "flew" were not in the training corpus. They are **OOV** (Out Of Vocabulary) tokens. The word tokenizer does not know what to do with them, so it returns -1.

This is a serious problem. Proper nouns, technical terms, words from other languages, typos: all of them become `<unk>`. The model loses all information about what was actually in the text.

On top of that, a word-level vocabulary grows very quickly. English alone has hundreds of thousands of words. A large vocabulary means a huge embedding layer, which raises computational cost and makes training harder.

---

## BPE: Byte Pair Encoding

BPE solves the OOV problem cleverly. Instead of working at the word level, it starts at the byte (or character) level and progressively learns which sequences deserve to become their own tokens.

### The core idea

1. Start with each byte as its own individual token. This guarantees any text can be represented.
2. Count the most frequent pairs of adjacent tokens in the corpus.
3. Merge the most frequent pair into a new single token.
4. Repeat until reaching the desired vocabulary size.

### Implementing the BPE core

```go
package tokenizer

type BPE struct {
    vocab  map[string]int
    merges [][2]string
}

func (b *BPE) Train(corpus string, vocabSize int) {
    b.vocab = make(map[string]int)
    b.merges = nil

    // Base vocabulary: all 256 possible bytes
    for i := 0; i < 256; i++ {
        b.vocab[string([]byte{byte(i)})] = i
    }

    // Represent the corpus as a sequence of symbols (one byte each)
    symbols := make([][]byte, 0, len(corpus))
    for _, r := range []byte(corpus) {
        symbols = append(symbols, []byte{r})
    }

    for len(b.vocab) < vocabSize {
        // Count all adjacent pairs
        pairs := make(map[[2]string]int)
        for i := 0; i < len(symbols)-1; i++ {
            pair := [2]string{string(symbols[i]), string(symbols[i+1])}
            pairs[pair]++
        }
        if len(pairs) == 0 {
            break
        }

        // Find the most frequent pair
        var best [2]string
        bestCount := 0
        for pair, count := range pairs {
            if count > bestCount {
                best = pair
                bestCount = count
            }
        }

        // Create a new token by merging
        merged := best[0] + best[1]
        b.merges = append(b.merges, best)
        b.vocab[merged] = len(b.vocab)

        // Apply the merge across the entire corpus
        newSymbols := make([][]byte, 0, len(symbols))
        for i := 0; i < len(symbols); i++ {
            if i < len(symbols)-1 &&
                string(symbols[i]) == best[0] &&
                string(symbols[i+1]) == best[1] {
                newSymbols = append(newSymbols, []byte(merged))
                i++ // skip next, already absorbed
            } else {
                newSymbols = append(newSymbols, symbols[i])
            }
        }
        symbols = newSymbols
    }
}

func (b *BPE) Encode(text string) []int {
    // Start with individual bytes
    symbols := make([]string, 0, len(text))
    for _, bt := range []byte(text) {
        symbols = append(symbols, string([]byte{bt}))
    }

    // Apply merges in the order they were learned
    for _, merge := range b.merges {
        merged := merge[0] + merge[1]
        newSymbols := make([]string, 0, len(symbols))
        for i := 0; i < len(symbols); i++ {
            if i < len(symbols)-1 &&
                symbols[i] == merge[0] &&
                symbols[i+1] == merge[1] {
                newSymbols = append(newSymbols, merged)
                i++
            } else {
                newSymbols = append(newSymbols, symbols[i])
            }
        }
        symbols = newSymbols
    }

    ids := make([]int, 0, len(symbols))
    for _, s := range symbols {
        if id, ok := b.vocab[s]; ok {
            ids = append(ids, id)
        }
    }
    return ids
}

func (b *BPE) Decode(ids []int) string {
    reverse := make(map[int]string, len(b.vocab))
    for s, id := range b.vocab {
        reverse[id] = s
    }
    result := make([]byte, 0)
    for _, id := range ids {
        if s, ok := reverse[id]; ok {
            result = append(result, []byte(s)...)
        }
    }
    return string(result)
}

func (b *BPE) VocabSize() int {
    return len(b.vocab)
}
```

### Running BPE

```go
package main

import (
    "fmt"
    "tokenizer"
)

func main() {
    corpus := `the cat climbed the roof the cat came down
               the dog barked the cat ran the dog ran too
               the cat won the dog lost`

    bpe := &tokenizer.BPE{}
    bpe.Train(corpus, 300)

    fmt.Println("Vocabulary:", bpe.VocabSize(), "tokens")

    text := "the cat"
    ids := bpe.Encode(text)
    fmt.Printf("Encode(%q): %v\n", text, ids)
    fmt.Printf("Decode: %q\n", bpe.Decode(ids))

    // A word that was not in the corpus
    text2 := "duck"
    ids2 := bpe.Encode(text2)
    fmt.Printf("Encode(%q): %v\n", text2, ids2)
    fmt.Printf("Decode: %q\n", bpe.Decode(ids2))
}
```

Approximate output:

```
Vocabulary: 300 tokens
Encode("the cat"): [116 104 101 32 99 257 116]
Decode: "the cat"
Encode("duck"): [100 117 99 107]
Decode: "duck"
```

Notice: "duck" was not in the corpus, but BPE can encode it using smaller pieces it already knows. There is no OOV. In the worst case, each byte becomes a separate token, but decoding still works and the original text is recovered perfectly.

### What happens step by step

Here is a simplified trace of the first few merges on a small corpus that contains "the the the":

```
Initial symbols: ['t','h','e',' ','t','h','e',' ','t','h','e']

Most frequent pair: ('t','h') appears 3 times
-> Merge: 'th' added to vocab
Symbols: ['th','e',' ','th','e',' ','th','e']

Most frequent pair: ('th','e') appears 3 times
-> Merge: 'the' added to vocab
Symbols: ['the',' ','the',' ','the']

Most frequent pair: ('the',' ') appears 2 times
-> Merge: 'the ' added to vocab
Symbols: ['the ','the ','the']
```

Each iteration compresses the representation further. Frequent sequences get their own token. Rare sequences stay decomposed into smaller pieces.

---

## Comparing the two approaches

| Criterion                  | Word tokenizer          | BPE                       |
|----------------------------|-------------------------|---------------------------|
| Vocabulary size            | Very large              | Controlled (configurable) |
| Out-of-vocabulary words    | Becomes `<unk>`         | Decomposed into subunits  |
| Compound words             | One token               | May be several tokens     |
| Mixed languages            | Problematic             | Works well                |
| Rare words                 | Rarely trained          | Parts are reused          |
| Implementation complexity  | Simple                  | More involved             |
| Text compression           | High (1 token/word)     | Medium                    |

BPE is the base algorithm for GPT-2 and GPT-3. The GPT-4 tokenizer (called cl100k_base) uses a variant called BBPE (Byte-level BPE) with some additional pre-tokenization rules. SentencePiece, used by LLaMA and T5, implements both BPE and unigram language model.

For our series, BPE is the right choice. Controlled vocabulary, no OOV, understandable implementation, and compatible with what modern models use.

---

## What we built

In this post, we started from the lowest possible level: bits, bytes, and how UTF-8 organizes characters into variable-length bytes. We covered the quirks of Go strings (len vs range, byte vs rune), understood why tokenization is necessary, implemented a word-level tokenizer and saw its fundamental flaw, and implemented BPE from scratch in Go.

The code is direct. No unnecessary abstractions, no external dependencies. Pure Go throughout.

In the next post in the series, we will transform the IDs that BPE produces into dense representation vectors: **embeddings**. That is where the model begins to learn what tokens mean in relation to each other.

---

## References

- [Unicode and UTF-8: official specification](https://www.unicode.org/faq/utf_bmp.html)
- [BPE original paper: Sennrich et al. 2016](https://arxiv.org/abs/1508.07909)
- [Go strings documentation](https://go.dev/blog/strings)
- [unicode/utf8 package in Go](https://pkg.go.dev/unicode/utf8)
- [GPT-2 tokenizer (tiktoken)](https://github.com/openai/tiktoken)
- [SentencePiece: LLaMA tokenizer](https://github.com/google/sentencepiece)
- [The Illustrated GPT-2 - Jay Alammar](https://jalammar.github.io/illustrated-gpt2/)
