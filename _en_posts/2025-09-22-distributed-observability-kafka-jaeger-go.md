---
layout: post
title: "Distributed Observability: Kafka + Jaeger + Go for Resilient Tracing"
subtitle: "Learning to create a resilient tracing system that never loses data, even when Jaeger is down."
author: otavio_celestino
date: 2025-09-22 08:01:00 -0300
categories: [Kafka, Jaeger, Observability, DevOps, Go]
tags: [kafka, jaeger, tracing, observability, fault-tolerance, distributed-systems, go]
comments: true
image: "/assets/img/posts/sistema-observabilidade-opentelemetry-go.png"
lang: en
original_post: "/sistema-observabilidade-opentelemetry-go/"
---

Hey everyone!

Today I'll show you how to create a **resilient distributed tracing system** using Apache Kafka and Jaeger. The idea is simple: what if Jaeger goes down? Do you lose all traces? No! We'll use Kafka as a buffer to ensure no trace is lost.

If you don't know Jaeger yet, check out the [YouTube video](https://youtu.be/Zxr3Uffts9Y) I recorded about observability!

{% include embed/youtube.html id="Zxr3Uffts9Y" %}

## The Problem: What happens when Jaeger is down?

In a traditional setup, your application sends traces directly to Jaeger. If Jaeger is down:

- ❌ **Traces are lost**
- ❌ **No visibility into what happened**
- ❌ **Debugging becomes impossible**
- ❌ **Performance issues go unnoticed**

## The Solution: Kafka as a Buffer

Instead of sending traces directly to Jaeger, we'll:

1. **Send traces to Kafka** (fast, reliable)
2. **Kafka stores traces** (persistent, fault-tolerant)
3. **Consumer reads from Kafka** and sends to Jaeger
4. **If Jaeger is down**, traces stay in Kafka until it's back

## Architecture Overview

```
[Application] → [Kafka Topic] → [Consumer] → [Jaeger]
                    ↓
               [Persistent Storage]
```

**Benefits:**
- ✅ **No data loss**: Traces are stored in Kafka
- ✅ **Fault tolerance**: System works even if Jaeger is down
- ✅ **Scalability**: Multiple consumers can process traces
- ✅ **Reliability**: Kafka guarantees message delivery

## Implementation

Let's build this step by step:

### Step 1: Project Setup

```bash
mkdir resilient-tracing
cd resilient-tracing
go mod init github.com/your-username/resilient-tracing
```

Install dependencies:

```bash
go get github.com/Shopify/sarama
go get go.opentelemetry.io/otel
go get go.opentelemetry.io/otel/trace
go get go.opentelemetry.io/otel/exporters/jaeger
go get go.opentelemetry.io/otel/sdk/trace
```

### Step 2: Kafka Producer (Trace Sender)

Create `producer.go`:

