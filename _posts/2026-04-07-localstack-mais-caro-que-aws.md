---
layout: post
title: "LocalStack ficou mais caro do que testar na AWS"
subtitle: "A conta que ninguém fez: com o fim da Community Edition, o plano mais barato do LocalStack custa mais do que a maioria dos times gasta na AWS para testar"
author: otavio_celestino
date: 2026-04-07 08:00:00 -0300
categories: [Go, AWS, DevOps, Custos]
tags: [go, golang, aws, localstack, ministack, custos, dynamodb, sqs, lambda, testes, ci]
comments: true
image: "/assets/img/posts/2026-04-07-localstack-more-expensive-than-aws-en.png"
lang: pt-BR
---

E aí, pessoal!

Em 23 de março de 2026 o LocalStack descontinuou a Community Edition. O Docker image que todo mundo usava passou a exigir conta e token de autenticação. O plano gratuito ficou restrito a uso não-comercial.

A narrativa do LocalStack sempre foi a mesma: use localmente, evite custos na AWS. Faz sentido. Mas agora que a ferramenta tem preço, vale fazer a conta de verdade.

O resultado surpreende.

---

## O que o LocalStack cobra agora

Três planos pagos:

| Plano | Preço por desenvolvedor/mês |
|-------|---------------------------|
| Base | $39 |
| Ultimate | $89 |
| Enterprise | sob consulta |

Um time de cinco pessoas no plano Base paga **$195 por mês**, ou **$2.340 por ano**. No Ultimate, **$445 por mês**.

O plano gratuito permanece, mas com restrições importantes: uso não-comercial, sem suporte a CI, e agora exige conta e `LOCALSTACK_AUTH_TOKEN` mesmo para subir o container. O que antes era um `docker run` virou um processo de cadastro.

---

## O que a AWS oferece de graça

O free tier da AWS tem duas categorias. A primeira é o trial de 12 meses para contas novas. A segunda, e mais importante, é o **always-free**: sem prazo de expiração, disponível para qualquer conta, para sempre.

Os números do always-free para os serviços mais usados em testes:

| Serviço | Free tier always-free |
|---------|----------------------|
| Lambda | 1 milhão de invocações por mês |
| Lambda | 400.000 GB-segundo por mês |
| DynamoDB | 25 GB de armazenamento |
| DynamoDB | 200 milhões de requests por mês |
| SQS | 1 milhão de requests por mês |
| S3 | 5 GB de armazenamento |

Um time inteiro de cinco desenvolvedores rodando testes de integração o dia inteiro dificilmente chega perto desses limites.

---

## A conta real

Vamos simular um time de cinco desenvolvedores com um pipeline de CI que roda em cada pull request.

Assuma um projeto com 200 testes de integração, 20 PRs por dia, 20 dias úteis no mês. Isso dá 80.000 execuções de teste por mês. Cada teste invoca Lambda uma vez e faz três operações no DynamoDB.

**Na AWS:**

| Recurso | Uso mensal | Custo |
|---------|-----------|-------|
| Lambda invocações | 80.000 | $0 (dentro do free tier) |
| DynamoDB requests | 240.000 | $0 (dentro do free tier) |
| SQS requests | 80.000 | $0 (dentro do free tier) |
| **Total** | | **$0** |

**No LocalStack (plano Base, 5 devs):**

| Item | Custo mensal |
|------|-------------|
| 5 licenças × $39 | $195 |
| **Total** | **$195** |

O time está pagando $195 por mês para evitar um custo que seria zero.

---

## Quando o uso sai do free tier

O free tier da AWS tem limites. Se o volume de testes for muito alto, você começa a pagar.

Em novembro de 2024 a AWS cortou o preço do DynamoDB em 50%. Os preços atuais fora do free tier:

| Serviço | Preço |
|---------|-------|
| Lambda | $0,20 por 1 milhão de invocações |
| DynamoDB leitura | $0,25 por 1 milhão de requests |
| DynamoDB escrita | $1,25 por 1 milhão de requests |
| SQS | $0,40 por 1 milhão de requests |

