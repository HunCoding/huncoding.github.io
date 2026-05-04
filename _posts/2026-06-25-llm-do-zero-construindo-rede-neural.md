---
layout: post
title: "Construindo um neurônio e nossa primeira rede neural em Go"
subtitle: "De uma função linear com peso e bias até uma rede multicamada com GELU e backpropagation"
author: otavio_celestino
date: 2026-06-25 08:00:00 -0300
categories: [Go, IA, LLM]
tags: [go, golang, llm, neural-network, backpropagation, gelu, feedforward, gradiente]
comments: true
image: "/assets/img/posts/2026-06-25-llm-do-zero-building-neural-network.png"
lang: pt-BR
series: "LLM do Zero em Go"
series_order: 4
---

E aí, pessoal!

Esta é a quarta parte da série **LLM do Zero em Go**. Até agora construímos um tokenizador, exploramos vetores de palavras e implementamos cadeias de Markov para prever o próximo token. Se você não leu os posts anteriores, vale a pena dar uma olhada antes de continuar aqui.

Este post cobre os vídeos 10 e 11 da série e trata de um salto conceitual importante: sair das tabelas de frequência do Markov e entrar em redes neurais de verdade. O projeto completo está em github.com/otavi/llm-do-zero.

---

## Por que sair do Markov?

Uma cadeia de Markov decide o próximo token consultando uma tabela de frequências. Se o modelo viu "o gato" seguido de "dorme" 47 vezes no corpus, essa contagem guia a predição. É simples e funciona para frases curtas. O problema é que uma tabela de frequências não generaliza.

Se o modelo nunca viu "o felino" no treinamento, ele não tem como aproveitar o que aprendeu sobre "o gato". São entradas completamente diferentes para uma tabela. Uma rede neural não tem esse problema. Ela aprende representações numéricas que capturam similaridades. Depois de ver "gato" e "dorme" juntos muitas vezes, ela consegue inferir algo útil sobre "felino", porque os dois acabam com vetores parecidos no espaço de embeddings.

A diferença não é só capacidade de memorização. É a habilidade de generalizar a partir de padrões. É isso que torna uma rede neural útil para linguagem.

Este post constrói o caminho do neurônio mais simples até a camada FeedForward que existe dentro de cada bloco transformer do nosso projeto.

---

## Um único neurônio

Tudo começa de um jeito bem direto. Um neurônio recebe uma entrada, multiplica por um peso, soma um bias, e passa o resultado por uma função de ativação.

```
saída = ativação(peso * entrada + bias)
```

Em Go, a implementação mais simples possível é:

```go
package model

import "math"

type Neuron struct {
    Weight float64
    Bias   float64
}

func (n *Neuron) Forward(input float64) float64 {
    return math.Tanh(n.Weight*input + n.Bias)
}
```

O que o `Weight` faz geometricamente: ele escala e rotaciona a entrada. Um peso alto amplifica o sinal. Um peso próximo de zero o suprime. Um peso negativo inverte o sinal.

O `Bias` desloca a saída. Sem bias, a função sempre passa pela origem. Com bias, você pode deslocar a curva para qualquer posição no eixo horizontal. Na prática, o bias dá ao neurônio a liberdade de ativar mesmo quando a entrada é zero.

Com um único neurônio e uma função de ativação linear, você consegue separar problemas linearmente separáveis, como classificar pontos acima ou abaixo de uma reta. Mas só isso.

O que torna as redes profundas poderosas é o Teorema da Aproximação Universal (Cybenko, 1989): uma rede com pelo menos uma camada oculta e uma função de ativação não-linear pode aproximar qualquer função contínua com precisão arbitrária, dado neurônios suficientes. Isso é a base teórica que justifica toda a engenharia que vem a seguir.

---

## Funções de ativação

Por que precisamos de funções de ativação não-lineares? A resposta é direta: sem elas, empilhar camadas não serve para nada.

Se cada camada faz `y = Wx + b`, então duas camadas fazem:

```
y = W2 * (W1 * x + b1) + b2
  = W2*W1 * x + W2*b1 + b2
```