```go
package main

import (
    "context"
    "encoding/json"
    "log"
    "time"

    "github.com/Shopify/sarama"
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/attribute"
    "go.opentelemetry.io/otel/trace"
)

type TraceProducer struct {
    producer sarama.SyncProducer
    topic    string
}

type TraceData struct {
    TraceID    string            `json:"trace_id"`
    SpanID     string            `json:"span_id"`
    ParentID   string            `json:"parent_id,omitempty"`
    Name       string            `json:"name"`
    StartTime  time.Time         `json:"start_time"`
    EndTime    time.Time         `json:"end_time"`
    Attributes map[string]string `json:"attributes"`
    Events     []Event           `json:"events,omitempty"`
}

type Event struct {
    Name      string            `json:"name"`
    Timestamp time.Time         `json:"timestamp"`
    Attributes map[string]string `json:"attributes"`
}

func NewTraceProducer(brokers []string, topic string) (*TraceProducer, error) {
    config := sarama.NewConfig()
    config.Producer.RequiredAcks = sarama.WaitForAll
    config.Producer.Retry.Max = 5
    config.Producer.Return.Successes = true

    producer, err := sarama.NewSyncProducer(brokers, config)
    if err != nil {
        return nil, err
    }

    return &TraceProducer{
        producer: producer,
        topic:    topic,
    }, nil
}

func (tp *TraceProducer) SendTrace(ctx context.Context, span trace.Span) error {
    spanCtx := span.SpanContext()
    
    traceData := TraceData{
        TraceID:    spanCtx.TraceID().String(),
        SpanID:     spanCtx.SpanID().String(),
        Name:       span.SpanKind().String(),
        StartTime:  time.Now(),
        EndTime:    time.Now(),
        Attributes: make(map[string]string),
    }

    // Add parent span ID if exists
    if spanCtx.HasParent() {
        traceData.ParentID = spanCtx.Parent().SpanID().String()
    }

    // Convert attributes
    span.SetAttributes(attribute.String("kafka.topic", tp.topic))
    span.SetAttributes(attribute.String("kafka.broker", "kafka:9092"))

    // Marshal to JSON
    data, err := json.Marshal(traceData)
    if err != nil {
        return err
    }

    // Send to Kafka
    msg := &sarama.ProducerMessage{
        Topic: tp.topic,
        Key:   sarama.StringEncoder(spanCtx.TraceID().String()),
        Value: sarama.ByteEncoder(data),
    }

    partition, offset, err := tp.producer.SendMessage(msg)
    if err != nil {
        return err
    }

    log.Printf("Trace sent to Kafka - Topic: %s, Partition: %d, Offset: %d", 
               tp.topic, partition, offset)

    return nil
}

func (tp *TraceProducer) Close() error {
    return tp.producer.Close()
}
```

### Step 3: Kafka Consumer (Trace Processor)

Create `consumer.go`:

```go
package main

import (
    "context"
    "encoding/json"
    "log"
    "time"

    "github.com/Shopify/sarama"
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/exporters/jaeger"
    "go.opentelemetry.io/otel/sdk/trace"
)

type TraceConsumer struct {
    consumer sarama.ConsumerGroup
    topic    string
    group    string
    tracer   trace.Tracer
}

func NewTraceConsumer(brokers []string, topic, group string) (*TraceConsumer, error) {
    config := sarama.NewConfig()
    config.Consumer.Group.Rebalance.Strategy = sarama.BalanceStrategyRoundRobin
    config.Consumer.Offsets.Initial = sarama.OffsetOldest

    consumer, err := sarama.NewConsumerGroup(brokers, group, config)
    if err != nil {
        return nil, err
    }

    // Setup Jaeger exporter
    exp, err := jaeger.New(jaeger.WithCollectorEndpoint(jaeger.WithEndpoint("http://jaeger:14268/api/traces")))
    if err != nil {
        return nil, err
    }

    tp := trace.NewTracerProvider(
        trace.WithBatcher(exp),
        trace.WithResource(resource.NewWithAttributes(
            semconv.SchemaURL,
            semconv.ServiceNameKey.String("trace-consumer"),
        )),
    )

    otel.SetTracerProvider(tp)
    tracer := tp.Tracer("trace-consumer")

    return &TraceConsumer{
        consumer: consumer,
        topic:    topic,
        group:    group,
        tracer:   tracer,
    }, nil
}

func (tc *TraceConsumer) Start(ctx context.Context) error {
    handler := &TraceHandler{tracer: tc.tracer}
    
    for {
        select {
        case <-ctx.Done():
            return ctx.Err()
        default:
            err := tc.consumer.Consume(ctx, []string{tc.topic}, handler)
            if err != nil {
                log.Printf("Error consuming: %v", err)
                time.Sleep(time.Second)
            }
        }
    }
}

func (tc *TraceConsumer) Close() error {
    return tc.consumer.Close()
}

type TraceHandler struct {
    tracer trace.Tracer
}

func (h *TraceHandler) Setup(sarama.ConsumerGroupSession) error   { return nil }
func (h *TraceHandler) Cleanup(sarama.ConsumerGroupSession) error { return nil }

func (h *TraceHandler) ConsumeClaim(session sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {
    for {
        select {
        case message := <-claim.Messages():
            if message == nil {
                return nil
            }

            // Process trace message
            if err := h.processTrace(message.Value); err != nil {
                log.Printf("Error processing trace: %v", err)
                continue
            }

            session.MarkMessage(message, "")
        case <-session.Context().Done():
            return nil
        }
    }
}

func (h *TraceHandler) processTrace(data []byte) error {
    var traceData TraceData
    if err := json.Unmarshal(data, &traceData); err != nil {
        return err
    }

    // Create span from trace data
    ctx := context.Background()
    span := h.tracer.Start(ctx, traceData.Name)
    defer span.End()

    // Add attributes
    for key, value := range traceData.Attributes {
        span.SetAttributes(attribute.String(key, value))
    }

    // Add events
    for _, event := range traceData.Events {
        span.AddEvent(event.Name, trace.WithAttributes(
            attribute.String("event.timestamp", event.Timestamp.Format(time.RFC3339)),
        ))
    }

    log.Printf("Processed trace: %s", traceData.TraceID)
    return nil
}
```

