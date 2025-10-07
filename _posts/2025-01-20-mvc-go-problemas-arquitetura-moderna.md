---
layout: post
title: "Por que Engenheiros Sênior Estão Abandonando MVC em Go"
subtitle: "Aprendendo por que o padrão MVC não escala bem em Go e quais arquiteturas modernas estão substituindo-o para sistemas mais limpos, testáveis e manuteníveis."
author: otavio_celestino
date: 2025-10-07 08:00:00 -0300
categories: [Go, Arquitetura, Clean Code, Microservices, Design Patterns]
tags: [go, mvc, hexagonal-architecture, clean-architecture, microservices, design-patterns, architecture]
comments: true
image: "/assets/img/posts/mvc-go-problemas-arquitetura-moderna.png"
lang: pt-BR
---

E aí, pessoal!

Hoje vou te mostrar por que **engenheiros sênior estão abandonando o padrão MVC** em Go e migrando para arquiteturas mais modernas. Se você ainda está forçando Go em um padrão que não combina com a linguagem, este post é para você!

## O Problema: MVC Não Foi Feito para Go

**MVC (Model-View-Controller)** nasceu em frameworks como Rails e Spring, quando o mundo era diferente:

- **Monolitos** eram a norma
- **Server-side rendering** dominava
- **Controllers** complexos controlavam tudo
- **Models** faziam tudo (dados + comportamento)

Mas Go é **diferente**. Go não é uma linguagem orientada a frameworks. Go é sobre **simplicidade, composição e interfaces**.

## Por que MVC Falha em Go?

### 1. Go Não Tem "Controllers" Nativos

**O problema fundamental**: Go não foi projetado para o padrão MVC tradicional. Quando você tenta forçar MVC em Go, acaba criando controllers que fazem tudo:

- **Validação de dados**
- **Lógica de negócio** 
- **Persistência de dados**
- **Serialização de resposta**

**Por que isso é problemático:**
- **Controllers complexos**: Violam o princípio da responsabilidade única
- **Tight coupling**: Acoplamento forte entre camadas
- **Difícil de testar**: Muitas dependências e responsabilidades
- **Violação de responsabilidades**: Controller faz trabalho que deveria ser de Service/Repository

**Em produção, isso resulta em:**
- Bugs difíceis de rastrear
- Código que ninguém quer mexer
- Testes que quebram por qualquer mudança
- Refatorações que viram pesadelos

### 2. Models em Go São Diferentes

**O problema**: Em frameworks como Rails/Spring, models fazem tudo - validação, persistência, lógica de negócio, até envio de emails. Em Go, isso vira um pesadelo.

**Por que não funciona:**
- **Violação SRP**: Model sobrecarregado com muitas responsabilidades
- **Difícil de testar**: Como testar um model que faz 5 coisas diferentes?
- **Acoplamento**: Model conhece banco, email, validação, etc.
- **Reutilização**: Como reutilizar lógica que está misturada no model?

**Em sistemas reais, isso causa:**
- Models com 500+ linhas de código
- Testes que precisam mockar 10 dependências
- Mudanças que quebram funcionalidades não relacionadas
- Código que ninguém entende completamente

### 3. Views Não Existem em APIs

**O problema**: MVC foi criado para aplicações web com server-side rendering. Em APIs REST/GraphQL, o conceito de "View" não faz sentido.

**Por que é problemático:**
- **Desnecessário**: APIs retornam JSON, não HTML
- **Complexidade extra**: Camada que não agrega valor
- **Confusão**: Mistura conceitos de web tradicional com API moderna
- **Overhead**: Código extra para algo que o framework já faz

**Em APIs modernas:**
- Serialização é feita automaticamente pelo framework
- Lógica de apresentação é responsabilidade do cliente
- "Views" viram apenas wrappers desnecessários

## Cenários Reais: Quando MVC Quebra

### Sistema de E-commerce
**Problema**: Controller de pedidos com 800 linhas
- Validação de produtos
- Cálculo de impostos
- Integração com gateway de pagamento
- Envio de emails
- Atualização de estoque

