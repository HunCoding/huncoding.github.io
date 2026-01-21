---
layout: post
title: "Migrando aplicações Go para Kubernetes: problemas reais e soluções"
subtitle: "Guia prático com os problemas mais comuns na migração e como resolvê-los de verdade"
date: 2026-01-20 08:00:00 -0300
categories: [Go, Kubernetes, DevOps, Migração]
tags: [go, kubernetes, migration, devops, containers, deployment, best-practices]
comments: true
image: "/assets/img/posts/2026-01-20-migrando-go-para-kubernetes.png"
lang: pt-BR
---

E aí, pessoal!

Migrar uma aplicação Go para Kubernetes parece simples no papel. Você cria um Dockerfile, faz deploy e pronto, certo?

Errado.

Na prática, você encontra problemas que não aparecem na documentação. Aplicações que funcionavam perfeitamente em servidores tradicionais começam a se comportar de forma estranha. Requests que demoram mais. Conexões que caem. Recursos que não são liberados.

Este post é sobre esses problemas reais. E sobre como resolvê-los de verdade.

## O que você vai encontrar aqui

Este guia cobre os problemas mais comuns que desenvolvedores Go enfrentam ao migrar para Kubernetes:

1. **ConfigMaps e Secrets**: como gerenciar configuração
2. **Health checks**: liveness e readiness probes
3. **Graceful shutdown**: encerrando aplicações corretamente
4. **Service discovery**: encontrando outros serviços
5. **Networking e DNS**: problemas de conectividade
6. **Resource limits**: CPU e memória
7. **Logs e observabilidade**: o que mudou

Cada seção tem problemas reais e soluções práticas que funcionam em produção.

## 1. ConfigMaps e Secrets: gerenciando configuração

### O problema

Sua aplicação Go provavelmente lê configuração de arquivos ou variáveis de ambiente:

```go
// app.go
config := os.Getenv("DATABASE_URL")
if config == "" {
    log.Fatal("DATABASE_URL não configurada")
}
```

Em Kubernetes, você não pode simplesmente editar arquivos no servidor. Você precisa usar ConfigMaps e Secrets.

### A solução

**Opção 1: Variáveis de ambiente (mais simples)**

Crie um ConfigMap:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  DATABASE_URL: "postgres://user:pass@db:5432/mydb"
  LOG_LEVEL: "info"
```

E use no Deployment:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  template:
    spec:
      containers:
      - name: app
        image: my-app:latest
        envFrom:
        - configMapRef:
            name: app-config
```

**Opção 2: Arquivos montados (mais flexível)**

Para arquivos de configuração maiores:

```yaml
spec:
  containers:
  - name: app
    volumeMounts:
    - name: config
      mountPath: /etc/app
  volumes:
  - name: config
    configMap:
      name: app-config
```

**Para Secrets (dados sensíveis):**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
type: Opaque
stringData:
  API_KEY: "sua-chave-secreta"
```

```yaml
envFrom:
- secretRef:
    name: app-secrets
```

### Problema comum: ConfigMap não atualiza

ConfigMaps montados como volumes são atualizados, mas sua aplicação precisa recarregar. Para variáveis de ambiente, você precisa recriar o Pod.

**Solução**: Você pode implementar hot reload na sua aplicação Go para recarregar configurações automaticamente quando o ConfigMap mudar. No vídeo abaixo, mostro como fazer isso na prática:

{% include embed/youtube.html id="ZAmaSfiwm84" %}

Alternativamente, você pode usar um sidecar como [Reloader](https://github.com/stakater/Reloader) que faz o reload automaticamente.

## 2. Health checks: liveness e readiness probes

### O problema

Sua aplicação Go pode estar rodando, mas não está pronta para receber tráfego. Ou pode estar travada, mas o Kubernetes não sabe.

Sem health checks, o Kubernetes não consegue:
- Saber quando reiniciar um container travado
- Saber quando a aplicação está pronta para receber tráfego
- Fazer rolling updates de forma segura

### A solução

Implemente endpoints de health check na sua aplicação:

```go
// health.go
func healthHandler(w http.ResponseWriter, r *http.Request) {
    w.WriteHeader(http.StatusOK)
    w.Write([]byte("OK"))
}

