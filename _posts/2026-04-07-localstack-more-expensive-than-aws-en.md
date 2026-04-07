---
layout: post
title: "LocalStack Is Now More Expensive Than Testing on AWS"
subtitle: "The math nobody ran: with the Community Edition gone, LocalStack's cheapest plan costs more than most teams spend on AWS for testing"
author: otavio_celestino
date: 2026-04-07 08:00:00 -0300
categories: [Go, AWS, DevOps, Cost]
tags: [go, golang, aws, localstack, ministack, cost, dynamodb, sqs, lambda, testing, ci]
comments: true
image: "/assets/img/posts/2026-04-07-localstack-more-expensive-than-aws-en.png"
lang: en
original_post: "/localstack-mais-caro-que-aws/"
---

Hey everyone!

On March 23, 2026 LocalStack discontinued the Community Edition. The Docker image everyone was using now requires an account and an authentication token. The free tier was restricted to non-commercial use only.

LocalStack's pitch has always been the same: run locally, avoid AWS costs. That makes sense. But now that the tool has a price tag, it is worth doing the actual math.

The result is surprising.

---

## What LocalStack charges now

Three paid plans:

| Plan | Price per developer/month |
|------|--------------------------|
| Base | $39 |
| Ultimate | $89 |
| Enterprise | contact sales |

A team of five on the Base plan pays **$195 per month**, or **$2,340 per year**. On Ultimate, **$445 per month**.

The free plan remains, but with significant restrictions: non-commercial use only, no CI support, and now requires an account and `LOCALSTACK_AUTH_TOKEN` even to start the container. What was once a `docker run` became a signup process.

---

## What AWS offers for free

The AWS free tier has two categories. The first is a 12-month trial for new accounts. The second, and more important, is the **always-free** tier: no expiration date, available to any account, forever.

The always-free numbers for the most common services used in testing:

| Service | Always-free tier |
|---------|-----------------|
| Lambda | 1 million invocations per month |
| Lambda | 400,000 GB-seconds per month |
| DynamoDB | 25 GB of storage |
| DynamoDB | 200 million requests per month |
| SQS | 1 million requests per month |
| S3 | 5 GB of storage |

An entire team of five developers running integration tests all day will barely scratch those limits.

---

## The actual numbers

Let's simulate a team of five developers with a CI pipeline that runs on every pull request.

Assume a project with 200 integration tests, 20 PRs per day, 20 working days per month. That is 80,000 test runs per month. Each test invokes Lambda once and makes three DynamoDB operations.

**On AWS:**

| Resource | Monthly usage | Cost |
|----------|--------------|------|
| Lambda invocations | 80,000 | $0 (within free tier) |
| DynamoDB requests | 240,000 | $0 (within free tier) |
| SQS requests | 80,000 | $0 (within free tier) |
| **Total** | | **$0** |

**On LocalStack (Base plan, 5 devs):**

| Item | Monthly cost |
|------|-------------|
| 5 licenses × $39 | $195 |
| **Total** | **$195** |

The team is paying $195 per month to avoid a cost that would be zero.

---

## When usage goes past the free tier

The AWS free tier has limits. If your test volume is very high, you will start paying.

AWS cut DynamoDB pricing by 50% in November 2024. Current prices outside the free tier:

| Service | Price |
|---------|-------|
| Lambda | $0.20 per 1 million invocations |
| DynamoDB reads | $0.25 per 1 million requests |
| DynamoDB writes | $1.25 per 1 million requests |
| SQS | $0.40 per 1 million requests |

To exceed the Lambda free tier you need more than 1 million invocations in a month. For a team of five that is 200,000 invocations per person per month, or 10,000 per working day per person.

Even in that extreme scenario, the AWS cost would be cents. Still below LocalStack's $195.

---

## Where LocalStack still makes sense

Being honest here matters. There are real cases where LocalStack delivers genuine value.

**Offline development.** If you work without internet or in restricted network environments, testing on AWS is not an option. LocalStack solves that.

**Services outside the free tier.** API Gateway, for example, has a 12-month trial but no always-free tier. If your project relies heavily on those services, AWS costs can add up.

**Local iteration speed.** Round trips to AWS add latency. For tight development loops where you want feedback in milliseconds, running locally is faster.

**Environments without an AWS account.** Some corporate contexts make it hard to create accounts or grant AWS access to every developer. LocalStack works around that.

These are legitimate arguments. The problem is when LocalStack gets used out of habit, without anyone running the actual numbers.

---

## MiniStack: the alternative that appeared within days

When the pricing change was announced, **MiniStack** emerged within days as a direct response. MIT license, no registration, no token, no telemetry.