### Step 4: Application with Tracing

Create `app.go`:

```go
package main

import (
    "context"
    "log"
    "time"

    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/attribute"
    "go.opentelemetry.io/otel/trace"
)

type App struct {
    tracer        trace.Tracer
    traceProducer *TraceProducer
}

func NewApp(traceProducer *TraceProducer) *App {
    tracer := otel.Tracer("resilient-tracing-app")
    return &App{
        tracer:        tracer,
        traceProducer: traceProducer,
    }
}

func (a *App) ProcessRequest(ctx context.Context, requestID string) error {
    // Create root span
    ctx, span := a.tracer.Start(ctx, "process-request")
    defer span.End()

    span.SetAttributes(
        attribute.String("request.id", requestID),
        attribute.String("service.name", "resilient-tracing-app"),
    )

    // Simulate some work
    if err := a.validateRequest(ctx, requestID); err != nil {
        span.RecordError(err)
        return err
    }

    if err := a.processBusinessLogic(ctx, requestID); err != nil {
        span.RecordError(err)
        return err
    }

    if err := a.sendResponse(ctx, requestID); err != nil {
        span.RecordError(err)
        return err
    }

    // Send trace to Kafka
    if err := a.traceProducer.SendTrace(ctx, span); err != nil {
        log.Printf("Failed to send trace to Kafka: %v", err)
        // Don't fail the request if tracing fails
    }

    return nil
}

func (a *App) validateRequest(ctx context.Context, requestID string) error {
    ctx, span := a.tracer.Start(ctx, "validate-request")
    defer span.End()

    span.SetAttributes(attribute.String("request.id", requestID))

    // Simulate validation
    time.Sleep(10 * time.Millisecond)
    
    span.AddEvent("validation.completed")
    return nil
}

func (a *App) processBusinessLogic(ctx context.Context, requestID string) error {
    ctx, span := a.tracer.Start(ctx, "process-business-logic")
    defer span.End()

    span.SetAttributes(attribute.String("request.id", requestID))

    // Simulate business logic
    time.Sleep(50 * time.Millisecond)
    
    span.AddEvent("business-logic.completed")
    return nil
}

func (a *App) sendResponse(ctx context.Context, requestID string) error {
    ctx, span := a.tracer.Start(ctx, "send-response")
    defer span.End()

    span.SetAttributes(attribute.String("request.id", requestID))

    // Simulate response sending
    time.Sleep(20 * time.Millisecond)
    
    span.AddEvent("response.sent")
    return nil
}
```

### Step 5: Main Application

Create `main.go`:

