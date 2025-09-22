---
layout: post
title: "Observabilidade Distribuída: Kafka + Jaeger + Go para Tracing Resiliente"
subtitle: "Aprendendo a criar um sistema de tracing resiliente que nunca perde dados, mesmo quando o Jaeger está fora do ar."
author: otavio_celestino
date: 2025-09-22 08:01:00 -0300
categories: [Kafka, Jaeger, Observabilidade, DevOps, Go]
tags: [kafka, jaeger, tracing, observabilidade, fault-tolerance, distributed-systems, go]
comments: true
image: "/assets/img/posts/sistema-observabilidade-opentelemetry-go.png"
---

E aí, pessoal!

Hoje vou te mostrar como criar um **sistema de tracing distribuído resiliente** usando Apache Kafka e Jaeger. A ideia é simples: e se o Jaeger cair? Você perde todos os traces? Não! Vamos usar Kafka como buffer para garantir que nenhum trace seja perdido.

Se você não conhece Jaeger ainda, dá uma olhada no [vídeo no YouTube](https://youtu.be/Zxr3Uffts9Y?si=HQez54Cm4U0VP9yO) que gravei sobre observabilidade!

{% include embed/youtube.html id="Zxr3Uffts9Y?si=HQez54Cm4U0VP9yO" %}

E se você quer aprender mais sobre como trabalhar com Kafka em Go, confira este vídeo sobre [Worker em Kafka - Lendo mensagens de filas Kafka com GoLang](https://www.youtube.com/watch?v=v1J8sdc4PAs):

{% include embed/youtube.html id="v1J8sdc4PAs" %}

## O Problema: E se o Jaeger Cair?

Imagine que você tem um sistema distribuído com múltiplos microserviços usando Kafka para comunicação. Você configurou Jaeger para rastrear como os dados fluem através do sistema - tudo funcionando perfeitamente.

Mas e se o Jaeger cair? Ou se houver problemas de rede? Ou se o collector ficar sobrecarregado?

**Você perde todos os traces!** E isso é um problema sério em produção.

## A Solução: Kafka como Buffer de Traces

A ideia é a seguinte: ao invés de enviar traces diretamente para o Jaeger, enviamos para um tópico Kafka. Depois, um consumidor dedicado pega esses traces e envia para o Jaeger.

**Vantagens:**
- **Fault Tolerance**: Se Jaeger cair, os traces ficam no Kafka
- **Buffering**: Kafka aguenta picos de tráfego
- **Replay**: Pode reprocessar traces se necessário
- **Decoupling**: Aplicações não dependem diretamente do Jaeger

## Arquitetura da Solução

Vamos criar uma arquitetura onde:

1. **Aplicações** → Enviam traces para tópico Kafka
2. **Tracing Consumer** → Consome traces do Kafka e envia para Jaeger
3. **Jaeger** → Armazena e visualiza os traces

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Aplicação 1 │───▶│   Kafka     │───▶│Tracing      │
└─────────────┘    │   Topic     │    │Consumer     │
┌─────────────┐    │             │    └─────────────┘
│ Aplicação 2 │───▶│             │           │
└─────────────┘    └─────────────┘           ▼
┌─────────────┐                           ┌─────────────┐
│ Aplicação 3 │──────────────────────────▶│   Jaeger    │
└─────────────┘                           └─────────────┘
```

## Instalação e Setup Inicial

Primeiro, vamos instalar as dependências necessárias:

```bash
# Criar o projeto
mkdir kafka-jaeger-tracing
cd kafka-jaeger-tracing
go mod init github.com/HunCoding/kafka-jaeger-tracing

# Instalar dependências
go get github.com/Shopify/sarama@latest
go get go.opentelemetry.io/otel@latest
go get go.opentelemetry.io/otel/trace@latest
go get go.opentelemetry.io/otel/exporters/jaeger@latest
go get go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp@latest
```

## Passo 1: Custom Kafka Sender

Vamos criar um sender customizado que envia traces para Kafka ao invés de diretamente para Jaeger:

```go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/Shopify/sarama"
	"go.opentelemetry.io/otel/exporters/jaeger"
)

// KafkaSender envia spans para Kafka ao invés de Jaeger
type KafkaSender struct {
	producer sarama.SyncProducer
	topic    string
}

// NewKafkaSender cria um novo sender para Kafka
func NewKafkaSender(brokers []string, topic string) (*KafkaSender, error) {
	config := sarama.NewConfig()
	config.Producer.RequiredAcks = sarama.WaitForAll
	config.Producer.Retry.Max = 3
	config.Producer.Return.Successes = true

	producer, err := sarama.NewSyncProducer(brokers, config)
	if err != nil {
		return nil, fmt.Errorf("falha ao criar producer: %w", err)
	}

	return &KafkaSender{
		producer: producer,
		topic:    topic,
	}, nil
}

// Send envia spans para o tópico Kafka
func (ks *KafkaSender) Send(ctx context.Context, spans []jaeger.Span) error {
	for _, span := range spans {
		spanData, err := json.Marshal(span)
		if err != nil {
			log.Printf("Erro ao serializar span: %v", err)
			continue
		}

		msg := &sarama.ProducerMessage{
			Topic: ks.topic,
			Value: sarama.ByteEncoder(spanData),
			Headers: []sarama.RecordHeader{
				{
					Key:   []byte("content-type"),
					Value: []byte("application/json"),
				},
			},
		}

		_, _, err = ks.producer.SendMessage(msg)
		if err != nil {
			return fmt.Errorf("falha ao enviar span para Kafka: %w", err)
		}
	}

	return nil
}

// Close fecha o producer
func (ks *KafkaSender) Close() error {
	return ks.producer.Close()
}
```

**O que fazemos aqui?**
- **KafkaSender**: Substitui o sender padrão do Jaeger
- **Serialização**: Converte spans para JSON
- **Headers**: Adiciona metadados úteis
- **Error Handling**: Trata erros de envio

## Passo 2: Tracing Consumer

Agora vamos criar o consumidor que pega traces do Kafka e envia para o Jaeger:

```go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/Shopify/sarama"
	"go.opentelemetry.io/otel/exporters/jaeger"
)

