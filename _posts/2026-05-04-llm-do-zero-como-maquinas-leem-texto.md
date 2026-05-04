---
layout: post
title: "LLM do Zero em Go: como máquinas leem texto"
subtitle: "Da representação de bytes ao BPE: construindo um tokenizador do zero em Go sem nenhuma biblioteca externa de ML"
author: otavio_celestino
date: 2026-05-04 08:00:00 -0300
categories: [Go, IA, LLM, Machine Learning]
tags: [go, golang, llm, tokenizer, bpe, encoding, utf-8, ia, machine-learning]
comments: true
image: "/assets/img/posts/2026-05-07-llm-do-zero-como-maquinas-leem-texto.png"
lang: pt-BR
series: "LLM do Zero em Go"
series_order: 1
youtube_videos:
  - id: "zitZsJYivAM"
    title: "Vídeo 01 - O que é um LLM"
  - id: "XzYV67ozBWg"
    title: "Vídeo 02 - Como o computador lê texto"
  - id: "HMwEnFpHqV0"
    title: "Vídeo 03 - Implementing a simple tokenizer"
---

E aí, pessoal!

Esta e a primeira parte de uma serie chamada **LLM do Zero em Go**. A proposta e simples: construir um modelo de linguagem do zero, em Go, sem nenhuma biblioteca externa de machine learning. Nada de PyTorch, nada de HuggingFace, nada de wrappers prontos. So Go puro.

A serie acompanha os videos do canal que cobrem: o que e um LLM, como o computador representa texto, como implementar um tokenizador simples, e como implementar o BPE (Byte Pair Encoding). Este post cobre os videos 01 ao 04.

Hoje o foco e o problema que ninguem explica direito antes de jogar voce no meio das redes neurais: como um computador le texto, e por que isso importa tanto pra construir um LLM.

---

## O que e um LLM de verdade

Antes de qualquer codigo, vale ter um modelo mental claro do que e um Large Language Model.

Um LLM nao e um banco de dados de respostas. Nao e uma busca. E um modelo matematico que, dado um contexto de tokens anteriores, calcula a probabilidade de cada token possivel ser o proximo.

Isso e tudo. A operacao central e:

```
P(proximo_token | tokens_anteriores)
```

Internamente, essa operacao acontece atraves de matrizes de numeros de ponto flutuante. O texto de entrada e convertido em vetores numericos, esses vetores passam por camadas de transformacoes (multiplicacoes de matrizes, funcoes de ativacao, atencao), e na saida temos uma distribuicao de probabilidade sobre o vocabulario.

A geracao de texto e **autoregressiva**: o modelo gera um token, esse token entra de volta como contexto, o modelo gera o proximo, e assim por diante.

```
Entrada: "O gato"
Modelo calcula: P("subiu" | "O gato") = 0.31
                P("dormiu" | "O gato") = 0.28
                P("comeu"  | "O gato") = 0.19
                ...
Saida escolhida: "subiu"

Nova entrada: "O gato subiu"
Modelo calcula: P("no" | "O gato subiu") = 0.45
...
```

Para que tudo isso funcione, o texto precisa virar numeros. E e ai que entra a tokenizacao.

---

## Como o computador ve texto

Antes de falar em tokens, precisa entender como o computador representa texto no nivel mais baixo.

### Bits e bytes

Um computador so entende bits: 0 ou 1. Agrupamos 8 bits em um byte. Um byte pode representar 256 valores distintos (0 a 255).

Um caractere, portanto, precisa ser mapeado para um ou mais bytes. Como fazemos esse mapeamento e o problema do **encoding**.

### ASCII: o comeco

O ASCII (American Standard Code for Information Interchange) foi criado nos anos 60. Ele define 128 caracteres usando 7 bits. Os primeiros 32 sao caracteres de controle (newline, tab, etc). Os demais sao letras do alfabeto ingles, digitos e pontuacao.

```
Caractere | Decimal | Binario
----------+---------+---------
'A'       |   65    | 01000001
'B'       |   66    | 01000010
'a'       |   97    | 01100001
'0'       |   48    | 00110000
' '       |   32    | 00100000
```

Isso funciona bem para ingles. Mas e o 'a' com acento? O 'c' cedilha? O ASCII nao tem esses caracteres.

### Latin-1 e o caos de encodings

Surgiram dezenas de encodings diferentes para cobrir outros idiomas. Latin-1 (ISO-8859-1) usa o byte completo (256 valores) e adiciona caracteres europeus ocidentais nos valores de 128 a 255. Windows criou o CP-1252. Outros sistemas criaram outros esquemas.