O resultado é uma única transformação linear com matriz `W2*W1`. Cem camadas lineares colapsam para uma. A não-linearidade é o que permite que cada camada aprenda algo novo que a anterior não capturou.

As três funções mais usadas são:

**ReLU** (Rectified Linear Unit):
```
f(x) = max(0, x)
```
Simples e rápida. Neurônios com entrada negativa simplesmente desligam (saída zero). O problema é o "dead ReLU": se durante o treinamento um neurônio recebe gradientes negativos repetidamente, seu peso pode ficar em uma região onde a saída é sempre zero, e ele nunca mais aprende nada.

**Sigmoid**:
```
f(x) = 1 / (1 + e^(-x))
```
Comprime a saída para o intervalo (0, 1). Era popular em redes antigas. O problema é a saturação: quando `x` é muito positivo ou muito negativo, a derivada fica próxima de zero. O gradiente desaparece ao ser propagado para camadas anteriores, o que dificulta o treinamento de redes profundas.

**GELU** (Gaussian Error Linear Unit):
```
GELU(x) = 0.5 * x * (1 + tanh(sqrt(2/pi) * (x + 0.044715 * x^3)))
```

Esta é a função que usamos no projeto, e é a que está em todos os transformers modernos, incluindo GPT-2 e GPT-3. O raciocínio por trás dela é probabilístico: GELU pondera a entrada `x` pela probabilidade de que `x` seja maior que zero sob uma distribuição normal padrão N(0,1). É uma porta suave. Em vez de desligar o neurônio bruscamente como o ReLU faz, o GELU atenua gradualmente.

O código exato do projeto:

```go
func GELU(x float64) float64 {
    return 0.5 * x * (1.0 + math.Tanh(math.Sqrt(2.0/math.Pi)*(x+0.044715*x*x*x)))
}

func GELUDeriv(x float64) float64 {
    k := math.Sqrt(2.0 / math.Pi)
    inner := k * (x + 0.044715*x*x*x)
    tanh := math.Tanh(inner)
    sech2 := 1.0 - tanh*tanh
    return 0.5*(1.0+tanh) + 0.5*x*sech2*k*(1.0+3.0*0.044715*x*x)
}
```

Precisamos de `GELUDeriv` para o backpropagation. Quando o gradiente do erro chega nessa camada durante o passo backward, precisamos multiplicá-lo pela derivada da GELU em cada ponto de pré-ativação.

O motivo prático para escolher GELU sobre ReLU em transformers é que ela não produz gradientes zero em região negativa de forma absoluta. Ela deixa passar um sinal pequeno mesmo para entradas negativas, o que mantém mais neurônios ativos durante o treinamento.

---

## De um neurônio para uma camada

Um neurônio com entrada e saída escalares não resolve nada interessante. A extensão natural é: em vez de um peso `w` (escalar), usamos uma matriz de pesos `W` de forma `(input_dim, output_dim)`.

Cada linha da saída é o produto interno da entrada com uma coluna de `W`, mais o bias correspondente. Isso é multiplicação de matrizes.

```go
// Uma camada: y = GELU(xW + b)
// x: (batch, input_dim)
// W: (input_dim, output_dim)
// b: (1, output_dim) - transmitido sobre o batch
// y: (batch, output_dim)
```

Para um batch de sequências, `x` tem forma `(T, embed_dim)`, onde `T` é o número de tokens. Cada linha de `x` é o vetor de embedding de um token. A multiplicação `x @ W` calcula, para cada token, sua projeção no espaço de saída da camada.

O bias `b` tem forma `(1, output_dim)` e é somado a cada linha do resultado. Em Go, isso é um loop explícito sobre as linhas do tensor de saída.

Com isso, saímos do neurônio escalar e chegamos em operações de álgebra linear sobre tensores. É exatamente o que o nosso `FeedForward` faz.

---

## O FeedForward do nosso projeto

A camada FeedForward no projeto implementa a fórmula padrão do transformer:

```
FFN(x) = GELU(x @ W1 + b1) @ W2 + b2
```

É uma rede de duas camadas. A primeira projeta de `embed_dim` para `ffn_dim` (expansão). A segunda projeta de volta de `ffn_dim` para `embed_dim` (compressão). Entre elas, a GELU.