![MiniStack benchmark vs LocalStack](/assets/img/posts/ministack-benchmark.png)

The startup numbers are significant:

| Tool | Startup | Idle RAM | Docker image |
|------|---------|----------|-------------|
| LocalStack | 15-30s | ~500MB | ~1GB |
| MiniStack | ~2s | ~30MB | ~150MB |

MiniStack covers 35 AWS services in a single container on port 4566, the same pattern as LocalStack. The migration is drop-in: where you had `localstack/localstack`, you put `nahuelnucera/ministack`.

Services covered: S3, SQS, SNS, DynamoDB, Lambda, IAM, STS, Secrets Manager, CloudWatch Logs, CloudWatch Metrics, SSM Parameter Store, EventBridge, Kinesis, Step Functions, API Gateway v1 and v2, Cognito, RDS, ElastiCache and ECS.

---

## Using MiniStack manually

Start the container:

```bash
docker run -p 4566:4566 nahuelnucera/ministack
```

Any credentials are accepted. Use `test` by convention:

```bash
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
```

Create an SQS queue:

```bash
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name orders
```

Create a DynamoDB table:

```bash
aws --endpoint-url=http://localhost:4566 dynamodb create-table \
  --table-name orders \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

List queues to confirm:

```bash
aws --endpoint-url=http://localhost:4566 sqs list-queues
```

---

## MiniStack with Testcontainers in Go

For automated tests you want the container to start and stop alongside the test. Testcontainers handles that.

```bash
go get github.com/testcontainers/testcontainers-go
```

The setup helper:

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
		t.Fatalf("ministack did not start: %v", err)
	}

	t.Cleanup(func() { container.Terminate(ctx) })

	host, _ := container.Host(ctx)
	port, _ := container.MappedPort(ctx, "4566")
	endpoint := fmt.Sprintf("http://%s:%s", host, port.Port())

	cfg := newConfig(ctx, endpoint)

	db := dynamodb.NewFromConfig(cfg)
	sqsClient := sqs.NewFromConfig(cfg)

	createOrdersTable(t, ctx, db)
	createOrdersQueue(t, ctx, sqsClient)

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
		t.Fatalf("create table failed: %v", err)
	}
}

func createOrdersQueue(t *testing.T, ctx context.Context, sqsClient *sqs.Client) {
	t.Helper()

	_, err := sqsClient.CreateQueue(ctx, &sqs.CreateQueueInput{
		QueueName: aws.String("orders"),
	})
	if err != nil {
		t.Fatalf("create queue failed: %v", err)
	}
}
```

The Lambda function under test receives an SQS message and saves to DynamoDB:

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
			return fmt.Errorf("unmarshal failed: %w", err)
		}

		if order.ID == "" || order.Amount <= 0 {
			return fmt.Errorf("invalid order: %+v", order)
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
			return fmt.Errorf("dynamo failed: %w", err)
		}
	}

	return nil
}
```

The tests using MiniStack:

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
	"github.com/yourusername/order-processor/handler"
)

func TestHandle_ValidOrder(t *testing.T) {
	env := setupMiniStack(t)
	h := handler.New(env.db, "orders")

	order := handler.Order{ID: "order-1", Amount: 99.90, Status: "pending"}
	body, _ := json.Marshal(order)

	event := events.SQSEvent{
		Records: []events.SQSMessage{{Body: string(body)}},
	}

	if err := h.Handle(context.Background(), event); err != nil {
		t.Fatalf("handler returned error: %v", err)
	}

	result, err := env.db.GetItem(context.Background(), &dynamodb.GetItemInput{
		TableName: aws.String("orders"),
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{Value: "order-1"},
		},
	})
	if err != nil {
		t.Fatalf("getitem failed: %v", err)
	}

	if result.Item == nil {
		t.Fatal("order was not saved to dynamo")
	}
}

func TestHandle_InvalidOrder(t *testing.T) {
	env := setupMiniStack(t)
	h := handler.New(env.db, "orders")

	order := handler.Order{ID: "", Amount: -10}
	body, _ := json.Marshal(order)

	event := events.SQSEvent{
		Records: []events.SQSMessage{{Body: string(body)}},
	}

	if err := h.Handle(context.Background(), event); err == nil {
		t.Fatal("expected error for invalid order")
	}
}

func TestHandle_InvalidPayload(t *testing.T) {
	env := setupMiniStack(t)
	h := handler.New(env.db, "orders")

	event := events.SQSEvent{
		Records: []events.SQSMessage{{Body: "this is not json"}},
	}

	if err := h.Handle(context.Background(), event); err == nil {
		t.Fatal("expected error for invalid payload")
	}
}

func TestHandle_MultipleMessages(t *testing.T) {
	env := setupMiniStack(t)
	h := handler.New(env.db, "orders")

	orders := []handler.Order{
		{ID: "order-10", Amount: 50.00, Status: "pending"},
		{ID: "order-11", Amount: 150.00, Status: "pending"},
		{ID: "order-12", Amount: 300.00, Status: "pending"},
	}

	var records []events.SQSMessage
	for _, o := range orders {
		body, _ := json.Marshal(o)
		records = append(records, events.SQSMessage{Body: string(body)})
	}

	event := events.SQSEvent{Records: records}

	if err := h.Handle(context.Background(), event); err != nil {
		t.Fatalf("handler returned error: %v", err)
	}

	for _, o := range orders {
		result, err := env.db.GetItem(context.Background(), &dynamodb.GetItemInput{
			TableName: aws.String("orders"),
			Key: map[string]types.AttributeValue{
				"id": &types.AttributeValueMemberS{Value: o.ID},
			},
		})
		if err != nil || result.Item == nil {
			t.Fatalf("order %s was not saved", o.ID)
		}
	}
}
```

