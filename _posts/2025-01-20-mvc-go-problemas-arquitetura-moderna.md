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
translations:
  title_en: "Why Senior Engineers Are Moving Away from MVC in Go"
  subtitle_en: "Learning why the MVC pattern doesn't scale well in Go and which modern architectures are replacing it for cleaner, more testable, and maintainable systems."
  content_en: |
    Hey everyone!

    Today I'm going to show you why **senior engineers are abandoning the MVC pattern** in Go and migrating to more modern architectures. If you're still forcing Go into a pattern that doesn't match the language, this post is for you!

    If you don't know the fundamentals of Go yet, check out the [YouTube video](https://youtu.be/Ao18pl4SAao) I recorded about Go!

    ## The Problem: MVC Wasn't Made for Go

    **MVC (Model-View-Controller)** was born in frameworks like Rails and Spring, when the world was different:

    - **Monoliths** were the norm
    - **Server-side rendering** dominated
    - **Complex controllers** controlled everything
    - **Models** did everything (data + behavior)

    But Go is **different**. Go is not a framework-oriented language. Go is about **simplicity, composition, and interfaces**.

    ## Why MVC Fails in Go?

    ### 1. Go Doesn't Have Native "Controllers"

    **The fundamental problem**: Go wasn't designed for the traditional MVC pattern. When you try to force MVC into Go, you end up creating controllers that do everything:

    - **Data validation**
    - **Business logic** 
    - **Data persistence**
    - **Response serialization**

    **Why this is problematic:**
    - **Complex controllers**: Violate the single responsibility principle
    - **Tight coupling**: Strong coupling between layers
    - **Hard to test**: Too many dependencies and responsibilities
    - **Responsibility violation**: Controller does work that should be Service/Repository

    **In production, this results in:**
    - Bugs that are hard to track
    - Code that no one wants to touch
    - Tests that break with any change
    - Refactoring that becomes nightmares

    ### 2. Models in Go Are Different

    **The problem**: In frameworks like Rails/Spring, models do everything - validation, persistence, business logic, even sending emails. In Go, this becomes a nightmare.

    **Why it doesn't work:**
    - **SRP violation**: Model overloaded with too many responsibilities
    - **Hard to test**: How do you test a model that does 5 different things?
    - **Coupling**: Model knows about database, email, validation, etc.
    - **Reusability**: How do you reuse logic that's mixed in the model?

    **In real systems, this causes:**
    - Models with 500+ lines of code
    - Tests that need to mock 10 dependencies
    - Changes that break unrelated functionality
    - Code that no one fully understands

    ### 3. Views Don't Exist in APIs

    **The problem**: MVC was created for web applications with server-side rendering. In REST/GraphQL APIs, the concept of "View" doesn't make sense.

    **Why it's problematic:**
    - **Unnecessary**: APIs return JSON, not HTML
    - **Extra complexity**: Layer that adds no value
    - **Confusion**: Mixes traditional web concepts with modern API
    - **Overhead**: Extra code for something the framework already does

    **In modern APIs:**
    - Serialization is done automatically by the framework
    - Presentation logic is the client's responsibility
    - "Views" become just unnecessary wrappers

    ## Real Scenarios: When MVC Breaks

    ### E-commerce System
    **Problem**: Order controller with 800 lines
    - Product validation
    - Tax calculation
    - Payment gateway integration
    - Email sending
    - Inventory updates

    **Result**: 6 months to add a new payment method

    ### Microservices API
    **Problem**: 15 microservices, all with MVC
    - Each controller does 5-10 different things
    - Tests that take 2 hours to run
    - Bugs that appear in unrelated services

    **Result**: Team of 8 people, 80% of time in maintenance

    ### Financial System
    **Problem**: Transaction model with 20 responsibilities
    - Business rule validation
    - Complex calculations
    - Persistence in multiple databases
    - Auditing and logs

    **Result**: 3 months to implement a new compliance rule

    ## What Senior Engineers Are Doing

    ### 1. Hexagonal Architecture (Ports & Adapters)

    If you want to learn Hexagonal Architecture in depth, I recorded a [YouTube video](https://youtu.be/wYyHZL1r7dQ) about the topic:

    **The central idea**: Put your business logic in the center and connect everything through interfaces (ports). Implementations (adapters) stay on the periphery.

    **Why it works in Go:**
    - **Implicit interfaces**: Go doesn't need to declare that it implements an interface
    - **Composition**: Easy to compose behaviors
    - **Testability**: Interfaces are easy to mock
    - **Flexibility**: Swap implementations without breaking code

    **Typical structure:**
    - **Domain**: Entities and business rules
    - **Ports**: Interfaces that define contracts
    - **Adapters**: Specific implementations (database, HTTP, etc.)
    - **Use Cases**: Business logic orchestration

    **Results in production:**
    - **90% fewer bugs** in infrastructure changes
    - **3x faster** to add new features
    - **Tests that run in seconds** instead of minutes
    - **Code that any dev understands** in 5 minutes

    ### 2. Clean Architecture

    **The central idea**: Organize your code in layers, with business logic independent of frameworks and external concerns.

    **Why it works in Go:**
    - **Framework independence**: Business logic doesn't depend on frameworks
    - **Testability**: Each layer is independently testable
    - **Flexibility**: Easy to swap implementations
    - **Maintainability**: Changes isolated by layer

    **Typical layers:**
    - **Entities**: Business rules and core logic
    - **Use Cases**: Application-specific business rules
    - **Interface Adapters**: Controllers, presenters, gateways
    - **Frameworks & Drivers**: Database, web framework, etc.

    **Results in production:**
    - **Framework changes** don't affect business logic
    - **Easy testing** of each layer independently
    - **Simple to add** new interfaces and adapters
    - **Maintainable code** that evolves with requirements

    ### 3. Domain-Driven Design (DDD)

    **The central idea**: Model your code based on the real business domain. Use type-safe constructs and put business logic where it belongs.

    **Why it works in Go:**
    - **Type safety**: Go has strong types that prevent errors
    - **Interfaces**: Easy to define domain contracts
    - **Composition**: Easy to compose complex behaviors
    - **Simplicity**: Go forces you to be simple and clear

    **Main concepts:**
    - **Entities**: Objects with unique identity
    - **Value Objects**: Immutable objects without identity
    - **Aggregates**: Groups of related entities
    - **Domain Services**: Logic that doesn't belong to an entity

    **Results in production:**
    - **Fewer bugs**: Type safety prevents common errors
    - **Self-documenting code**: Names reflect the real domain
    - **Facilitates communication**: Devs and business speak the same language
    - **Natural evolution**: Code evolves with the domain

    ## Comparison: MVC vs Modern Architectures

    ### MVC in Go (❌)

    **Problems:**
    - **Everything in controller**: Violation of responsibilities
    - **Hard to test**: Too many dependencies
    - **Coupling**: Controller knows about database, HTTP, etc.
    - **Duplication**: Logic scattered across multiple controllers

    ### Modern Architecture (✅)

    **Advantages:**
    - **Clear responsibilities**: Each class has one responsibility
    - **Easy to test**: Use case can be tested in isolation
    - **Low coupling**: Handler doesn't know implementation
    - **Reusability**: Use case can be used in other contexts

    ## Trade-offs: Cost vs Benefit

    ### Migration Cost
    - **Time**: 2-4 weeks to migrate a medium module
    - **Risk**: Possibility of introducing bugs
    - **Learning curve**: Team needs to learn new patterns
    - **Initial complexity**: More code to write initially

    ### Long-term Benefits
    - **Maintainability**: 60% less time to make changes
    - **Testability**: 80% more test coverage
    - **Scalability**: Easy to add new developers
    - **Quality**: 70% fewer bugs in production

    ### Migration ROI
    - **Break-even**: 3-6 months after migration
    - **Payback**: 2-3x more productivity after 1 year
    - **Cost reduction**: 40% less time in maintenance

    ## When to Use Each Approach

    ### Use MVC When:
    - **Quick prototypes**: Fast development (1-2 weeks)
    - **Simple APIs**: Basic CRUD without complex logic
    - **Small team**: 1-2 experienced developers
    - **Tight deadline**: Very short timeline (< 1 month)
    - **Legacy system**: Migration would be too expensive

    ### Use Modern Architectures When:
    - **Complex systems**: Complex business logic
    - **Large team**: 3+ developers
    - **Long term**: 6+ month project
    - **High quality**: Need for high reliability
    - **Multiple integrations**: Many external dependencies

    ## Signs You Need to Migrate

    ### Code Metrics
    - **Controllers with 200+ lines**: Indicates too many responsibilities
    - **Models with 300+ lines**: Business logic mixed in
    - **Test coverage < 60%**: Hard to test
    - **Cyclomatic complexity > 10**: Code too complex

    ### Process Metrics
    - **Feature time > 2 weeks**: For simple functionalities
    - **Production bugs > 5 per month**: Per module
    - **Onboarding time > 2 weeks**: For new developers
    - **Refactoring breaks**: Unrelated functionality

    ### Team Signs
    - **"Don't touch that"**: Developers avoid certain modules
    - **"It works, but I don't know how"**: Code no one understands
    - **Recurring bugs**: Same problems appearing
    - **Deploy with fear**: Fear of making changes

    ## Gradual Migration

    ### Phase 1: Extract Use Cases

    **Before**: Complex controller
    **After**: Controller + Use Case

    ### Phase 2: Introduce Interfaces

    **Before**: Direct dependency
    **After**: Interface

    ### Phase 3: Apply DDD

    **Before**: Simple struct
    **After**: Rich domain

    ## Tools and Libraries

    ### For Hexagonal Architecture:
    - **Wire**: Dependency injection
    - **Testify**: Mocking
    - **Gomock**: Interface mocking

    ### For Clean Architecture:
    - **Clean Architecture**: Folder structure
    - **Domain Events**: Domain events
    - **CQRS**: Command Query Responsibility Segregation

    ### For DDD:
    - **Value Objects**: Type-safe constructs
    - **Aggregates**: Domain aggregates
    - **Domain Events**: Domain events

    ## Conclusion

    **MVC is not the problem** - the problem is forcing Go into a pattern that doesn't match the language.

    **Senior engineers are migrating to:**
    - **Hexagonal Architecture**: For testability and flexibility
    - **Clean Architecture**: For framework independence
    - **DDD**: For rich domains and type safety

    **Main benefits:**
    - **Testability**: Easy to test each layer
    - **Maintainability**: Isolated changes
    - **Flexibility**: Easy to swap implementations
    - **Scalability**: Architecture that scales with the team

    **Final tip:**
    Don't change everything at once. Start by extracting use cases, then introduce interfaces, and gradually apply DDD. Migration should be incremental and based on real project needs.

    The key is **choosing the right architecture for the right problem**. MVC can work for prototypes, but for complex, long-term systems, modern architectures are the choice of senior engineers.

    ## References

    - [Hexagonal Architecture in Go - Complete Playlist](https://www.youtube.com/watch?v=wYyHZL1r7dQ&list=PLm-xZWCprwYTYVMu99HwoqZnf8LhH_9eH&index=1&t=1s) - Complete playlist about Hexagonal Architecture in Go
    - [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) - Clean architecture by Robert C. Martin
    - [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/) - Hexagonal architecture by Alistair Cockburn
    - [Domain-Driven Design](https://martinfowler.com/bliki/DomainDrivenDesign.html) - DDD by Eric Evans
    - [Go Project Layout](https://github.com/golang-standards/project-layout) - Standard layout for Go projects
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