O resultado: o mesmo byte podia significar caracteres diferentes dependendo do encoding que voce assumia. Abrir um arquivo de texto com o encoding errado gerava aquelas sequencias de caracteres ilegíveis que todo desenvolvedor ja viu.

### UTF-8: o encoding que ganhou

O UTF-8 resolveu o problema de forma elegante. Ele pode representar qualquer caractere Unicode (mais de 1,1 milhao de caracteres), e faz isso com tamanho variavel: de 1 a 4 bytes por caractere.

A regra de codificacao:

```
Unicode range       | Bytes | Formato binario
--------------------+-------+------------------------------------------
U+0000 - U+007F    |   1   | 0xxxxxxx
U+0080 - U+07FF    |   2   | 110xxxxx 10xxxxxx
U+0800 - U+FFFF    |   3   | 1110xxxx 10xxxxxx 10xxxxxx
U+10000 - U+10FFFF |   4   | 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx
```

Os caracteres ASCII (0-127) sao representados com exatamente 1 byte, e esse byte e identico ao ASCII original. Isso garante compatibilidade retroativa.

Um exemplo pratico com a letra 'a' e o 'a' com acento:

```
'a'  -> U+0061 -> 1 byte:  0x61         (97 em decimal)
'a'  -> U+00E3 -> 2 bytes: 0xC3 0xA3    (195, 163 em decimal)
```

Ja a letra chinesa '中':

```
'中' -> U+4E2D -> 3 bytes: 0xE4 0xB8 0xAD
```

---

## Go e strings: o que voce precisa saber

Go tem uma relacao especifica com texto que pega muita gente de surpresa.

**Em Go, uma string e uma sequencia de bytes imutavel.** Nao e uma sequencia de caracteres. Bytes.

Isso tem consequencias diretas:

```go
package main

import "fmt"

func main() {
    s := "Ola"

    // len() conta bytes, nao caracteres
    fmt.Println(len("hello"))  // 5
    fmt.Println(len("Ola"))    // 5 (o 'a' com acento usa 2 bytes)

    // indexacao acessa bytes
    fmt.Printf("%x\n", s[0])  // 4f ('O')
    fmt.Printf("%x\n", s[2])  // c3 (primeiro byte do 'a')
    fmt.Printf("%x\n", s[3])  // a3 (segundo byte do 'a'))

    // range itera sobre runes (codepoints Unicode)
    for i, r := range s {
        fmt.Printf("indice %d: %c (U+%04X)\n", i, r, r)
    }
}
```

Saida:

```
5
5
4f
c3
a3
indice 0: O (U+004F)
indice 2: l (U+006C)
indice 3: a (U+00E3)
```

Repare: o range pula do indice 2 para o 3. O indice 2 e 'l', que ocupa 1 byte. O indice 3 e 'a', que ocupa 2 bytes. Por isso o proximo seria indice 5.

O tipo `rune` em Go e um alias para `int32`, e representa um codepoint Unicode. Quando voce precisa trabalhar com caracteres (nao bytes), voce usa rune.

```go
package main

import (
    "fmt"
    "unicode/utf8"
)

func main() {
    s := "Ola, 世界"

    fmt.Println("Bytes:", len(s))
    fmt.Println("Runes:", utf8.RuneCountInString(s))

    // Convertendo para slice de runes
    runes := []rune(s)
    fmt.Println("Terceiro caractere:", string(runes[2]))
}
```

Saida:

```
Bytes: 13
Runes: 8
Terceiro caractere: a
```

Essa diferenca entre bytes e runes e fundamental quando construimos um tokenizador. Dependendo de como voce itera a string, voce obtem resultados completamente diferentes.

---

## Por que precisamos de tokens

Um LLM opera sobre numeros. Matrizes de floats, multiplicacoes lineares, funcoes de ativacao. Texto puro nao entra diretamente nesses calculos.

Precisamos de uma funcao que converta texto em sequencias de inteiros, e outra que converta de volta. Esse processo e a tokenizacao.

O conceito central e o **vocabulario**: um conjunto fixo de tokens, cada um com um ID numerico unico. Durante o treinamento, o modelo aprende um vetor de representacao (embedding) para cada ID no vocabulario. Durante a inferencia, o texto de entrada e convertido em IDs, os IDs viram vetores, e os calculos acontecem nesses vetores.