```go
package model

import "github.com/otavi/llm-do-zero/internal/tensor"

// FeedForward is a position-wise two-layer network:
//   FFN(x) = GELU(x W1 + b1) W2 + b2
type FeedForward struct {
    W1, W2 *tensor.Tensor
    B1, B2 *tensor.Tensor
    cache struct {
        x, preact, h *tensor.Tensor
    }
}

func NewFeedForward(cfg Config) *FeedForward {
    const std = 0.02
    ff := &FeedForward{
        W1: tensor.New(cfg.EmbedDim, cfg.FFNDim),
        W2: tensor.New(cfg.FFNDim, cfg.EmbedDim),
        B1: tensor.New(1, cfg.FFNDim),
        B2: tensor.New(1, cfg.EmbedDim),
    }
    ff.W1.RandNormal(0, std)
    ff.W2.RandNormal(0, std)
    return ff
}

func (ff *FeedForward) Forward(x *tensor.Tensor) *tensor.Tensor {
    T, ffnDim := x.Rows, ff.W1.Cols
    preact := tensor.MatMul(x, ff.W1)
    for i := 0; i < T; i++ {
        for j := 0; j < ffnDim; j++ {
            preact.AddAt(i, j, ff.B1.At(0, j))
        }
    }
    h := tensor.New(T, ffnDim)
    for i := range h.Data {
        h.Data[i] = tensor.GELU(preact.Data[i])
    }
    out := tensor.MatMul(h, ff.W2)
    for i := 0; i < T; i++ {
        for j := 0; j < ff.W2.Cols; j++ {
            out.AddAt(i, j, ff.B2.At(0, j))
        }
    }
    ff.cache.x = x
    ff.cache.preact = preact
    ff.cache.h = h
    return out
}
```

No GPT-2, a proporção padrão é `FFNDim = 4 * EmbedDim`. Para `EmbedDim = 512`, a primeira camada expande para 2048 dimensões, aplica GELU, e a segunda camada comprime de volta para 512. Por que essa expansão?

A intuição é que a camada FFN funciona como uma memória de chave-valor. O paper "Transformer Feed-Forward Layers Are Key-Value Memories" (Geva et al., 2021) mostra que as colunas de `W1` atuam como vetores de chave que detectam padrões linguísticos, e as colunas de `W2` como vetores de valor que emitem as ativações correspondentes. O espaço expandido dá ao modelo mais "slots" de memória para armazenar associações entre padrões de tokens.

O `cache` armazena as ativações intermediárias (`x`, `preact`, `h`) durante o forward pass. Elas são necessárias durante o backward pass para calcular os gradientes. Isso é um padrão clássico de autograd manual.

---

## Backpropagation: como o modelo aprende

Backpropagation é a regra da cadeia aplicada de trás para frente na computação. A ideia central: se sabemos como o erro muda com respeito à saída de uma camada (`dL/dy`), podemos calcular como o erro muda com respeito às entradas e parâmetros dessa camada.

Para uma camada linear `y = xW + b`:

- Gradiente do erro com respeito a `W`: `dL/dW = x^T @ dL/dy`
- Gradiente do erro com respeito a `b`: `dL/db = soma(dL/dy, eixo=0)`
- Gradiente do erro com respeito a `x`: `dL/dx = dL/dy @ W^T` (passa para a camada anterior)

O gradiente flui de trás para frente. Cada operação sabe como inverter seu fluxo de informação.

Para o nosso `FeedForward`, o backward percorre as mesmas operações na ordem inversa:

1. Gradiente flui pela segunda camada linear (`W2`)
2. Gradiente flui pela GELU (usando a derivada `GELUDeriv`)
3. Gradiente flui pela primeira camada linear (`W1`)

