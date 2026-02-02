---
layout: post
title: "Go and gRPC: How to Create and Use gRPC APIs from Scratch"
subtitle: "Practical guide to get started with gRPC in Go: from Protocol Buffers to working APIs"
date: 2026-01-21 08:00:00 -0300
categories: [Go, gRPC, Microservices, APIs]
tags: [go, grpc, microservices, api, protocol-buffers, tutorial]
comments: true
image: "/assets/img/posts/2026-02-02-go-grpc-boas-praticas-producao.png"
lang: en
original_post: "/go-grpc-boas-praticas-producao/"
---

Hey everyone!

gRPC is one of the most powerful technologies for building modern APIs. Excellent performance. Strong typing. Native streaming. Used by Google, Netflix, Uber, and other giants.

But where to start? How to create a gRPC API from scratch in Go?

This post is a practical guide to get you started with gRPC. From Protocol Buffers to working APIs in production.

## What you'll find here

This guide covers everything you need to get started with gRPC in Go:

1. **What is gRPC and why use it**: fundamental concepts
2. **Protocol Buffers**: defining your API
3. **Creating a gRPC server**: implementation in Go
4. **Creating a gRPC client**: consuming the API
5. **Streaming**: real-time communication
6. **Errors and status codes**: error handling

Each section has practical examples and concepts you need to understand.

## 1. What is gRPC and why use it

### What is gRPC

gRPC (gRPC Remote Procedure Calls) is a framework for service-to-service communication. Unlike REST, gRPC uses:

- **Protocol Buffers** for serialization (more efficient than JSON)
- **HTTP/2** for transport (multiplexing, streaming)
- **Strong typing** (defined contracts)
- **Automatic code generation**

### Why use gRPC

**Performance**: Protocol Buffers is faster and smaller than JSON
- Fewer bytes transferred
- Faster serialization/deserialization
- Ideal for high-traffic microservices

**Strong typing**: Well-defined contracts
- Compile-time errors
- Automatic documentation
- Controlled versioning

**Native streaming**: Bidirectional communication
- Real-time chat
- Push notifications
- Stream processing

**Multi-language**: Same contract, multiple languages
- Go, Python, Java, Node.js, etc.
- Single contract (`.proto`)

### When to use gRPC

✅ **Use when:**
- Communication between internal microservices
- Performance is critical
- Need streaming
- Control both sides (client and server)

