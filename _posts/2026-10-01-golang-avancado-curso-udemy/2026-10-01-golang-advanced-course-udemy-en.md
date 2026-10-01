---
layout: post
title: "Advanced Golang: building a real payment processor"
subtitle: "Fraud detection in 8ns, FSM with deterministic fallback, MCP from scratch, pgvector, Kafka, gRPC, and GKE deploy"
author: otavio_celestino
date: 2026-10-01 08:00:00 +0200
categories: [Go, Course]
tags: [go, golang, microservices, grpc, kafka, ai, fraud, gcp, kubernetes, fsm, mcp, pgvector, course, udemy]
comments: true
image: "/assets/img/posts/2026-10-01-golang-avancado-curso.png"
lang: en
original_post: "/golang-avancado-curso-udemy/"
youtube_videos:
  - id: "X02C-HN58ko"
    title: "Youtube video"
---

<style>
.pp { --blue:#3b82f6; --green:#10b981; --amber:#f59e0b;
      --purple:#8b5cf6; --pink:#ec4899; --slate:#334155; }
@keyframes fadeUp  { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:none} }
@keyframes flowDash{ from{stroke-dashoffset:60} to{stroke-dashoffset:0} }
@keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:.5} }
.arch-wrap { overflow-x:auto; margin:2rem 0; }
.arch-wrap svg { width:100%; max-width:780px; display:block; margin:0 auto; }
.flow  { stroke-dasharray:6 4; animation:flowDash 1.1s linear infinite; }
.kpulse{ animation:pulse 2.2s ease-in-out infinite; }
.card  { animation:fadeUp .45s ease both; }
.c1{animation-delay:.10s} .c2{animation-delay:.22s}
.c3{animation-delay:.34s} .c4{animation-delay:.46s} .c5{animation-delay:.58s}
.fsm-wrap { overflow-x:auto; margin:2rem 0; }
.fsm-wrap svg { width:100%; max-width:680px; display:block; margin:0 auto; }
.fsm-state { animation:fadeUp .4s ease both; }
.fsm-state:nth-child(1){animation-delay:.05s} .fsm-state:nth-child(2){animation-delay:.18s}
.fsm-state:nth-child(3){animation-delay:.31s} .fsm-state:nth-child(4){animation-delay:.44s}
.fsm-state:nth-child(5){animation-delay:.57s}
.fsm-flow { stroke-dasharray:5 3; animation:flowDash 1.4s linear infinite; }
.fsm-fallback { stroke-dasharray:4 4; animation:flowDash 1.8s linear infinite reverse; }
.mod-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:.9rem; margin:1.5rem 0; }
.mod-card { background:#0f1117; border:1px solid #1e293b; border-radius:10px; padding:.9rem 1rem; transition:border-color .2s,transform .2s; }
.mod-card:hover { border-color:#3b82f6; transform:translateY(-2px); }
.mod-card .badge { font-size:.65rem; font-family:monospace; background:#1e293b; color:#64748b; padding:2px 7px; border-radius:4px; margin-bottom:.45rem; display:inline-block; }
.mod-card h4 { margin:.3rem 0 .25rem; font-size:.88rem; color:#e2e8f0; }
.mod-card p  { font-size:.78rem; color:#64748b; margin:0; line-height:1.4; }
.int-row { display:flex; flex-wrap:wrap; gap:.7rem; margin:1.2rem 0; }
.int-chip { background:#0f1117; border:1px solid #1e293b; border-radius:6px; padding:.4rem .8rem; font-family:monospace; font-size:.8rem; color:#94a3b8; display:flex; align-items:center; gap:.45rem; }
.int-chip .dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
.dot-opt { background:#10b981; }
</style>

Hey everyone!

Over the past few months I put together a course about building a payment processor in Go. Not a simplified example: four microservices, architecture decisions documented as ADRs, and a full deploy on GKE.

The course is on Udemy: [GoLang Avançado: Microsserviços, gRPC, Kafka e IA Antifraude](https://www.udemy.com/course/golang-avancado-microsservicos-grpc-kafka-ia-antifraude/?referralCode=5D3D655AEF5FF5BE7830).

Here is what is inside.

---

## The complete system

Five components, each with a clear responsibility:

<div class="arch-wrap pp">
<svg viewBox="0 0 780 420" xmlns="http://www.w3.org/2000/svg">
  <rect width="780" height="420" rx="14" fill="#0b0f19"/>
  <text x="390" y="26" text-anchor="middle" font-size="11" fill="#4b5563" font-family="monospace">Payment Processor — overview</text>
  <rect x="14" y="175" width="82" height="46" rx="7" fill="#141b2d" stroke="#334155" stroke-width="1.2"/>
  <text x="55" y="195" text-anchor="middle" font-size="9.5" fill="#94a3b8" font-family="monospace">client</text>
  <text x="55" y="210" text-anchor="middle" font-size="8" fill="#475569" font-family="monospace">HTTP</text>
  <line x1="96" y1="198" x2="126" y2="198" stroke="#3b82f6" stroke-width="1.4" class="flow"/>
  <rect x="14" y="298" width="82" height="46" rx="7" fill="#141b2d" stroke="#334155" stroke-width="1.2"/>
  <text x="55" y="318" text-anchor="middle" font-size="9.5" fill="#94a3b8" font-family="monospace">console</text>
  <text x="55" y="333" text-anchor="middle" font-size="8" fill="#475569" font-family="monospace">:3001</text>
  <line x1="96" y1="321" x2="126" y2="245" stroke="#3b82f6" stroke-width="1.2" class="flow"/>
  <g class="card c1">
    <rect x="126" y="160" width="108" height="76" rx="10" fill="#1a2e50" stroke="#3b82f6" stroke-width="1.5"/>
    <text x="180" y="183" text-anchor="middle" font-size="10.5" fill="#93c5fd" font-family="monospace" font-weight="bold">gateway</text>
    <text x="180" y="198" text-anchor="middle" font-size="8" fill="#60a5fa" font-family="monospace">HTTP + SSE</text>
    <text x="180" y="212" text-anchor="middle" font-size="8" fill="#60a5fa" font-family="monospace">rate limiting</text>
    <text x="180" y="226" text-anchor="middle" font-size="8" fill="#60a5fa" font-family="monospace">gRPC client</text>
    <text x="180" y="237" text-anchor="middle" font-size="7.5" fill="#334155" font-family="monospace">:8080</text>
  </g>
  <line x1="234" y1="183" x2="298" y2="155" stroke="#10b981" stroke-width="1.3" class="flow"/>
  <text x="262" y="160" text-anchor="middle" font-size="7.5" fill="#10b981" font-family="monospace">gRPC</text>
  <line x1="234" y1="213" x2="298" y2="248" stroke="#f59e0b" stroke-width="1.3" class="flow"/>
  <text x="262" y="242" text-anchor="middle" font-size="7.5" fill="#f59e0b" font-family="monospace">gRPC</text>
  <g class="card c2">
    <rect x="298" y="90" width="118" height="100" rx="10" fill="#0d3b2e" stroke="#10b981" stroke-width="1.5"/>
    <text x="357" y="113" text-anchor="middle" font-size="10.5" fill="#6ee7b7" font-family="monospace" font-weight="bold">ledger</text>
    <text x="357" y="128" text-anchor="middle" font-size="8" fill="#34d399" font-family="monospace">double-entry</text>
    <text x="357" y="142" text-anchor="middle" font-size="8" fill="#34d399" font-family="monospace">idempotency</text>
    <text x="357" y="156" text-anchor="middle" font-size="8" fill="#34d399" font-family="monospace">Postgres 16</text>
    <text x="357" y="170" text-anchor="middle" font-size="8" fill="#34d399" font-family="monospace">outbox → Kafka</text>
    <text x="357" y="182" text-anchor="middle" font-size="7.5" fill="#065f46" font-family="monospace">:9001</text>
  </g>
  <g class="card c3">
    <rect x="298" y="222" width="118" height="110" rx="10" fill="#3b1f00" stroke="#f59e0b" stroke-width="1.5"/>
    <text x="357" y="245" text-anchor="middle" font-size="10.5" fill="#fcd34d" font-family="monospace" font-weight="bold">fraud</text>
    <text x="357" y="261" text-anchor="middle" font-size="8" fill="#fbbf24" font-family="monospace">decision tree</text>
    <text x="357" y="275" text-anchor="middle" font-size="8" fill="#fbbf24" font-family="monospace">~8ns per score</text>
    <text x="357" y="289" text-anchor="middle" font-size="8" fill="#fbbf24" font-family="monospace">FSM + fallback</text>
    <text x="357" y="303" text-anchor="middle" font-size="8" fill="#fbbf24" font-family="monospace">semantic cache</text>
    <text x="357" y="318" text-anchor="middle" font-size="7.5" fill="#78350f" font-family="monospace">:9002</text>
  </g>
  <g class="kpulse">
    <rect x="450" y="175" width="100" height="46" rx="8" fill="#130a28" stroke="#8b5cf6" stroke-width="1.5"/>
    <text x="500" y="197" text-anchor="middle" font-size="10" fill="#c4b5fd" font-family="monospace" font-weight="bold">Kafka</text>
    <text x="500" y="212" text-anchor="middle" font-size="8" fill="#a78bfa" font-family="monospace">Redpanda</text>
  </g>
  <line x1="416" y1="148" x2="462" y2="185" stroke="#8b5cf6" stroke-width="1.2" class="flow"/>
  <line x1="416" y1="268" x2="462" y2="213" stroke="#8b5cf6" stroke-width="1.2" class="flow"/>
  <line x1="550" y1="198" x2="598" y2="198" stroke="#ec4899" stroke-width="1.3" class="flow"/>
  <g class="card c4">
    <rect x="598" y="148" width="118" height="110" rx="10" fill="#2d0a1e" stroke="#ec4899" stroke-width="1.5"/>
    <text x="657" y="172" text-anchor="middle" font-size="10.5" fill="#f9a8d4" font-family="monospace" font-weight="bold">investigator</text>
    <text x="657" y="188" text-anchor="middle" font-size="8" fill="#f472b6" font-family="monospace">Claude agent</text>
    <text x="657" y="202" text-anchor="middle" font-size="8" fill="#f472b6" font-family="monospace">MCP server</text>
    <text x="657" y="216" text-anchor="middle" font-size="8" fill="#f472b6" font-family="monospace">pgvector RAG</text>
    <text x="657" y="230" text-anchor="middle" font-size="8" fill="#f472b6" font-family="monospace">Slack + email</text>
    <text x="657" y="250" text-anchor="middle" font-size="7.5" fill="#701a3a" font-family="monospace">Kafka consumer</text>
  </g>
  <g class="card c5">
    <rect x="342" y="362" width="100" height="40" rx="8" fill="#0d1a2d" stroke="#334155" stroke-width="1.2"/>
    <text x="392" y="380" text-anchor="middle" font-size="9" fill="#64748b" font-family="monospace">Postgres 16</text>
    <text x="392" y="394" text-anchor="middle" font-size="7.5" fill="#475569" font-family="monospace">+ pgvector</text>
  </g>
  <line x1="357" y1="190" x2="392" y2="362" stroke="#334155" stroke-width="1" stroke-dasharray="3 3"/>
  <line x1="657" y1="258" x2="440" y2="380" stroke="#334155" stroke-width="1" stroke-dasharray="3 3"/>
  <text x="390" y="408" text-anchor="middle" font-size="9.5" fill="#374151" font-family="monospace">Prometheus + Grafana · GKE (Cloud SQL · Managed Kafka · Managed Prometheus)</text>
</svg>
</div>

---

## Native fraud detection in Go

The fraud service runs in the synchronous authorization path with a budget of around 15ms. The usual setup is a Python sidecar or a dedicated inference server: one more network hop, one more runtime to operate, one more serialization per call.

Gradient boosted trees (the standard model family for tabular fraud data) reduce at inference time to comparisons and additions. Nothing about them requires an ML runtime.

The course implements inference directly in Go. The model is exported as a JSON file of flat node arrays, validated at startup, and walked directly. The scorer allocates nothing on the hot path and sits behind a generic dynamic batcher. The benchmark came out at ~8 nanoseconds per score with zero allocations.

---

## FSM with deterministic fallback

The fraud pipeline has five named states:

<div class="fsm-wrap pp">
<svg viewBox="0 0 680 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="680" height="200" rx="10" fill="#0b0f19"/>
  <text x="340" y="22" text-anchor="middle" font-size="10" fill="#4b5563" font-family="monospace">Fraud pipeline — FSM states</text>
  <g class="fsm-state">
    <rect x="20" y="70" width="98" height="44" rx="8" fill="#1a2e50" stroke="#3b82f6" stroke-width="1.3"/>
    <text x="69" y="90" text-anchor="middle" font-size="9" fill="#93c5fd" font-family="monospace">enrich</text>
    <text x="69" y="105" text-anchor="middle" font-size="7.5" fill="#475569" font-family="monospace">geo + velocity</text>
  </g>
  <g class="fsm-state">
    <rect x="148" y="70" width="98" height="44" rx="8" fill="#1a2e50" stroke="#3b82f6" stroke-width="1.3"/>
    <text x="197" y="90" text-anchor="middle" font-size="9" fill="#93c5fd" font-family="monospace">fast_rules</text>
    <text x="197" y="105" text-anchor="middle" font-size="7.5" fill="#475569" font-family="monospace">blocklist · caps</text>
  </g>
  <g class="fsm-state">
    <rect x="276" y="70" width="98" height="44" rx="8" fill="#3b1f00" stroke="#f59e0b" stroke-width="1.5"/>
    <text x="325" y="90" text-anchor="middle" font-size="9" fill="#fcd34d" font-family="monospace">ml_score</text>
    <text x="325" y="105" text-anchor="middle" font-size="7.5" fill="#78350f" font-family="monospace">tree ~8ns</text>
  </g>
  <g class="fsm-state">
    <rect x="404" y="70" width="108" height="44" rx="8" fill="#130a28" stroke="#8b5cf6" stroke-width="1.3"/>
    <text x="458" y="90" text-anchor="middle" font-size="9" fill="#c4b5fd" font-family="monospace">semantic_tie</text>
    <text x="458" y="105" text-anchor="middle" font-size="7.5" fill="#5b21b6" font-family="monospace">pgvector cache</text>
  </g>
  <g class="fsm-state">
    <rect x="542" y="70" width="98" height="44" rx="8" fill="#0d3b2e" stroke="#10b981" stroke-width="1.3"/>
    <text x="591" y="90" text-anchor="middle" font-size="9" fill="#6ee7b7" font-family="monospace">finalize</text>
    <text x="591" y="105" text-anchor="middle" font-size="7.5" fill="#065f46" font-family="monospace">approve / deny</text>
  </g>
  <line x1="118" y1="92" x2="148" y2="92" stroke="#3b82f6" stroke-width="1.3" class="fsm-flow"/>
  <line x1="246" y1="92" x2="276" y2="92" stroke="#3b82f6" stroke-width="1.3" class="fsm-flow"/>
  <line x1="374" y1="92" x2="404" y2="92" stroke="#8b5cf6" stroke-width="1.3" class="fsm-flow"/>
  <line x1="512" y1="92" x2="542" y2="92" stroke="#10b981" stroke-width="1.3" class="fsm-flow"/>
  <path d="M325 114 Q325 155 591 155 Q591 155 591 114" fill="none" stroke="#ef4444" stroke-width="1.4" class="fsm-fallback"/>
  <text x="458" y="171" text-anchor="middle" font-size="8" fill="#ef4444" font-family="monospace">fallback: degraded → manual review</text>
  <text x="340" y="190" text-anchor="middle" font-size="8.5" fill="#374151" font-family="monospace">every transition recorded with duration and error · loops structurally impossible</text>
</svg>
</div>

The key point about the fallback: if `ml_score` fails or exceeds its budget, the system does not stall the authorization. The handler marks the decision as `degraded`, routes it to manual review, and continues. Availability wins over model coverage, and the degradation is visible in the response instead of being silent.

---

## Generic dynamic batcher

The tree scorer sits behind a batcher that accumulates requests over a short time window before processing them in bulk. The implementation uses generics:

```go
// the batcher is parameterized on request and response types
type Batcher[Req, Resp any] struct {
    window  time.Duration
    process func([]Req) []Resp
    // ...
}

func (b *Batcher[Req, Resp]) Submit(ctx context.Context, req Req) (Resp, error) {
    // groups concurrent calls and dispatches in batch
}
```

The same `Batcher` serves the fraud scorer, embedding calls, and any other hot path that needs batching, without duplicating the windowing logic.

---

## MCP from scratch in Go

The `investigator` exposes three investigation tools:

| Tool | What it does |
|---|---|
| `get_account_history` | payment history for the account |
| `geo_lookup` | IP geolocation (ipapi.co or static) |
| `search_fraud_patterns` | similarity search via pgvector/cosine |

The MCP server is implemented directly on top of `encoding/json` and `stdio`, with no SDK and no external dependencies. The full protocol (JSON-RPC 2.0, `initialize` handshake, tool listing, `tool_call` semantics) is course material.

The same tool registry serves two frontends: the stdio MCP for external clients (any MCP client can connect with `go run ./cmd/investigator --mcp`) and in-process calls for the investigation advisors.

By default, the investigator runs a rule-based advisor. When `ANTHROPIC_API_KEY` is set, the same tool registry is passed to a Claude agent, without changing anything in the registry itself.

---

## Outbox: consistency without two-phase commit

Event publishing is an area where many systems have silent bugs. The problematic sequence:

```
1. BEGIN
2. INSERT payment
3. COMMIT
4. process dies here
5. publish to Kafka  ← never happens
```

The outbox pattern fixes this by writing the event in the same transaction as the payment:

```
1. BEGIN
2. INSERT payment
3. INSERT outbox_events  (same tx)
4. COMMIT
                         ← if the process dies here, the relay recovers on the next poll
5. relay: SELECT unpublished FROM outbox_events
6. publish to Kafka
7. UPDATE outbox_events SET published=true
```

The relay polls every 200ms, publishes, and marks as published after the broker ACKs. At-least-once delivery, idempotent consumers keyed by `payment_id`.

---

## Caches without Redis

Velocity counting and the semantic cache are kept in-process, without Redis. Two reasons from the ADR:

1. A network round-trip on the authorization hot path costs more than the cache saves
2. Redis goes down, authorization degrades

The implementation uses types with manual sharding:

```go
// velocity: sharded TTL map for per-card attempt counting
type VelocityCounter[K comparable] struct {
    shards [N]shard[K]
}

// semantic cache: rolling window of embedding vectors
type SemanticCache struct {
    embeddings []embeddingEntry
    mu         sync.RWMutex
}
```

With multiple fraud replicas, each holds independent state. Load balancing via card fingerprint hash at the gRPC client softens this.

---

## pgvector: similarity search in Postgres

The investigator searches historical similar cases to provide context for the investigation. The decision was to use pgvector in the same Postgres the ledger already uses, rather than spinning up a dedicated vector database.

```sql
-- find the 5 most similar cases by cosine distance
SELECT id, description, decision
FROM fraud_patterns
ORDER BY embedding <=> $1  -- cosine distance operator
LIMIT 5;
```

The index is IVFFlat for approximate nearest neighbor search. The `PatternStore` port isolates the implementation, so swapping to Qdrant means changing one adapter.

---

## Observability

Every service exposes `/metrics` in Prometheus format. Grafana has a dashboard provisioned as code in the repository, and the same manifests run on `docker-compose`, kind, and the GCP cluster.

The operator console (`localhost:3001`) is a pre-built web interface showing the live payment feed and review queue. It connects to the gateway via SSE and degrades progressively: each panel shows a locked state with the course module name that unlocks it.

```bash
make dashboards   # opens Grafana and Prometheus
make demo-feed    # global stream of payments and reviews
```

---

## Optional integrations

Everything runs offline by default. Integrations activate by environment variable:

<div class="int-row pp">
  <div class="int-chip"><span class="dot dot-opt"></span>ANTHROPIC_API_KEY — Claude agent in the investigator</div>
  <div class="int-chip"><span class="dot dot-opt"></span>STRIPE_API_KEY — real charges in test mode</div>
  <div class="int-chip"><span class="dot dot-opt"></span>SLACK_WEBHOOK_URL — investigation reports to Slack</div>
  <div class="int-chip"><span class="dot dot-opt"></span>RESEND_API_KEY — investigation reports by email</div>
  <div class="int-chip"><span class="dot dot-opt"></span>GEO_PROVIDER=ipapi — real geolocation via ipapi.co</div>
</div>

Without any of these keys, the system runs complete with the rule-based advisor, static geo, and no external notifications.

---

## GKE deployment

Terraform provisions two node pools on GKE: a standard pool and a dedicated pool for the fraud service, with taint and autoscaling from 1 to 8 replicas on ARM instances. The database uses Cloud SQL for PostgreSQL 16 with private IP and native pgvector.

```bash
make up           # full local stack with docker-compose
# --- after covering the infra module ---
terraform init && terraform apply   # GKE + Cloud SQL + Managed Kafka
kubectl apply -k deploy/k8s/overlays/gcp
```

---

## ADRs

Every technical decision in the system has an ADR documenting context, decision, and consequences (positive and negative). There are 11 ADRs in the repository, covering everything from the choice of Postgres as the single database to the console as a walking skeleton.

---

## What you will build

<div class="mod-grid pp">
  <div class="mod-card">
    <span class="badge">concurrency</span>
    <h4>Advanced Go</h4>
    <p>Generics, goroutines, channels, sync.RWMutex, context, idiomatic errors, type-parameterized dynamic batcher.</p>
  </div>
  <div class="mod-card">
    <span class="badge">fraud</span>
    <h4>Native inference</h4>
    <p>Decision tree in Go, ~8ns per score, zero allocations on the hot path. No Python sidecar.</p>
  </div>
  <div class="mod-card">
    <span class="badge">architecture</span>
    <h4>Auditable FSM</h4>
    <p>Fraud pipeline modeled as an explicit FSM. Deterministic fallback, per-transition trace, loops structurally impossible.</p>
  </div>
  <div class="mod-card">
    <span class="badge">protocol</span>
    <h4>Protocol Buffers and gRPC</h4>
    <p>Service contracts from scratch. HTTP, SSE, and gRPC in a single gateway. SSE for the operator console.</p>
  </div>
  <div class="mod-card">
    <span class="badge">events</span>
    <h4>Kafka and Outbox</h4>
    <p>Consistency between Postgres and Kafka with outbox, idempotency by payment_id, double-entry accounting.</p>
  </div>
  <div class="mod-card">
    <span class="badge">ai</span>
    <h4>MCP from scratch</h4>
    <p>MCP server in JSON-RPC 2.0 over stdio. Claude agent or rule-based advisor — same tool registry.</p>
  </div>
  <div class="mod-card">
    <span class="badge">database</span>
    <h4>pgvector</h4>
    <p>Similarity search in the same Postgres as the ledger. IVFFlat index, cosine distance, port to swap for Qdrant.</p>
  </div>
  <div class="mod-card">
    <span class="badge">infra</span>
    <h4>GKE + Terraform</h4>
    <p>Kubernetes deploy on GCP. Two node pools, Cloud SQL, Managed Kafka, Grafana provisioned as code.</p>
  </div>
</div>

---

There is a YouTube presentation video if you want to see the system before enrolling: [YouTube presentation](https://www.youtube.com/watch?v=X02C-HN58ko&t=5s).

Course link: [GoLang Avançado: Microsserviços, gRPC, Kafka e IA Antifraude](https://www.udemy.com/course/golang-avancado-microsservicos-grpc-kafka-ia-antifraude/?referralCode=5D3D655AEF5FF5BE7830).

See you in the next post!
