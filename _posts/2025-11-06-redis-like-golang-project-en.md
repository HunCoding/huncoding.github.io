---
layout: post
title: "Redis-like KV Store: An Educational Go Project with Clean Architecture"
subtitle: "Presenting an in-memory key-value database implemented from scratch, demonstrating Clean Architecture, Dependency Injection, and concurrency in Go."
date: 2025-11-06 08:00:00 -0000
categories: [Go, Clean Architecture, Database]
tags: [go, clean-architecture, dependency-injection, wire, redis, key-value-store]
comments: true
image: "/assets/img/posts/2025-11-06-redis-like-golang-project.png"
lang: en
---

Hey there!

Implementing systems from scratch is one of the best ways to deeply understand how they work. In this article, I present an educational project: a Redis-like Key-Value Store fully implemented in Go, following Clean Architecture principles and using Dependency Injection with Google Wire.

This project is not just a functional key-value database implementation, but also a practical demonstration of how to apply advanced software architecture concepts, concurrency, and systems design.

![Redis-like KV Store Project Overview](/assets/img/posts/diagram-redis-like-golang.png)

## The Project

The Redis-like KV Store is an in-memory database that implements 11 basic commands inspired by Redis: SET, GET, DEL, EXPIRE, TTL, PERSIST, KEYS, EXISTS, PING, INFO, and QUIT. The project supports TTL with automatic cleanup of expired keys, optional persistence via Append-Only File (AOF), and is completely thread-safe, allowing multiple simultaneous connections.

### Key Features

**11 Implemented Commands**: Basic and advanced operations for data manipulation.

**Thread-Safe**: Uses sync.RWMutex to ensure safe concurrent operations, allowing multiple simultaneous reads and exclusive writes.

**TTL and Automatic Expiration**: Full support for Time To Live with a background goroutine that periodically removes expired keys.

**AOF Persistence**: Optional Append-Only File that saves write commands and allows complete state restoration on restart.

**Simple TCP Protocol**: Plain text communication, one line per command, compatible with standard tools like netcat.

**Clean Architecture**: Code organization in four well-defined layers, ensuring separation of concerns.

**Dependency Injection**: Google Wire for automatic and type-safe dependency management.

## Architecture: Clean Architecture

The project strictly follows Clean Architecture principles, dividing the code into four main layers, each with well-defined responsibilities.

### Layer Structure

```
┌─────────────────────────────────────────┐
│         Adapter Layer                    │
│  TCP Handler + Protocol Parser          │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│         Use Case Layer                   │
│  Command Handler + Stats                 │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│         Domain Layer                     │
│  Interfaces + Entities + Commands        │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│      Infrastructure Layer                │
│  Store (in-memory) + AOF (persistence)  │
└─────────────────────────────────────────┘
```

The fundamental principle is that dependencies always point inward. The Domain layer is completely independent and knows no concrete implementations.

### Domain Layer: The Core

The domain layer defines the contracts and pure entities of the system. This is the innermost layer and has no dependencies on other layers.

**Item Entity**: Represents an item stored in the database, containing the value (string) and expiration time (time.Time). Includes methods to check if it's expired and calculate remaining TTL.

**Repository Interfaces**: Defines contracts for key-value operations (KeyValueRepository) and persistence (PersistenceRepository). These interfaces are implemented by the infrastructure layer.

**Command Enum**: Enum type that unifies and validates all supported commands, including methods to check if it's valid and if it's a write command.

The independence of this layer allows business rules to be tested in isolation, without depending on concrete implementations.

### Use Case Layer: Business Logic

The use case layer contains all the business logic of the system.

**CommandHandler**: Receives parsed commands from the adapter, validates arguments, executes operations through repositories, and persists write commands when AOF is enabled. Each command has its own specific handler (handleSet, handleGet, handleDel, etc.).

**Stats**: Collects and formats server statistics, including uptime, total commands processed, connections received, and keyspace size. Formats output in Redis style for the INFO command.

This layer orchestrates operations but doesn't know implementation details. It works only with interfaces defined in the Domain.

### Infrastructure Layer: Concrete Implementations

The infrastructure layer provides concrete implementations of interfaces defined in the Domain.

**Store**: In-memory implementation of KeyValueRepository using a map[string]*Item. Ensures thread-safety through sync.RWMutex, allowing multiple simultaneous reads (RLock) and exclusive writes (Lock). Includes a background goroutine that periodically removes expired keys.

**AOF**: Implementation of PersistenceRepository that saves write commands in a text file. Each command is written on a separate line, and the file is synchronized after each append to ensure durability. On initialization, the server executes a complete replay of the file to restore state.

The separation between interfaces and implementations allows easy swapping of implementations without affecting other layers.

### Adapter Layer: I/O Interfaces

The adapter layer manages the system's input and output interfaces.

**TCPHandler**: Manages TCP connections, creating a separate goroutine for each connection. Reads commands from the client, parses them through the Parser, executes via CommandHandler, and returns the formatted response.

