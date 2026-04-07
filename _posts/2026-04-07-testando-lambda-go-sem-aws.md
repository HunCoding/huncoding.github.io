---
layout: post
title: "Testando Lambda em Go sem AWS"
subtitle: "Como rodar testes de integração reais de funções Lambda com LocalStack e Testcontainers, sem credencial e sem custo"
author: otavio_celestino
date: 2026-04-07 08:00:00 -0300
categories: [Go, AWS, Lambda, Testes]
tags: [go, golang, aws, lambda, localstack, testcontainers, sqs, testes, integração, ci]
comments: true
image: "/assets/img/posts/2026-04-07-testing-lambda-go-without-aws-en.png"
lang: pt-BR
---

E aí, pessoal!

Testar Lambda na AWS é caro, lento e depende de credencial. Você faz deploy, espera, verifica o log no CloudWatch, corrige, faz deploy de novo. O ciclo inteiro leva minutos.

O problema fica pior no CI. Ou você configura credenciais AWS no pipeline e reza pra ninguém vazar, ou você pula os testes de integração e vai com fé pro deploy. As duas opções são ruins.

LocalStack resolve isso. Você sobe toda a infraestrutura AWS localmente, os testes rodam contra ela e o CI não precisa saber que a AWS existe.

---

## A função Lambda que vamos testar

Vamos usar um consumer de SQS que processa pedidos. Recebe uma mensagem, valida o payload e salva no DynamoDB.

```go
// handler/handler.go
package handler

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

type Order struct {
	ID     string  `json:"id"`
	Amount float64 `json:"amount"`
	Status string  `json:"status"`
}

type Handler struct {
	db    *dynamodb.Client
	table string
}

func New(db *dynamodb.Client, table string) *Handler {
	return &Handler{db: db, table: table}
}

func (h *Handler) Handle(ctx context.Context, event events.SQSEvent) error {
	for _, record := range event.Records {
		var order Order
		if err := json.Unmarshal([]byte(record.Body), &order); err != nil {
			return fmt.Errorf("unmarshal falhou: %w", err)
		}

		if order.ID == "" || order.Amount <= 0 {
			return fmt.Errorf("pedido invalido: %+v", order)
		}

		_, err := h.db.PutItem(ctx, &dynamodb.PutItemInput{
			TableName: aws.String(h.table),
			Item: map[string]types.AttributeValue{
				"id":     &types.AttributeValueMemberS{Value: order.ID},
				"amount": &types.AttributeValueMemberN{Value: fmt.Sprintf("%.2f", order.Amount)},
				"status": &types.AttributeValueMemberS{Value: order.Status},
			},
		})
		if err != nil {
			return fmt.Errorf("dynamo falhou: %w", err)
		}
	}

	return nil
}
```

```go
// main.go
package main

import (
	"context"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/seuusuario/order-processor/handler"
)

func main() {
	cfg, _ := config.LoadDefaultConfig(context.Background())
	db := dynamodb.NewFromConfig(cfg)

	h := handler.New(db, "orders")
	lambda.Start(h.Handle)
}
```

---

## O problema de testar isso na AWS

Sem LocalStack, o teste de integração exige:

- credenciais AWS configuradas localmente
- tabela DynamoDB criada na conta
- fila SQS criada na conta
- cleanup manual depois de cada teste
- custo por request e por armazenamento

No CI fica pior ainda: credenciais no GitHub Secrets, IAM role com permissão mínima difícil de acertar, testes que passam local e falham no pipeline por diferença de region ou permissão.

---

## LocalStack

LocalStack simula os serviços AWS localmente. SQS, DynamoDB, S3, Lambda, API Gateway e mais de 80 outros serviços rodam num único container Docker.

A versão community cobre o que a maioria dos projetos precisa. Instala a CLI:

```bash
pip install localstack
brew install localstack/tap/localstack-cli
```

Sobe o container:

```bash
localstack start
```

Cria os recursos com `awslocal` (wrapper do AWS CLI que aponta pro LocalStack):

```bash
pip install awscli-local

awslocal dynamodb create-table \
  --table-name orders \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

awslocal sqs create-queue --queue-name orders
```

Funciona. Mas ainda é manual. Para testes automatizados você quer que o container suba e desça junto com os testes.

---

## Testcontainers: LocalStack programático

Testcontainers sobe containers Docker de dentro do código Go. O container começa antes do teste e some quando o teste termina.

```bash
go get github.com/testcontainers/testcontainers-go
go get github.com/testcontainers/testcontainers-go/modules/localstack
```

---

## Escrevendo os testes de integração

