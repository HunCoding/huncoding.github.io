---
layout: post
title: "Go e gRPC: como criar e usar APIs gRPC do zero"
subtitle: "Guia prático para começar com gRPC em Go: do Protocol Buffers até APIs funcionando"
date: 2026-01-21 08:00:00 -0300
categories: [Go, gRPC, Microserviços, APIs]
tags: [go, grpc, microservices, api, protocol-buffers, tutorial]
comments: true
image: "/assets/img/posts/2026-02-02-go-grpc-boas-praticas-producao.png"
lang: pt-BR
---

E aí, pessoal!

gRPC é uma das tecnologias mais poderosas para construir APIs modernas. Performance excelente. Tipagem forte. Streaming nativo. Usado por Google, Netflix, Uber e outras gigantes.

Mas por onde começar? Como criar uma API gRPC do zero em Go?

Este post é um guia prático para você começar com gRPC. Do Protocol Buffers até APIs funcionando em produção.

**Quer aprender ainda mais?** No meu canal do YouTube tem uma playlist completa ensinando tudo sobre gRPC:

{% include embed/youtube.html id="p3rdu5HBxxE" %}

## O que você vai encontrar aqui

Este guia cobre tudo que você precisa para começar com gRPC em Go:

1. **O que é gRPC e por que usar**: conceitos fundamentais
2. **Protocol Buffers**: definindo sua API
3. **Criando um servidor gRPC**: implementação em Go
4. **Criando um cliente gRPC**: consumindo a API
5. **Streaming**: comunicação em tempo real
6. **Erros e status codes**: tratamento de erros

Cada seção tem exemplos práticos e conceitos que você precisa entender.

## 1. O que é gRPC e por que usar

### O que é gRPC

gRPC (gRPC Remote Procedure Calls) é um framework para comunicação entre serviços. Diferente de REST, gRPC usa:

- **Protocol Buffers** para serialização (mais eficiente que JSON)
- **HTTP/2** para transporte (multiplexing, streaming)
- **Tipagem forte** (contratos definidos)
- **Geração de código** automática

### Por que usar gRPC

**Performance**: Protocol Buffers é mais rápido e menor que JSON
- Menos bytes trafegados
- Serialização/deserialização mais rápida
- Ideal para microserviços com alto tráfego

**Tipagem forte**: Contratos bem definidos
- Erros em tempo de compilação
- Documentação automática
- Versionamento controlado

**Streaming nativo**: Comunicação bidirecional
- Chat em tempo real
- Notificações push
- Processamento de streams

**Multi-linguagem**: Mesmo contrato, múltiplas linguagens
- Go, Python, Java, Node.js, etc.
- Contrato único (`.proto`)

### Quando usar gRPC

✅ **Use quando:**
- Comunicação entre microserviços internos
- Performance é crítica
- Precisa de streaming
- Controle ambos os lados (cliente e servidor)

❌ **Não use quando:**
- APIs públicas para browsers (não suportam gRPC nativamente)
- Integração com sistemas legados
- APIs simples que REST resolve

## 2. Protocol Buffers: definindo sua API

### O que são Protocol Buffers

Protocol Buffers (protobuf) é uma linguagem para definir contratos de API. Você escreve um arquivo `.proto` que define:

- Mensagens (estruturas de dados)
- Serviços (métodos/endpoints)
- Tipos e campos

### Exemplo básico

Vamos criar uma API simples de usuários:

```protobuf
syntax = "proto3";

package user;

option go_package = "github.com/seu-usuario/proto/user";

// Mensagem de requisição
message GetUserRequest {
  string user_id = 1;
}

// Mensagem de resposta
message User {
  string id = 1;
  string name = 2;
  string email = 3;
}

// Serviço (API)
service UserService {
  rpc GetUser(GetUserRequest) returns (User);
}
```

### Conceitos importantes

**syntax = "proto3"**: Versão do Protocol Buffers (proto3 é a mais recente)

**package**: Namespace para evitar conflitos

**message**: Estrutura de dados (como structs em Go)

**service**: Interface da API (como métodos)

**rpc**: Método remoto (como endpoints REST)

