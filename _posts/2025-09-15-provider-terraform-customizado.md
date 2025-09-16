---
layout: post
title: "Criando um Provider Terraform Customizado do Zero"
date: 2025-09-15 00:00:00 -0000
categories: [terraform, go, devops]
tags: [terraform, go, provider, sdk, api]
image: "/assets/img/posts/provider-terraform-customizado.png"
---

E aí, pessoal! Hoje vou te mostrar como criar um Provider Terraform customizado do zero usando Go. É um tema que muitos desenvolvedores têm medo de encarar, mas na verdade não é esse bicho de sete cabeças que parece.

## Por que criar um Provider customizado?

Antes de mergulhar no código, vamos entender o cenário. O Terraform já tem milhares de providers oficiais e da comunidade, mas e quando você precisa gerenciar um recurso de uma API interna da sua empresa? Ou quando você tem uma ferramenta muito específica que não tem provider?

É aí que entra a criação de um provider customizado. E olha, não é só para casos extremos não - às vezes você quer ter controle total sobre como seus recursos são gerenciados, ou precisa de funcionalidades muito específicas que os providers existentes não oferecem.

## A arquitetura de um Terraform Provider

Um provider Terraform é basicamente um plugin que implementa a interface do Terraform SDK. Ele precisa implementar algumas funções principais:

- **Configure**: Configuração inicial do provider
- **Resources**: Definição dos recursos que o provider pode gerenciar
- **Data Sources**: Fontes de dados que o provider pode consultar

O SDK do Terraform em Go facilita muito essa implementação, fornecendo estruturas e funções prontas para você usar.

## Mãos na massa: Criando nosso provider

Vamos criar um provider simples que gerencia "usuários" em uma API fictícia.

### 1. Estrutura inicial do projeto

Primeiro, vamos criar a estrutura do nosso projeto:

```bash
mkdir terraform-provider-example
cd terraform-provider-example
go mod init github.com/HunCoding/terraform-provider-example
```

### 2. Dependências necessárias

Vamos adicionar as dependências do Terraform SDK:

```bash
go get github.com/hashicorp/terraform-plugin-sdk/v2/helper/schema
go get github.com/hashicorp/terraform-plugin-sdk/v2/plugin
```

### 3. Implementação do Provider

Agora vamos criar o arquivo principal do nosso provider:

```go
package main

import (
    "context"
    "fmt"
    "log"

    "github.com/hashicorp/terraform-plugin-sdk/v2/diag"
    "github.com/hashicorp/terraform-plugin-sdk/v2/helper/schema"
    "github.com/hashicorp/terraform-plugin-sdk/v2/plugin"
)

func main() {
    plugin.Serve(&plugin.ServeOpts{
        ProviderFunc: Provider,
    })
}

func Provider() *schema.Provider {
    return &schema.Provider{
        Schema: map[string]*schema.Schema{
            "api_url": {
                Type:        schema.TypeString,
                Required:    true,
                DefaultFunc: schema.EnvDefaultFunc("API_URL", ""),
                Description: "URL da API para gerenciar usuários",
            },
            "api_token": {
                Type:        schema.TypeString,
                Required:    true,
                DefaultFunc: schema.EnvDefaultFunc("API_TOKEN", ""),
                Description: "Token de autenticação da API",
            },
        },
        ResourcesMap: map[string]*schema.Resource{
            "example_user": resourceUser(),
        },
        DataSourcesMap: map[string]*schema.Resource{
            "example_user": dataSourceUser(),
        },
        ConfigureContextFunc: providerConfigure,
    }
}

func providerConfigure(ctx context.Context, d *schema.ResourceData) (interface{}, diag.Diagnostics) {
    apiURL := d.Get("api_url").(string)
    apiToken := d.Get("api_token").(string)

    if apiURL == "" {
        return nil, diag.Errorf("api_url é obrigatório")
    }

    if apiToken == "" {
        return nil, diag.Errorf("api_token é obrigatório")
    }

    // Aqui você criaria sua estrutura de cliente da API
    client := &APIClient{
        URL:   apiURL,
        Token: apiToken,
    }

    return client, nil
}
```

### 4. Estrutura do cliente da API

Vamos criar uma estrutura simples para representar nosso cliente da API:

```go
type APIClient struct {
    URL   string
    Token string
}

type User struct {
    ID    string `json:"id"`
    Name  string `json:"name"`
    Email string `json:"email"`
}

// Métodos do cliente (implementação simplificada)
func (c *APIClient) CreateUser(user *User) (*User, error) {
    // Implementação da criação de usuário
    // Aqui você faria a chamada HTTP para sua API
    return user, nil
}

func (c *APIClient) GetUser(id string) (*User, error) {
    // Implementação da busca de usuário
    return &User{ID: id, Name: "Exemplo", Email: "exemplo@test.com"}, nil
}

func (c *APIClient) UpdateUser(id string, user *User) (*User, error) {
    // Implementação da atualização de usuário
    return user, nil
}

func (c *APIClient) DeleteUser(id string) error {
    // Implementação da exclusão de usuário
    return nil
}
```

