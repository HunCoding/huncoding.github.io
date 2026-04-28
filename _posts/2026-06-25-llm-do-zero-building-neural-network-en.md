---
layout: post
title: "Building a neuron and our first neural network in Go"
subtitle: "From a linear function with weight and bias to a multi-layer network with GELU and backpropagation"
author: otavio_celestino
date: 2026-06-25 08:00:00 -0300
categories: [Go, AI, LLM]
tags: [go, golang, llm, neural-network, backpropagation, gelu, feedforward, gradient]
comments: true
image: "/assets/img/posts/2026-06-25-llm-do-zero-construindo-rede-neural.png"
lang: en
original_post: "/llm-do-zero-construindo-rede-neural/"
series: "LLM from Scratch in Go"
series_order: 4
---

Hey everyone!

This is the fourth post in the **LLM from Scratch in Go** series. So far we have built a tokenizer, explored word vectors, and implemented Markov chains to predict the next token. If you have not read the previous posts, it is worth going through them before continuing here.

This post covers videos 10 and 11 of the series and addresses an important conceptual jump: moving away from Markov frequency tables and into real neural networks. The full project is at github.com/otavi/llm-do-zero.

---

## Why move beyond Markov?

A Markov chain decides the next token by looking up a frequency table. If the model saw "the cat" followed by "sleeps" 47 times in the corpus, that count guides the prediction. It is simple and works for short phrases. The problem is that a frequency table does not generalize.

If the model never saw "the feline" during training, it has no way to use what it learned about "the cat". They are completely different keys in a table. A neural network does not have this problem. It learns numerical representations that capture similarities. After seeing "cat" and "sleeps" together many times, it can infer something useful about "feline", because both end up with similar vectors in the embedding space.

The difference is not just memorization capacity. It is the ability to generalize from patterns. That is what makes a neural network useful for language.

This post builds the path from the simplest neuron to the FeedForward layer that lives inside every transformer block in our project.

---

## A single neuron

Everything starts simply. A neuron receives an input, multiplies it by a weight, adds a bias, and passes the result through an activation function.

```
output = activation(weight * input + bias)
```

In Go, the simplest possible implementation is:

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

What `Weight` does geometrically: it scales and rotates the input. A high weight amplifies the signal. A weight near zero suppresses it. A negative weight inverts the signal.

`Bias` shifts the output. Without a bias, the function always passes through the origin. With a bias, you can shift the curve to any position along the horizontal axis. In practice, bias gives the neuron the freedom to activate even when the input is zero.

With a single neuron and a linear activation function, you can separate linearly separable problems, like classifying points above or below a line. But only that.

What makes deep networks powerful is the Universal Approximation Theorem (Cybenko, 1989): a network with at least one hidden layer and a non-linear activation function can approximate any continuous function to arbitrary precision, given enough neurons. This is the theoretical foundation that justifies all the engineering that follows.

---

## Activation functions

Why do we need non-linear activation functions? The answer is direct: without them, stacking layers accomplishes nothing.

If each layer does `y = Wx + b`, then two layers do:

```
y = W2 * (W1 * x + b1) + b2
  = W2*W1 * x + W2*b1 + b2
```

The result is a single linear transformation with matrix `W2*W1`. One hundred linear layers collapse into one. Non-linearity is what allows each layer to learn something new that the previous one did not capture.

The three most used functions are:

**ReLU** (Rectified Linear Unit):
```
f(x) = max(0, x)
```
Simple and fast. Neurons with negative input simply turn off (output zero). The problem is the "dead ReLU": if a neuron receives negative gradients repeatedly during training, its weight can get stuck in a region where output is always zero, and it never learns anything again.

**Sigmoid**:
```
f(x) = 1 / (1 + e^(-x))
```
Compresses the output to the range (0, 1). It was popular in older networks. The problem is saturation: when `x` is very positive or very negative, the derivative gets close to zero. The gradient vanishes as it is propagated to earlier layers, making it hard to train deep networks.

**GELU** (Gaussian Error Linear Unit):
```
GELU(x) = 0.5 * x * (1 + tanh(sqrt(2/pi) * (x + 0.044715 * x^3)))
```

This is the function we use in the project, and it is the one in all modern transformers, including GPT-2 and GPT-3. The reasoning behind it is probabilistic: GELU weights the input `x` by the probability that `x` is greater than zero under a standard normal distribution N(0,1). It is a smooth gate. Instead of shutting off a neuron abruptly like ReLU does, GELU attenuates gradually.

The exact code from the project:

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

We need `GELUDeriv` for backpropagation. When the error gradient reaches this layer during the backward pass, we need to multiply it by the GELU derivative at each pre-activation point.

