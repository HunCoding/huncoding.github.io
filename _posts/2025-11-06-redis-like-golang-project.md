---
layout: post
title: "Redis-like KV Store: Um Projeto Educacional em Go com Clean Architecture"
subtitle: "Apresentando um banco de dados key-value in-memory implementado do zero, demonstrando Clean Architecture, Dependency Injection e concorrência em Go."
date: 2025-11-06 08:00:00 -0000
categories: [Go, Clean Architecture, Database]
tags: [go, clean-architecture, dependency-injection, wire, redis, key-value-store]
comments: true
image: "/assets/img/posts/2025-11-06-redis-like-golang-project.png"
lang: pt-BR
---

E aí, pessoal!

Implementar sistemas do zero é uma das melhores formas de entender profundamente como eles funcionam. Neste artigo, apresento um projeto educacional: um Redis-like Key-Value Store implementado completamente em Go, seguindo os princípios de Clean Architecture e utilizando Dependency Injection com Google Wire.

Este projeto não é apenas uma implementação funcional de um banco de dados key-value, mas também uma demonstração prática de como aplicar conceitos avançados de arquitetura de software, concorrência e design de sistemas.

![Visão Geral do Projeto Redis-like KV Store](/assets/img/posts/diagram-redis-like-golang.png)

## O Projeto

O Redis-like KV Store é um banco de dados in-memory que implementa 11 comandos básicos inspirados no Redis: SET, GET, DEL, EXPIRE, TTL, PERSIST, KEYS, EXISTS, PING, INFO e QUIT. O projeto suporta TTL com limpeza automática de chaves expiradas, persistência opcional via Append-Only File (AOF) e é completamente thread-safe, permitindo múltiplas conexões simultâneas.

### Características Principais

**11 Comandos Implementados**: Operações básicas e avançadas para manipulação de dados.

**Thread-Safe**: Utiliza sync.RWMutex para garantir operações concorrentes seguras, permitindo múltiplas leituras simultâneas e escritas exclusivas.

**TTL e Expiração Automática**: Suporte completo a Time To Live com uma goroutine de background que remove chaves expiradas periodicamente.

**Persistência AOF**: Append-Only File opcional que salva comandos de escrita e permite restaurar o estado completo na reinicialização.

**Protocolo TCP Simples**: Comunicação via texto plano, uma linha por comando, compatível com ferramentas padrão como netcat.

**Clean Architecture**: Organização do código em quatro camadas bem definidas, garantindo separação de responsabilidades.

**Dependency Injection**: Google Wire para gerenciamento automático e type-safe de dependências.

## Arquitetura: Clean Architecture

O projeto segue rigorosamente os princípios de Clean Architecture, dividindo o código em quatro camadas principais, cada uma com responsabilidades bem definidas.

### Estrutura de Camadas

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

O princípio fundamental é que as dependências sempre apontam para dentro. A camada Domain é completamente independente e não conhece nenhuma implementação concreta.

### Domain Layer: O Núcleo

A camada de domínio define os contratos e entidades puras do sistema. Esta é a camada mais interna e não possui dependências de outras camadas.

**Entidade Item**: Representa um item armazenado no banco, contendo o valor (string) e o tempo de expiração (time.Time). Inclui métodos para verificar se está expirado e calcular o TTL restante.

**Interfaces de Repositório**: Define os contratos para operações de key-value (KeyValueRepository) e persistência (PersistenceRepository). Estas interfaces são implementadas pela camada de infraestrutura.

**Enum de Comandos**: Tipo enum que unifica e valida todos os comandos suportados, incluindo métodos para verificar se é válido e se é um comando de escrita.

A independência desta camada permite que as regras de negócio sejam testadas isoladamente, sem depender de implementações concretas.

### Use Case Layer: Lógica de Negócio

A camada de casos de uso contém toda a lógica de negócio do sistema.

**CommandHandler**: Recebe comandos parseados do adapter, valida argumentos, executa operações através dos repositórios e persiste comandos de escrita quando o AOF está habilitado. Cada comando tem seu próprio handler específico (handleSet, handleGet, handleDel, etc.).

**Stats**: Coleta e formata estatísticas do servidor, incluindo uptime, total de comandos processados, conexões recebidas e tamanho do keyspace. Formata a saída no estilo Redis para o comando INFO.