Run everything:

```bash
go test ./handler/... -v -timeout 120s
```

MiniStack starts, all four tests run, the container disappears. Around 10-15 seconds total, most of it being the image pull on the first run.

---

## GitHub Actions with no secrets at all

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

No secrets, no AWS environment variables, no external account. Testcontainers uses the Docker daemon on the GitHub Actions runner and MiniStack starts inside it exactly like locally.

---

## Separating unit tests from integration tests

Container-based tests take a few extra seconds. It makes sense to separate them so you can run only unit tests when you want fast feedback.

Add a build tag to integration tests:

```go
//go:build integration

package handler_test
```

Run each type separately:

```bash
# unit tests only (instant)
go test ./...

# unit + integration (with container)
go test -tags integration ./...
```

In CI you decide where each runs. Pull requests can run only unit tests. Merges to main run everything.

---

## State persistence between runs

By default MiniStack is stateless: each `docker run` starts fresh. For local development where you want to keep state between restarts, enable persistence:

```bash
docker run -p 4566:4566 \
  -e PERSIST_STATE=1 \
  -e STATE_DIR=/data \
  -v $(pwd)/ministack-data:/data \
  nahuelnucera/ministack
```

MiniStack saves state to `/data` on shutdown and reloads it on startup. Useful when you are developing and do not want to recreate resources every time.

---

## Final comparison of the options

Each option has a different use case. The honest summary:

| Option | Cost | Login | AWS services | Startup | Best for |
|--------|------|-------|-------------|---------|----------|
| Real AWS | $0 (free tier) | Yes (AWS account) | All | N/A | CI with low volume |
| MiniStack | Free | No | 35+ | ~2s | Local dev and CI |
| DynamoDB Local + ElasticMQ | Free | No | DynamoDB + SQS | ~3s | Projects needing only these two |
| LocalStack Free | Free | Yes (required) | Limited | 15-30s | Non-commercial use |
| LocalStack Base | $39/dev/month | Yes | 80+ | 15-30s | Teams needing advanced services |

For most Go projects with Lambda, SQS and DynamoDB, MiniStack covers everything needed. Free, no account, no token, starts in two seconds.

---

## The real question

LocalStack was built on the narrative that testing on AWS is expensive. That narrative made more sense when the free tier was more restricted and prices were higher.

In 2026, with the always-free tier covering most testing scenarios and AWS having cut prices on services like DynamoDB, the math shifted. And with MiniStack available, you have a free local alternative that starts faster, uses less memory, and requires no signup.

This is not a criticism of LocalStack's business decision. It is just worth running the numbers before renewing a license.

---

## References

- [LocalStack: pricing](https://www.localstack.cloud/pricing)
- [InfoQ: LocalStack Drops Community Edition](https://www.infoq.com/news/2026/02/localstack-aws-community/)
- [MiniStack: official site](https://ministack.org/)
- [MiniStack on GitHub](https://github.com/Nahuel990/ministack)
- [MiniStack vs LocalStack benchmark](https://dev.to/nahuel990/ministack-vs-floci-vs-localstack-honest-performance-benchmark-april-3rd-2026-479p)
- [AWS Free Tier: always-free services](https://aws.amazon.com/free/)
- [AWS DynamoDB Pricing](https://aws.amazon.com/dynamodb/pricing/on-demand/)
- [AWS Lambda Pricing](https://aws.amazon.com/lambda/pricing/)
- [AWS SQS Pricing](https://aws.amazon.com/sqs/pricing/)
- [Testcontainers for Go](https://golang.testcontainers.org)