Para sair do free tier em Lambda você precisa de mais de 1 milhão de invocações por mês. Para um time de cinco devs isso é 200.000 invocações por pessoa por mês, ou 10.000 por dia útil por pessoa.

Mesmo nesse cenário extremo, o custo na AWS seria de centavos. Ainda abaixo dos $195 do LocalStack.

---

## Onde o LocalStack ainda faz sentido

Ser honesto aqui importa. Há casos onde o LocalStack entrega valor real.

**Desenvolvimento offline.** Se você trabalha sem internet ou em ambientes com restrição de rede, testar na AWS não é opção. LocalStack resolve isso.

**Serviços fora do free tier.** API Gateway, por exemplo, tem trial de 12 meses mas não always-free. Se o projeto depende muito desses serviços, o custo na AWS pode crescer.

**Velocidade de ciclo local.** Round trip para a AWS adiciona latência. Para desenvolvimento iterativo onde você quer feedback em milissegundos, rodar localmente é mais rápido.

**Ambientes sem conta AWS.** Alguns contextos corporativos dificultam criar contas ou dar acesso à AWS para todos os devs. LocalStack contorna isso.

Esses são argumentos legítimos. O problema é quando o LocalStack é usado por inércia, sem ninguém rodar a conta.

---

## MiniStack: a alternativa que apareceu em dias

Quando a mudança foi anunciada, o **MiniStack** surgiu em poucos dias como resposta direta. MIT license, sem registro, sem token, sem telemetria.

Os números de startup são significativos:

| Ferramenta | Startup | RAM idle | Imagem Docker |
|-----------|---------|----------|---------------|
| LocalStack | 15-30s | ~500MB | ~1GB |
| MiniStack | ~2s | ~30MB | ~150MB |

MiniStack cobre 35 serviços AWS num único container na porta 4566, o mesmo padrão do LocalStack. A troca é drop-in: onde você tinha `localstack/localstack`, coloca `nahuelnucera/ministack`.

Os serviços principais que cobre: S3, SQS, SNS, DynamoDB, Lambda, IAM, STS, Secrets Manager, CloudWatch Logs, CloudWatch Metrics, SSM Parameter Store, EventBridge, Kinesis, Step Functions, API Gateway v1 e v2, Cognito, RDS, ElastiCache e ECS.

---

## Usando o MiniStack manualmente

Sobe o container:

```bash
docker run -p 4566:4566 nahuelnucera/ministack
```

Qualquer credencial funciona. Use `test` por convenção:

```bash
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
```

Cria uma fila SQS:

```bash
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name orders
```

Cria uma tabela no DynamoDB:

```bash
aws --endpoint-url=http://localhost:4566 dynamodb create-table \
  --table-name orders \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

Lista as filas para confirmar:

```bash
aws --endpoint-url=http://localhost:4566 sqs list-queues
```

---

## MiniStack com Testcontainers em Go

Para testes automatizados você quer que o container suba e desça junto com o teste. Testcontainers faz isso.

```bash
go get github.com/testcontainers/testcontainers-go
```

O helper de setup:

```go
// testhelper_test.go
package handler_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
)

type testEnv struct {
	db       *dynamodb.Client
	sqsQueue *sqs.Client
	endpoint string
}

func setupMiniStack(t *testing.T) *testEnv {
	t.Helper()
	ctx := context.Background()

	req := testcontainers.ContainerRequest{
		Image:        "nahuelnucera/ministack:latest",
		ExposedPorts: []string{"4566/tcp"},
		WaitingFor:   wait.ForListeningPort("4566/tcp"),
	}

	container, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: req,
		Started:          true,
	})
	if err != nil {
		t.Fatalf("ministack nao subiu: %v", err)
	}

	t.Cleanup(func() { container.Terminate(ctx) })

	host, _ := container.Host(ctx)
	port, _ := container.MappedPort(ctx, "4566")
	endpoint := fmt.Sprintf("http://%s:%s", host, port.Port())

	cfg := newConfig(ctx, endpoint)

	db := dynamodb.NewFromConfig(cfg)
	sqsClient := sqs.NewFromConfig(cfg)

	createOrdersTable(t, ctx, db)
	createOrdersQueue(t, ctx, sqsClient, endpoint)

	return &testEnv{
		db:       db,
		sqsQueue: sqsClient,
		endpoint: endpoint,
	}
}