// TracingConsumer consome traces do Kafka e envia para Jaeger
type TracingConsumer struct {
	consumer sarama.ConsumerGroup
	jaegerClient *jaeger.Client
}

// NewTracingConsumer cria um novo consumidor
func NewTracingConsumer(brokers []string, groupID string, jaegerEndpoint string) (*TracingConsumer, error) {
	config := sarama.NewConfig()
	config.Consumer.Group.Rebalance.Strategy = sarama.BalanceStrategyRoundRobin
	config.Consumer.Offsets.Initial = sarama.OffsetOldest

	consumer, err := sarama.NewConsumerGroup(brokers, groupID, config)
	if err != nil {
		return nil, fmt.Errorf("falha ao criar consumer: %w", err)
	}

	// Criar cliente Jaeger
	jaegerClient, err := jaeger.NewClient(jaegerEndpoint)
	if err != nil {
		return nil, fmt.Errorf("falha ao criar cliente Jaeger: %w", err)
	}

	return &TracingConsumer{
		consumer: consumer,
		jaegerClient: jaegerClient,
	}, nil
}

// ConsumeClaim implementa sarama.ConsumerGroupHandler
func (tc *TracingConsumer) ConsumeClaim(session sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {
	for {
		select {
		case message := <-claim.Messages():
			if message == nil {
				return nil
			}

			// Processar mensagem
			if err := tc.processMessage(context.Background(), message); err != nil {
				log.Printf("Erro ao processar mensagem: %v", err)
				// IMPORTANTE: Não fazer commit se falhou
				continue
			}

			// Fazer commit apenas se processou com sucesso
			session.MarkMessage(message, "")
			session.Commit()

		case <-session.Context().Done():
			return nil
		}
	}
}

// processMessage processa uma mensagem individual
func (tc *TracingConsumer) processMessage(ctx context.Context, message *sarama.ConsumerMessage) error {
	var span jaeger.Span
	if err := json.Unmarshal(message.Value, &span); err != nil {
		return fmt.Errorf("falha ao deserializar span: %w", err)
	}

	// Enviar para Jaeger
	if err := tc.jaegerClient.SendSpan(ctx, span); err != nil {
		return fmt.Errorf("falha ao enviar span para Jaeger: %w", err)
	}

	log.Printf("Span enviado com sucesso para Jaeger: %s", span.SpanID)
	return nil
}

// Setup e Cleanup (implementação do sarama.ConsumerGroupHandler)
func (tc *TracingConsumer) Setup(sarama.ConsumerGroupSession) error   { return nil }
func (tc *TracingConsumer) Cleanup(sarama.ConsumerGroupSession) error { return nil }
```

**O que fazemos aqui?**
- **Consumer Group**: Para processamento paralelo e fault tolerance
- **Manual Commit**: Só confirma se processou com sucesso
- **Error Handling**: Não perde mensagens em caso de erro
- **Jaeger Client**: Envia spans para o collector

## Passo 3: Aplicação Go Simples

Vamos criar uma aplicação Go simples que foca na observabilidade:

```go
package main

import (
	"context"
	"log"
	"net/http"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

func main() {
	// Configurar tracing com Kafka
	setupKafkaTracing()

	// Criar rota simples
	mux := http.NewServeMux()
	mux.HandleFunc("/test", testHandler)

	// Aplicar middleware de tracing
	handler := otelhttp.NewHandler(mux, "go-app")
	
	log.Println("Servidor Go rodando na porta 8080")
	log.Fatal(http.ListenAndServe(":8080", handler))
}

func testHandler(w http.ResponseWriter, r *http.Request) {
	ctx, span := otel.Tracer("go-app").Start(r.Context(), "test-operation")
	defer span.End()

	// Simular processamento
	time.Sleep(100 * time.Millisecond)
	
	// Simular operação interna
	processData(ctx)
	
	w.Write([]byte("Test completed successfully"))
}

func processData(ctx context.Context) {
	_, span := otel.Tracer("go-app").Start(ctx, "process-data")
	defer span.End()
	
	// Simular processamento de dados
	time.Sleep(50 * time.Millisecond)
}
```

**O que fazemos aqui?**
- **Aplicação Go simples**: Apenas 1 endpoint `/test`
- **Tracing automático**: Middleware cria spans automaticamente
- **Spans manuais**: Para operações específicas
- **Foco na observabilidade**: Sem complexidade desnecessária

## Passo 4: Docker Compose para Stack Completa

Vamos criar um `docker-compose.yml` para rodar toda a stack:

```yaml
version: '3.8'

services:
  # Zookeeper para Kafka
  zookeeper:
    image: confluentinc/cp-zookeeper:latest
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000

  # Kafka
  kafka:
    image: confluentinc/cp-kafka:latest
    depends_on:
      - zookeeper
    ports:
      - "9092:9092"
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1

  # Jaeger para traces
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"  # UI
      - "14268:14268"  # HTTP collector
    environment:
      - COLLECTOR_OTLP_ENABLED=true

  # Nossa aplicação Go
  go-app:
    build: .
    ports:
      - "8080:8080"
    depends_on:
      - kafka
      - jaeger
    environment:
      - KAFKA_BROKERS=kafka:9092
      - JAEGER_ENDPOINT=http://jaeger:14268/api/traces

  # Tracing consumer
  tracing-consumer:
    build: .
    command: ["./tracing-consumer"]
    depends_on:
      - kafka
      - jaeger
    environment:
      - KAFKA_BROKERS=kafka:9092
      - JAEGER_ENDPOINT=http://jaeger:14268/api/traces
```

## Passo 5: Testando a Fault Tolerance

Agora vamos testar o que acontece quando o Jaeger cai:

```bash
# 1. Iniciar a stack completa
docker-compose up -d

# 2. Gerar tráfego de teste
for i in {1..100}; do
  curl http://localhost:8080/test
done

# 3. Verificar que traces estão chegando no Jaeger
# Acesse: http://localhost:16686

# 4. SIMULAR FALHA: Parar o Jaeger
docker-compose stop jaeger

# 5. Continuar gerando tráfego (traces vão para Kafka)
for i in {1..50}; do
  curl http://localhost:8080/test
done

# 6. Verificar logs do tracing-consumer
docker logs -f tracing-consumer
# Você verá: "Erro ao processar mensagem: falha ao enviar span para Jaeger"

# 7. RESTAURAR: Subir o Jaeger novamente
docker-compose up jaeger

# 8. Verificar que todos os traces foram recuperados
# Acesse: http://localhost:16686
# Todos os traces estarão lá, mesmo os que foram gerados durante a falha!
```

## Demonstração da Fault Tolerance

**Cenário 1: Jaeger funcionando normalmente**
- Traces são enviados para Kafka
- Tracing consumer processa e envia para Jaeger
- Tudo aparece na UI do Jaeger

**Cenário 2: Jaeger cai**
- Traces continuam sendo enviados para Kafka
- Tracing consumer tenta enviar para Jaeger e falha
- **Mensagens ficam no Kafka** (não são perdidas!)
- Consumer não faz commit (não confirma que processou)

**Cenário 3: Jaeger volta**
- Tracing consumer tenta processar novamente
- Agora consegue enviar para Jaeger
- **Todos os traces são recuperados!**

## Vantagens da Solução

1. **Zero perda de dados**: Traces ficam no Kafka até serem processados
2. **Resiliente**: Sistema continua funcionando mesmo com Jaeger fora
3. **Replay**: Pode reprocessar traces se necessário
4. **Escalável**: Múltiplos consumers podem processar em paralelo
5. **Decoupled**: Aplicações não dependem diretamente do Jaeger

## Conclusão

Criar um sistema de tracing resiliente com Kafka e Jaeger é uma solução legal para um problema real em produção. Ao usar Kafka como buffer, você garante que nenhum trace seja perdido, mesmo quando o Jaeger está fora do ar.

**Principais benefícios:**
- **Fault tolerance**: Sistema continua funcionando mesmo com falhas
- **Zero perda de dados**: Traces ficam seguros no Kafka
- **Escalabilidade**: Pode processar grandes volumes de traces
- **Flexibilidade**: Fácil de integrar com sistemas existentes

A chave é sempre pensar em observabilidade como parte da arquitetura, não como algo adicionado depois. Com essa solução, você nunca mais vai perder traces em produção!

## Referências

- [Fault Tolerance in Distributed Systems: Tracing with Apache Kafka and Jaeger](https://www.confluent.io/blog/fault-tolerance-distributed-systems-tracing-with-apache-kafka-jaeger/) - Artigo original da Confluent sobre fault tolerance em sistemas distribuídos
- [Rastreamento Distribuído com o Kafka](https://newrelic.com/pt/blog/how-to-relic/distributed-tracing-with-kafka) - Implementação de rastreamento distribuído no Kafka utilizando OpenTelemetry e Otelsarama
- [Tracing Distribuído em Aplicações com OpenTelemetry + Jaeger](https://renatogroffe.medium.com/tracing-distribu%C3%ADdo-em-aplica%C3%A7%C3%B5es-com-opentelemetry-jaeger-devops-experience-maio-2022-149492c90f32) - Implementação prática de tracing distribuído com exemplos reais
- [Começando com Jaeger](https://medium.com/%40habbema/come%C3%A7ando-com-jaeger-d29ff065ec8f) - Guia introdutório sobre Jaeger e seus componentes para monitoramento de transações distribuídas
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/) - Documentação oficial do OpenTelemetry
- [Apache Kafka Documentation](https://kafka.apache.org/documentation/) - Documentação oficial do Apache Kafka