**Resultado**: 6 meses para adicionar uma nova forma de pagamento

### API de Microserviços
**Problema**: 15 microserviços, todos com MVC
- Cada controller faz 5-10 coisas diferentes
- Testes que demoram 2 horas para rodar
- Bugs que aparecem em serviços não relacionados

**Resultado**: Time de 8 pessoas, 80% do tempo em manutenção

### Sistema Financeiro
**Problema**: Model de transação com 20 responsabilidades
- Validação de regras de negócio
- Cálculos complexos
- Persistência em múltiplos bancos
- Auditoria e logs

**Resultado**: 3 meses para implementar uma nova regra de compliance

## O Que Engenheiros Sênior Estão Fazendo

### 1. Hexagonal Architecture (Ports & Adapters)

Se você quer aprender Hexagonal Architecture em profundidade, gravei um [vídeo no YouTube](https://youtu.be/wYyHZL1r7dQ) sobre o tema:

{% include embed/youtube.html id="wYyHZL1r7dQ" %}

**A ideia central**: Coloque sua lógica de negócio no centro e conecte tudo através de interfaces (ports). As implementações (adapters) ficam na periferia.

**Por que funciona em Go:**
- **Interfaces implícitas**: Go não precisa declarar que implementa uma interface
- **Composição**: Fácil de compor comportamentos
- **Testabilidade**: Interfaces são fáceis de mockar
- **Flexibilidade**: Troca implementações sem quebrar código

**Estrutura típica:**
- **Domain**: Entidades e regras de negócio
- **Ports**: Interfaces que definem contratos
- **Adapters**: Implementações específicas (banco, HTTP, etc.)
- **Use Cases**: Orquestração da lógica de negócio

**Resultados em produção:**
- **90% menos bugs** em mudanças de infraestrutura
- **3x mais rápido** para adicionar novas features
- **Testes que rodam em segundos** ao invés de minutos
- **Código que qualquer dev entende** em 5 minutos

### 2. Clean Architecture

```go
// ✅ Entities (regras de negócio)
type User struct {
    ID    string
    Name  string
    Email string
}

func (u *User) Validate() error {
    if u.Name == "" {
        return errors.New("name is required")
    }
    if !isValidEmail(u.Email) {
        return errors.New("invalid email")
    }
    return nil
}

// ✅ Use Cases (aplicação)
type UserService struct {
    repo UserRepository
}

func (s *UserService) CreateUser(name, email string) (*User, error) {
    user := &User{
        ID:    generateID(),
        Name:  name,
        Email: email,
    }
    
    if err := user.Validate(); err != nil {
        return nil, err
    }
    
    return user, s.repo.Save(user)
}

// ✅ Interface Adapters (infraestrutura)
type HTTPHandler struct {
    userService *UserService
}

func (h *HTTPHandler) CreateUser(w http.ResponseWriter, r *http.Request) {
    var req CreateUserRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "invalid request", http.StatusBadRequest)
        return
    }
    
    user, err := h.userService.CreateUser(req.Name, req.Email)
    if err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(user)
}
```

**Vantagens:**
- **Independência**: Lógica de negócio não depende de frameworks
- **Testabilidade**: Cada camada é testável independentemente
- **Flexibilidade**: Fácil de trocar implementações
- **Manutenibilidade**: Mudanças isoladas por camada

### 3. Domain-Driven Design (DDD)

**A ideia central**: Modele seu código baseado no domínio de negócio real. Use tipos seguros e coloque a lógica de negócio onde ela pertence.

**Por que funciona em Go:**
- **Type safety**: Go tem tipos fortes que previnem erros
- **Interfaces**: Fácil de definir contratos de domínio
- **Composição**: Fácil de compor comportamentos complexos
- **Simplicidade**: Go força você a ser simples e claro

**Conceitos principais:**
- **Entities**: Objetos com identidade única
- **Value Objects**: Objetos imutáveis sem identidade
- **Aggregates**: Grupos de entidades relacionadas
- **Domain Services**: Lógica que não pertence a uma entidade

**Resultados em produção:**
- **Menos bugs**: Type safety previne erros comuns
- **Código autodocumentado**: Nomes refletem o domínio real
- **Facilita comunicação**: Devs e negócio falam a mesma linguagem
- **Evolução natural**: Código evolui com o domínio

## Comparação: MVC vs Arquiteturas Modernas

### MVC em Go (❌)

```go
// Controller faz tudo
type UserController struct {
    db *sql.DB
}

func (c *UserController) CreateUser(w http.ResponseWriter, r *http.Request) {
    // 1. Parse request
    var req CreateUserRequest
    json.NewDecoder(r.Body).Decode(&req)
    
    // 2. Validação
    if req.Name == "" {
        http.Error(w, "name required", 400)
        return
    }
    
    // 3. Lógica de negócio
    user := &User{
        ID:    generateID(),
        Name:  req.Name,
        Email: req.Email,
    }
    
    // 4. Persistência
    _, err := c.db.Exec("INSERT INTO users...", user.ID, user.Name, user.Email)
    if err != nil {
        http.Error(w, "database error", 500)
        return
    }
    
    // 5. Resposta
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(user)
}
```

**Problemas:**
- **Tudo no controller**: Violação de responsabilidades
- **Difícil de testar**: Muitas dependências
- **Acoplamento**: Controller conhece banco, HTTP, etc.
- **Duplicação**: Lógica espalhada em vários controllers

### Arquitetura Moderna (✅)

```go
// Separação clara de responsabilidades
type CreateUserHandler struct {
    useCase CreateUserUseCase
}

func (h *CreateUserHandler) Handle(w http.ResponseWriter, r *http.Request) {
    var req CreateUserRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "invalid request", http.StatusBadRequest)
        return
    }
    
    user, err := h.useCase.Execute(req.Name, req.Email)
    if err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(user)
}

// Use case isolado e testável
type CreateUserUseCase struct {
    repo UserRepository
}

func (uc *CreateUserUseCase) Execute(name, email string) (*User, error) {
    user, err := NewUser(name, email)
    if err != nil {
        return nil, err
    }
    
    return user, uc.repo.Save(user)
}
```

**Vantagens:**
- **Responsabilidades claras**: Cada classe tem uma responsabilidade
- **Fácil de testar**: Use case pode ser testado isoladamente
- **Baixo acoplamento**: Handler não conhece implementação
- **Reutilização**: Use case pode ser usado em outros contextos

## Trade-offs: Custo vs Benefício

### Custo da Migração
- **Tempo**: 2-4 semanas para migrar um módulo médio
- **Risco**: Possibilidade de introduzir bugs
- **Curva de aprendizado**: Time precisa aprender novos padrões
- **Complexidade inicial**: Mais código para escrever no início

### Benefícios a Longo Prazo
- **Manutenibilidade**: 60% menos tempo para fazer mudanças
- **Testabilidade**: 80% mais cobertura de testes
- **Escalabilidade**: Fácil adicionar novos desenvolvedores
- **Qualidade**: 70% menos bugs em produção

### ROI da Migração
- **Break-even**: 3-6 meses após migração
- **Payback**: 2-3x mais produtividade após 1 ano
- **Redução de custos**: 40% menos tempo em manutenção

## Quando Usar Cada Abordagem

### Use MVC Quando:
- **Protótipos rápidos**: Desenvolvimento rápido (1-2 semanas)
- **APIs simples**: CRUD básico sem lógica complexa
- **Equipe pequena**: 1-2 desenvolvedores experientes
- **Deadline apertado**: Prazo muito curto (< 1 mês)
- **Sistema legado**: Migração seria muito cara

### Use Arquiteturas Modernas Quando:
- **Sistemas complexos**: Lógica de negócio complexa
- **Equipe grande**: 3+ desenvolvedores
- **Longo prazo**: Projeto de 6+ meses
- **Alta qualidade**: Necessidade de alta confiabilidade
- **Múltiplas integrações**: Muitas dependências externas

## Sinais de que Precisa Migrar

### Métricas de Código
- **Controllers com 200+ linhas**: Indica muitas responsabilidades
- **Models com 300+ linhas**: Lógica de negócio misturada
- **Cobertura de testes < 60%**: Difícil de testar
- **Cyclomatic complexity > 10**: Código muito complexo

### Métricas de Processo
- **Tempo de feature > 2 semanas**: Para funcionalidades simples
- **Bugs em produção > 5 por mês**: Por módulo
- **Tempo de onboarding > 2 semanas**: Para novos desenvolvedores
- **Refatorações que quebram**: Funcionalidades não relacionadas

### Sinais de Equipe
- **"Não mexe nisso"**: Desenvolvedores evitam certos módulos
- **"Funciona, mas não sei como"**: Código que ninguém entende
- **Bugs recorrentes**: Mesmos problemas aparecendo
- **Deploy com medo**: Medo de fazer mudanças

## Migração Gradual

### Fase 1: Extrair Use Cases

```go
// Antes: Controller complexo
func (c *UserController) CreateUser(w http.ResponseWriter, r *http.Request) {
    // Toda lógica aqui
}

// Depois: Controller + Use Case
func (c *UserController) CreateUser(w http.ResponseWriter, r *http.Request) {
    user, err := c.createUserUseCase.Execute(name, email)
    // Apenas HTTP handling
}
```

### Fase 2: Introduzir Interfaces

```go
// Antes: Dependência direta
type UserService struct {
    db *sql.DB
}

// Depois: Interface
type UserService struct {
    repo UserRepository
}
```

### Fase 3: Aplicar DDD

```go
// Antes: Struct simples
type User struct {
    ID    int
    Name  string
    Email string
}

// Depois: Rich Domain
type User struct {
    id    UserID
    name  UserName
    email Email
}
```

## Ferramentas e Bibliotecas

### Para Hexagonal Architecture:
- **Wire**: Dependency injection
- **Testify**: Mocking
- **Gomock**: Interface mocking

### Para Clean Architecture:
- **Clean Architecture**: Estrutura de pastas
- **Domain Events**: Eventos de domínio
- **CQRS**: Command Query Responsibility Segregation

### Para DDD:
- **Value Objects**: Tipos seguros
- **Aggregates**: Agregados de domínio
- **Domain Events**: Eventos de domínio

## Conclusão

**MVC não é o problema** - o problema é forçar Go em um padrão que não combina com a linguagem.

**Engenheiros sênior estão migrando para:**
- **Hexagonal Architecture**: Para testabilidade e flexibilidade
- **Clean Architecture**: Para independência de frameworks
- **DDD**: Para domínios ricos e type safety

**Principais benefícios:**
- **Testabilidade**: Fácil de testar cada camada
- **Manutenibilidade**: Mudanças isoladas
- **Flexibilidade**: Troca implementações facilmente
- **Escalabilidade**: Arquitetura que escala com o time

**Dica final:**
Não mude tudo de uma vez. Comece extraindo use cases, depois introduza interfaces, e gradualmente aplique DDD. A migração deve ser incremental e baseada nas necessidades reais do projeto.

A chave é **escolher a arquitetura certa para o problema certo**. MVC pode funcionar para protótipos, mas para sistemas complexos e de longo prazo, arquiteturas modernas são a escolha dos engenheiros sênior.

## Referências

- [Hexagonal Architecture em Go - Playlist Completa](https://www.youtube.com/watch?v=wYyHZL1r7dQ&list=PLm-xZWCprwYTYVMu99HwoqZnf8LhH_9eH&index=1&t=1s) - Playlist completa sobre Hexagonal Architecture em Go
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) - Arquitetura limpa por Robert C. Martin
- [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/) - Arquitetura hexagonal por Alistair Cockburn
- [Domain-Driven Design](https://martinfowler.com/bliki/DomainDrivenDesign.html) - DDD por Eric Evans
- [Go Project Layout](https://github.com/golang-standards/project-layout) - Layout padrão para projetos Go
