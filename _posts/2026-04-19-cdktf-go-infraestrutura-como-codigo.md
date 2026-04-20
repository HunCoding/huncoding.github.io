---
layout: post
title: "CDKTF em Go: escreva sua infraestrutura Terraform em Go puro"
subtitle: "Chega de HCL. Com o CDKTF você define recursos da AWS em Go, com loops, funções e tipagem estática."
author: otavio_celestino
date: 2026-04-19 08:00:00 -0300
categories: [Go, Terraform, DevOps, AWS]
tags: [go, golang, terraform, cdktf, aws, iac, infraestrutura, devops]
comments: true
image: "/assets/img/posts/2026-04-19-cdktf-go-infraestrutura-como-codigo-en.png"
lang: pt-BR
---

E aí, pessoal!

Se você já escreveu um provider customizado do Terraform em Go, sabe que a linguagem e o ecossistema combinam muito bem. Mas na hora de escrever a infraestrutura em si, você volta pro HCL.

O CDKTF muda isso. Com ele, você define seus recursos da AWS, GCP ou qualquer outro provider diretamente em Go. Loops, funções, structs, testes unitários na sua infra. O HCL vira um detalhe de implementação que você nunca precisa ver.

---

## Como funciona

O CDKTF não substitui o Terraform. Ele fica em cima. Você escreve Go, roda `cdktf synth`, e ele gera o JSON que o Terraform entende. O `terraform apply` acontece normalmente por baixo.

```
Seu código Go → cdktf synth → terraform.json → terraform apply → infra criada
```

Você ganha a expressividade de uma linguagem de programação real sem abrir mão do ecossistema do Terraform: providers, state, planos de execução, tudo continua igual.

---

## Instalando o CDKTF CLI

```bash
npm install -g cdktf-cli
```

Sim, o CLI é Node. Mas o código que você vai escrever é Go puro. O CLI é só scaffolding.

Verifique a instalação:

```bash
cdktf --version
```

---

## Criando o projeto

```bash
mkdir minha-infra && cd minha-infra
cdktf init --template=go --local
```

A flag `--local` usa state local em vez do Terraform Cloud. Boa opção pra começar.

Estrutura gerada:

```
minha-infra/
  main.go
  go.mod
  go.sum
  cdktf.json
  help/
```

O `cdktf.json` define os providers que você vai usar:

```json
{
  "language": "go",
  "app": "go run main.go",
  "terraformProviders": ["aws@~> 5.0"],
  "terraformModules": []
}
```

Agora gera os bindings Go do provider AWS:

```bash
cdktf get
```

Isso baixa e gera o pacote Go com todos os recursos da AWS tipados. Demora alguns minutos na primeira vez.

---

## Primeira stack: um bucket S3

O `main.go` gerado tem a estrutura base. Vamos criar um bucket S3:

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

func NewMinhaStack(scope constructs.Construct, id string) cdktf.TerraformStack {
	stack := cdktf.NewTerraformStack(scope, &id)

	aws.NewAwsProvider(stack, jsii.String("AWS"), &aws.AwsProviderConfig{
		Region: jsii.String("us-east-1"),
	})

	s3.NewS3Bucket(stack, jsii.String("meu-bucket"), &s3.S3BucketConfig{
		Bucket: jsii.String("meu-bucket-huncoding"),
	})

	return stack
}

func main() {
	app := cdktf.NewApp(nil)
	NewMinhaStack(app, "minha-stack")
	app.Synth()
}
```

Uma coisa que chama atenção: `jsii.String("valor")` em vez de só `"valor"`. O CDKTF usa o runtime JSII por baixo, que exige ponteiros em todos os campos. É verboso, mas você se acostuma rápido.

Gera o JSON:

```bash
cdktf synth
```

Isso cria `cdktf.out/stacks/minha-stack/cdk.tf.json` com o Terraform JSON equivalente ao HCL que você teria escrito. Você nunca precisa mexer nesse arquivo.

---

## Onde o Go começa a fazer diferença

Criar um bucket é simples em HCL também. O CDKTF começa a brilhar quando você tem lógica real.

### Múltiplos ambientes com um loop

Em HCL, criar o mesmo recurso pra dev, staging e prod exige `for_each` ou módulos. Em Go:

```go
func NewMinhaStack(scope constructs.Construct, id string) cdktf.TerraformStack {
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

Três buckets criados, cada um com suas tags, num loop de três linhas.

### Constructs reutilizáveis

Você pode extrair padrões em funções Go normais. Um bucket com versionamento e bloqueio de acesso público que todo projeto usa:

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

Agora em qualquer stack do projeto:

```go
NewAppBucket(stack, AppBucketConfig{
	Name:        "huncoding-uploads",
	Environment: "prod",
})
```

Um construct que cria bucket, versionamento e bloqueio de acesso público, sempre com as mesmas configurações de segurança, sem duplicação.

---

## Múltiplas stacks

Projetos maiores organizam a infra em stacks separadas: rede, banco, aplicação. Em Go isso é só criar mais structs:

```go
func main() {
	app := cdktf.NewApp(nil)

	NewRedeStack(app, "rede")
	NewBancoStack(app, "banco")
	NewAppStack(app, "aplicacao")

	app.Synth()
}
```

Cada stack tem seu próprio state file. Você faz deploy de cada uma independentemente.

---

## Fazendo o deploy

Com as credenciais AWS configuradas:

```bash
# Plano de execução
cdktf diff

# Deploy
cdktf deploy

# Destruir tudo
cdktf destroy
```

O `cdktf diff` é equivalente ao `terraform plan`. Mostra o que vai ser criado, modificado ou destruído antes de aplicar.

---

## Testando a infra

Uma vantagem real do CDKTF em Go: você pode testar a geração do JSON com testes unitários normais, sem precisar de infraestrutura real:

```go
// main_test.go
package main

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/aws/constructs-go/constructs/v10"
	"github.com/hashicorp/terraform-cdk-go/cdktf"
	"github.com/stretchr/testify/assert"
)

func TestBucketsCriados(t *testing.T) {
	app := cdktf.NewApp(nil)
	stack := NewMinhaStack(app, "test-stack")

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

Isso não cria nada na AWS. Só verifica que o JSON gerado tem os recursos esperados. Dá pra rodar no CI sem credenciais.

---

## Vale a pena migrar?

Não precisa migrar nada. CDKTF funciona junto com HCL existente. Você pode começar usando pra novos módulos enquanto o restante continua em HCL.

Faz mais sentido pra times que já escrevem Go e querem consistência na stack, ou pra infra com muita lógica condicional e repetição que em HCL ficaria difícil de ler.

Se sua infra é simples e estável, HCL continua sendo a opção mais direta.

---

## Conclusão

O CDKTF não é a solução pra tudo, mas preenche uma lacuna real: lógica de programação na definição de infraestrutura, sem abrir mão do Terraform por baixo. E em Go, com tipagem e reuso que uma linguagem real oferece, a diferença pra HCL fica clara rápido.

Se você já escreveu um provider customizado, o próximo passo natural é definir a infra que usa esse provider na mesma linguagem.

---

## Referências

- [CDKTF: documentação oficial](https://developer.hashicorp.com/terraform/cdktf)
- [cdktf-provider-aws-go no GitHub](https://github.com/cdktf/cdktf-provider-aws-go)
- [Construindo um provider Terraform customizado em Go](https://huncoding.github.io/criando-provider-terraform-do-zero/)
- [CDKTF Go template](https://github.com/hashicorp/terraform-cdk/tree/main/packages/cdktf-cli/lib/init-templates/go)