### 5. Implementação do Resource

Agora vamos implementar o resource de usuário:

```go
func resourceUser() *schema.Resource {
    return &schema.Resource{
        CreateContext: resourceUserCreate,
        ReadContext:   resourceUserRead,
        UpdateContext: resourceUserUpdate,
        DeleteContext: resourceUserDelete,
        Schema: map[string]*schema.Schema{
            "id": {
                Type:     schema.TypeString,
                Computed: true,
            },
            "name": {
                Type:     schema.TypeString,
                Required: true,
            },
            "email": {
                Type:     schema.TypeString,
                Required: true,
            },
        },
    }
}

func resourceUserCreate(ctx context.Context, d *schema.ResourceData, m interface{}) diag.Diagnostics {
    client := m.(*APIClient)

    user := &User{
        Name:  d.Get("name").(string),
        Email: d.Get("email").(string),
    }

    createdUser, err := client.CreateUser(user)
    if err != nil {
        return diag.FromErr(err)
    }

    d.SetId(createdUser.ID)
    return resourceUserRead(ctx, d, m)
}

func resourceUserRead(ctx context.Context, d *schema.ResourceData, m interface{}) diag.Diagnostics {
    client := m.(*APIClient)

    user, err := client.GetUser(d.Id())
    if err != nil {
        return diag.FromErr(err)
    }

    d.Set("name", user.Name)
    d.Set("email", user.Email)

    return nil
}

func resourceUserUpdate(ctx context.Context, d *schema.ResourceData, m interface{}) diag.Diagnostics {
    client := m.(*APIClient)

    user := &User{
        ID:    d.Id(),
        Name:  d.Get("name").(string),
        Email: d.Get("email").(string),
    }

    _, err := client.UpdateUser(d.Id(), user)
    if err != nil {
        return diag.FromErr(err)
    }

    return resourceUserRead(ctx, d, m)
}

func resourceUserDelete(ctx context.Context, d *schema.ResourceData, m interface{}) diag.Diagnostics {
    client := m.(*APIClient)

    err := client.DeleteUser(d.Id())
    if err != nil {
        return diag.FromErr(err)
    }

    d.SetId("")
    return nil
}
```

### 6. Implementação do Data Source

Para completar, vamos implementar um data source:

```go
func dataSourceUser() *schema.Resource {
    return &schema.Resource{
        ReadContext: dataSourceUserRead,
        Schema: map[string]*schema.Schema{
            "id": {
                Type:     schema.TypeString,
                Required: true,
            },
            "name": {
                Type:     schema.TypeString,
                Computed: true,
            },
            "email": {
                Type:     schema.TypeString,
                Computed: true,
            },
        },
    }
}

func dataSourceUserRead(ctx context.Context, d *schema.ResourceData, m interface{}) diag.Diagnostics {
    client := m.(*APIClient)

    userID := d.Get("id").(string)
    user, err := client.GetUser(userID)
    if err != nil {
        return diag.FromErr(err)
    }

    d.SetId(user.ID)
    d.Set("name", user.Name)
    d.Set("email", user.Email)

    return nil
}
```

## Testando o provider

Agora vamos criar um exemplo de uso do nosso provider:

```hcl
terraform {
  required_providers {
    example = {
      source = "github.com/HunCoding/terraform-provider-example"
    }
  }
}

provider "example" {
  api_url   = "https://api.exemplo.com"
  api_token = "seu-token-aqui"
}

resource "example_user" "usuario_teste" {
  name  = "João Silva"
  email = "joao@exemplo.com"
}

data "example_user" "usuario_existente" {
  id = "123"
}
```

## Compilando e instalando

Para compilar o provider:

```bash
go build -o terraform-provider-example
```

Para instalar localmente, você precisa colocar o binário no diretório correto do Terraform:

```bash
mkdir -p ~/.terraform.d/plugins/github.com/HunCoding/terraform-provider-example/1.0.0/linux_amd64
cp terraform-provider-example ~/.terraform.d/plugins/github.com/HunCoding/terraform-provider-example/1.0.0/linux_amd64/
```

## Usando o Provider Customizado na Prática

Agora que criamos nosso provider, vamos ver como usar ele na prática. Vou te mostrar alguns cenários reais de uso.

### Cenário 1: Gerenciando usuários de uma aplicação

Imagine que você tem uma aplicação web e quer gerenciar os usuários via Terraform. Vamos criar um exemplo completo:

