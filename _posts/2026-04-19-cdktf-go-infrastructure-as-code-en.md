---
layout: post
title: "CDKTF in Go: write your Terraform infrastructure in pure Go"
subtitle: "No more HCL. With CDKTF you define AWS resources in Go, with loops, functions and static typing."
author: otavio_celestino
date: 2026-04-19 08:00:00 -0300
categories: [Go, Terraform, DevOps, AWS]
tags: [go, golang, terraform, cdktf, aws, iac, infrastructure, devops]
comments: true
image: "/assets/img/posts/2026-04-19-cdktf-go-infraestrutura-como-codigo-en.png"
lang: en
original_post: "/cdktf-go-infraestrutura-como-codigo/"
---

Hey everyone!

If you have ever written a custom Terraform provider in Go, you know the language and the ecosystem fit well together. But when it comes time to write the actual infrastructure, you go back to HCL.

CDKTF changes that. With it, you define your AWS, GCP, or any other provider resources directly in Go. Loops, functions, structs, unit tests for your infra. HCL becomes an implementation detail you never have to look at.

---

## How it works

CDKTF does not replace Terraform. It sits on top of it. You write Go, run `cdktf synth`, and it generates the JSON that Terraform understands. The `terraform apply` happens normally underneath.

```
Your Go code → cdktf synth → terraform.json → terraform apply → infra created
```

You get the expressiveness of a real programming language without giving up the Terraform ecosystem: providers, state, execution plans, all of it stays the same.

---

## Installing the CDKTF CLI

```bash
npm install -g cdktf-cli
```

Yes, the CLI is Node. But the code you write is pure Go. The CLI is just scaffolding.

Check the installation:

```bash
cdktf --version
```

---

## Creating the project

```bash
mkdir my-infra && cd my-infra
cdktf init --template=go --local
```

The `--local` flag uses local state instead of Terraform Cloud. A good option to start.

Generated structure:

```
my-infra/
  main.go
  go.mod
  go.sum
  cdktf.json
  help/
```

The `cdktf.json` defines the providers you will use:

```json
{
  "language": "go",
  "app": "go run main.go",
  "terraformProviders": ["aws@~> 5.0"],
  "terraformModules": []
}
```

Now generate the Go bindings for the AWS provider:

```bash
cdktf get
```

This downloads and generates the Go package with all AWS resources fully typed. Takes a few minutes the first time.

---

## First stack: an S3 bucket

The generated `main.go` has the base structure. Let us create an S3 bucket:

```go
// main.go
package main

import (
	"github.com/aws/constructs-go/constructs/v10"
	"github.com/aws/jsii-runtime-go"
	"github.com/hashicorp/terraform-cdk-go/cdktf"

	aws "github.com/cdktf/cdktf-provider-aws-go/aws/v19/provider"
	s3 "github.com/cdktf/cdktf-provider-aws-go/aws/v19/s3bucket"
)

func NewMyStack(scope constructs.Construct, id string) cdktf.TerraformStack {
	stack := cdktf.NewTerraformStack(scope, &id)

	aws.NewAwsProvider(stack, jsii.String("AWS"), &aws.AwsProviderConfig{
		Region: jsii.String("us-east-1"),
	})

	s3.NewS3Bucket(stack, jsii.String("my-bucket"), &s3.S3BucketConfig{
		Bucket: jsii.String("my-bucket-huncoding"),
	})

	return stack
}

func main() {
	app := cdktf.NewApp(nil)
	NewMyStack(app, "my-stack")
	app.Synth()
}
```

One thing that stands out: `jsii.String("value")` instead of just `"value"`. CDKTF uses the JSII runtime underneath, which requires pointers on all fields. It is verbose, but you get used to it quickly.

Generate the JSON:

```bash
cdktf synth
```

This creates `cdktf.out/stacks/my-stack/cdk.tf.json` with the Terraform JSON equivalent to the HCL you would have written. You never need to touch that file.

---

## Where Go starts to make a difference

Creating a single bucket is simple in HCL too. CDKTF starts to shine when you have real logic.

### Multiple environments with a loop

In HCL, creating the same resource for dev, staging, and prod requires `for_each` or modules. In Go:

```go
func NewMyStack(scope constructs.Construct, id string) cdktf.TerraformStack {
	stack := cdktf.NewTerraformStack(scope, &id)

	aws.NewAwsProvider(stack, jsii.String("AWS"), &aws.AwsProviderConfig{
		Region: jsii.String("us-east-1"),
	})

	envs := []string{"dev", "staging", "prod"}

	for _, env := range envs {
		env := env
		s3.NewS3Bucket(stack, jsii.String("bucket-"+env), &s3.S3BucketConfig{
			Bucket: jsii.String("huncoding-assets-" + env),
			Tags: &map[string]*string{
				"Environment": jsii.String(env),
				"ManagedBy":   jsii.String("cdktf"),
			},
		})
	}

	return stack
}
```