**Números de campo**: Cada campo tem um número único (1, 2, 3...). Nunca mude números de campos existentes!

### Instalando ferramentas

Para gerar código Go a partir do `.proto`:

```bash
# Instalar protoc (compilador)
# Linux/Mac
brew install protobuf  # ou apt-get install protobuf-compiler

# Instalar plugin Go
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
```

### Gerando código Go

Com o `.proto` pronto, gere o código:

```bash
protoc --go_out=. --go-grpc_out=. user.proto
```

Isso gera:
- `user.pb.go`: código das mensagens
- `user_grpc.pb.go`: código do servidor e cliente

## 3. Criando um servidor gRPC

### Estrutura básica

Um servidor gRPC em Go precisa:

1. Implementar a interface gerada
2. Criar o servidor gRPC
3. Registrar o serviço
4. Escutar em uma porta

### Implementação

```go
package main

import (
    "context"
    "log"
    "net"

    "google.golang.org/grpc"
    pb "github.com/seu-usuario/proto/user"
)

// Servidor que implementa UserService
type server struct {
    pb.UnimplementedUserServiceServer
}

// Implementa o método GetUser
func (s *server) GetUser(ctx context.Context, req *pb.GetUserRequest) (*pb.User, error) {
    // Aqui você busca o usuário (DB, cache, etc)
    user := &pb.User{
        Id:    req.UserId,
        Name:  "João Silva",
        Email: "joao@example.com",
    }
    
    return user, nil
}

func main() {
    // Cria listener na porta 50051
    lis, err := net.Listen("tcp", ":50051")
    if err != nil {
        log.Fatalf("falha ao escutar: %v", err)
    }

    // Cria servidor gRPC
    s := grpc.NewServer()

    // Registra o serviço
    pb.RegisterUserServiceServer(s, &server{})

    log.Println("Servidor rodando na porta 50051")
    
    // Inicia o servidor
    if err := s.Serve(lis); err != nil {
        log.Fatalf("falha ao servir: %v", err)
    }
}
```

### Conceitos importantes

**UnimplementedUserServiceServer**: Sempre inclua isso para compatibilidade futura

**Context**: Sempre receba `context.Context` como primeiro parâmetro

**Erros**: Retorne `status.Error` para erros gRPC apropriados

## 4. Criando um cliente gRPC

### Conectando ao servidor

```go
package main

import (
    "context"
    "log"
    "time"

    "google.golang.org/grpc"
    "google.golang.org/grpc/credentials/insecure"
    pb "github.com/seu-usuario/proto/user"
)

func main() {
    // Conecta ao servidor
    conn, err := grpc.Dial("localhost:50051", grpc.WithTransportCredentials(insecure.NewCredentials()))
    if err != nil {
        log.Fatalf("falha ao conectar: %v", err)
    }
    defer conn.Close()

    // Cria cliente
    client := pb.NewUserServiceClient(conn)

    // Cria contexto com timeout
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()

    // Chama o método
    user, err := client.GetUser(ctx, &pb.GetUserRequest{
        UserId: "123",
    })
    
    if err != nil {
        log.Fatalf("erro ao buscar usuário: %v", err)
    }

    log.Printf("Usuário: %+v", user)
}
```

### Conceitos importantes

**grpc.Dial**: Cria conexão com o servidor

**NewUserServiceClient**: Cliente gerado automaticamente

**Context com timeout**: Sempre use timeout para evitar travamentos

**insecure.NewCredentials**: Para desenvolvimento. Em produção, use TLS!

## 5. Streaming: comunicação em tempo real

### Tipos de streaming

gRPC suporta três tipos de streaming:

**Server Streaming**: Servidor envia múltiplas respostas
```protobuf
rpc ListUsers(ListUsersRequest) returns (stream User);
```

**Client Streaming**: Cliente envia múltiplas requisições
```protobuf
rpc CreateUsers(stream User) returns (CreateUsersResponse);
```

**Bidirectional Streaming**: Comunicação bidirecional
```protobuf
rpc Chat(stream Message) returns (stream Message);
```

### Exemplo: Server Streaming

**Protocol Buffers:**
```protobuf
service UserService {
  rpc ListUsers(ListUsersRequest) returns (stream User);
}
```