```hcl
# main.tf
terraform {
  required_providers {
    example = {
      source = "github.com/huncoding/terraform-provider-example"
    }
  }
}

provider "example" {
  api_url   = var.api_url
  api_token = var.api_token
}

# Variáveis
variable "api_url" {
  description = "URL da API"
  type        = string
  default     = "https://api.minhaempresa.com"
}

variable "api_token" {
  description = "Token de autenticação"
  type        = string
  sensitive   = true
}

# Usuários da equipe de desenvolvimento
resource "example_user" "dev_team" {
  for_each = {
    joao = {
      name  = "João Silva"
      email = "joao@minhaempresa.com"
    }
    maria = {
      name  = "Maria Santos"
      email = "maria@minhaempresa.com"
    }
    pedro = {
      name  = "Pedro Costa"
      email = "pedro@minhaempresa.com"
    }
  }

  name  = each.value.name
  email = each.value.email
}

# Usuário admin
resource "example_user" "admin" {
  name  = "Admin Sistema"
  email = "admin@minhaempresa.com"
}

# Buscando um usuário existente
data "example_user" "usuario_existente" {
  id = "123"
}

# Outputs
output "dev_team_users" {
  description = "IDs dos usuários da equipe de desenvolvimento"
  value = {
    for k, v in example_user.dev_team : k => v.id
  }
}

output "admin_user_id" {
  description = "ID do usuário admin"
  value       = example_user.admin.id
}

output "existing_user_email" {
  description = "Email do usuário existente"
  value       = data.example_user.usuario_existente.email
}
```

### Cenário 2: Integrando com outros providers

O legal do Terraform é que você pode usar seu provider customizado junto com outros providers oficiais:

```hcl
terraform {
  required_providers {
    example = {
      source = "github.com/huncoding/terraform-provider-example"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "example" {
  api_url   = var.api_url
  api_token = var.api_token
}

provider "aws" {
  region = "us-east-1"
}

# Criando usuário na nossa API
resource "example_user" "new_user" {
  name  = "Usuário AWS"
  email = "aws-user@minhaempresa.com"
}

# Criando bucket S3 para o usuário
resource "aws_s3_bucket" "user_bucket" {
  bucket = "bucket-${example_user.new_user.id}"
}

# Criando política IAM baseada no usuário
resource "aws_iam_policy" "user_policy" {
  name = "policy-${example_user.new_user.id}"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "s3:GetObject",
          "s3:PutObject"
        ]
        Effect = "Allow"
        Resource = "${aws_s3_bucket.user_bucket.arn}/*"
      }
    ]
  })
}
```

### Executando o Terraform

Agora vamos ver como executar tudo isso:

```bash
# 1. Inicializar o Terraform
terraform init

# 2. Planejar as mudanças
terraform plan

# 3. Aplicar as mudanças
terraform apply

# 4. Ver o estado atual
terraform show

# 5. Destruir os recursos (se necessário)
terraform destroy
```

### Dicas importantes para uso em produção

#### 1. Gerenciamento de estado
```hcl
# backend.tf
terraform {
  backend "s3" {
    bucket = "meu-terraform-state"
    key    = "users/terraform.tfstate"
    region = "us-east-1"
  }
}
```

#### 2. Variáveis de ambiente
```bash
# .env
export TF_VAR_api_url="https://api.minhaempresa.com"
export TF_VAR_api_token="seu-token-aqui"
```

#### 3. Workspaces para diferentes ambientes
```bash
# Criar workspace para desenvolvimento
terraform workspace new dev

# Criar workspace para produção
terraform workspace new prod

# Listar workspaces
terraform workspace list

# Trocar de workspace
terraform workspace select dev
```

#### 4. Validação e formatação
```bash
# Validar a configuração
terraform validate

# Formatar os arquivos
terraform fmt -recursive

# Verificar se há problemas de segurança
terraform plan -detailed-exitcode
```

### Monitoramento e logs

Para monitorar o uso do seu provider:

```bash
# Habilitar logs detalhados
export TF_LOG=DEBUG
export TF_LOG_PATH=terraform.log

# Executar o Terraform
terraform apply
```

### Próximos passos para produção

1. **Testes automatizados**: Crie testes para seu provider
2. **CI/CD**: Integre com GitHub Actions ou similar
3. **Documentação**: Documente todos os recursos e data sources
4. **Versionamento**: Use tags Git para versionar seu provider
5. **Registry**: Publique no Terraform Registry quando estiver maduro

## Conclusão

Criar um provider Terraform customizado não é tão complicado quanto parece. Com o SDK do Terraform em Go, você tem todas as ferramentas necessárias para criar providers robustos e funcionais.

Se você tem uma API interna ou precisa de funcionalidades específicas, talvez vale a oportunidade de criar um provider.