func readinessHandler(w http.ResponseWriter, r *http.Request) {
    // Verifica se está pronto (DB conectado, etc)
    if db.Ping() != nil {
        w.WriteHeader(http.StatusServiceUnavailable)
        return
    }
    w.WriteHeader(http.StatusOK)
}
```

Configure as probes no Deployment:

```yaml
spec:
  containers:
  - name: app
    livenessProbe:
      httpGet:
        path: /health
        port: 8080
      initialDelaySeconds: 30
      periodSeconds: 10
    readinessProbe:
      httpGet:
        path: /ready
        port: 8080
      initialDelaySeconds: 5
      periodSeconds: 5
```

### Diferença entre liveness e readiness

```
┌─────────────────────────────────┐
│  Liveness Probe                │
│  "A aplicação está viva?"      │
│  Se falhar → reinicia o Pod    │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│  Readiness Probe                │
│  "A aplicação está pronta?"     │
│  Se falhar → remove do Service  │
└─────────────────────────────────┘
```

**Liveness**: detecta se a aplicação está travada e precisa ser reiniciada.

**Readiness**: detecta se a aplicação está pronta para receber tráfego (DB conectado, cache carregado, etc).

### Problema comum: probes muito agressivas

Se suas probes falharem muito rápido, o Kubernetes vai reiniciar seu Pod constantemente.

**Solução**: Ajuste `initialDelaySeconds` para dar tempo da aplicação inicializar.

## 3. Graceful shutdown: encerrando corretamente

### O problema

Quando o Kubernetes precisa encerrar um Pod (rolling update, scale down), ele envia um SIGTERM. Se sua aplicação não tratar isso corretamente, você pode:

- Perder requests em processamento
- Não fechar conexões de banco de dados
- Não salvar estado
- Corromper dados

### A solução

Implemente graceful shutdown na sua aplicação Go:

```go
// main.go
func main() {
    // Cria servidor HTTP
    srv := &http.Server{
        Addr:    ":8080",
        Handler: mux,
    }

    // Canal para receber sinais do sistema
    sigChan := make(chan os.Signal, 1)
    signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

    // Inicia servidor em goroutine
    go func() {
        if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            log.Fatalf("servidor falhou: %v", err)
        }
    }()

    // Espera sinal
    <-sigChan
    log.Println("Shutdown iniciado...")

    // Cria contexto com timeout para shutdown
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    // Shutdown graceful
    if err := srv.Shutdown(ctx); err != nil {
        log.Fatalf("shutdown forçado: %v", err)
    }

    // Fecha conexões de banco, etc
    db.Close()
    log.Println("Shutdown completo")
}
```

Configure o Pod para dar tempo:

```yaml
spec:
  containers:
  - name: app
    lifecycle:
      preStop:
        exec:
          command: ["/bin/sh", "-c", "sleep 15"]
  terminationGracePeriodSeconds: 30
```

### O que acontece

```
1. Kubernetes envia SIGTERM
2. Sua aplicação para de aceitar novos requests
3. Espera requests em processamento terminarem
4. Fecha conexões
5. Encerra graciosamente
```

**terminationGracePeriodSeconds**: tempo máximo que Kubernetes espera antes de forçar kill (SIGKILL).

## 4. Service discovery: encontrando outros serviços

### O problema

Em servidores tradicionais, você pode usar IPs fixos ou hosts conhecidos. Em Kubernetes, Pods têm IPs dinâmicos. Como encontrar outros serviços?

### A solução

Kubernetes tem DNS interno. Use nomes de serviços:

```go
// Em vez de:
dbURL := "postgres://user:pass@192.168.1.10:5432/db"