Three buckets created, each with its own tags, in a three-line loop.

### Reusable constructs

You can extract patterns into normal Go functions. A bucket with versioning and public access blocking that every project uses:

```go
type AppBucketConfig struct {
	Name        string
	Environment string
}

func NewAppBucket(stack cdktf.TerraformStack, config AppBucketConfig) s3.S3Bucket {
	bucket := s3.NewS3Bucket(stack, jsii.String("bucket-"+config.Name), &s3.S3BucketConfig{
		Bucket: jsii.String(config.Name),
		Tags: &map[string]*string{
			"Environment": jsii.String(config.Environment),
		},
	})

	s3.NewS3BucketVersioningA(stack, jsii.String("versioning-"+config.Name), &s3.S3BucketVersioningAConfig{
		Bucket: bucket.Bucket(),
		VersioningConfiguration: &s3.S3BucketVersioningAVersioningConfiguration{
			Status: jsii.String("Enabled"),
		},
	})

	s3.NewS3BucketPublicAccessBlock(stack, jsii.String("public-access-"+config.Name), &s3.S3BucketPublicAccessBlockConfig{
		Bucket:                bucket.Id(),
		BlockPublicAcls:       jsii.Bool(true),
		BlockPublicPolicy:     jsii.Bool(true),
		IgnorePublicAcls:      jsii.Bool(true),
		RestrictPublicBuckets: jsii.Bool(true),
	})

	return bucket
}
```

Now anywhere in the project:

```go
NewAppBucket(stack, AppBucketConfig{
	Name:        "huncoding-uploads",
	Environment: "prod",
})
```

One construct that creates bucket, versioning, and public access blocking, always with the same security settings, no duplication.

---

## Multiple stacks

Larger projects organize infrastructure into separate stacks: networking, database, application. In Go that is just creating more structs:

```go
func main() {
	app := cdktf.NewApp(nil)

	NewNetworkStack(app, "network")
	NewDatabaseStack(app, "database")
	NewAppStack(app, "application")

	app.Synth()
}
```

Each stack has its own state file. You deploy each one independently.

---

## Deploying

With AWS credentials configured:

```bash
# Execution plan
cdktf diff

# Deploy
cdktf deploy

# Destroy everything
cdktf destroy
```

`cdktf diff` is equivalent to `terraform plan`. Shows what will be created, modified, or destroyed before applying.

---

## Testing the infrastructure

A real advantage of CDKTF in Go: you can test JSON generation with normal unit tests, without needing real infrastructure:

```go
// main_test.go
package main

import (
	"encoding/json"
	"testing"

	"github.com/hashicorp/terraform-cdk-go/cdktf"
	"github.com/stretchr/testify/assert"
)

func TestBucketsCreated(t *testing.T) {
	app := cdktf.NewApp(nil)
	stack := NewMyStack(app, "test-stack")

	synth := cdktf.Testing().SynthScope(stack)

	var config map[string]any
	json.Unmarshal([]byte(synth), &config)

	resources := config["resource"].(map[string]any)
	buckets := resources["aws_s3_bucket"].(map[string]any)

	assert.Contains(t, buckets, "bucket-dev")
	assert.Contains(t, buckets, "bucket-staging")
	assert.Contains(t, buckets, "bucket-prod")
}
```

This creates nothing on AWS. It only verifies that the generated JSON has the expected resources. Runs in CI without credentials.

---

## Is it worth migrating?

You do not need to migrate anything. CDKTF works alongside existing HCL. You can start using it for new modules while the rest stays in HCL.

It makes more sense for teams that already write Go and want consistency in the stack, or for infrastructure with a lot of conditional logic and repetition that would be hard to read in HCL.

If your infrastructure is simple and stable, HCL is still the more straightforward option.

---

## Conclusion

CDKTF is not a solution for everything, but it fills a real gap: programming logic in infrastructure definition, without giving up Terraform underneath. And in Go, with the typing and reuse that a real language offers, the difference from HCL becomes clear quickly.

If you have already written a custom provider, the natural next step is to define the infrastructure that uses that provider in the same language.

---

## References

- [CDKTF: official documentation](https://developer.hashicorp.com/terraform/cdktf)
- [cdktf-provider-aws-go on GitHub](https://github.com/cdktf/cdktf-provider-aws-go)
- [Building a custom Terraform provider in Go](https://huncoding.github.io/en/building-terraform-custom-provider/)
- [CDKTF Go template](https://github.com/hashicorp/terraform-cdk/tree/main/packages/cdktf-cli/lib/init-templates/go)
