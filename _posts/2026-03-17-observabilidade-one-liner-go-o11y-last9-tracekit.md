---
layout: post
title: "Observabilidade one-liner em Go com o11y, Last9 Agent e TraceKit"
subtitle: "Como ligar sua aplicação Go à Last9 com uma única linha de inicialização, integrando traces, métricas, logs e erros enriquecidos"
date: 2026-03-17 08:00:00 -0300
categories: [Go, Observabilidade, DevOps, SRE]
tags: [go, observabilidade, o11y, last9, tracekit, tracing, metrics, logs]
comments: true
image: "/assets/img/posts/2026-03-17-observabilidade-one-liner-go-o11y-last9-tracekit.png"
lang: pt-BR
---

E aí, pessoal!

Instrumentar uma aplicação Go do zero costuma ser caro em tempo e energia. É biblioteca, exporter, contexto de trace sendo propagado, correlação com logs e métricas, dashboards, alertas. Na prática, muita equipe desiste no meio do caminho ou empurra observabilidade para depois.

A proposta de observabilidade one liner mira exatamente esse atrito. Em vez de começar montando um mini projeto de observabilidade, você adiciona uma linha de código que:

- Conecta seu serviço Go à Last9
- Coleta traces, métricas e logs de forma automática
- Enriquece erros com contexto de execução usando TraceKit
- Expõe dados no painel da Last9 para análise, alertas e debugging

Este post mostra como isso funciona, qual é a arquitetura por trás e um exemplo prático em Go.

## 1. Por que observabilidade one liner importa

Em uma base Go típica você encontra:

- Serviço HTTP com `net/http` ou um framework tipo `chi` ou `gin`
- Chamadas a bancos de dados, filas e APIs externas
- Erros sendo retornados em cadeia com pouca informação
- Logs soltos, sem correlação com requisições ou usuários

Sem observabilidade integrada, você não sabe com clareza:

- Qual endpoint está degradando a latência
- Qual chamada externa está causando timeouts
- Como reproduzir o erro que apareceu no log de produção
- Que impacto uma nova versão teve nos percentis de latência

Uma abordagem one liner reduz a barreira de entrada. Em vez de um projeto de semanas, você mostra valor em minutos.

## 2. Componentes do stack

O stack que vamos considerar aqui combina:

- **Last9**: plataforma de observabilidade e confiabilidade que recebe traces, métricas e logs e permite criar SLOs, alertas e dashboards.
- **Last9 Agent**: agente que recebe dados da sua aplicação Go e encaminha para a Last9.
- **TraceKit**: biblioteca focada em enriquecer erros e traces com contexto, pilha e metadados de negócio.
- **o11y para Go**: camada de inicialização que simplifica a configuração de tracing, métricas e logs em uma única chamada.

A filosofia é simples. Você inicializa o stack uma vez, no `main`, e o resto da aplicação só precisa usar o contexto padrão de Go.

## 3. Configurando dependências

Suponha um serviço Go com `go.mod` já configurado. A instalação das dependências poderia seguir esta linha:

```bash
go get github.com/last9/o11y-go
go get github.com/last9/tracekit-go
```

Os nomes acima são ilustrativos. Sempre confira a documentação oficial da Last9 para os módulos atuais e caminhos corretos.

Além das dependências Go, é comum configurar o Last9 Agent como sidecar ou daemon. Sua aplicação fala com o agente, e o agente fala com a Last9.

## 4. A one liner no `main`

O padrão é ter uma função de inicialização de observabilidade que:

- Registra o tracer global
- Configura o exporter apontando para o Last9 Agent
- Ativa métricas padrão da runtime quando disponíveis
- Integra com TraceKit e com o logger da aplicação

Um exemplo de `main.go` poderia ficar assim:

```go
package main

import (
    "log"
    "net/http"
    "os"

    "github.com/last9/o11y-go"
    "github.com/last9/tracekit-go"
)

func main() {
    // One liner de inicialização da observabilidade
    shutdown, err := o11y.Init(o11y.Config{
        ServiceName: os.Getenv("SERVICE_NAME"),
        Env:         os.Getenv("SERVICE_ENV"),
        AgentURL:    os.Getenv("LAST9_AGENT_URL"),
        APIKey:      os.Getenv("LAST9_API_KEY"),
    })
    if err != nil {
        log.Fatalf("erro ao inicializar observabilidade: %v", err)
    }
    defer shutdown()

    mux := http.NewServeMux()
    mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        _, _ = w.Write([]byte("ok"))
    })

    mux.HandleFunc("/process", func(w http.ResponseWriter, r *http.Request) {
        ctx := r.Context()

        result, err := processOrder(ctx, r)
        if err != nil {
            terr := tracekit.Wrap(ctx, err, "falha ao processar pedido",
                tracekit.WithTag("path", r.URL.Path),
                tracekit.WithTag("method", r.Method),
            )

            o11y.Logger(ctx).Error("erro ao processar pedido", "error", terr)

            http.Error(w, "erro interno", http.StatusInternalServerError)
            return
        }

        w.WriteHeader(http.StatusOK)
        _, _ = w.Write([]byte(result))
    })

    handler := o11y.HTTPMiddleware(mux)

    log.Println("servidor iniciado na porta 8080")
    if err := http.ListenAndServe(":8080", handler); err != nil {
        log.Fatalf("erro no servidor: %v", err)
    }
}
```

