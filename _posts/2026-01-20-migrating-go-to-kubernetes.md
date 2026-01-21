---
layout: post
title: "Migrating Go Applications to Kubernetes: Real Problems and Solutions"
subtitle: "Practical guide with the most common migration issues and how to actually solve them"
date: 2026-01-20 08:00:00 -0300
categories: [Go, Kubernetes, DevOps, Migration]
tags: [go, kubernetes, migration, devops, containers, deployment, best-practices]
comments: true
image: "/assets/img/posts/2026-01-20-migrando-go-para-kubernetes.png"
lang: en
original_post: "/migrando-go-para-kubernetes/"
---

Hey everyone!

Migrating a Go application to Kubernetes seems simple on paper. You create a Dockerfile, deploy it, and you're done, right?

Wrong.

In practice, you encounter problems that don't appear in the documentation. Applications that worked perfectly on traditional servers start behaving strangely. Requests that take longer. Connections that drop. Resources that aren't released.

This post is about those real problems. And about how to actually solve them.

## What you'll find here

This guide covers the most common problems Go developers face when migrating to Kubernetes:

1. **ConfigMaps and Secrets**: how to manage configuration
2. **Health checks**: liveness and readiness probes
3. **Graceful shutdown**: shutting down applications correctly
4. **Service discovery**: finding other services
5. **Networking and DNS**: connectivity issues
6. **Resource limits**: CPU and memory
7. **Logs and observability**: what changed

Each section has real problems and practical solutions that work in production.

## 1. ConfigMaps and Secrets: managing configuration

### The problem

Your Go application probably reads configuration from files or environment variables:

```go
// app.go
config := os.Getenv("DATABASE_URL")
if config == "" {
    log.Fatal("DATABASE_URL not configured")
}
```

In Kubernetes, you can't simply edit files on the server. You need to use ConfigMaps and Secrets.

### The solution

**Option 1: Environment variables (simplest)**

Create a ConfigMap:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  DATABASE_URL: "postgres://user:pass@db:5432/mydb"
  LOG_LEVEL: "info"
```

And use it in the Deployment:

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

**Option 2: Mounted files (more flexible)**

For larger configuration files:

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

**For Secrets (sensitive data):**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
type: Opaque
stringData:
  API_KEY: "your-secret-key"
```

```yaml
envFrom:
- secretRef:
    name: app-secrets
```

### Common problem: ConfigMap doesn't update

ConfigMaps mounted as volumes are updated, but your application needs to reload. For environment variables, you need to recreate the Pod.

**Solution**: You can implement hot reload in your Go application to automatically reload configurations when the ConfigMap changes. In the video below, I show how to do this in practice:

{% include embed/youtube.html id="ZAmaSfiwm84" %}