```go
func (ff *FeedForward) Backward(grad *tensor.Tensor) *tensor.Tensor {
    // grad flui pela W2
    dW2 := tensor.MatMul(tensor.Transpose(ff.cache.h), grad)
    for i := range ff.W2.Grad {
        ff.W2.Grad[i] += dW2.Data[i]
    }
    dh := tensor.MatMul(grad, tensor.Transpose(ff.W2))

    // derivada da GELU em cada pré-ativação
    dPreact := tensor.New(ff.cache.x.Rows, ff.W1.Cols)
    for i := range dPreact.Data {
        dPreact.Data[i] = dh.Data[i] * tensor.GELUDeriv(ff.cache.preact.Data[i])
    }

    // grad flui pela W1
    dW1 := tensor.MatMul(tensor.Transpose(ff.cache.x), dPreact)
    for i := range ff.W1.Grad {
        ff.W1.Grad[i] += dW1.Data[i]
    }
    return tensor.MatMul(dPreact, tensor.Transpose(ff.W1))
}
```

Note que os gradientes são acumulados com `+=` em vez de atribuídos diretamente. Isso porque em um transformer completo, a mesma camada pode receber gradientes de múltiplos caminhos. O acúmulo garante que todas as contribuições sejam somadas antes da atualização dos pesos. O `ZeroGrad()` reseta esses acumuladores no início de cada passo de treinamento.

O gradiente retornado (`dL/dx`) é passado para a camada anterior no grafo computacional, que então faz o mesmo processo, até chegarmos nos embeddings.

---

## O otimizador Adam

Uma vez que temos os gradientes, precisamos atualizar os pesos. O método mais simples é o SGD (Stochastic Gradient Descent):

```
θ = θ - lr * dL/dθ
```

Subtrai da cada parâmetro um múltiplo do seu gradiente. O problema é que usar a mesma taxa de aprendizado (`lr`) para todos os parâmetros é ineficiente. Parâmetros com gradientes consistentemente grandes precisam de passos menores. Parâmetros com gradientes ruidosos precisam de mais suavização.

Adam (Adaptive Moment Estimation, Kingma & Ba, 2014) resolve isso rastreando duas médias móveis por parâmetro:

- `m`: média móvel dos gradientes (momento de primeira ordem). Funciona como momentum: acumula a direção do gradiente ao longo do tempo, o que ajuda a atravessar regiões planas da função de perda.
- `v`: média móvel dos quadrados dos gradientes (momento de segunda ordem). Rastreia a magnitude do gradiente por parâmetro, permitindo adaptar a taxa de aprendizado individualmente.

```
m = β1 * m + (1 - β1) * g
v = β2 * v + (1 - β2) * g²
m̂ = m / (1 - β1^t)
v̂ = v / (1 - β2^t)
θ = θ - lr * m̂ / (sqrt(v̂) + ε)
```

As divisões por `(1 - β^t)` são correções de viés. No início do treinamento, `m` e `v` estão zerados. Sem correção, as primeiras atualizações seriam artificialmente pequenas.

A implementação do projeto:

```go
type Adam struct {
    LR, Beta1, Beta2, Eps float64
    step                  int
    m, v                  map[*tensor.Tensor][]float64
}

func NewAdam(lr float64) *Adam {
    return &Adam{
        LR: lr, Beta1: 0.9, Beta2: 0.999, Eps: 1e-8,
        m: make(map[*tensor.Tensor][]float64),
        v: make(map[*tensor.Tensor][]float64),
    }
}

func (a *Adam) Step(params []*tensor.Tensor) {
    a.step++
    bc1 := 1.0 - math.Pow(a.Beta1, float64(a.step))
    bc2 := 1.0 - math.Pow(a.Beta2, float64(a.step))
    for _, p := range params {
        if _, ok := a.m[p]; !ok {
            a.m[p] = make([]float64, len(p.Data))
            a.v[p] = make([]float64, len(p.Data))
        }
        m, v := a.m[p], a.v[p]
        for i, g := range p.Grad {
            m[i] = a.Beta1*m[i] + (1-a.Beta1)*g
            v[i] = a.Beta2*v[i] + (1-a.Beta2)*g*g
            mHat := m[i] / bc1
            vHat := v[i] / bc2
            p.Data[i] -= a.LR * mHat / (math.Sqrt(vHat) + a.Eps)
        }
    }
}
```