A escolha de como definir o vocabulario e o que diferencia as estrategias de tokenizacao. E esse choice tem impacto direto no tamanho do modelo, na qualidade do treinamento e na capacidade de lidar com palavras novas.

Vamos implementar a interface que todos os nossos tokenizadores vao seguir:

```go
type Tokenizer interface {
    Train(corpus string, vocabSize int)
    Encode(text string) []int
    Decode(ids []int) string
    VocabSize() int
}
```

`Train` constroi o vocabulario a partir de um corpus. `Encode` converte texto em IDs. `Decode` converte IDs de volta em texto. `VocabSize` retorna quantos tokens existem no vocabulario.

---

## Tokenizador simples por palavras

A abordagem mais intuitiva: cada palavra e um token.

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
            ids = append(ids, -1) // token desconhecido
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

Usando o tokenizador:

```go
package main

import (
    "fmt"
    "tokenizer"
)

func main() {
    corpus := `o gato subiu no telhado o gato desceu o cachorro latiu
               o gato correu o cachorro tambem correu o gato ganhou`

    tok := &tokenizer.WordTokenizer{}
    tok.Train(corpus, 10)

    ids := tok.Encode("o gato correu")
    fmt.Println("IDs:", ids)
    fmt.Println("Decode:", tok.Decode(ids))

    ids2 := tok.Encode("o pato voou")
    fmt.Println("IDs com desconhecido:", ids2)
    fmt.Println("Decode:", tok.Decode(ids2))
}
```

Saida:

```
IDs: [0 1 5]
Decode: o gato correu
IDs com desconhecido: [0 -1 -1]
Decode: o <unk> <unk>
```

### O problema do OOV

"pato" e "voou" nao estavam no corpus de treinamento. Eles sao tokens **OOV** (Out Of Vocabulary). O tokenizador por palavras nao sabe o que fazer com eles, entao retorna -1.

Isso e um problema serio. Nomes proprios, termos tecnicos, palavras em outros idiomas, erros de digitacao: tudo isso vai virar `<unk>`. O modelo perde informacao sobre o que estava no texto.

Alem disso, o vocabulario de palavras cresce muito rapido. O portugues tem centenas de milhares de palavras. Um vocabulario grande significa uma camada de embedding enorme, o que aumenta o custo computacional e dificulta o treinamento.

---

## BPE: Byte Pair Encoding

O BPE resolve o problema do OOV de forma esperta. Em vez de trabalhar no nivel de palavras, ele começa no nivel de bytes (ou caracteres) e aprende progressivamente quais sequencias merecem virar tokens proprios.

### A ideia central

1. Comece com cada byte como um token individual. Isso garante que qualquer texto pode ser representado.
2. Conte os pares de tokens adjacentes mais frequentes no corpus.
3. Mescle o par mais frequente em um novo token.
4. Repita ate atingir o tamanho de vocabulario desejado.

### Implementacao do nucleo do BPE

```go
package tokenizer

type BPE struct {
    vocab  map[string]int
    merges [][2]string
}

func (b *BPE) Train(corpus string, vocabSize int) {
    b.vocab = make(map[string]int)
    b.merges = nil

    // Vocabulario base: todos os bytes unicos
    for i := 0; i < 256; i++ {
        b.vocab[string([]byte{byte(i)})] = i
    }

    // Representar o corpus como sequencia de simbolos (um byte cada)
    symbols := make([][]byte, 0, len(corpus))
    for _, r := range []byte(corpus) {
        symbols = append(symbols, []byte{r})
    }

    for len(b.vocab) < vocabSize {
        // Contar todos os pares adjacentes
        pairs := make(map[[2]string]int)
        for i := 0; i < len(symbols)-1; i++ {
            pair := [2]string{string(symbols[i]), string(symbols[i+1])}
            pairs[pair]++
        }
        if len(pairs) == 0 {
            break
        }

        // Encontrar o par mais frequente
        var best [2]string
        bestCount := 0
        for pair, count := range pairs {
            if count > bestCount {
                best = pair
                bestCount = count
            }
        }

        // Criar novo token pela mesclagem
        merged := best[0] + best[1]
        b.merges = append(b.merges, best)
        b.vocab[merged] = len(b.vocab)

        // Aplicar a mesclagem em todo o corpus
        newSymbols := make([][]byte, 0, len(symbols))
        for i := 0; i < len(symbols); i++ {
            if i < len(symbols)-1 &&
                string(symbols[i]) == best[0] &&
                string(symbols[i+1]) == best[1] {
                newSymbols = append(newSymbols, []byte(merged))
                i++ // pula o proximo, ja foi incorporado
            } else {
                newSymbols = append(newSymbols, symbols[i])
            }
        }
        symbols = newSymbols
    }
}

func (b *BPE) Encode(text string) []int {
    // Comecar com bytes individuais
    symbols := make([]string, 0, len(text))
    for _, bt := range []byte(text) {
        symbols = append(symbols, string([]byte{bt}))
    }

    // Aplicar as mesclagens na ordem em que foram aprendidas
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

### Rodando o BPE

```go
package main