**Servidor:**
```go
func (s *server) ListUsers(req *pb.ListUsersRequest, stream pb.UserService_ListUsersServer) error {
    users := []*pb.User{
        {Id: "1", Name: "João", Email: "joao@example.com"},
        {Id: "2", Name: "Maria", Email: "maria@example.com"},
    }
    
    for _, user := range users {
        if err := stream.Send(user); err != nil {
            return err
        }
    }
    
    return nil
}
```

**Cliente:**
```go
stream, err := client.ListUsers(ctx, &pb.ListUsersRequest{})
if err != nil {
    log.Fatalf("erro: %v", err)
}

for {
    user, err := stream.Recv()
    if err == io.EOF {
        break
    }
    if err != nil {
        log.Fatalf("erro: %v", err)
    }
    log.Printf("Usuário: %+v", user)
}
```

### Quando usar streaming

- **Notificações em tempo real**: Server streaming
- **Upload de arquivos grandes**: Client streaming
- **Chat/mensagens**: Bidirectional streaming
- **Processamento de dados grandes**: Server streaming

## 6. Erros e status codes

### Status codes do gRPC

gRPC usa códigos de status específicos:

- `OK`: Sucesso
- `INVALID_ARGUMENT`: Parâmetros inválidos
- `NOT_FOUND`: Recurso não encontrado
- `ALREADY_EXISTS`: Recurso já existe
- `PERMISSION_DENIED`: Sem permissão
- `UNAUTHENTICATED`: Não autenticado
- `RESOURCE_EXHAUSTED`: Rate limit
- `INTERNAL`: Erro interno
- `UNAVAILABLE`: Serviço indisponível
- `DEADLINE_EXCEEDED`: Timeout

### Retornando erros

```go
import "google.golang.org/grpc/status"
import "google.golang.org/grpc/codes"

func (s *server) GetUser(ctx context.Context, req *pb.GetUserRequest) (*pb.User, error) {
    if req.UserId == "" {
        return nil, status.Error(codes.InvalidArgument, "user_id é obrigatório")
    }
    
    user, err := s.db.GetUser(req.UserId)
    if err == ErrNotFound {
        return nil, status.Error(codes.NotFound, "usuário não encontrado")
    }
    if err != nil {
        return nil, status.Error(codes.Internal, "erro ao buscar usuário")
    }
    
    return user, nil
}
```

### Verificando erros no cliente

```go
user, err := client.GetUser(ctx, &pb.GetUserRequest{UserId: "123"})
if err != nil {
    st := status.Convert(err)
    switch st.Code() {
    case codes.NotFound:
        log.Println("Usuário não encontrado")
    case codes.InvalidArgument:
        log.Println("Parâmetro inválido")
    default:
        log.Printf("Erro: %v", err)
    }
    return
}
```

## Conclusão

gRPC é uma tecnologia poderosa para construir APIs modernas. Com Go, você tem tudo que precisa para começar.

O processo é simples:
1. Defina seu contrato em `.proto`
2. Gere código Go
3. Implemente o servidor
4. Crie clientes

Comece simples. Adicione complexidade conforme precisa. E sempre teste em produção com cuidado.

Vale a pena o esforço.

## Referências e fontes

### Documentação oficial

- **[gRPC Documentation](https://grpc.io/docs/)** - Documentação completa
- **[Protocol Buffers](https://protobuf.dev/)** - Guia de Protocol Buffers
- **[gRPC Go Examples](https://github.com/grpc/grpc-go/tree/master/examples)** - Exemplos oficiais

### Artigos e guias

- **[gRPC vs REST](https://www.baeldung.com/grpc-vs-rest)** - Comparação detalhada
- **[gRPC Best Practices](https://grpc.io/docs/guides/best-practices/)** - Melhores práticas oficiais

### Ferramentas

- **[buf](https://buf.build/)** - Ferramenta moderna para Protocol Buffers
- **[grpc-gateway](https://github.com/grpc-ecosystem/grpc-gateway)** - Gateway REST para gRPC
- **[protoc-gen-validate](https://github.com/bufbuild/protoc-gen-validate)** - Validação de mensagens