The practical reason to choose GELU over ReLU in transformers is that it does not produce absolute zero gradients in the negative region. It lets a small signal through even for negative inputs, which keeps more neurons active during training.

---

## From one neuron to a full layer

A neuron with scalar input and output does not solve anything interesting. The natural extension: instead of one weight `w` (scalar), we use a weight matrix `W` of shape `(input_dim, output_dim)`.

Each row of the output is the dot product of the input with one column of `W`, plus the corresponding bias. This is matrix multiplication.

```go
// One layer: y = GELU(xW + b)
// x: (batch, input_dim)
// W: (input_dim, output_dim)
// b: (1, output_dim) - broadcast over batch
// y: (batch, output_dim)
```

For a batch of sequences, `x` has shape `(T, embed_dim)`, where `T` is the number of tokens. Each row of `x` is the embedding vector of one token. The multiplication `x @ W` computes, for each token, its projection into the output space of the layer.

The bias `b` has shape `(1, output_dim)` and is added to each row of the result. In Go, this is an explicit loop over the rows of the output tensor.

With this, we move from a scalar neuron to linear algebra operations over tensors. This is exactly what our `FeedForward` does.

---

## The FeedForward layer in our project

The FeedForward layer in the project implements the standard transformer formula:

```
FFN(x) = GELU(x @ W1 + b1) @ W2 + b2
```

It is a two-layer network. The first layer projects from `embed_dim` to `ffn_dim` (expansion). The second projects back from `ffn_dim` to `embed_dim` (compression). Between them, GELU.

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

In GPT-2, the standard ratio is `FFNDim = 4 * EmbedDim`. For `EmbedDim = 512`, the first layer expands to 2048 dimensions, applies GELU, and the second layer compresses back to 512. Why this expansion?

The intuition is that the FFN layer works as a key-value memory. The paper "Transformer Feed-Forward Layers Are Key-Value Memories" (Geva et al., 2021) shows that the columns of `W1` act as key vectors that detect linguistic patterns, and the columns of `W2` as value vectors that emit corresponding activations. The expanded space gives the model more "memory slots" to store associations between token patterns.

The `cache` stores intermediate activations (`x`, `preact`, `h`) during the forward pass. They are needed during the backward pass to compute gradients. This is a classic manual autograd pattern.

---

## Backpropagation: how the model learns

Backpropagation is the chain rule applied backwards through the computation. The core idea: if we know how the error changes with respect to the output of a layer (`dL/dy`), we can compute how the error changes with respect to the inputs and parameters of that layer.

For a linear layer `y = xW + b`:

- Gradient of the error with respect to `W`: `dL/dW = x^T @ dL/dy`
- Gradient of the error with respect to `b`: `dL/db = sum(dL/dy, axis=0)`
- Gradient of the error with respect to `x`: `dL/dx = dL/dy @ W^T` (passed to the previous layer)

The gradient flows backward. Each operation knows how to reverse its information flow.

For our `FeedForward`, the backward pass traverses the same operations in reverse order:

1. Gradient flows through the second linear layer (`W2`)
2. Gradient flows through GELU (using the `GELUDeriv` derivative)
3. Gradient flows through the first linear layer (`W1`)

```go
func (ff *FeedForward) Backward(grad *tensor.Tensor) *tensor.Tensor {
    // grad flows through W2
    dW2 := tensor.MatMul(tensor.Transpose(ff.cache.h), grad)
    for i := range ff.W2.Grad {
        ff.W2.Grad[i] += dW2.Data[i]
    }
    dh := tensor.MatMul(grad, tensor.Transpose(ff.W2))

    // GELU derivative at each pre-activation
    dPreact := tensor.New(ff.cache.x.Rows, ff.W1.Cols)
    for i := range dPreact.Data {
        dPreact.Data[i] = dh.Data[i] * tensor.GELUDeriv(ff.cache.preact.Data[i])
    }

    // grad flows through W1
    dW1 := tensor.MatMul(tensor.Transpose(ff.cache.x), dPreact)
    for i := range ff.W1.Grad {
        ff.W1.Grad[i] += dW1.Data[i]
    }
    return tensor.MatMul(dPreact, tensor.Transpose(ff.W1))
}
```

Note that gradients are accumulated with `+=` instead of being directly assigned. This is because in a complete transformer, the same layer may receive gradients from multiple paths. Accumulation ensures all contributions are summed before the weight update. `ZeroGrad()` resets those accumulators to zero at the start of each training step.

The returned gradient (`dL/dx`) is passed to the previous layer in the computational graph, which then does the same process, until we reach the embeddings.

