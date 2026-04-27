---
layout: post
title: "Atenção e o mini LLM gerando texto"
subtitle: "Implementando multi-head causal self-attention, o transformer completo e treinando nosso mini GPT em Go"
author: otavio_celestino
# date: 2026-07-16 08:00:00 -0300
date: 2026-04-27 08:00:00 -0300
categories: [Go, IA, LLM]
tags: [go, golang, llm, attention, transformer, gpt, text-generation, self-attention]
comments: true
image: "/assets/img/posts/2026-07-16-llm-do-zero-atencao-mini-llm.png"
lang: pt-BR
---

E aí, pessoal!

Este é o quinto e último post da série **LLM do Zero em Go**. Nos posts anteriores construímos um tokenizador BPE (post 1), vetores de palavras com busca semântica (post 2), uma cadeia de Markov e seus limites (post 3), e uma rede feedforward com backpropagation manual (post 4). Este post cobre os vídeos 13 a 15 da série.

Chegamos no mecanismo central que diferencia um transformer de tudo que veio antes: a atenção. Este post implementa multi-head causal self-attention em Go, monta o bloco transformer completo, constrói o modelo GPT, e treina ele para gerar texto.

O código completo está em [github.com/otavi/llm-do-zero](https://github.com/otavi/llm-do-zero).

---

## O problema que atenção resolve

A cadeia de Markov do post 3 esquecia tudo além dos últimos N tokens. A rede feedforward do post 4 deixou cada token fazer seus próprios cálculos internos, mas os tokens não se enxergavam. Cada posição do contexto era processada de forma completamente independente das outras.

Isso cria um problema concreto. Considere a frase:

```
O gato sentou no tapete porque ele estava confortável.
```

A palavra "ele" na posição 9 precisa ser resolvida: a que se refere? Ao gato ou ao tapete? Para um humano é óbvio: gatos ficam confortáveis, tapetes normalmente não. Mas para um modelo que processa cada posição independentemente, "ele" não tem como saber que o referente está na posição 2.

A atenção resolve isso. Ela deixa a posição 9 ("ele") fazer uma consulta sobre todas as posições anteriores e aprender quais são relevantes para ela. Depois de treinar, a posição de "ele" aprende a pontuar alta a posição do "gato" e baixa a do "tapete", porque o gradiente empurrou os pesos nessa direção sempre que o modelo errou o contexto.

Isso não é lógica programada manualmente. É o gradiente descobrindo, durante o treino, qual padrão de atenção minimiza o erro de predição.

---

## Scaled dot-product attention

O mecanismo de atenção começa com três matrizes aprendidas: Q (query), K (key), V (value). Para cada token de entrada `x`, calculamos:

```
Q = x · Wq
K = x · Wk
V = x · Wv
```

A ideia é simples de explicar com uma analogia de banco de dados. Cada token tem:
- Uma **query**: o que este token está procurando no contexto
- Uma **key**: o que este token está anunciando para os outros
- Um **value**: o conteúdo que ele fornece quando selecionado

O score de compatibilidade entre posição `i` (query) e posição `j` (key) é o produto interno dos seus vetores:

```
score(i, j) = Q[i] · K[j]
```

Fazemos isso para todos os pares, gerando uma matriz de scores `T x T`. Depois aplicamos softmax para converter os scores em pesos que somam 1, e multiplicamos por V para obter uma soma ponderada dos valores:

```
Attention(Q, K, V) = softmax(Q · K^T / sqrt(d_k)) · V
```

A divisão por `sqrt(d_k)` não é detalhe estético. Sem ela, quando `d_k` é grande, os produtos internos ficam muito grandes em módulo, o que empurra o softmax para regiões de gradiente quase zero (a curva satura). A divisão mantém os scores em uma escala onde o gradiente flui bem durante o treino.

Vamos ver com um exemplo mínimo: 3 tokens, vetores de dimensão 4.

Suponha que após calcular Q e K temos (para um único head):

```
Q = [[0.1, 0.8, 0.2, 0.5],   # token 0
     [0.3, 0.1, 0.9, 0.2],   # token 1
     [0.7, 0.4, 0.1, 0.6]]   # token 2

K = [[0.2, 0.7, 0.3, 0.4],
     [0.5, 0.2, 0.8, 0.1],
     [0.6, 0.9, 0.2, 0.3]]
```

O score bruto entre token 2 (query) e token 0 (key):

```
dot = 0.7*0.2 + 0.4*0.7 + 0.1*0.3 + 0.6*0.4 = 0.14 + 0.28 + 0.03 + 0.24 = 0.69
score = 0.69 / sqrt(4) = 0.69 / 2.0 = 0.345
```

Fazemos isso para cada par (i, j) onde j <= i (com máscara causal, que veremos a seguir), aplicamos softmax na linha, e temos os pesos de atenção do token 2 sobre os tokens 0 e 1.

---

## Máscara causal

Para geração de texto, o modelo não pode consultar posições futuras. Quando estamos na posição `i`, os tokens `i+1, i+2, ...` ainda não foram gerados. Se o modelo pudesse olhá-los durante o treino, ele "colaria" no gabarito e não aprenderia nada útil.

A solução é a máscara causal: antes de aplicar o softmax, definimos os scores para j > i como `-infinito`. O softmax de `-infinito` é 0, então essas posições não contribuem para a soma ponderada.

No código do projeto, isso aparece de forma direta no loop de forward:

```go
for j := 0; j <= i; j++ {  // causal: j <= i apenas
    var dot float64
    for d := 0; d < Dh; d++ {
        dot += q.At(i, h*Dh+d) * k.At(j, h*Dh+d)
    }
    score := dot * mha.scale
    row[j] = score
    if score > maxVal { maxVal = score }
}
```

O loop interno vai de `j = 0` até `j = i` inclusive. As posições `j > i` nunca recebem score - elas simplesmente não existem no cálculo. O efeito é idêntico a aplicar uma máscara de `-infinito` antes do softmax, mas mais eficiente porque evita calcular scores que serão descartados.

Este é o "causal" em "causal self-attention". Modelos de linguagem usam atenção causal. Modelos de codificação (como o BERT) usam atenção bidirecional onde todos os tokens podem ver todos os outros.

---

## Multi-head attention

Em vez de fazer uma atenção grande com toda a dimensão `D`, dividimos em `H` cabeças menores, cada uma com dimensão `Dh = D / H`. Cada cabeça faz sua própria atenção independente e os resultados são concatenados.

Por que isso funciona melhor? Porque cada cabeça pode especializar em padrões diferentes. Uma cabeça pode aprender dependências sintáticas (sujeito-verbo), outra pode aprender referências semânticas (pronome-antecedente), outra pode focar em padrões de posição relativa. Com uma única atenção grande, o modelo teria que resolver todos esses padrões com os mesmos pesos.

No código do projeto em `internal/model/attention.go`:

```go
func NewMultiHeadAttention(cfg Config) *MultiHeadAttention {
    D := cfg.EmbedDim
    mha := &MultiHeadAttention{
        Wq:       tensor.New(D, D),
        Wk:       tensor.New(D, D),
        Wv:       tensor.New(D, D),
        Wo:       tensor.New(D, D),
        numHeads: cfg.NumHeads,
        headDim:  D / cfg.NumHeads,
        scale:    1.0 / math.Sqrt(float64(D/cfg.NumHeads)),
    }
    const std = 0.02
    mha.Wq.RandNormal(0, std)
    mha.Wk.RandNormal(0, std)
    mha.Wv.RandNormal(0, std)
    mha.Wo.RandNormal(0, std)
    return mha
}
```

Quatro matrizes aprendidas: Wq, Wk, Wv (cada uma `D x D`), e Wo (a projeção de saída, também `D x D`). A inicialização com desvio padrão 0.02 segue o padrão do GPT-2 - mantém os pesos pequenos o suficiente para que os residuais dominem no início do treino.

No forward, os heads são processados em paralelo no mesmo passo (mesmo que o código use um loop - em produção, isso seria uma operação batch de matrizes):

```go
func (mha *MultiHeadAttention) Forward(x *tensor.Tensor) *tensor.Tensor {
    T, D := x.Rows, x.Cols
    H, Dh := mha.numHeads, mha.headDim

    q := tensor.MatMul(x, mha.Wq)
    k := tensor.MatMul(x, mha.Wk)
    v := tensor.MatMul(x, mha.Wv)

    attn := make([][]float64, H*T)
    for row := range attn {
        attn[row] = make([]float64, T)
    }
    ctx := tensor.New(T, D)

    for h := 0; h < H; h++ {
        for i := 0; i < T; i++ {
            row := attn[h*T+i]
            var maxVal float64 = math.Inf(-1)
            for j := 0; j <= i; j++ {
                var dot float64
                for d := 0; d < Dh; d++ {
                    dot += q.At(i, h*Dh+d) * k.At(j, h*Dh+d)
                }
                score := dot * mha.scale
                row[j] = score
                if score > maxVal { maxVal = score }
            }
            var sum float64
            for j := 0; j <= i; j++ {
                e := math.Exp(row[j] - maxVal)
                row[j] = e
                sum += e
            }
            for j := 0; j <= i; j++ { row[j] /= sum }

            for d := 0; d < Dh; d++ {
                var weighted float64
                for j := 0; j <= i; j++ {
                    weighted += row[j] * v.At(j, h*Dh+d)
                }
                ctx.Set(i, h*Dh+d, weighted)
            }
        }
    }
    mha.cache.x, mha.cache.q, mha.cache.k = x, q, k
    mha.cache.v, mha.cache.attn, mha.cache.ctx = v, attn, ctx
    return tensor.MatMul(ctx, mha.Wo)
}
```

O acesso `q.At(i, h*Dh+d)` extrai a fatia de dimensões `[h*Dh : (h+1)*Dh]` do vetor de query do token `i`, que corresponde ao head `h`. Os heads estão intercalados na mesma matriz em vez de serem tensores separados - isso é mais eficiente em memória e mais fácil de implementar com multiplicação de matrizes simples.

O subtrick `row[j] - maxVal` no softmax é o "stable softmax": em vez de calcular `exp(x)` direto (que pode explodir numericamente), subtrai o máximo antes. O resultado matemático é idêntico porque o maxVal cancela no denominador.

Depois de acumular o contexto ponderado nos `H` heads, o resultado passa pela matriz `Wo`, que mistura as informações de todos os heads de volta para o espaço original de dimensão D.

---

## O bloco transformer completo

A atenção sozinha não é o transformer. O transformer block combina atenção, feedforward, e dois padrões estruturais que tornam o treino de redes profundas possível: conexões residuais e layer normalization.

O código em `internal/model/block.go`:

```go
// Block: x1 = x + Attn(LN1(x))
//        out = x1 + FFN(LN2(x1))
type Block struct {
    Ln1  *LayerNorm
    Attn *MultiHeadAttention
    Ln2  *LayerNorm
    FFN  *FeedForward
}

func (b *Block) Forward(x *tensor.Tensor) *tensor.Tensor {
    ln1Out := b.Ln1.Forward(x)
    attnOut := b.Attn.Forward(ln1Out)
    x1 := tensor.Add(x, attnOut)      // conexão residual

    ln2Out := b.Ln2.Forward(x1)
    ffnOut := b.FFN.Forward(ln2Out)
    return tensor.Add(x1, ffnOut)     // conexão residual
}
```

**Conexões residuais** (`x + sublayer(x)`): o sinal original é somado à saída de cada sublayer. Por que isso importa? Durante o backpropagation, o gradiente flui através da soma. A derivada de `f(x) + x` em relação a `x` é `f'(x) + 1`. O `+1` garante que o gradiente nunca desaparece completamente - ele pode sempre "passar direto" pela conexão residual sem precisar atravessar a sublayer. Sem residuais, redes com dezenas de camadas sofrem com o problema do gradiente que desaparece.

**Pre-norm vs post-norm**: nosso código aplica LayerNorm *antes* de cada sublayer (`b.Ln1.Forward(x)` antes de `b.Attn.Forward(...)`). O paper original "Attention Is All You Need" usava post-norm (normaliza depois). Pre-norm tornou-se o padrão porque produz treino mais estável, especialmente para modelos grandes. Com pre-norm, os residuais chegam não normalizados diretamente na adição, o que preserva a escala do gradiente.

**LayerNorm**: normaliza cada vetor de token independentemente (média zero, variância um), depois aplica escala e bias aprendidos. Diferente do BatchNorm, o LayerNorm não depende do tamanho do batch, o que é importante para inferência com batch de tamanho 1.

**FeedForward**: é a rede do post 4. Para cada posição, aplica dois lineares com ativação no meio: `FFN(x) = max(0, x·W1 + b1)·W2 + b2`. Com `FFNDim = 4*EmbedDim`, o feedforward tem 4x mais parâmetros do que as matrizes de atenção. É aqui que o modelo armazena "fatos" sobre o mundo - a atenção rota informação, o feedforward processa e transforma.

---

## O modelo GPT completo

Com os blocos prontos, o modelo GPT em `internal/model/gpt.go` é direto:

```go
// GPT: ids de entrada → Embedding (token + posição) → N × Block → LayerNorm → Linear head → logits
type GPT struct {
    Embed  *Embedding
    Blocks []*Block
    LnF    *LayerNorm
    Head   *tensor.Tensor
    cfg    Config
}

func (g *GPT) Forward(ids []int) *tensor.Tensor {
    x := g.Embed.Forward(ids)
    for _, block := range g.Blocks {
        x = block.Forward(x)
    }
    x = g.LnF.Forward(x)
    return tensor.MatMul(x, g.Head)
}
```

Passo a passo:

**1. Embedding**: cada token ID é mapeado para um vetor de dimensão `EmbedDim`. Mas o transformer não tem noção intrínseca de ordem - a atenção não sabe se o token está na posição 0 ou na posição 50. Por isso somamos um segundo vetor: o positional embedding. Cada posição 0..ContextLen tem seu próprio vetor aprendido. A entrada final para os blocks é `token_embedding[id] + position_embedding[pos]`.

**2. N blocos transformer em sequência**: cada bloco recebe o tensor `T x D` e retorna um tensor `T x D` do mesmo tamanho. O número de blocos `NumLayers` controla a profundidade do modelo. Camadas mais profundas aprendem representações mais abstratas.

**3. LayerNorm final** (`LnF`): normaliza as representações antes de projetar para o vocabulário.

**4. Linear head**: projeta de `EmbedDim` para `VocabSize`. O resultado são os logits - um score para cada token do vocabulário em cada posição. Não aplicamos softmax aqui; isso é feito durante o cálculo do loss (cross-entropy com logits é mais estável numericamente) ou durante a geração (onde dividimos pela temperatura antes do softmax).

O objetivo de treino é: para cada posição `t`, o token `ids[t+1]` deve ter o maior logit. O modelo aprende a prever o próximo token em cada posição simultaneamente - é por isso que transformers são tão eficientes para treinar.

### Quantos parâmetros tem o TinyConfig?

```go
var TinyConfig = Config{
    VocabSize:  256,
    ContextLen: 128,
    EmbedDim:   64,
    NumHeads:   4,
    NumLayers:  2,
    FFNDim:     256,
}
```

Fazendo a conta:

| Componente | Cálculo | Parâmetros |
|---|---|---|
| Token embedding | 256 × 64 | 16.384 |
| Positional embedding | 128 × 64 | 8.192 |
| Atenção (Wq+Wk+Wv+Wo) por bloco | 4 × 64 × 64 | 16.384 |
| FFN (W1+b1+W2+b2) por bloco | 64×256 + 256 + 256×64 + 64 | 33.088 |
| LayerNorm (2 por bloco) | 4 × 64 × 2 | 512 |
| Final LayerNorm | 64 × 2 | 128 |
| Linear head | 64 × 256 | 16.384 |
| **2 blocos no total** | 2 × (16.384 + 33.088 + 512) | 99.968 |
| **Total** | | ~141.000 |

Cerca de 141 mil parâmetros. Para comparação: GPT-2 pequeno tem 117 milhões. GPT-4 tem estimados centenas de bilhões. A arquitetura é idêntica - o que muda é a escala.

---

## Gerando texto autoregressivamente

A função `Generate` em `gpt.go` implementa a geração token por token:

```go
func (g *GPT) Generate(prompt []int, maxNew int, temperature float64) []int {
    ids := make([]int, len(prompt))
    copy(ids, prompt)
    for range maxNew {
        ctx := ids
        if len(ctx) > g.cfg.ContextLen {
            ctx = ctx[len(ctx)-g.cfg.ContextLen:]
        }
        logits := g.Forward(ctx)
        next := sampleLogits(logits.Row(len(ctx)-1), temperature)
        ids = append(ids, next)
    }
    return ids[len(prompt):]
}
```

O ponto importante: `logits.Row(len(ctx)-1)` extrai apenas a última linha dos logits. O modelo gera logits para todas as posições, mas só nos importamos com a última posição para decidir o próximo token. As outras posições são usadas apenas durante o treino para calcular o loss em paralelo.

Se o contexto acumular mais do que `ContextLen` tokens, truncamos pelo início, mantendo sempre os tokens mais recentes. O modelo não tem memória além da janela de contexto.

---

## Temperatura e sampling

A função `sampleLogits` controla como escolhemos o próximo token a partir dos logits:

```
p_i = exp((logit_i - max_logit) / temperature) / sum_j(exp((logit_j - max_logit) / temperature))
```

Temperatura 1.0 é o softmax padrão - as probabilidades refletem fielmente o que o modelo aprendeu. Temperatura 0 (no limite) é greedy - sempre escolhe o token com maior logit, sem aleatoriedade. Temperatura > 1 achata a distribuição, tornando tokens improváveis mais prováveis - o texto fica mais criativo e menos coerente. Temperatura < 1 aguça a distribuição, concentrando probabilidade no token mais provável - o texto fica mais determinístico e repetitivo.

Para aplicações práticas:
- **Geração criativa (prosa, poesia)**: 0.7 a 1.0
- **Completamento de código**: 0.2 a 0.4
- **Extração de informação / respostas factuais**: 0.1 a 0.3
- **Exploração / brainstorming**: 1.0 a 1.2

Temperatura alta demais produz texto que não faz sentido. Temperatura muito baixa produz texto que fica preso em loops repetitivos. O range 0.7-0.9 é um bom ponto de partida para a maioria dos casos de geração de texto natural.

---

## Treinando e gerando texto

O loop de treino em `internal/train/trainer.go`:

```go
func (t *Trainer) Train() {
    params := t.Model.Parameters()
    for step := range t.Cfg.MaxSteps {
        inputs, targets := t.Dataset.Batch(t.Cfg.BatchSize, seqLen)
        t.Model.ZeroGrad()
        var totalLoss float64
        scale := 1.0 / float64(t.Cfg.BatchSize)
        for b := range t.Cfg.BatchSize {
            logits := t.Model.Forward(inputs[b])
            loss, dLogits := crossEntropy(logits, targets[b])
            totalLoss += loss
            for i := range dLogits.Data { dLogits.Data[i] *= scale }
            t.Model.Backward(dLogits)
        }
        t.Optim.Step(params)
        if step%t.Cfg.LogEvery == 0 {
            avg := totalLoss / float64(t.Cfg.BatchSize)
            fmt.Printf("step %6d | loss %.4f | ppl %.2f\n", step, avg, math.Exp(avg))
        }
    }
}
```

Para cada step: pega um batch de pares (entrada, alvo), zera os gradientes, faz forward e backward em cada sequência do batch, soma os gradientes, e atualiza os parâmetros. O `scale = 1/BatchSize` normaliza o gradiente para que o learning rate não precise ser ajustado conforme o tamanho do batch.

A perplexidade (`ppl = exp(loss)`) é a métrica intuitiva: perplexidade 255 significa que o modelo está igualmente confuso sobre 255 tokens possíveis (no começo, com vocab de 256 bytes, isso faz sentido). Perplexidade 6-8 significa que o modelo está efetivamente escolhendo entre 6-8 opções razoáveis.

Para treinar na prática:

```bash
# Clonar o projeto
git clone https://github.com/otavi/llm-do-zero
cd llm-do-zero

# Adicionar texto de treino (Shakespeare, notícias, código, qualquer coisa)
# Coloque em data/train.txt

# Treinar
go run ./cmd/train
```

Saída esperada durante o treino:

```
step      0 | loss 5.5450 | ppl 255.75
step    500 | loss 3.2100 | ppl 24.76
step   1000 | loss 2.8400 | ppl 17.12
step   5000 | loss 2.1200 | ppl 8.33
step  10000 | loss 1.8900 | ppl 6.62
```

A queda de perplexidade de 255 para 6 mostra o modelo aprendendo a estrutura do texto.

```bash
# Gerar texto
go run ./cmd/generate --prompt "The king" --tokens 100 --temperature 0.8
```

Depois de treinar em Shakespeare, a saída fica parecida com isso:

```
The king hath spoken well of thee,
And bid me come to court before the sun
Doth rise upon the castle. I have told
My lord the matter, yet he speaks of war
And will not hear the counsel of his men.
```

Não é perfeito. A cada 10-15 palavras o texto começa a desviar. Mas a estrutura métrica, o vocabulário arcaico, e as construções gramaticais são claramente shakespearianas. O modelo aprendeu os padrões do texto de treino.

---

## Limitações do nosso mini GPT

Vamos ser honestos sobre o que construímos.

Nosso TinyConfig tem ~141 mil parâmetros treinados em alguns MB de texto. O GPT-2 pequeno tem 117 milhões de parâmetros. O GPT-3 tem 175 bilhões. GPT-4 tem estimados centenas de bilhões. A diferença de escala é de 3 a 6 ordens de magnitude.

O que isso significa na prática:
- O texto gerado é coerente dentro de 5-15 tokens, depois degrade
- O modelo não tem capacidade de "memorizar fatos" - parâmetros demais para poucos dados
- A janela de contexto de 128 tokens é pequena (GPT-4 trabalha com 128k tokens)
- O treino em CPU pode levar horas para resultados razoáveis

O que nosso modelo tem de correto:
- A arquitetura é idêntica à do GPT original
- Todos os componentes que importam estão implementados: tokenização, embeddings, atenção causal multi-head, blocks transformer, layer norm, residuais, geração autoregressiva
- O código é explícito sobre cada passo - não há "mágica" escondida em abstrações de framework

A diferença entre o nosso mini GPT e o ChatGPT é de escala, dados de treino, e fine-tuning com RLHF. A arquitetura central é a mesma que Vaswani et al. publicaram em 2017.

Um detalhe que nossa implementação omite por simplicidade: em produção, a backward pass pelo transformer requer implementar gradientes para MatMul, softmax, LayerNorm, e a atenção em si. Nosso código faz o forward correto, e a estrutura do backward segue o mesmo padrão do post 4 (gradiente fluindo de trás para frente pela cadeia de operações). Para uma implementação educacional completa com backward, o repositório tem os detalhes.

---

## Conclusão da série

Esta série percorreu o caminho de `strings.Split(text, " ")` até um GPT funcional em Go, sem nenhuma biblioteca de machine learning externa.

**Post 1 - Tokenização**: transformamos texto em sequências de inteiros. Implementamos UTF-8, vocabulário de bytes, e o algoritmo BPE que comprime sequências frequentes em tokens únicos. Sem tokenização, o modelo não tem entrada.

**Post 2 - Vetores de palavras**: transformamos tokens em vetores densos de dimensão EmbedDim. Implementamos busca semântica e vimos que palavras com significados relacionados ficam próximas no espaço vetorial. Sem embeddings, o modelo não tem representação.

**Post 3 - Cadeia de Markov**: o primeiro modelo preditivo. Aprendemos probabilidades de transição entre tokens e geramos texto com elas. Ficou claro o limite: a janela de contexto é rígida e o modelo não tem parâmetros para aprender representações internas.

**Post 4 - Rede feedforward e backpropagation**: implementamos a primeira rede neural com gradiente descendente manual. Cada token passa por transformações não-lineares e o modelo aprende dos seus erros. O limite ficou explícito: tokens não se comunicam.

**Post 5 - Atenção e o transformer**: tokens finalmente se enxergam. Cada posição pode consultar todas as anteriores e decidir quais são relevantes. Multi-head attention, blocos transformer com residuais, e o GPT completo com geração autoregressiva.

O código completo está em [github.com/otavi/llm-do-zero](https://github.com/otavi/llm-do-zero). Cada componente tem seu próprio pacote, os testes cobrem os casos principais, e os comandos `train` e `generate` funcionam com qualquer arquivo de texto.

Se você chegou até aqui, você entende os fundamentos de como um transformer funciona. Não no nível "li um artigo sobre isso", mas no nível "escrevi cada operação linha por linha e vi os gradientes descendo". Isso importa.

---

## Referências

- Vaswani, A. et al. "Attention Is All You Need" (2017) - [arxiv.org/abs/1706.03762](https://arxiv.org/abs/1706.03762)
- Radford, A. et al. "Language Models are Unsupervised Multitask Learners" (GPT-2, 2019) - [openai.com/research/language-unsupervised](https://openai.com/research/language-unsupervised)
- Karpathy, A. nanoGPT - [github.com/karpathy/nanoGPT](https://github.com/karpathy/nanoGPT)
- Alammar, J. "The Illustrated Transformer" - [jalammar.github.io/illustrated-transformer/](https://jalammar.github.io/illustrated-transformer/)
- Rush, A. "The Annotated Transformer" - [nlp.seas.harvard.edu/annotated-transformer/](https://nlp.seas.harvard.edu/annotated-transformer/)
