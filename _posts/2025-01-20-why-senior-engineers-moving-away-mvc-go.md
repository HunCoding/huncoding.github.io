---
layout: post
title: "Why Senior Engineers Are Moving Away from MVC in Go"
subtitle: "Learning why the MVC pattern doesn't scale well in Go and which modern architectures are replacing it for cleaner, more testable, and maintainable systems."
author: otavio_celestino
date: 2025-01-20 08:01:00 -0300
categories: [Go, Architecture, Clean Code, Microservices, Design Patterns]
tags: [go, mvc, hexagonal-architecture, clean-architecture, microservices, design-patterns, architecture]
comments: true
image: "/assets/img/posts/mvc-go-problemas-arquitetura-moderna.png"
lang: en
original_post: "/mvc-go-problemas-arquitetura-moderna/"
---

Hey everyone!

Today I'm going to show you why **senior engineers are abandoning the MVC pattern** in Go and migrating to more modern architectures. If you're still forcing Go into a pattern that doesn't match the language, this post is for you!

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

{% include embed/youtube.html id="wYyHZL1r7dQ" %}

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