Alternatively, you can use a sidecar like [Reloader](https://github.com/stakater/Reloader) that does the reload automatically.

## 2. Health checks: liveness and readiness probes

### The problem

Your Go application might be running, but it's not ready to receive traffic. Or it might be stuck, but Kubernetes doesn't know.

Without health checks, Kubernetes can't:
- Know when to restart a stuck container
- Know when the application is ready to receive traffic
- Perform rolling updates safely

### The solution

Implement health check endpoints in your application:

```go
// health.go
func healthHandler(w http.ResponseWriter, r *http.Request) {
    w.WriteHeader(http.StatusOK)
    w.Write([]byte("OK"))
}

func readinessHandler(w http.ResponseWriter, r *http.Request) {
    // Check if ready (DB connected, etc)
    if db.Ping() != nil {
        w.WriteHeader(http.StatusServiceUnavailable)
        return
    }
    w.WriteHeader(http.StatusOK)
}
```

Configure the probes in the Deployment:

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

### Difference between liveness and readiness

```
┌─────────────────────────────────┐
│  Liveness Probe                │
│  "Is the app alive?"            │
│  If fails → restarts the Pod    │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│  Readiness Probe                │
│  "Is the app ready?"            │
│  If fails → removes from Service│
└─────────────────────────────────┘
```

**Liveness**: detects if the application is stuck and needs to be restarted.

**Readiness**: detects if the application is ready to receive traffic (DB connected, cache loaded, etc).

### Common problem: probes too aggressive

If your probes fail too quickly, Kubernetes will constantly restart your Pod.

**Solution**: Adjust `initialDelaySeconds` to give the application time to initialize.

## 3. Graceful shutdown: shutting down correctly

### The problem

When Kubernetes needs to terminate a Pod (rolling update, scale down), it sends a SIGTERM. If your application doesn't handle this correctly, you can:

- Lose requests in processing
- Not close database connections
- Not save state
- Corrupt data

### The solution

Implement graceful shutdown in your Go application:

```go
// main.go
func main() {
    // Create HTTP server
    srv := &http.Server{
        Addr:    ":8080",
        Handler: mux,
    }

    // Channel to receive system signals
    sigChan := make(chan os.Signal, 1)
    signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

    // Start server in goroutine
    go func() {
        if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            log.Fatalf("server failed: %v", err)
        }
    }()

    // Wait for signal
    <-sigChan
    log.Println("Shutdown initiated...")

    // Create context with timeout for shutdown
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    // Graceful shutdown
    if err := srv.Shutdown(ctx); err != nil {
        log.Fatalf("forced shutdown: %v", err)
    }

    // Close database connections, etc
    db.Close()
    log.Println("Shutdown complete")
}
```

Configure the Pod to give time:

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

### What happens

```
1. Kubernetes sends SIGTERM
2. Your application stops accepting new requests
3. Waits for in-flight requests to finish
4. Closes connections
5. Shuts down gracefully
```

**terminationGracePeriodSeconds**: maximum time Kubernetes waits before forcing kill (SIGKILL).

## 4. Service discovery: finding other services

### The problem

On traditional servers, you can use fixed IPs or known hosts. In Kubernetes, Pods have dynamic IPs. How to find other services?

### The solution

Kubernetes has internal DNS. Use service names:

```go
// Instead of:
dbURL := "postgres://user:pass@192.168.1.10:5432/db"

// Use:
dbURL := "postgres://user:pass@postgres-service:5432/db"
```

Kubernetes DNS resolves automatically:

```
┌─────────────────────────────────┐
│  Service Name                   │
│  postgres-service               │
│  ↓                              │
│  Kubernetes DNS                 │
│  ↓                              │
│  Service IP                     │
│  ↓                              │
│  Load Balancer                  │
│  ↓                              │
│  Service Pods                   │
└─────────────────────────────────┘
```

**Format**: `<service-name>.<namespace>.svc.cluster.local`

For services in the same namespace, you only need the name: `postgres-service`

### Practical example

```go
// config.go
func getDBURL() string {
    // Kubernetes DNS
    host := os.Getenv("DB_HOST")
    if host == "" {
        host = "postgres-service" // Service name
    }
    
    port := os.Getenv("DB_PORT")
    if port == "" {
        port = "5432"
    }
    
    return fmt.Sprintf("postgres://user:pass@%s:%s/db", host, port)
}
```

### Common problem: DNS doesn't resolve

If you're testing locally or in development, Kubernetes DNS doesn't exist.

**Solution**: Use environment variables for development:

```go
host := os.Getenv("DB_HOST")
if host == "" {
    if os.Getenv("KUBERNETES_SERVICE_HOST") != "" {
        // In Kubernetes
        host = "postgres-service"
    } else {
        // Local development
        host = "localhost"
    }
}
```

## 5. Networking and DNS: connectivity issues

### The problem

Your Go application might not be able to connect to other services. Timeouts, connection refused, DNS doesn't resolve.

### Common problems and solutions

**1. DNS doesn't resolve**

```go
// Connectivity test
func testConnection(host string) error {
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()
    
    conn, err := net.DialContext(ctx, "tcp", host)
    if err != nil {
        return fmt.Errorf("could not connect: %v", err)
    }
    conn.Close()
    return nil
}
```

**2. Timeouts too short**

Adjust timeouts for Kubernetes environment:

```go
// HTTP client with adequate timeout
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

**3. Connections aren't reused**

Use connection pooling:

```go
// For database
db.SetMaxOpenConns(25)
db.SetMaxIdleConns(5)
db.SetConnMaxLifetime(5 * time.Minute)
```

### Network debugging

If something doesn't work, check:

```bash
# Inside the Pod
nslookup postgres-service
curl http://postgres-service:5432
ping postgres-service
```

## 6. Resource limits: CPU and memory

### The problem

Without limits, your application can:
- Consume all node CPU
- Exhaust node memory
- Be killed by OOMKiller
- Affect other Pods

### The solution

Configure requests and limits:

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

**Requests**: guaranteed resources (scheduling)

**Limits**: maximum it can use

### GOMAXPROCS and CPU limits

Go uses `GOMAXPROCS` based on available CPUs. In containers with CPU limits, this can be problematic.

**Solution**: Use [automaxprocs](https://github.com/uber-go/automaxprocs):

```go
import _ "go.uber.org/automaxprocs"

func main() {
    // GOMAXPROCS will be automatically adjusted
    // based on container CPU limits
}
```

### Memory limits and GC

With memory limits, Go's GC needs to work harder:

```go
// Adjust GOGC if needed
// GOGC=50 = more aggressive (uses less memory)
// GOGC=100 = default
// GOGC=200 = less aggressive (uses more memory)
```

Monitor memory usage:

```go
var m runtime.MemStats
runtime.ReadMemStats(&m)
log.Printf("Allocated memory: %d MB", m.Alloc/1024/1024)
```

## 7. Logs and observability: what changed

### The problem

On traditional servers, logs go to files. In Kubernetes, Pods are ephemeral. Logs are lost when Pods are recreated.

### The solution

**1. Structured logs (JSON)**

```go
import "github.com/sirupsen/logrus"

logrus.SetFormatter(&logrus.JSONFormatter{})

logrus.WithFields(logrus.Fields{
    "user_id": 123,
    "action": "login",
}).Info("User logged in")
```

**2. Log to stdout/stderr**

Kubernetes automatically captures stdout/stderr:

```go
// Use standard log or logging library
log.Println("Log message")
fmt.Fprintf(os.Stderr, "Error: %v\n", err)
```

**3. Context for tracing**

Use context to propagate trace IDs:

```go
func handleRequest(w http.ResponseWriter, r *http.Request) {
    ctx := r.Context()
    
    // Add trace ID to context
    traceID := r.Header.Get("X-Trace-ID")
    if traceID == "" {
        traceID = generateTraceID()
    }
    ctx = context.WithValue(ctx, "trace_id", traceID)
    
    // Logs include trace ID
    log.WithContext(ctx).Info("Processing request")
}
```

### Observability integration

For metrics, use Prometheus:

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

## Common problems and quick solutions

| Problem | Cause | Solution |
|---------|-------|----------|
| Pod restarts constantly | Liveness probe failing | Increase `initialDelaySeconds` |
| Requests lost on deploy | No graceful shutdown | Implement graceful shutdown |
| Can't connect to other services | DNS doesn't resolve | Use Service names |
| High memory usage | No limits | Configure memory limits |
| CPU not used efficiently | Wrong GOMAXPROCS | Use automaxprocs |
| Logs lost | Logs in files | Log to stdout/stderr |
| Frequent timeouts | Timeouts too short | Adjust network timeouts |

## Conclusion

Migrating to Kubernetes isn't just about deploying. It's about adapting your application to a different environment.

The problems you'll encounter are predictable. And the solutions are known. This guide covers the main ones.

The key is understanding how Kubernetes works and adapting your Go application to this environment. It's not hard, but it requires attention to detail.

And when you do it right, you gain:
- Automatic scalability
- High availability
- Zero-downtime deployments
- Native observability
- Simplified management

It's worth the effort.

## References and sources

### Official documentation

- **[Kubernetes Documentation](https://kubernetes.io/docs/)** - Complete documentation
- **[Kubernetes Best Practices](https://kubernetes.io/docs/concepts/configuration/overview/)** - Official best practices
- **[ConfigMaps](https://kubernetes.io/docs/concepts/configuration/configmap/)** - Configuration management
- **[Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)** - Secrets management
- **[Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)** - Health checks

### Articles and guides

- **[Kubernetes Patterns](https://www.redhat.com/en/topics/containers/kubernetes-patterns)** - Kubernetes patterns
- **[12-Factor App](https://12factor.net/)** - Principles for cloud-native applications
- **[Go Best Practices](https://go.dev/doc/effective_go)** - Effective Go

### Tools

- **[Reloader](https://github.com/stakater/Reloader)** - ConfigMap hot reload
- **[automaxprocs](https://github.com/uber-go/automaxprocs)** - Automatic GOMAXPROCS adjustment
- **[Prometheus Go client](https://github.com/prometheus/client_golang)** - Prometheus metrics

### Example code

- **[Kubernetes Go client](https://github.com/kubernetes/client-go)** - Official Kubernetes client
- **[controller-runtime](https://github.com/kubernetes-sigs/controller-runtime)** - Framework for operators