// Use:
dbURL := "postgres://user:pass@postgres-service:5432/db"
```

O DNS do Kubernetes resolve automaticamente:

```
┌─────────────────────────────────┐
│  Nome do Service                │
│  postgres-service               │
│  ↓                              │
│  DNS do Kubernetes              │
│  ↓                              │
│  IP do Service                  │
│  ↓                              │
│  Load Balancer                  │
│  ↓                              │
│  Pods do serviço                │
└─────────────────────────────────┘
```

**Formato**: `<service-name>.<namespace>.svc.cluster.local`

Para serviços no mesmo namespace, só precisa do nome: `postgres-service`

### Exemplo prático

```go
// config.go
func getDBURL() string {
    // Kubernetes DNS
    host := os.Getenv("DB_HOST")
    if host == "" {
        host = "postgres-service" // Nome do Service
    }
    
    port := os.Getenv("DB_PORT")
    if port == "" {
        port = "5432"
    }
    
    return fmt.Sprintf("postgres://user:pass@%s:%s/db", host, port)
}
```

### Problema comum: DNS não resolve

Se você estiver testando localmente ou em desenvolvimento, o DNS do Kubernetes não existe.

**Solução**: Use variáveis de ambiente para desenvolvimento:

```go
host := os.Getenv("DB_HOST")
if host == "" {
    if os.Getenv("KUBERNETES_SERVICE_HOST") != "" {
        // Está em Kubernetes
        host = "postgres-service"
    } else {
        // Desenvolvimento local
        host = "localhost"
    }
}
```

## 5. Networking e DNS: problemas de conectividade

### O problema

Sua aplicação Go pode não conseguir conectar com outros serviços. Timeouts, conexões recusadas, DNS não resolve.

### Problemas comuns e soluções

**1. DNS não resolve**

```go
// Teste de conectividade
func testConnection(host string) error {
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()
    
    conn, err := net.DialContext(ctx, "tcp", host)
    if err != nil {
        return fmt.Errorf("não conseguiu conectar: %v", err)
    }
    conn.Close()
    return nil
}
```

**2. Timeouts muito curtos**

Ajuste timeouts para ambiente Kubernetes:

```go
// HTTP client com timeout adequado
client := &http.Client{
    Timeout: 30 * time.Second,
    Transport: &http.Transport{
        DialContext: (&net.Dialer{
            Timeout:   10 * time.Second,
            KeepAlive: 30 * time.Second,
        }).DialContext,
    },
}
```

**3. Conexões não são reutilizadas**

Use connection pooling:

```go
// Para banco de dados
db.SetMaxOpenConns(25)
db.SetMaxIdleConns(5)
db.SetConnMaxLifetime(5 * time.Minute)
```

### Debugging de rede

Se algo não funciona, verifique:

```bash
# Dentro do Pod
nslookup postgres-service
curl http://postgres-service:5432
ping postgres-service
```

## 6. Resource limits: CPU e memória

### O problema

Sem limits, sua aplicação pode:
- Consumir toda a CPU do nó
- Esgotar memória do nó
- Ser morta pelo OOMKiller
- Afetar outros Pods

### A solução

Configure requests e limits:

```yaml
spec:
  containers:
  - name: app
    resources:
      requests:
        memory: "128Mi"
        cpu: "100m"
      limits:
        memory: "256Mi"
        cpu: "500m"
```

**Requests**: recursos garantidos (scheduling)

**Limits**: máximo que pode usar

### GOMAXPROCS e CPU limits

Go usa `GOMAXPROCS` baseado em CPUs disponíveis. Em containers com CPU limits, isso pode ser problemático.

**Solução**: Use [automaxprocs](https://github.com/uber-go/automaxprocs):

```go
import _ "go.uber.org/automaxprocs"

func main() {
    // GOMAXPROCS será ajustado automaticamente
    // baseado nos CPU limits do container
}
```

### Memory limits e GC

Com memory limits, o GC do Go precisa trabalhar mais:

```go
// Ajuste GOGC se necessário
// GOGC=50 = mais agressivo (usa menos memória)
// GOGC=100 = padrão
// GOGC=200 = menos agressivo (usa mais memória)
```

Monitore uso de memória:

```go
var m runtime.MemStats
runtime.ReadMemStats(&m)
log.Printf("Memória alocada: %d MB", m.Alloc/1024/1024)
```

## 7. Logs e observabilidade: o que mudou

### O problema

Em servidores tradicionais, logs vão para arquivos. Em Kubernetes, Pods são efêmeros. Logs são perdidos quando Pods são recriados.

### A solução

**1. Logs estruturados (JSON)**

```go
import "github.com/sirupsen/logrus"