**Parser**: Parses the plain text protocol, converting strings into typed Command structures. Also formats responses (OK, values, errors) according to the protocol.

This layer isolates the system from the communication protocol, allowing future support for other protocols (HTTP, gRPC) without affecting business logic.

## Dependency Injection with Google Wire

The project uses Google Wire for automatic dependency management. Wire is a code generation tool that creates type-safe code at compile time.

### How It Works

Wire analyzes files marked with `//go:build wireinject` and generates code that automatically resolves all dependencies. The developer defines only the providers (constructor functions) and Wire generates the code that creates and injects all instances in the correct order.

**Dependency Graph**:
```
Container
├── Store (KeyValueRepository)
├── Persistence (PersistenceRepository) [optional]
├── Parser (*Parser)
├── Stats (*Stats)
│   └── Store (KeyValueRepository)
├── CommandHandler (*CommandHandler)
│   ├── Store (KeyValueRepository)
│   ├── Persistence (PersistenceRepository)
│   ├── Stats (*Stats)
│   └── Parser (*Parser)
└── TCPHandler (*TCPHandler)
    ├── CommandHandler (*CommandHandler)
    └── Parser (*Parser)
```

Wire automatically resolves this graph, ensuring all dependencies are created in the correct order and injected into the appropriate constructors.

### Benefits

**Type-Safe**: Dependency errors are detected at compile time, not at runtime.

**Generated Code**: The generated code is optimized and adds no runtime overhead.

**Maintainability**: Adding new dependencies is simple - just add the provider and Wire resolves the rest.

**Testability**: Facilitates the creation of mocks and isolated tests.

## Thread Safety and Concurrency

One of the main challenges of in-memory systems is ensuring thread-safety when multiple connections access data simultaneously.

### Mechanisms Used

**sync.RWMutex**: The Store uses an RWMutex that allows multiple simultaneous reads through RLock() and ensures exclusivity for writes through Lock(). This optimizes performance in scenarios with many reads and few writes.

**Goroutines**: Each TCP connection runs in a separate goroutine, allowing the server to handle multiple clients simultaneously without blocking.

**Atomic Counters**: Statistics use atomic.AddInt64 and atomic.LoadInt64 to increment and read counters in a thread-safe manner, without needing locks.

**Background Cleanup**: An isolated goroutine runs periodically (configurable, default 1 second) to remove expired keys. This goroutine uses appropriate locks to ensure it doesn't interfere with normal operations.

### Thread-Safe Operations

- **Reads** (Get, Keys, Exists, TTL): Use RLock, allowing concurrency between multiple reads.
- **Writes** (Set, Del, Expire, Persist): Use Lock, ensuring exclusivity.
- **Background Cleanup**: Executes in an isolated goroutine with appropriate locks.

The result is a system that can safely handle multiple clients simultaneously, with optimizations for high-read scenarios.

## Persistence: Append-Only File (AOF)

The project implements optional persistence through Append-Only File, similar to Redis.

### How It Works

**During Execution**: When enabled, all write commands (SET, DEL, EXPIRE, PERSIST) are saved to the `data.aof` file, one line per command. After each append, the file is synchronized (sync) to ensure data is written to disk.

**On Initialization**: When the server starts with AOF enabled, it reads the file sequentially, parses each command, and executes it in the store. This restores the complete state before accepting new connections.

**Persisted Commands**: Only write commands are saved. Read commands (GET, KEYS, EXISTS, TTL, PING, INFO) are not persisted, as they don't alter state.

### AOF File Example

```
SET user:1 John
EXPIRE user:1 60
SET user:2 Jane
DEL user:2
PERSIST user:1
```

This simple format allows complete replay and is easy to debug and inspect manually.

## Communication Protocol

The protocol is intentionally simple: plain text, one line per command.

### Command Format

```
COMMAND arg1 arg2 arg3\n
```

### Response Format

- **Success**: `OK\n`
- **Value**: `value\n`
- **Not found**: `nil\n`
- **Error**: `ERR message\n`
- **Number**: `123\n`

### Usage Examples

```bash
# SET
echo "SET user:1 John" | nc localhost 6379
# → OK

# GET
echo "GET user:1" | nc localhost 6379
# → John

# KEYS with wildcard
echo "KEYS user:*" | nc localhost 6379
# → user:1 user:2

# INFO (multi-line)
echo "INFO" | nc localhost 6379
# → # Server
# → redis_version:redis-like-go/1.0.0
# → ...
```

The simplicity of the protocol allows easy interaction with standard tools and facilitates debugging.

## Implemented Commands

The project implements 11 commands, divided into basic and advanced.

### Basic Commands

**SET**: Creates or updates a key. Removes TTL if the key already had expiration. Persists in AOF.

**GET**: Retrieves a key's value. Returns "nil" if the key doesn't exist or has expired.

**DEL**: Removes one or multiple keys. Returns the number of keys removed. Persists in AOF.