---

## The Adam optimizer

Once we have the gradients, we need to update the weights. The simplest method is SGD (Stochastic Gradient Descent):

```
theta = theta - lr * dL/dtheta
```

Subtract from each parameter a multiple of its gradient. The problem is that using the same learning rate (`lr`) for all parameters is inefficient. Parameters with consistently large gradients need smaller steps. Parameters with noisy gradients need more smoothing.

Adam (Adaptive Moment Estimation, Kingma & Ba, 2014) solves this by tracking two running averages per parameter:

- `m`: running average of gradients (first moment). Acts as momentum: accumulates the gradient direction over time, which helps cross flat regions of the loss surface.
- `v`: running average of squared gradients (second moment). Tracks gradient magnitude per parameter, allowing the learning rate to adapt individually.

```
m = beta1 * m + (1 - beta1) * g
v = beta2 * v + (1 - beta2) * g^2
m_hat = m / (1 - beta1^t)
v_hat = v / (1 - beta2^t)
theta = theta - lr * m_hat / (sqrt(v_hat) + epsilon)
```

The divisions by `(1 - beta^t)` are bias corrections. At the start of training, `m` and `v` are initialized to zero. Without correction, the first updates would be artificially small.

The project implementation:

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

The default values `beta1 = 0.9`, `beta2 = 0.999` and `epsilon = 1e-8` are what the original paper recommends and are used virtually unchanged in all modern transformers. A typical learning rate for a small transformer is around `3e-4`.

`Eps` is a small number added to the denominator to avoid division by zero at the start of training, when `v` is still near zero.

---

## A complete minimal training loop

To put everything together, here is a minimal training loop using the FeedForward layer to predict the next token from embeddings:

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

    // update weights
    adam.Step(ff.Parameters())

    if step%100 == 0 {
        fmt.Printf("step %d loss %.4f\n", step, loss)
    }
}
```

The flow is always the same, regardless of model complexity:

1. **Forward**: compute predictions from the input
2. **Loss**: measure how wrong the predictions are (cross-entropy for token classification)
3. **Backward**: propagate the error gradient back through all operations
4. **Update**: adjust weights in the direction that reduces loss

`crossEntropy` receives the logits (an unnormalized distribution over the vocabulary) and the correct token indices. It returns the scalar loss and the gradient `dLogits`, which is the starting point of the backward pass.

`ff.ZeroGrad()` resets the accumulated gradients to zero before each step. If you forget this, gradients from previous steps will contaminate the current step.

`ff.Parameters()` returns pointers to `W1`, `W2`, `B1`, `B2`. Adam uses the pointers as keys in its `m` and `v` maps to identify each parameter across steps.

This training loop is the skeleton of any neural network training run. In a full transformer, `ff.Forward(embeddings)` becomes `model.Forward(tokens)`, which internally passes through embeddings, through each transformer block (attention + FFN), and through the final projection layer. But the structure of the loop does not change.

---

## What comes next

The FeedForward layer we built here processes each token independently. It transforms the embedding vector of each position without looking at the other positions. It has no way of knowing that "bank" in "I went to the bank to withdraw money" needs a different vector from "bank" in "I sat on the river bank".

That is the job of attention. The attention layer is the mechanism that allows tokens to communicate with each other. It decides, for each position, which other positions in the sequence are relevant and mixes their information accordingly.

Attention is what makes transformers capable of understanding context, resolving ambiguities, and tracking long-range dependencies in text. That is the subject of the next post.

---

## References

- Cybenko, G. (1989). "Approximation by superpositions of a sigmoidal function." Mathematics of Control, Signals and Systems. https://link.springer.com/article/10.1007/BF02551274
- Hendrycks, D. & Gimpel, K. (2016). "Gaussian Error Linear Units (GELUs)." arXiv. https://arxiv.org/abs/1606.08415
- Kingma, D. P. & Ba, J. (2014). "Adam: A Method for Stochastic Optimization." arXiv. https://arxiv.org/abs/1412.6980
- Geva, M. et al. (2021). "Transformer Feed-Forward Layers Are Key-Value Memories." EMNLP 2021. https://arxiv.org/abs/2012.14913
- Goodfellow, I., Bengio, Y. & Courville, A. (2016). "Deep Learning." MIT Press. https://www.deeplearningbook.org/
- 3Blue1Brown. "Neural Networks" series. https://www.youtube.com/playlist?list=PLZHQObOWTQDNU6R1_67000Dx_ZCJB-3pi
- Project llm-do-zero: https://github.com/otavi/llm-do-zero
