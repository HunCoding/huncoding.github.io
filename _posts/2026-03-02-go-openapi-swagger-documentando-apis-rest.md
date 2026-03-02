---
layout: post
title: "Go e OpenAPI/Swagger: documentando APIs REST do jeito certo"
subtitle: "Guia prático para documentar APIs REST em Go: ferramentas, estratégias e boas práticas"
date: 2026-03-01 08:00:00 -0300
categories: [Go, APIs, Documentação, OpenAPI]
tags: [go, openapi, swagger, rest, api, documentation, swaggo]
comments: true
image: "/assets/img/posts/2026-03-02-go-openapi-swagger-documenting-rest-apis.png"
lang: pt-BR
---

E aí, pessoal!

Documentar APIs REST é chato. Mas é necessário. E quando você faz certo, você ganha:

- Clientes que entendem sua API sem precisar perguntar
- Documentação que sempre está atualizada
- Ferramentas que geram código automaticamente
- Menos suporte e mais produtividade

O problema é que documentação manual sempre fica desatualizada. E ninguém gosta de escrever documentação.

A solução? **OpenAPI/Swagger com geração automática a partir do código**.

Este post mostra como documentar APIs REST em Go do jeito certo.

## O que você vai encontrar aqui

Este guia cobre tudo que você precisa para documentar APIs REST em Go:

1. **Por que OpenAPI/Swagger**: o que é e por que usar
2. **Ferramentas disponíveis**: swaggo, go-swagger e outras
3. **Estratégias de documentação**: code-first vs spec-first
4. **Implementação prática**: passo a passo com swaggo
5. **Boas práticas**: o que fazer e o que evitar

Cada seção tem exemplos práticos e decisões que você precisa tomar.

## 1. Por que OpenAPI/Swagger

### O que é OpenAPI

OpenAPI (anteriormente Swagger) é uma especificação para descrever APIs REST. É um formato YAML ou JSON que define:

A spec OpenAPI define:

- Endpoints (paths)
- Métodos HTTP
- Parâmetros e respostas
- Schemas de dados
- Autenticação
- Exemplos

### Por que usar OpenAPI

**1. Documentação sempre atualizada**

Quando você gera a spec a partir do código, a documentação nunca fica desatualizada:

O fluxo é simples:

Código Go -> OpenAPI Spec -> Swagger UI (HTML)

Tudo sempre sincronizado automaticamente.

**2. Geração de código automática**

Com uma spec OpenAPI, você pode gerar:
- Clientes em múltiplas linguagens
- Servidores em múltiplas linguagens
- Testes automatizados
- Mocks para desenvolvimento

**3. Ferramentas de validação**

OpenAPI permite validar:
- Requests contra a spec
- Responses contra a spec
- Contratos em testes

**4. Integração com ferramentas**

- Postman importa OpenAPI
- Insomnia importa OpenAPI
- Swagger UI renderiza visualmente
- Redoc cria documentação bonita

## 2. Ferramentas disponíveis

### Comparação das principais ferramentas

| Ferramenta | Abordagem | Complexidade | Manutenção |
|------------|----------|--------------|------------|
| **swaggo/swag** | Code-first | Baixa | Alta |
| **go-swagger** | Spec-first | Média | Média |
| **oapi-codegen** | Spec-first | Média | Alta |
| **openapi-generator** | Spec-first | Alta | Média |

### swaggo/swag (recomendado para começar)

**Vantagens:**
- Anotações no código Go
- Geração automática de spec
- Swagger UI integrado
- Fácil de começar

**Desvantagens:**
- Anotações podem poluir o código
- Menos flexível que spec-first

**Quando usar:**
- Projetos novos ou pequenos
- Quando você quer começar rápido
- Quando a documentação vem do código

### go-swagger

**Vantagens:**
- Spec-first (mais controle)
- Gera código a partir da spec
- Validação automática

**Desvantagens:**
- Mais complexo de configurar
- Precisa manter spec e código sincronizados

**Quando usar:**
- APIs grandes e complexas
- Quando você precisa de controle total
- Quando múltiplas equipes trabalham na API

## 3. Estratégias de documentação

### Code-first vs Spec-first

**CODE-FIRST (swaggo):**

Código Go -> Anotações -> OpenAPI Spec -> UI

A fonte da verdade é o código.

Vantagens:
- Mais rápido para começar
- Documentação sempre sincronizada

Desvantagens:
- Anotações podem poluir código

**SPEC-FIRST (go-swagger):**

OpenAPI Spec -> Gera Código -> Implementação

A fonte da verdade é a spec.

Vantagens:
- Controle total sobre a spec
- Pode gerar código para múltiplas linguagens

Desvantagens:
- Precisa manter spec e código sincronizados

### Qual escolher?