Acima está a ideia central de one liner:

```go
shutdown, err := o11y.Init(o11y.Config{...})
```

Essa inicialização concentra o trabalho pesado. Ela configura tracing, métricas e logs de forma consistente para o processo inteiro.

Os nomes de pacotes e funções vão depender da implementação real, mas o padrão de uso tende a ser bem próximo disso.

## 5. Integrando TraceKit na borda da aplicação

Depois de inicializar o o11y, o próximo passo é conectar erros ao contexto de trace. A função `tracekit.Wrap` faz exatamente isso.

No handler de exemplo, o fluxo fica assim:

- A requisição entra, o middleware do o11y cria um trace e um span.
- O handler extrai o `ctx` de `r.Context()`.
- A lógica de negócio roda com esse contexto.
- Se ocorre erro, você chama `tracekit.Wrap(ctx, err, mensagem, tags...)`.
- A biblioteca envolve o erro original, anexa contexto e pilha e o envia para a Last9 com o trace já correlacionado.

O resultado é que, no painel da Last9, você passa a enxergar:

- O span onde o erro aconteceu
- A pilha de chamadas do Go
- Metadados de negócio que você adicionou via tags, como `tenant_id`, `order_id`, `user_id`

## 6. Logs, métricas e traces alinhados

Com o middleware HTTP ativado, cada requisição gera um trace com spans que podem incluir:

- Recepção do request
- Chamadas a dependências instrumentadas, como bancos e HTTP clients
- Erros enriquecidos com TraceKit
- Métricas de latência, contadores de requisições e taxa de erro

Essa correlação libera o time de adivinhar o que aconteceu em produção. Em vez de olhar para logs soltos, você abre um trace específico e enxerga:

- Linha do tempo completa da requisição
- Serviços e dependências envolvidos
- Pontos de maior latência
- Erros e timeouts, com contexto

## 7. Fluxo de debug orientado por trace

Na prática, o trabalho do time em incidentes muda.

Antes de ter o stack configurado, o fluxo era algo assim:

- Alguém vê um erro genérico no log
- Começa uma caça a IDs de requisição espalhados em vários serviços
- Ninguém sabe se afeta todos os clientes ou só um tenant específico

Com o one liner em produção, o fluxo passa a ser:

- Você pesquisa o erro no painel da Last9
- Abre um trace com o erro anotado pelo TraceKit
- Visualiza usuário ou tenant afetado, serviço chamador, sequência de dependências e onde houve timeout ou erro de validação

Esse modelo reduz o tempo de análise de incidentes e leva a discussões muito mais objetivas.

## 8. Padrões recomendados de uso

Alguns padrões que ajudam a extrair mais valor dessa abordagem:

- **Inicialização centralizada no `main`**  
  Configure o o11y uma única vez. Evite inicializações duplicadas em pacotes diferentes.

- **Variáveis de ambiente obrigatórias em produção**  
  Se `LAST9_API_KEY` e `LAST9_AGENT_URL` estiverem vazios em produção, falhe rápido em vez de rodar sem observabilidade.

- **Uso consistente do contexto**  
  Sempre passe `ctx` adiante em chamadas internas. É ele que carrega trace, span, logger e metadados.

- **Erro envelopado quando cruza boundaries**  
  Use TraceKit quando um erro sai de um boundary importante, como camadas de caso de uso ou comunicação externa.

- **Tags de negócio padronizadas**  
  Defina um conjunto pequeno e consistente de tags de negócio para todos os serviços, como `tenant_id`, `request_id` e `service`.

## 9. Benefícios práticos

Adotar um modelo de observabilidade one liner em Go traz ganhos rápidos:

- Adoção mais fácil, porque o impacto inicial no código é pequeno.
- Menos código de plumbing para manter, já que o stack encapsula configuração de tracing, métricas e logs.
- Correlação de logs e erros com traces por padrão, sem esforço manual.
- Facilidade para mostrar valor para o time e para a gestão logo nas primeiras horas.

Em vez de ser um projeto que nunca sai do papel, observabilidade passa a ser uma decisão trivial que você toma ao iniciar o serviço.

## 10. Conclusão

Observabilidade one liner em Go com o11y, Last9 Agent e TraceKit é menos sobre mágica e mais sobre embalar boas práticas em uma inicialização simples. Ao centralizar configuração em uma única chamada e integrar automaticamente tracing, métricas, logs e erros enriquecidos, você tira observabilidade da categoria de projeto futuro e leva para a categoria de padrão de inicialização.

Se a sua equipe já adiou instrumentação mais de uma vez, este é um bom ponto de partida. Adicione a linha de inicialização, suba a aplicação, veja os traces na Last9 e, a partir daí, aprofunde a instrumentação onde fizer mais sentido.