**EXPIRE**: Sets TTL in seconds for an existing key. Returns OK on success, 0 if the key doesn't exist. Persists in AOF.

**TTL**: Returns remaining seconds until expiration. Returns -1 if no TTL, -2 if it doesn't exist.

**PERSIST**: Removes TTL from a key, making it persistent. Returns OK on success, 0 otherwise. Persists in AOF.

### Advanced Commands

**KEYS**: Lists all keys that match a pattern. Supports wildcards `*` (any string) and `?` (any character). Uses filepath.Match for pattern matching.

**EXISTS**: Checks if one or multiple keys exist. Returns the number of existing keys.

**PING**: Health check. Returns "PONG" if no arguments, or the custom message if provided.

**INFO**: Returns server statistics in Redis-style format, including version, uptime, processed commands, connections, and keyspace size.

**QUIT**: Closes the current TCP connection.

## Architecture Benefits

Choosing Clean Architecture brings several practical benefits.

### Separation of Concerns

Each layer has a clear and well-defined responsibility. Domain defines contracts, Use Case implements logic, Infrastructure provides implementations, and Adapter manages I/O. This makes the code easier to understand and maintain.

### Testability

Interfaces facilitate the creation of mocks and isolated tests. Each layer can be tested independently, without depending on concrete implementations. This results in faster and more reliable tests.

### Maintainability

Changes in one layer don't affect other layers. For example, switching the protocol from TCP to HTTP requires changes only in the Adapter Layer, without touching business logic.

### Flexibility

The architecture allows easy swapping of implementations. For example, replacing AOF with RDB (snapshots) requires only creating a new PersistenceRepository implementation, without affecting other parts of the system.

### Dependency Injection

Google Wire automatically resolves dependencies, keeping code clean and facilitating tests. The generated code is type-safe and optimized.

## Use Cases and Applications

This project serves as a foundation for understanding various important concepts.

### Architecture Learning

Demonstrates how to apply Clean Architecture in a real project, showing separation of concerns and dependency flow.

### Concurrency in Go

Exemplifies the use of goroutines, mutexes, and atomic operations to build thread-safe systems.

### Protocol Design

Shows how to design and implement simple and efficient communication protocols.

### Data Persistence

Demonstrates different persistence strategies (AOF) and how to implement command replay.

### Dependency Injection

Illustrates the use of modern DI tools like Google Wire in Go projects.

## Project Structure

The project is organized following Go conventions and Clean Architecture principles:

```
redis-like-go/
├── cmd/
│   ├── server/          # Server entry point
│   └── client/          # CLI client
├── internal/
│   ├── domain/          # Interfaces and entities
│   ├── usecase/         # Business logic
│   ├── infrastructure/  # Implementations
│   ├── adapter/         # I/O
│   └── container/       # Dependency Injection
├── Dockerfile
├── docker-compose.yml
└── go.mod
```

This organization facilitates navigation, maintenance, and testing.

## Testing and Quality

The project includes unit and integration tests covering:

- Basic store operations (Set, Get, Del)
- TTL operations (Expire, TTL, Persist)
- Advanced commands (Keys, Exists)
- Thread-safety in concurrent scenarios
- AOF replay on initialization
- Protocol parsing

The tests ensure the system works correctly in various scenarios and that future changes don't break existing functionality.

## Docker and Deployment

The project includes a multi-stage Dockerfile and docker-compose.yml to facilitate build and execution:

- Optimized build in separate stages
- Minimalist final image (Alpine)
- Volume support for AOF persistence
- Configuration via docker-compose

This allows easy deployment in any environment that supports Docker.

## Future Improvements and Extensions

The current project serves as a solid foundation for various extensions:

**Data Types**: Add support for lists, hashes, sets, and sorted sets.

**Additional Commands**: Implement INCR, DECR, LPUSH, RPUSH, HSET, HGET, and others.

**Advanced Features**: Multi-key transactions, command pipeline, pub/sub.

**Infrastructure**: Primary-secondary replication, clustering, sharding.

**Persistence**: RDB snapshots in addition to AOF, compression, checkpointing.

**Security**: Authentication, authorization (ACL), encryption/TLS.

**Monitoring**: Advanced metrics, Prometheus integration, dashboards.

The current architecture facilitates adding these features without major refactoring.

## Conclusion

The Redis-like KV Store is a complete educational project that demonstrates the practical application of advanced software architecture, concurrency, and systems design concepts. Through implementing a key-value database from scratch, the project illustrates:

- How to apply Clean Architecture in real projects
- Concurrency and thread-safety techniques in Go
- Communication protocol design and implementation
- Data persistence strategies
- Using Dependency Injection with Google Wire

This project serves as an excellent starting point for understanding how storage systems work internally and how to apply clean architecture principles in Go projects. The modular and well-organized structure facilitates future extensions and serves as a reference for other projects.

For developers interested in deepening their knowledge in software architecture, concurrency, and systems design, this project offers a solid and practical foundation for exploration and learning.