**Code-first (swaggo)** se:
- Você já tem código Go
- Quer começar rápido
- A documentação é secundária

**Spec-first (go-swagger)** se:
- Você está começando do zero
- A API é o contrato principal
- Múltiplas equipes/linguagens

## 4. Implementação prática com swaggo

### Passo 1: Instalação

```bash
go install github.com/swaggo/swag/cmd/swag@latest
```

### Passo 2: Estrutura básica

Com swaggo, você adiciona anotações nos handlers:

```go
// @Summary      Cria um novo usuário
// @Description  Cria um novo usuário no sistema
// @Tags         users
// @Accept       json
// @Produce      json
// @Param        user  body      UserRequest  true  "Dados do usuário"
// @Success      201   {object}  UserResponse
// @Failure      400   {object}  ErrorResponse
// @Router       /users [post]
func CreateUser(c *gin.Context) {
    // ... implementação
}
```

### Passo 3: Gerar documentação

```bash
swag init
```

Isso gera:
- `docs/swagger.json` - Spec OpenAPI
- `docs/swagger.yaml` - Spec OpenAPI (YAML)
- `docs/docs.go` - Código Go com a spec

### Passo 4: Servir Swagger UI

```go
import "github.com/swaggo/gin-swagger"
import "github.com/swaggo/files"

router.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
```

Agora você tem documentação interativa em `/swagger/index.html`.

### Como fica visualmente

Aqui está um exemplo de como o Swagger UI fica quando você acessa `/swagger/index.html`:

![Swagger UI - Exemplo de documentação interativa](/assets/img/posts/2026-03-02-go-openapi-swagger-documenting-rest-apis-openai.png)

> **Nota**: Este é o Swagger UI padrão do Petstore (exemplo oficial). No seu caso, seria a documentação da sua própria API, gerada automaticamente a partir das anotações no código Go.

**O que você pode fazer no Swagger UI:**
- Ver todos os endpoints organizados por tags
- Ver schemas de request/response
- Testar endpoints diretamente na interface ("Try it out")
- Ver exemplos de código em múltiplas linguagens
- Validar requests antes de enviar

**Para usar com sua própria API**, você pode:
1. Hospedar o `swagger.json` em algum lugar público (GitHub Pages, S3, etc.)
2. Ou simplesmente linkar para `/swagger/index.html` no seu servidor

## 5. Boas práticas

### O que fazer

**1. Documente exemplos reais**

```go
// @Success      200  {object}  UserResponse  "Exemplo: {\"id\": 1, \"name\": \"João\"}"
```

**2. Documente erros comuns**

```go
// @Failure      400  {object}  ErrorResponse  "Email inválido"
// @Failure      409  {object}  ErrorResponse  "Usuário já existe"
```

**3. Use tags para organizar**

```go
// @Tags         users
// @Tags         authentication
```

**4. Documente autenticação**

```go
// @Security     BearerAuth
// @Security     ApiKeyAuth
```

**5. Mantenha schemas consistentes**

Use structs reutilizáveis para requests/responses:

```go
type UserResponse struct {
    ID    int    `json:"id" example:"1"`
    Name  string `json:"name" example:"João Silva"`
    Email string `json:"email" example:"joao@example.com"`
}
```

### O que evitar

**1. Não documente tudo manualmente**

Use anotações, não comentários livres.

**2. Não esqueça de atualizar**

Se mudar o código, atualize as anotações.

**3. Não documente endpoints internos**

Documente apenas APIs públicas.

**4. Não use exemplos genéricos**

Use exemplos reais que ajudem desenvolvedores.

## Conclusão

Documentar APIs REST não precisa ser chato. Com OpenAPI/Swagger e ferramentas como swaggo, você tem:

- Documentação sempre atualizada
- Interface visual interativa
- Geração de código automática
- Integração com ferramentas

A chave é escolher a estratégia certa (code-first vs spec-first) e automatizar o máximo possível.

Comece simples com swaggo. Adicione complexidade conforme precisa. E sempre mantenha a documentação sincronizada com o código.

Vale a pena o esforço.

## Referências e fontes

### Documentação oficial

- **[OpenAPI Specification](https://swagger.io/specification/)** - Especificação oficial
- **[swaggo/swag](https://github.com/swaggo/swag)** - Ferramenta para Go
- **[go-swagger](https://goswagger.io/)** - Framework completo

### Ferramentas

- **[Swagger UI](https://swagger.io/tools/swagger-ui/)** - Interface visual
- **[Redoc](https://github.com/Redocly/redoc)** - Documentação alternativa
- **[Postman](https://www.postman.com/)** - Importa OpenAPI

### Recursos

- **[OpenAPI Generator](https://openapi-generator.tech/)** - Gera código de specs
- **[SwaggerHub](https://swagger.io/tools/swaggerhub/)** - Plataforma de documentação