import (
    "fmt"
    "tokenizer"
)

func main() {
    corpus := `o gato subiu no telhado o gato desceu
               o cachorro latiu o gato correu o cachorro
               tambem correu o gato ganhou o cachorro perdeu`

    bpe := &tokenizer.BPE{}
    bpe.Train(corpus, 300)

    fmt.Println("Vocabulario:", bpe.VocabSize(), "tokens")

    text := "o gato"
    ids := bpe.Encode(text)
    fmt.Printf("Encode(%q): %v\n", text, ids)
    fmt.Printf("Decode: %q\n", bpe.Decode(ids))

    // Palavra que nao estava no corpus
    text2 := "pato"
    ids2 := bpe.Encode(text2)
    fmt.Printf("Encode(%q): %v\n", text2, ids2)
    fmt.Printf("Decode: %q\n", bpe.Decode(ids2))
}
```

Saida aproximada:

```
Vocabulario: 300 tokens
Encode("o gato"): [111 32 103 257 111]
Decode: "o gato"
Encode("pato"): [112 257 111]
Decode: "pato"
```

Repare: "pato" nao estava no corpus, mas o BPE consegue codifica-la usando porcoes menores que ele conhece. Nao ha OOV. No pior caso, cada byte vira um token separado, mas a decodificacao continua funcionando e o texto original e recuperado perfeitamente.

---

## Comparando as abordagens

| Criterio                   | Tokenizador por palavras | BPE                      |
|----------------------------|--------------------------|--------------------------|
| Tamanho do vocabulario     | Muito grande             | Controlado (configuravel)|
| Palavras fora do vocab     | Vira `<unk>`             | Decomposta em subunidades|
| Palavras compostas         | Um token                 | Pode ser varios tokens   |
| Idiomas misturados         | Problematico             | Funciona bem             |
| Palavras raras             | Raramente treinadas      | Partes reutilizadas       |
| Implementacao              | Simples                  | Mais complexo            |
| Compressao do texto        | Alta (1 token/palavra)   | Media                    |

O BPE e o algoritmo base do GPT-2 e GPT-3. O tokenizador do GPT-4 (chamado cl100k_base) usa uma variante chamada BBPE (Byte-level BPE) com algumas regras adicionais de pre-tokenizacao. O SentencePiece, usado pelo LLaMA e T5, implementa tanto BPE quanto unigram language model.

Para a nossa serie, o BPE e a escolha certa. Vocabulario controlado, sem OOV, implementacao compreensivel, e compativel com o que os modelos modernos usam.

---

## O que construimos

Neste post, partimos do nivel mais baixo possivel: bits, bytes, e como o UTF-8 organiza caracteres em bytes de tamanho variavel. Passamos pelas peculiaridades de strings em Go (len vs range, byte vs rune), entendemos por que tokenizacao e necessaria, implementamos um tokenizador por palavras e vimos seu problema fundamental, e implementamos o BPE do zero em Go.

O codigo e direto. Sem abstraccoes desnecessarias, sem dependencias externas. Tudo em Go puro.

No proximo post da serie, vamos transformar os IDs que o BPE gera em vetores de representacao densos: os **embeddings**. E ai que o modelo comeca a aprender o que os tokens significam em relacao uns aos outros.

---

## Referências

- [Unicode e UTF-8: especificacao oficial](https://www.unicode.org/faq/utf_bmp.html)
- [BPE original: Sennrich et al. 2016](https://arxiv.org/abs/1508.07909)
- [Documentacao de strings em Go](https://go.dev/blog/strings)
- [unicode/utf8 package em Go](https://pkg.go.dev/unicode/utf8)
- [GPT-2 tokenizer (tiktoken)](https://github.com/openai/tiktoken)
- [SentencePiece: tokenizador do LLaMA](https://github.com/google/sentencepiece)
- [The Illustrated GPT-2 - Jay Alammar](https://jalammar.github.io/illustrated-gpt2/)