func newConfig(ctx context.Context, endpoint string) aws.Config {
	cfg, _ := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion("us-east-1"),
		awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider("test", "test", ""),
		),
		awsconfig.WithEndpointResolverWithOptions(
			aws.EndpointResolverWithOptionsFunc(func(service, region string, options ...interface{}) (aws.Endpoint, error) {
				return aws.Endpoint{URL: endpoint}, nil
			}),
		),
	)
	return cfg
}

func createOrdersTable(t *testing.T, ctx context.Context, db *dynamodb.Client) {
	t.Helper()

	_, err := db.CreateTable(ctx, &dynamodb.CreateTableInput{
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
}

func createOrdersQueue(t *testing.T, ctx context.Context, sqsClient *sqs.Client, endpoint string) {
	t.Helper()

	_, err := sqsClient.CreateQueue(ctx, &sqs.CreateQueueInput{
		QueueName: aws.String("orders"),
	})
	if err != nil {
		t.Fatalf("create queue falhou: %v", err)
	}
}
```

A função Lambda que estamos testando recebe uma mensagem SQS e salva no DynamoDB:

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

Os testes usando o MiniStack:

```go
// handler/handler_test.go
package handler_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/seuusuario/order-processor/handler"
)

func TestHandle_PedidoValido(t *testing.T) {
	env := setupMiniStack(t)
	h := handler.New(env.db, "orders")

	order := handler.Order{ID: "pedido-1", Amount: 99.90, Status: "pending"}
	body, _ := json.Marshal(order)

	event := events.SQSEvent{
		Records: []events.SQSMessage{{Body: string(body)}},
	}

	if err := h.Handle(context.Background(), event); err != nil {
		t.Fatalf("handler retornou erro: %v", err)
	}

	result, err := env.db.GetItem(context.Background(), &dynamodb.GetItemInput{
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
	env := setupMiniStack(t)
	h := handler.New(env.db, "orders")

	order := handler.Order{ID: "", Amount: -10}
	body, _ := json.Marshal(order)

	event := events.SQSEvent{
		Records: []events.SQSMessage{{Body: string(body)}},
	}

	if err := h.Handle(context.Background(), event); err == nil {
		t.Fatal("esperava erro para pedido invalido")
	}
}

func TestHandle_PayloadInvalido(t *testing.T) {
	env := setupMiniStack(t)
	h := handler.New(env.db, "orders")

	event := events.SQSEvent{
		Records: []events.SQSMessage{{Body: "isso nao e json"}},
	}

	if err := h.Handle(context.Background(), event); err == nil {
		t.Fatal("esperava erro para payload invalido")
	}
}

func TestHandle_MultiplassMensagens(t *testing.T) {
	env := setupMiniStack(t)
	h := handler.New(env.db, "orders")

	orders := []handler.Order{
		{ID: "pedido-10", Amount: 50.00, Status: "pending"},
		{ID: "pedido-11", Amount: 150.00, Status: "pending"},
		{ID: "pedido-12", Amount: 300.00, Status: "pending"},
	}

	var records []events.SQSMessage
	for _, o := range orders {
		body, _ := json.Marshal(o)
		records = append(records, events.SQSMessage{Body: string(body)})
	}

	event := events.SQSEvent{Records: records}

	if err := h.Handle(context.Background(), event); err != nil {
		t.Fatalf("handler retornou erro: %v", err)
	}

	for _, o := range orders {
		result, err := env.db.GetItem(context.Background(), &dynamodb.GetItemInput{
			TableName: aws.String("orders"),
			Key: map[string]types.AttributeValue{
				"id": &types.AttributeValueMemberS{Value: o.ID},
			},
		})
		if err != nil || result.Item == nil {
			t.Fatalf("pedido %s nao foi salvo", o.ID)
		}
	}
}
```

Roda tudo:

```bash
go test ./handler/... -v -timeout 120s
```

O MiniStack sobe, os quatro testes rodam, o container some. Em torno de 10-15 segundos no total, sendo a maior parte o pull da imagem na primeira execução.

---

## GitHub Actions sem nenhum secret

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

Nenhum secret, nenhuma variável de ambiente de AWS, nenhuma conta externa. O Testcontainers usa o Docker do runner e o MiniStack sobe dentro dele igual ao local.

---

## Separando testes unitários dos de integração

Testes com container levam alguns segundos a mais. Faz sentido separar para poder rodar só os unitários quando quiser feedback rápido.

Adiciona build tag nos testes de integração:

```go
//go:build integration

package handler_test
```

Roda cada tipo separado:

```bash
# unitários (instantâneo)
go test ./...

# unitários + integração (com container)
go test -tags integration ./...
```

No CI você decide onde cada um roda. Em pull request pode rodar só unitários. No merge pra main roda tudo.

---

## Persistência de estado entre execuções

Por padrão o MiniStack é stateless: cada `docker run` começa do zero. Para desenvolvimento local onde você quer manter o estado entre reinicializações, ativa a persistência:

```bash
docker run -p 4566:4566 \
  -e PERSIST_STATE=1 \
  -e STATE_DIR=/data \
  -v $(pwd)/ministack-data:/data \
  nahuelnucera/ministack
```

O MiniStack salva o estado em `/data` no shutdown e recarrega no startup. Util quando você está desenvolvendo e não quer recriar recursos a cada vez.

---

## Comparativo final das opções

Cada opção tem um caso de uso diferente. O resumo honesto:

| Opção | Custo | Login | Serviços AWS | Startup | Melhor para |
|-------|-------|-------|-------------|---------|-------------|
| AWS real | $0 (free tier) | Sim (conta AWS) | Todos | N/A | CI com volume baixo |
| MiniStack | Gratuito | Nao | 35+ | ~2s | Desenvolvimento local e CI |
| DynamoDB Local + ElasticMQ | Gratuito | Nao | DynamoDB + SQS | ~3s | Quem precisa so desses dois |
| LocalStack Free | Gratuito | Sim (obrigatorio) | Limitado | 15-30s | Uso nao-comercial |
| LocalStack Base | $39/dev/mes | Sim | 80+ | 15-30s | Times com necessidade de servicos avancados |

Para a maioria dos projetos Go com Lambda, SQS e DynamoDB, MiniStack cobre tudo que precisa. Gratuito, sem conta, sem token, sobe em dois segundos.

---

## A questão real

O LocalStack foi construído em cima da narrativa de que testar na AWS é caro. Essa narrativa fazia mais sentido quando o free tier era mais restrito e os preços eram mais altos.

Em 2026, com o always-free cobrindo a maioria dos casos de teste e a AWS tendo cortado preços no DynamoDB, a conta mudou. E com o MiniStack disponível, você tem uma alternativa local gratuita que sobe mais rápido, consome menos memória e não exige cadastro.

Isso não é crítica à decisão de negócio do LocalStack. É só fazer a conta antes de renovar a licença.

---

## Referências

- [LocalStack: pricing](https://www.localstack.cloud/pricing)
- [InfoQ: LocalStack Drops Community Edition](https://www.infoq.com/news/2026/02/localstack-aws-community/)
- [MiniStack: site oficial](https://ministack.org/)
- [MiniStack no GitHub](https://github.com/Nahuel990/ministack)
- [MiniStack vs LocalStack benchmark](https://dev.to/nahuel990/ministack-vs-floci-vs-localstack-honest-performance-benchmark-april-3rd-2026-479p)
- [AWS Free Tier: always-free services](https://aws.amazon.com/free/)
- [AWS DynamoDB Pricing](https://aws.amazon.com/dynamodb/pricing/on-demand/)
- [AWS Lambda Pricing](https://aws.amazon.com/lambda/pricing/)
- [AWS SQS Pricing](https://aws.amazon.com/sqs/pricing/)
- [Testcontainers para Go](https://golang.testcontainers.org)