Esta camada orquestra as operações, mas não conhece detalhes de implementação. Ela trabalha apenas com interfaces definidas no Domain.

### Infrastructure Layer: Implementações Concretas

A camada de infraestrutura fornece as implementações concretas das interfaces definidas no Domain.

**Store**: Implementação in-memory do KeyValueRepository utilizando um map[string]*Item. Garante thread-safety através de sync.RWMutex, permitindo múltiplas leituras simultâneas (RLock) e escritas exclusivas (Lock). Inclui uma goroutine de background que remove chaves expiradas periodicamente.

**AOF**: Implementação do PersistenceRepository que salva comandos de escrita em um arquivo texto. Cada comando é escrito em uma linha separada, e o arquivo é sincronizado após cada append para garantir durabilidade. Na inicialização, o servidor executa um replay completo do arquivo para restaurar o estado.

A separação entre interfaces e implementações permite trocar facilmente as implementações sem afetar outras camadas.

### Adapter Layer: Interfaces de I/O

A camada de adaptadores gerencia as interfaces de entrada e saída do sistema.

**TCPHandler**: Gerencia conexões TCP, criando uma goroutine separada para cada conexão. Lê comandos do cliente, parseia através do Parser, executa via CommandHandler e retorna a resposta formatada.

**Parser**: Parseia o protocolo texto plano, convertendo strings em estruturas Command tipadas. Também formata respostas (OK, valores, erros) de acordo com o protocolo.

Esta camada isola o sistema do protocolo de comunicação, permitindo que futuramente seja adicionado suporte a outros protocolos (HTTP, gRPC) sem afetar a lógica de negócio.

## Dependency Injection com Google Wire

O projeto utiliza Google Wire para gerenciamento automático de dependências. Wire é uma ferramenta de code generation que cria código type-safe em tempo de compilação.

### Como Funciona

Wire analisa arquivos marcados com `//go:build wireinject` e gera código que resolve automaticamente todas as dependências. O desenvolvedor define apenas os providers (funções construtoras) e o Wire gera o código que cria e injeta todas as instâncias na ordem correta.

**Grafo de Dependências**:
```
Container
├── Store (KeyValueRepository)
├── Persistence (PersistenceRepository) [opcional]
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

O Wire resolve automaticamente este grafo, garantindo que todas as dependências sejam criadas na ordem correta e injetadas nos construtores apropriados.

### Benefícios

**Type-Safe**: Erros de dependência são detectados em tempo de compilação, não em runtime.

**Código Gerado**: O código gerado é otimizado e não adiciona overhead em runtime.

**Manutenibilidade**: Adicionar novas dependências é simples - apenas adicione o provider e o Wire resolve o resto.

**Testabilidade**: Facilita a criação de mocks e testes isolados.

## Thread Safety e Concorrência

Um dos desafios principais de sistemas in-memory é garantir thread-safety quando múltiplas conexões acessam os dados simultaneamente.

### Mecanismos Utilizados

**sync.RWMutex**: O Store utiliza um RWMutex que permite múltiplas leituras simultâneas através de RLock() e garante exclusividade para escritas através de Lock(). Isso otimiza o desempenho em cenários com muitas leituras e poucas escritas.

**Goroutines**: Cada conexão TCP roda em uma goroutine separada, permitindo que o servidor atenda múltiplos clientes simultaneamente sem bloqueios.

**Atomic Counters**: As estatísticas utilizam atomic.AddInt64 e atomic.LoadInt64 para incrementar e ler contadores de forma thread-safe, sem necessidade de locks.

**Background Cleanup**: Uma goroutine isolada executa periodicamente (configurável, padrão 1 segundo) para remover chaves expiradas. Esta goroutine utiliza locks apropriados para garantir que não interfira com operações normais.

### Operações Thread-Safe

- **Leituras** (Get, Keys, Exists, TTL): Utilizam RLock, permitindo concorrência entre múltiplas leituras.
- **Escritas** (Set, Del, Expire, Persist): Utilizam Lock, garantindo exclusividade.
- **Background Cleanup**: Executa em goroutine isolada com locks apropriados.

O resultado é um sistema que pode atender múltiplos clientes simultaneamente de forma segura, com otimizações para cenários de alta leitura.

## Persistência: Append-Only File (AOF)

O projeto implementa persistência opcional através de Append-Only File, similar ao Redis.

### Funcionamento

**Durante Execução**: Quando habilitado, todos os comandos de escrita (SET, DEL, EXPIRE, PERSIST) são salvos no arquivo `data.aof`, uma linha por comando. Após cada append, o arquivo é sincronizado (sync) para garantir que os dados sejam escritos no disco.

**Na Inicialização**: Quando o servidor inicia com AOF habilitado, ele lê o arquivo sequencialmente, parseia cada comando e executa no store. Isso restaura o estado completo antes de aceitar novas conexões.

**Comandos Persistidos**: Apenas comandos de escrita são salvos. Comandos de leitura (GET, KEYS, EXISTS, TTL, PING, INFO) não são persistidos, pois não alteram o estado.

### Exemplo de Arquivo AOF

```
SET user:1 John
EXPIRE user:1 60
SET user:2 Jane
DEL user:2
PERSIST user:1
```

Este formato simples permite replay completo e é fácil de debugar e inspecionar manualmente.

## Protocolo de Comunicação

O protocolo é intencionalmente simples: texto plano, uma linha por comando.

### Formato de Comando

```
COMANDO arg1 arg2 arg3\n
```

### Formato de Resposta

- **Sucesso**: `OK\n`
- **Valor**: `valor\n`
- **Não encontrado**: `nil\n`
- **Erro**: `ERR mensagem\n`
- **Número**: `123\n`

### Exemplos de Uso

```bash
# SET
echo "SET user:1 John" | nc localhost 6379
# → OK

