---
layout: post
title: "Testing Lambda in Go Without AWS"
subtitle: "How to run real integration tests for Lambda functions with LocalStack and Testcontainers, no credentials and no cost"
author: otavio_celestino
date: 2026-04-07 08:00:00 -0300
categories: [Go, AWS, Lambda, Testing]
tags: [go, golang, aws, lambda, localstack, testcontainers, sqs, testing, integration, ci]
comments: true
image: "/assets/img/posts/2026-04-07-testing-lambda-go-without-aws-en.png"
lang: en
original_post: "/testando-lambda-go-sem-aws/"
---

Hey everyone!

Testing Lambda on AWS is expensive, slow and requires credentials. You deploy, wait, check the log in CloudWatch, fix it, deploy again. The entire cycle takes minutes.

The problem gets worse in CI. Either you configure AWS credentials in the pipeline and hope nobody leaks them, or you skip integration tests and go straight to deploy on faith. Both options are bad.

LocalStack fixes this. You spin up the entire AWS infrastructure locally, tests run against it and the CI pipeline does not need to know AWS exists.

---

## The Lambda function we are going to test

We will use an SQS consumer that processes orders. It receives a message, validates the payload and saves to DynamoDB.

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

```go
// main.go
package main

import (
	"context"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/yourusername/order-processor/handler"
)

func main() {
	cfg, _ := config.LoadDefaultConfig(context.Background())
	db := dynamodb.NewFromConfig(cfg)

	h := handler.New(db, "orders")
	lambda.Start(h.Handle)
}
```

---

## The problem with testing this on AWS

Without LocalStack, integration tests require:

- AWS credentials configured locally
- DynamoDB table created in the account
- SQS queue created in the account
- manual cleanup after each test run
- cost per request and per storage

In CI it gets worse: credentials in GitHub Secrets, IAM role with minimal permissions that takes time to get right, tests that pass locally and fail in the pipeline because of region or permission differences.

---

## LocalStack

LocalStack simulates AWS services locally. SQS, DynamoDB, S3, Lambda, API Gateway and more than 80 other services run in a single Docker container.

The community version covers what most projects need. Install the CLI:

```bash
pip install localstack
brew install localstack/tap/localstack-cli
```

Start the container:

```bash
localstack start
```

Create resources with `awslocal` (a wrapper around the AWS CLI that points to LocalStack):

```bash
pip install awscli-local

awslocal dynamodb create-table \
  --table-name orders \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

awslocal sqs create-queue --queue-name orders
```

It works. But it is still manual. For automated tests you want the container to start and stop alongside the tests.

---

## Testcontainers: LocalStack programmatically

Testcontainers starts Docker containers from inside Go code. The container starts before the test and disappears when the test finishes.

```bash
go get github.com/testcontainers/testcontainers-go
go get github.com/testcontainers/testcontainers-go/modules/localstack
```

---

## Writing the integration tests

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
	"github.com/yourusername/order-processor/handler"
)

func setupLocalStack(t *testing.T) *dynamodb.Client {
	t.Helper()
	ctx := context.Background()

	container, err := localstack.Run(ctx, "localstack/localstack:3")
	if err != nil {
		t.Fatalf("localstack did not start: %v", err)
	}

	t.Cleanup(func() {
		container.Terminate(ctx)
	})

	endpoint, err := container.Endpoint(ctx, "")
	if err != nil {
		t.Fatalf("endpoint not found: %v", err)
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
		t.Fatalf("config failed: %v", err)
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
		t.Fatalf("create table failed: %v", err)
	}

	return db
}

func TestHandle_ValidOrder(t *testing.T) {
	db := setupLocalStack(t)
	h := handler.New(db, "orders")

	order := handler.Order{ID: "order-1", Amount: 99.90, Status: "pending"}
	body, _ := json.Marshal(order)

	event := events.SQSEvent{
		Records: []events.SQSMessage{
			{Body: string(body)},
		},
	}

	if err := h.Handle(context.Background(), event); err != nil {
		t.Fatalf("handler returned error: %v", err)
	}

	result, err := db.GetItem(context.Background(), &dynamodb.GetItemInput{
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
		t.Fatal("expected error for invalid order")
	}
}

func TestHandle_InvalidPayload(t *testing.T) {
	db := setupLocalStack(t)
	h := handler.New(db, "orders")

	event := events.SQSEvent{
		Records: []events.SQSMessage{
			{Body: "this is not json"},
		},
	}

	if err := h.Handle(context.Background(), event); err == nil {
		t.Fatal("expected error for invalid payload")
	}
}
```

Run it:

```bash
go test ./handler/... -v
```

Testcontainers starts LocalStack automatically, the tests run against it and the container disappears at the end. No manual setup, no real credentials.

---

## GitHub Actions without AWS credentials

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

No AWS secrets. Testcontainers uses the Docker daemon on the GitHub Actions runner, LocalStack starts inside it and the tests pass the same as locally.

---

## Separating unit tests from integration tests

Tests with LocalStack start a container and take a few seconds. It makes sense to separate them so you can run only unit tests when you want fast feedback.

Add a build tag to the integration tests:

```go
//go:build integration

package handler_test
```

Run each type separately:

```bash
# unit tests only (fast)
go test ./...

# unit + integration
go test -tags integration ./...
```

In CI you decide which runs when. Pull requests can run only unit tests, merges to main run everything.

---

## Conclusion

LocalStack with Testcontainers solves the problem of testing Lambda without AWS. The setup takes less than an hour, CI needs no credentials and the feedback cycle drops from minutes to seconds.

The same pattern works for any AWS service LocalStack supports: S3, SNS, SQS, EventBridge, Kinesis. You swap the service name in the setup and the tests work the same way.

---

## References

- [LocalStack: official documentation](https://docs.localstack.cloud)
- [Testcontainers for Go](https://golang.testcontainers.org)
- [LocalStack module for Testcontainers](https://golang.testcontainers.org/modules/localstack/)
- [AWS Lambda Go: official repository](https://github.com/aws/aws-lambda-go)
- [AWS SDK Go v2](https://github.com/aws/aws-sdk-go-v2)