Os valores padrão `β1 = 0.9`, `β2 = 0.999` e `ε = 1e-8` são os que o paper original recomenda e são usados praticamente sem mudanças em todos os transformers modernos. A taxa de aprendizado típica para um transformer pequeno é algo em torno de `3e-4`.

O `Eps` é um número pequeno somado ao denominador para evitar divisão por zero no início do treinamento, quando `v` ainda está próximo de zero.

---

## Um treino completo simples

Para juntar tudo, aqui está um loop de treinamento mínimo usando a camada FeedForward para prever o próximo token a partir de embeddings:

```go
ff := NewFeedForward(cfg)
adam := NewAdam(3e-4)

for step := 0; step < 1000; step++ {
    // forward
    logits := ff.Forward(embeddings)
    loss, dLogits := crossEntropy(logits, targets)

    // backward
    ff.ZeroGrad()
    ff.Backward(dLogits)

    // atualiza pesos
    adam.Step(ff.Parameters())

    if step%100 == 0 {
        fmt.Printf("step %d loss %.4f\n", step, loss)
    }
}
```

O fluxo é sempre o mesmo, independente da complexidade do modelo:

1. **Forward**: calcula as predições a partir da entrada
2. **Perda**: mede o quão erradas estão as predições (cross-entropy para classificação de tokens)
3. **Backward**: propaga o gradiente do erro de volta por todas as operações
4. **Atualização**: ajusta os pesos na direção que reduz a perda

`crossEntropy` recebe os logits (uma distribuição não-normalizada sobre o vocabulário) e os índices dos tokens corretos. Ela retorna a perda escalar e o gradiente `dLogits`, que é o ponto de partida do backward pass.

`ff.ZeroGrad()` reseta os gradientes acumulados para zero antes de cada passo. Se você esquecer isso, os gradientes de passos anteriores vão contaminar o passo atual.

`ff.Parameters()` retorna os ponteiros para `W1`, `W2`, `B1`, `B2`. O Adam usa os ponteiros como chaves nos seus mapas `m` e `v` para identificar cada parâmetro entre passos.

Esse loop de treinamento é o esqueleto de qualquer treino de rede neural. Em um transformer completo, o `ff.Forward(embeddings)` vira `model.Forward(tokens)`, que internamente passa pelos embeddings, por cada bloco transformer (atenção + FFN), e pela camada de projeção final. Mas a estrutura do loop não muda.

---

## O que vem a seguir

A camada FeedForward que construímos aqui processa cada token de forma independente. Ela transforma o vetor de embedding de cada posição sem olhar para as outras posições. Ela não tem como saber que "banco" na frase "fui ao banco sacar dinheiro" precisa de um vetor diferente do "banco" em "sentei no banco da praça".

Esse é o trabalho da atenção (attention). A camada de atenção é o mecanismo que permite que os tokens se comuniquem entre si. Ela decide, para cada posição, quais outras posições da sequência são relevantes e mistura suas informações de acordo.

Atenção é o que torna transformers capazes de entender contexto, resolver ambiguidades e rastrear dependências de longa distância em um texto. É o assunto do próximo post.

---

## Referências

- Cybenko, G. (1989). "Approximation by superpositions of a sigmoidal function." Mathematics of Control, Signals and Systems. https://link.springer.com/article/10.1007/BF02551274
- Hendrycks, D. & Gimpel, K. (2016). "Gaussian Error Linear Units (GELUs)." arXiv. https://arxiv.org/abs/1606.08415
- Kingma, D. P. & Ba, J. (2014). "Adam: A Method for Stochastic Optimization." arXiv. https://arxiv.org/abs/1412.6980
- Geva, M. et al. (2021). "Transformer Feed-Forward Layers Are Key-Value Memories." EMNLP 2021. https://arxiv.org/abs/2012.14913
- Goodfellow, I., Bengio, Y. & Courville, A. (2016). "Deep Learning." MIT Press. https://www.deeplearningbook.org/
- 3Blue1Brown. "Neural Networks" series. https://www.youtube.com/playlist?list=PLZHQObOWTQDNU6R1_67000Dx_ZCJB-3pi
- Projeto llm-do-zero: https://github.com/otavi/llm-do-zero