# GET
echo "GET user:1" | nc localhost 6379
# → John

# KEYS com wildcard
echo "KEYS user:*" | nc localhost 6379
# → user:1 user:2

# INFO (multi-linha)
echo "INFO" | nc localhost 6379
# → # Server
# → redis_version:redis-like-go/1.0.0
# → ...
```

A simplicidade do protocolo permite interação fácil com ferramentas padrão e facilita debugging.

## Comandos Implementados

O projeto implementa 11 comandos, divididos em básicos e avançados.

### Comandos Básicos

**SET**: Cria ou atualiza uma chave. Remove TTL se a chave já tinha expiração. Persiste no AOF.

**GET**: Recupera o valor de uma chave. Retorna "nil" se a chave não existe ou expirou.

**DEL**: Remove uma ou múltiplas chaves. Retorna o número de chaves removidas. Persiste no AOF.

**EXPIRE**: Define TTL em segundos para uma chave existente. Retorna OK se sucesso, 0 se a chave não existe. Persiste no AOF.

**TTL**: Retorna segundos restantes até expiração. Retorna -1 se não tem TTL, -2 se não existe.

**PERSIST**: Remove TTL de uma chave, tornando-a persistente. Retorna OK se sucesso, 0 caso contrário. Persiste no AOF.

### Comandos Avançados

**KEYS**: Lista todas as chaves que correspondem a um padrão. Suporta wildcards `*` (qualquer string) e `?` (qualquer caractere). Utiliza filepath.Match para pattern matching.

**EXISTS**: Verifica se uma ou múltiplas chaves existem. Retorna o número de chaves existentes.

**PING**: Health check. Retorna "PONG" se sem argumentos, ou a mensagem customizada se fornecida.

**INFO**: Retorna estatísticas do servidor em formato estilo Redis, incluindo versão, uptime, comandos processados, conexões e tamanho do keyspace.

**QUIT**: Fecha a conexão TCP atual.

## Benefícios da Arquitetura

A escolha por Clean Architecture traz diversos benefícios práticos.

### Separação de Responsabilidades

Cada camada tem uma responsabilidade clara e bem definida. Domain define contratos, Use Case implementa lógica, Infrastructure fornece implementações e Adapter gerencia I/O. Isso torna o código mais fácil de entender e manter.

### Testabilidade

Interfaces facilitam a criação de mocks e testes isolados. Cada camada pode ser testada independentemente, sem depender de implementações concretas. Isso resulta em testes mais rápidos e confiáveis.

### Manutenibilidade

Mudanças em uma camada não afetam outras camadas. Por exemplo, trocar o protocolo de TCP para HTTP requer mudanças apenas no Adapter Layer, sem tocar na lógica de negócio.

### Flexibilidade

A arquitetura permite trocar implementações facilmente. Por exemplo, trocar AOF por RDB (snapshots) requer apenas criar uma nova implementação de PersistenceRepository, sem afetar outras partes do sistema.

### Dependency Injection

Google Wire resolve dependências automaticamente, mantendo o código limpo e facilitando testes. O código gerado é type-safe e otimizado.

## Casos de Uso e Aplicações

Este projeto serve como base para entender diversos conceitos importantes.

### Aprendizado de Arquitetura

Demonstra como aplicar Clean Architecture em um projeto real, mostrando a separação de responsabilidades e o fluxo de dependências.

### Concorrência em Go

Exemplifica o uso de goroutines, mutexes e operações atômicas para construir sistemas thread-safe.

### Design de Protocolos

Mostra como projetar e implementar protocolos de comunicação simples e eficientes.

### Persistência de Dados

Demonstra diferentes estratégias de persistência (AOF) e como implementar replay de comandos.

### Dependency Injection

Ilustra o uso de ferramentas modernas de DI como Google Wire em projetos Go.

## Estrutura do Projeto

O projeto está organizado seguindo as convenções Go e os princípios de Clean Architecture:

```
redis-like-go/
├── cmd/
│   ├── server/          # Entry point do servidor
│   └── client/          # CLI client
├── internal/
│   ├── domain/          # Interfaces e entidades
│   ├── usecase/         # Lógica de negócio
│   ├── infrastructure/  # Implementações
│   ├── adapter/         # I/O
│   └── container/       # Dependency Injection
├── Dockerfile
├── docker-compose.yml
└── go.mod
```

Esta organização facilita navegação, manutenção e testes.

## Testes e Qualidade

O projeto inclui testes unitários e de integração cobrindo:

- Operações básicas do store (Set, Get, Del)
- Operações de TTL (Expire, TTL, Persist)
- Comandos avançados (Keys, Exists)
- Thread-safety em cenários concorrentes
- Replay do AOF na inicialização
- Parsing do protocolo

Os testes garantem que o sistema funciona corretamente em diversos cenários e que mudanças futuras não quebrem funcionalidades existentes.

## Docker e Deploy

O projeto inclui Dockerfile multi-stage e docker-compose.yml para facilitar build e execução:

- Build otimizado em estágios separados
- Imagem final minimalista (Alpine)
- Suporte a volumes para persistência AOF
- Configuração via docker-compose

Isso permite deploy fácil em qualquer ambiente que suporte Docker.

## Melhorias e Extensões Futuras

O projeto atual serve como base sólida para diversas extensões:

**Tipos de Dados**: Adicionar suporte a listas, hashes, sets e sorted sets.

**Comandos Adicionais**: Implementar INCR, DECR, LPUSH, RPUSH, HSET, HGET e outros.

**Funcionalidades Avançadas**: Transações multi-chave, pipeline de comandos, pub/sub.

**Infraestrutura**: Replicação primário-secundário, clusterização, sharding.

**Persistência**: RDB snapshots além de AOF, compressão, checkpointing.

**Segurança**: Autenticação, autorização (ACL), encryption/TLS.

**Monitoramento**: Métricas avançadas, integração com Prometheus, dashboards.

A arquitetura atual facilita a adição dessas funcionalidades sem grandes refatorações.

## Conclusão

O Redis-like KV Store é um projeto educacional completo que demonstra a aplicação prática de conceitos avançados de arquitetura de software, concorrência e design de sistemas. Através da implementação de um banco de dados key-value do zero, o projeto ilustra:

- Como aplicar Clean Architecture em projetos reais
- Técnicas de concorrência e thread-safety em Go
- Design e implementação de protocolos de comunicação
- Estratégias de persistência de dados
- Uso de Dependency Injection com Google Wire

Este projeto serve como excelente ponto de partida para entender como sistemas de armazenamento funcionam internamente e como aplicar princípios de arquitetura limpa em projetos Go. A estrutura modular e bem organizada facilita extensões futuras e serve como referência para outros projetos.

Para desenvolvedores interessados em aprofundar conhecimentos em arquitetura de software, concorrência e design de sistemas, este projeto oferece uma base sólida e prática para exploração e aprendizado.