```go
package main

import (
    "context"
    "log"
    "os"
    "os/signal"
    "syscall"
    "time"
)

func main() {
    // Setup Kafka producer
    producer, err := NewTraceProducer([]string{"kafka:9092"}, "traces")
    if err != nil {
        log.Fatal("Failed to create producer:", err)
    }
    defer producer.Close()

    // Setup Kafka consumer
    consumer, err := NewTraceConsumer([]string{"kafka:9092"}, "traces", "trace-consumer-group")
    if err != nil {
        log.Fatal("Failed to create consumer:", err)
    }
    defer consumer.Close()

    // Create app
    app := NewApp(producer)

    // Start consumer in background
    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()

    go func() {
        if err := consumer.Start(ctx); err != nil {
            log.Printf("Consumer error: %v", err)
        }
    }()

    // Simulate requests
    go func() {
        for i := 0; i < 100; i++ {
            requestID := fmt.Sprintf("req-%d", i)
            if err := app.ProcessRequest(ctx, requestID); err != nil {
                log.Printf("Request failed: %v", err)
            }
            time.Sleep(100 * time.Millisecond)
        }
    }()

    // Wait for interrupt
    sigChan := make(chan os.Signal, 1)
    signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
    <-sigChan

    log.Println("Shutting down...")
    cancel()
}
```

### Step 6: Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  zookeeper:
    image: confluentinc/cp-zookeeper:latest
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000

  kafka:
    image: confluentinc/cp-kafka:latest
    depends_on:
      - zookeeper
    ports:
      - "9092:9092"
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1

  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"
      - "14268:14268"
    environment:
      COLLECTOR_OTLP_ENABLED: true

  app:
    build: .
    depends_on:
      - kafka
      - jaeger
    environment:
      KAFKA_BROKERS: kafka:9092
      JAEGER_ENDPOINT: http://jaeger:14268/api/traces
```

## Testing the System

### Test 1: Normal Operation

```bash
# Start the system
docker-compose up -d

# Check if traces are being sent
docker-compose logs app

# View traces in Jaeger UI
open http://localhost:16686
```

### Test 2: Jaeger Down

```bash
# Stop Jaeger
docker-compose stop jaeger

# Check if traces are still being sent to Kafka
docker-compose logs app

# Check Kafka topic
docker-compose exec kafka kafka-console-consumer --bootstrap-server localhost:9092 --topic traces --from-beginning
```

### Test 3: Jaeger Recovery

```bash
# Start Jaeger again
docker-compose start jaeger

# Check if traces are being processed
docker-compose logs app

# View traces in Jaeger UI
open http://localhost:16686
```

## Monitoring and Alerting

### Kafka Metrics

```go
// Add metrics to producer
func (tp *TraceProducer) SendTrace(ctx context.Context, span trace.Span) error {
    // ... existing code ...
    
    // Increment counter
    metrics.IncrementCounter("traces.sent.total")
    
    return nil
}
```

### Consumer Metrics

```go
// Add metrics to consumer
func (h *TraceHandler) processTrace(data []byte) error {
    // ... existing code ...
    
    // Increment counter
    metrics.IncrementCounter("traces.processed.total")
    
    return nil
}
```

## Best Practices

1. **Error Handling**: Always handle Kafka errors gracefully
2. **Retry Logic**: Implement exponential backoff for failed sends
3. **Monitoring**: Monitor Kafka lag and consumer health
4. **Partitioning**: Use trace ID as partition key for ordering
5. **Compression**: Enable compression for large trace payloads
6. **Retention**: Set appropriate retention policies for Kafka topics

## Conclusion

This resilient tracing system ensures that you never lose trace data, even when Jaeger is down. Kafka acts as a reliable buffer, and the consumer processes traces when Jaeger is available.

**Key Benefits:**
- ✅ **No data loss**: Traces are persisted in Kafka
- ✅ **Fault tolerance**: System works even if Jaeger is down
- ✅ **Scalability**: Multiple consumers can process traces
- ✅ **Reliability**: Kafka guarantees message delivery

**Next Steps:**
- Add more sophisticated error handling
- Implement trace sampling
- Add metrics and alerting
- Optimize for high-throughput scenarios

Happy tracing! 🚀