```go
// handler/handler_test.go
package handler_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/testcontainers/testcontainers-go/modules/localstack"
	"github.com/seuusuario/order-processor/handler"
)

func setupLocalStack(t *testing.T) *dynamodb.Client {
	t.Helper()
	ctx := context.Background()

	container, err := localstack.Run(ctx, "localstack/localstack:3")
	if err != nil {
		t.Fatalf("localstack nao subiu: %v", err)
	}

	t.Cleanup(func() {
		container.Terminate(ctx)
	})

	endpoint, err := container.Endpoint(ctx, "")
	if err != nil {
		t.Fatalf("endpoint nao encontrado: %v", err)
	}

	cfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion("us-east-1"),
		awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider("test", "test", ""),
		),
		awsconfig.WithEndpointResolverWithOptions(
			aws.EndpointResolverWithOptionsFunc(func(service, region string, options ...interface{}) (aws.Endpoint, error) {
				return aws.Endpoint{URL: "http://" + endpoint}, nil
			}),
		),
	)
	if err != nil {
		t.Fatalf("config falhou: %v", err)
	}

	db := dynamodb.NewFromConfig(cfg)

	_, err = db.CreateTable(ctx, &dynamodb.CreateTableInput{
		TableName: aws.String("orders"),
		AttributeDefinitions: []types.AttributeDefinition{
			{AttributeName: aws.String("id"), AttributeType: types.ScalarAttributeTypeS},
		},
		KeySchema: []types.KeySchemaElement{
			{AttributeName: aws.String("id"), KeyType: types.KeyTypeHash},
		},
		BillingMode: types.BillingModePayPerRequest,
	})
	if err != nil {
		t.Fatalf("create table falhou: %v", err)
	}

	return db
}

func TestHandle_PedidoValido(t *testing.T) {
	db := setupLocalStack(t)
	h := handler.New(db, "orders")

	order := handler.Order{ID: "pedido-1", Amount: 99.90, Status: "pending"}
	body, _ := json.Marshal(order)

	event := events.SQSEvent{
		Records: []events.SQSMessage{
			{Body: string(body)},
		},
	}

	if err := h.Handle(context.Background(), event); err != nil {
		t.Fatalf("handler retornou erro: %v", err)
	}

	result, err := db.GetItem(context.Background(), &dynamodb.GetItemInput{
		TableName: aws.String("orders"),
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{Value: "pedido-1"},
		},
	})
	if err != nil {
		t.Fatalf("getitem falhou: %v", err)
	}

	if result.Item == nil {
		t.Fatal("pedido nao foi salvo no dynamo")
	}
}

func TestHandle_PedidoInvalido(t *testing.T) {
	db := setupLocalStack(t)
	h := handler.New(db, "orders")

	order := handler.Order{ID: "", Amount: -10}
	body, _ := json.Marshal(order)

	event := events.SQSEvent{
		Records: []events.SQSMessage{
			{Body: string(body)},
		},
	}

	if err := h.Handle(context.Background(), event); err == nil {
		t.Fatal("esperava erro para pedido invalido")
	}
}

func TestHandle_PayloadInvalido(t *testing.T) {
	db := setupLocalStack(t)
	h := handler.New(db, "orders")

	event := events.SQSEvent{
		Records: []events.SQSMessage{
			{Body: "isso nao e json"},
		},
	}

	if err := h.Handle(context.Background(), event); err == nil {
		t.Fatal("esperava erro para payload invalido")
	}
}
```

Roda:

```bash
go test ./handler/... -v
```

O Testcontainers sobe o LocalStack automaticamente, os testes rodam contra ele e o container some no final. Sem setup manual, sem credencial real.

---

## GitHub Actions sem credencial AWS

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-go@v5
        with:
          go-version: stable

      - name: Run tests
        run: go test ./... -v -timeout 120s
```

Nenhum secret de AWS. O Testcontainers usa o Docker do runner do GitHub Actions, o LocalStack sobe dentro dele e os testes passam igual ao local.

---

## Separando testes unitários dos de integração

Testes com LocalStack sobem um container e levam alguns segundos. Faz sentido separar para poder rodar só os unitários quando quiser rápido.

Adiciona uma build tag nos testes de integração:

```go
//go:build integration

package handler_test
```

Roda cada tipo separado:

```bash
# só unitários (rápido)
go test ./...

# unitários + integração
go test -tags integration ./...
```

No CI você decide qual roda em qual momento. Pull request pode rodar só unitários, merge na main roda tudo.

---

## Conclusão

LocalStack com Testcontainers resolve o problema de testar Lambda sem a AWS. O setup leva menos de uma hora, o CI não precisa de credencial nenhuma e o ciclo de feedback cai de minutos para segundos.

O mesmo padrão funciona para qualquer serviço AWS que o LocalStack suporta: S3, SNS, SQS, EventBridge, Kinesis. Você troca o nome do serviço no setup e os testes funcionam igual.

---

## Referências

- [LocalStack: documentação oficial](https://docs.localstack.cloud)
- [Testcontainers para Go](https://golang.testcontainers.org)
- [Módulo LocalStack do Testcontainers](https://golang.testcontainers.org/modules/localstack/)
- [AWS Lambda Go: repositório oficial](https://github.com/aws/aws-lambda-go)
- [AWS SDK Go v2](https://github.com/aws/aws-sdk-go-v2)