logrus.SetFormatter(&logrus.JSONFormatter{})

logrus.WithFields(logrus.Fields{
    "user_id": 123,
    "action": "login",
}).Info("Usuário fez login")
```

**2. Log para stdout/stderr**

Kubernetes captura stdout/stderr automaticamente:

```go
// Use log padrão ou biblioteca de logging
log.Println("Mensagem de log")
fmt.Fprintf(os.Stderr, "Erro: %v\n", err)
```

**3. Context para tracing**

Use context para propagar trace IDs:

```go
func handleRequest(w http.ResponseWriter, r *http.Request) {
    ctx := r.Context()
    
    // Adiciona trace ID ao contexto
    traceID := r.Header.Get("X-Trace-ID")
    if traceID == "" {
        traceID = generateTraceID()
    }
    ctx = context.WithValue(ctx, "trace_id", traceID)
    
    // Logs incluem trace ID
    log.WithContext(ctx).Info("Processando request")
}
```

### Integração com observabilidade

Para métricas, use Prometheus:

```go
import "github.com/prometheus/client_golang/prometheus"

var httpRequests = prometheus.NewCounterVec(
    prometheus.CounterOpts{
        Name: "http_requests_total",
    },
    []string{"method", "endpoint", "status"},
)

func init() {
    prometheus.MustRegister(httpRequests)
}
```

## Problemas comuns e soluções rápidas

| Problema | Causa | Solução |
|----------|-------|---------|
| Pod reinicia constantemente | Liveness probe falhando | Aumentar `initialDelaySeconds` |
| Requests perdidos no deploy | Sem graceful shutdown | Implementar shutdown graceful |
| Não conecta com outros serviços | DNS não resolve | Usar nomes de Services |
| Alto uso de memória | Sem limits | Configurar memory limits |
| CPU não é usado eficientemente | GOMAXPROCS errado | Usar automaxprocs |
| Logs perdidos | Logs em arquivos | Log para stdout/stderr |
| Timeouts frequentes | Timeouts muito curtos | Ajustar timeouts de rede |

## Conclusão

Migrar para Kubernetes não é só fazer deploy. É adaptar sua aplicação para um ambiente diferente.

Os problemas que você vai encontrar são previsíveis. E as soluções são conhecidas. Este guia cobre os principais.

A chave é entender como Kubernetes funciona e adaptar sua aplicação Go para esse ambiente. Não é difícil, mas requer atenção aos detalhes.

E quando você fizer certo, você ganha:
- Escalabilidade automática
- Alta disponibilidade
- Deploy sem downtime
- Observabilidade nativa
- Gerenciamento simplificado

Vale a pena o esforço.

## Referências e fontes

### Documentação oficial

- **[Kubernetes Documentation](https://kubernetes.io/docs/)** - Documentação completa
- **[Kubernetes Best Practices](https://kubernetes.io/docs/concepts/configuration/overview/)** - Melhores práticas oficiais
- **[ConfigMaps](https://kubernetes.io/docs/concepts/configuration/configmap/)** - Gerenciamento de configuração
- **[Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)** - Gerenciamento de secrets
- **[Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)** - Health checks

### Artigos e guias

- **[Kubernetes Patterns](https://www.redhat.com/en/topics/containers/kubernetes-patterns)** - Padrões de Kubernetes
- **[12-Factor App](https://12factor.net/)** - Princípios para aplicações cloud-native
- **[Go Best Practices](https://go.dev/doc/effective_go)** - Effective Go

### Ferramentas

- **[Reloader](https://github.com/stakater/Reloader)** - Hot reload de ConfigMaps
- **[automaxprocs](https://github.com/uber-go/automaxprocs)** - Ajuste automático de GOMAXPROCS
- **[Prometheus Go client](https://github.com/prometheus/client_golang)** - Métricas Prometheus

### Código de exemplo

- **[Kubernetes Go client](https://github.com/kubernetes/client-go)** - Cliente oficial do Kubernetes
- **[controller-runtime](https://github.com/kubernetes-sigs/controller-runtime)** - Framework para operadores