❌ **Don't use when:**
- Public APIs for browsers (don't natively support gRPC)
- Integration with legacy systems
- Simple APIs that REST solves

## 2. Protocol Buffers: defining your API

### What are Protocol Buffers

Protocol Buffers (protobuf) is a language for defining API contracts. You write a `.proto` file that defines:

- Messages (data structures)
- Services (methods/endpoints)
- Types and fields

### Basic example

Let's create a simple user API:

```protobuf
syntax = "proto3";

package user;

option go_package = "github.com/your-username/proto/user";

// Request message
message GetUserRequest {
  string user_id = 1;
}

// Response message
message User {
  string id = 1;
  string name = 2;
  string email = 3;
}

// Service (API)
service UserService {
  rpc GetUser(GetUserRequest) returns (User);
}
```

### Important concepts

**syntax = "proto3"**: Protocol Buffers version (proto3 is the latest)

**package**: Namespace to avoid conflicts

**message**: Data structure (like structs in Go)

**service**: API interface (like methods)

**rpc**: Remote method (like REST endpoints)

**Field numbers**: Each field has a unique number (1, 2, 3...). Never change existing field numbers!

### Installing tools

To generate Go code from `.proto`:

```bash
# Install protoc (compiler)
# Linux/Mac
brew install protobuf  # or apt-get install protobuf-compiler

# Install Go plugin
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
```

### Generating Go code

With the `.proto` ready, generate the code:

```bash
protoc --go_out=. --go-grpc_out=. user.proto
```

This generates:
- `user.pb.go`: message code
- `user_grpc.pb.go`: server and client code

## 3. Creating a gRPC server

### Basic structure

A gRPC server in Go needs:

1. Implement the generated interface
2. Create the gRPC server
3. Register the service
4. Listen on a port

### Implementation

```go
package main

import (
    "context"
    "log"
    "net"

    "google.golang.org/grpc"
    pb "github.com/your-username/proto/user"
)

// Server that implements UserService
type server struct {
    pb.UnimplementedUserServiceServer
}

// Implements GetUser method
func (s *server) GetUser(ctx context.Context, req *pb.GetUserRequest) (*pb.User, error) {
    // Here you fetch the user (DB, cache, etc)
    user := &pb.User{
        Id:    req.UserId,
        Name:  "John Doe",
        Email: "john@example.com",
    }
    
    return user, nil
}

func main() {
    // Create listener on port 50051
    lis, err := net.Listen("tcp", ":50051")
    if err != nil {
        log.Fatalf("failed to listen: %v", err)
    }

    // Create gRPC server
    s := grpc.NewServer()

    // Register the service
    pb.RegisterUserServiceServer(s, &server{})

    log.Println("Server running on port 50051")
    
    // Start the server
    if err := s.Serve(lis); err != nil {
        log.Fatalf("failed to serve: %v", err)
    }
}
```

### Important concepts

**UnimplementedUserServiceServer**: Always include this for future compatibility

**Context**: Always receive `context.Context` as first parameter

**Errors**: Return `status.Error` for appropriate gRPC errors

## 4. Creating a gRPC client

### Connecting to the server

```go
package main

import (
    "context"
    "log"
    "time"

    "google.golang.org/grpc"
    "google.golang.org/grpc/credentials/insecure"
    pb "github.com/your-username/proto/user"
)

func main() {
    // Connect to server
    conn, err := grpc.Dial("localhost:50051", grpc.WithTransportCredentials(insecure.NewCredentials()))
    if err != nil {
        log.Fatalf("failed to connect: %v", err)
    }
    defer conn.Close()

    // Create client
    client := pb.NewUserServiceClient(conn)

    // Create context with timeout
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()

    // Call the method
    user, err := client.GetUser(ctx, &pb.GetUserRequest{
        UserId: "123",
    })
    
    if err != nil {
        log.Fatalf("error fetching user: %v", err)
    }

    log.Printf("User: %+v", user)
}
```

### Important concepts

**grpc.Dial**: Creates connection to server

**NewUserServiceClient**: Automatically generated client

**Context with timeout**: Always use timeout to avoid hangs

**insecure.NewCredentials**: For development. In production, use TLS!

## 5. Streaming: real-time communication

### Types of streaming

gRPC supports three types of streaming:

**Server Streaming**: Server sends multiple responses
```protobuf
rpc ListUsers(ListUsersRequest) returns (stream User);
```

**Client Streaming**: Client sends multiple requests
```protobuf
rpc CreateUsers(stream User) returns (CreateUsersResponse);
```

**Bidirectional Streaming**: Bidirectional communication
```protobuf
rpc Chat(stream Message) returns (stream Message);
```

### Example: Server Streaming

**Protocol Buffers:**
```protobuf
service UserService {
  rpc ListUsers(ListUsersRequest) returns (stream User);
}
```

**Server:**
```go
func (s *server) ListUsers(req *pb.ListUsersRequest, stream pb.UserService_ListUsersServer) error {
    users := []*pb.User{
        {Id: "1", Name: "John", Email: "john@example.com"},
        {Id: "2", Name: "Jane", Email: "jane@example.com"},
    }
    
    for _, user := range users {
        if err := stream.Send(user); err != nil {
            return err
        }
    }
    
    return nil
}
```

**Client:**
```go
stream, err := client.ListUsers(ctx, &pb.ListUsersRequest{})
if err != nil {
    log.Fatalf("error: %v", err)
}

for {
    user, err := stream.Recv()
    if err == io.EOF {
        break
    }
    if err != nil {
        log.Fatalf("error: %v", err)
    }
    log.Printf("User: %+v", user)
}
```

### When to use streaming

- **Real-time notifications**: Server streaming
- **Large file uploads**: Client streaming
- **Chat/messages**: Bidirectional streaming
- **Large data processing**: Server streaming

## 6. Errors and status codes

### gRPC status codes

gRPC uses specific status codes:

- `OK`: Success
- `INVALID_ARGUMENT`: Invalid parameters
- `NOT_FOUND`: Resource not found
- `ALREADY_EXISTS`: Resource already exists
- `PERMISSION_DENIED`: No permission
- `UNAUTHENTICATED`: Not authenticated
- `RESOURCE_EXHAUSTED`: Rate limit
- `INTERNAL`: Internal error
- `UNAVAILABLE`: Service unavailable
- `DEADLINE_EXCEEDED`: Timeout

### Returning errors

```go
import "google.golang.org/grpc/status"
import "google.golang.org/grpc/codes"

func (s *server) GetUser(ctx context.Context, req *pb.GetUserRequest) (*pb.User, error) {
    if req.UserId == "" {
        return nil, status.Error(codes.InvalidArgument, "user_id is required")
    }
    
    user, err := s.db.GetUser(req.UserId)
    if err == ErrNotFound {
        return nil, status.Error(codes.NotFound, "user not found")
    }
    if err != nil {
        return nil, status.Error(codes.Internal, "error fetching user")
    }
    
    return user, nil
}
```

### Checking errors on client

```go
user, err := client.GetUser(ctx, &pb.GetUserRequest{UserId: "123"})
if err != nil {
    st := status.Convert(err)
    switch st.Code() {
    case codes.NotFound:
        log.Println("User not found")
    case codes.InvalidArgument:
        log.Println("Invalid parameter")
    default:
        log.Printf("Error: %v", err)
    }
    return
}
```

## Conclusion

gRPC is a powerful technology for building modern APIs. With Go, you have everything you need to get started.

The process is simple:
1. Define your contract in `.proto`
2. Generate Go code
3. Implement the server
4. Create clients

Start simple. Add complexity as needed. And always test in production carefully.

It's worth the effort.

## References and sources

### Official documentation

- **[gRPC Documentation](https://grpc.io/docs/)** - Complete documentation
- **[Protocol Buffers](https://protobuf.dev/)** - Protocol Buffers guide
- **[gRPC Go Examples](https://github.com/grpc/grpc-go/tree/master/examples)** - Official examples

### Articles and guides

- **[gRPC vs REST](https://www.baeldung.com/grpc-vs-rest)** - Detailed comparison
- **[gRPC Best Practices](https://grpc.io/docs/guides/best-practices/)** - Official best practices

### Tools

- **[buf](https://buf.build/)** - Modern tool for Protocol Buffers
- **[grpc-gateway](https://github.com/grpc-ecosystem/grpc-gateway)** - REST gateway for gRPC
- **[protoc-gen-validate](https://github.com/bufbuild/protoc-gen-validate)** - Message validation
