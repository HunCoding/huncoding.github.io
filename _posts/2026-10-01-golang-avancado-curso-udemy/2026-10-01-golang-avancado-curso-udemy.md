---
layout: post
title: "Golang Avançado: construindo um processador de pagamentos de verdade"
subtitle: "Detecção de fraude em 8ns, FSM com fallback determinístico, MCP do zero, pgvector, Kafka, gRPC e deploy no GKE"
author: otavio_celestino
date: 2026-10-01 08:00:00 +0200
categories: [Go, Curso]
tags: [go, golang, microsservicos, grpc, kafka, ia, antifraude, gcp, kubernetes, fsm, mcp, pgvector, curso, udemy]
comments: true
image: "/assets/img/posts/2026-10-01-golang-avancado-curso.png"
lang: pt-BR
youtube_videos:
  - id: "X02C-HN58ko"
    title: "Vídeo no Youtube"
---

<style>
/* ── reset e paleta ─────────────────────────────────────────── */
.pp { --blue:#3b82f6; --green:#10b981; --amber:#f59e0b;
      --purple:#8b5cf6; --pink:#ec4899; --slate:#334155; }

/* ── animações base ─────────────────────────────────────────── */
@keyframes fadeUp  { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:none} }
@keyframes flowDash{ from{stroke-dashoffset:60} to{stroke-dashoffset:0} }
@keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:.5} }
@keyframes spinIn  { from{stroke-dashoffset:125} to{stroke-dashoffset:0} }

/* ── diagrama de arquitetura ────────────────────────────────── */
.arch-wrap { overflow-x:auto; margin:2rem 0; }
.arch-wrap svg { width:100%; max-width:780px; display:block; margin:0 auto; }
.flow  { stroke-dasharray:6 4; animation:flowDash 1.1s linear infinite; }
.kpulse{ animation:pulse 2.2s ease-in-out infinite; }
.card  { animation:fadeUp .45s ease both; }
.c1{animation-delay:.10s} .c2{animation-delay:.22s}
.c3{animation-delay:.34s} .c4{animation-delay:.46s}
.c5{animation-delay:.58s}

/* ── pipeline FSM ───────────────────────────────────────────── */
.fsm-wrap { overflow-x:auto; margin:2rem 0; }
.fsm-wrap svg { width:100%; max-width:680px; display:block; margin:0 auto; }
.fsm-state { animation:fadeUp .4s ease both; }
.fsm-state:nth-child(1){animation-delay:.05s}
.fsm-state:nth-child(2){animation-delay:.18s}
.fsm-state:nth-child(3){animation-delay:.31s}
.fsm-state:nth-child(4){animation-delay:.44s}
.fsm-state:nth-child(5){animation-delay:.57s}
.fsm-flow { stroke-dasharray:5 3; animation:flowDash 1.4s linear infinite; }
.fsm-fallback { stroke-dasharray:4 4; animation:flowDash 1.8s linear infinite reverse; }

/* ── cards de módulos ───────────────────────────────────────── */
.mod-grid {
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(200px,1fr));
  gap:.9rem; margin:1.5rem 0;
}
.mod-card {
  background:#0f1117; border:1px solid #1e293b; border-radius:10px;
  padding:.9rem 1rem; transition:border-color .2s,transform .2s;
}
.mod-card:hover { border-color:#3b82f6; transform:translateY(-2px); }
.mod-card .badge {
  font-size:.65rem; font-family:monospace; background:#1e293b;
  color:#64748b; padding:2px 7px; border-radius:4px;
  margin-bottom:.45rem; display:inline-block;
}
.mod-card h4 { margin:.3rem 0 .25rem; font-size:.88rem; color:#e2e8f0; }
.mod-card p  { font-size:.78rem; color:#64748b; margin:0; line-height:1.4; }

/* ── integrações ────────────────────────────────────────────── */
.int-row {
  display:flex; flex-wrap:wrap; gap:.7rem; margin:1.2rem 0;
}
.int-chip {
  background:#0f1117; border:1px solid #1e293b; border-radius:6px;
  padding:.4rem .8rem; font-family:monospace; font-size:.8rem; color:#94a3b8;
  display:flex; align-items:center; gap:.45rem;
}
.int-chip .dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
.dot-opt { background:#10b981; }
.dot-off { background:#334155; }
</style>

E aí, pessoal!

Nos últimos meses montei um curso sobre como construir um processador de pagamentos em Go. Não um exemplo simplificado: um sistema com quatro microsserviços, decisões de arquitetura documentadas em ADRs e deploy completo no GKE.

O resultado está na Udemy: [GoLang Avançado: Microsserviços, gRPC, Kafka e IA Antifraude](https://www.udemy.com/course/golang-avancado-microsservicos-grpc-kafka-ia-antifraude/?referralCode=5D3D655AEF5FF5BE7830).

Vou detalhar o que está lá dentro.

---

## O sistema completo

Cinco componentes, cada um com uma responsabilidade clara:

<div class="arch-wrap pp">
<svg viewBox="0 0 780 420" xmlns="http://www.w3.org/2000/svg">
  <rect width="780" height="420" rx="14" fill="#0b0f19"/>
  <text x="390" y="26" text-anchor="middle" font-size="11" fill="#4b5563" font-family="monospace">Payment Processor — visão geral</text>

  <!-- Client -->
  <rect x="14" y="175" width="82" height="46" rx="7" fill="#141b2d" stroke="#334155" stroke-width="1.2"/>
  <text x="55" y="195" text-anchor="middle" font-size="9.5" fill="#94a3b8" font-family="monospace">cliente</text>
  <text x="55" y="210" text-anchor="middle" font-size="8" fill="#475569" font-family="monospace">HTTP</text>
  <line x1="96" y1="198" x2="126" y2="198" stroke="#3b82f6" stroke-width="1.4" class="flow"/>

  <!-- Console -->
  <rect x="14" y="298" width="82" height="46" rx="7" fill="#141b2d" stroke="#334155" stroke-width="1.2"/>
  <text x="55" y="318" text-anchor="middle" font-size="9.5" fill="#94a3b8" font-family="monospace">console</text>
  <text x="55" y="333" text-anchor="middle" font-size="8" fill="#475569" font-family="monospace">:3001</text>
  <line x1="96" y1="321" x2="126" y2="245" stroke="#3b82f6" stroke-width="1.2" class="flow"/>

  <!-- Gateway -->
  <g class="card c1">
    <rect x="126" y="160" width="108" height="76" rx="10" fill="#1a2e50" stroke="#3b82f6" stroke-width="1.5"/>
    <text x="180" y="183" text-anchor="middle" font-size="10.5" fill="#93c5fd" font-family="monospace" font-weight="bold">gateway</text>
    <text x="180" y="198" text-anchor="middle" font-size="8" fill="#60a5fa" font-family="monospace">HTTP + SSE</text>
    <text x="180" y="212" text-anchor="middle" font-size="8" fill="#60a5fa" font-family="monospace">rate limiting</text>
    <text x="180" y="226" text-anchor="middle" font-size="8" fill="#60a5fa" font-family="monospace">gRPC client</text>
    <text x="180" y="237" text-anchor="middle" font-size="7.5" fill="#334155" font-family="monospace">:8080</text>
  </g>

  <!-- gw → ledger -->
  <line x1="234" y1="183" x2="298" y2="155" stroke="#10b981" stroke-width="1.3" class="flow"/>
  <text x="262" y="160" text-anchor="middle" font-size="7.5" fill="#10b981" font-family="monospace">gRPC</text>
  <!-- gw → fraud -->
  <line x1="234" y1="213" x2="298" y2="248" stroke="#f59e0b" stroke-width="1.3" class="flow"/>
  <text x="262" y="242" text-anchor="middle" font-size="7.5" fill="#f59e0b" font-family="monospace">gRPC</text>

  <!-- Ledger -->
  <g class="card c2">
    <rect x="298" y="90" width="118" height="100" rx="10" fill="#0d3b2e" stroke="#10b981" stroke-width="1.5"/>
    <text x="357" y="113" text-anchor="middle" font-size="10.5" fill="#6ee7b7" font-family="monospace" font-weight="bold">ledger</text>
    <text x="357" y="128" text-anchor="middle" font-size="8" fill="#34d399" font-family="monospace">dupla entrada</text>
    <text x="357" y="142" text-anchor="middle" font-size="8" fill="#34d399" font-family="monospace">idempotência</text>
    <text x="357" y="156" text-anchor="middle" font-size="8" fill="#34d399" font-family="monospace">Postgres 16</text>
    <text x="357" y="170" text-anchor="middle" font-size="8" fill="#34d399" font-family="monospace">outbox → Kafka</text>
    <text x="357" y="182" text-anchor="middle" font-size="7.5" fill="#065f46" font-family="monospace">:9001</text>
  </g>

  <!-- Fraud -->
  <g class="card c3">
    <rect x="298" y="222" width="118" height="110" rx="10" fill="#3b1f00" stroke="#f59e0b" stroke-width="1.5"/>
    <text x="357" y="245" text-anchor="middle" font-size="10.5" fill="#fcd34d" font-family="monospace" font-weight="bold">fraud</text>
    <text x="357" y="261" text-anchor="middle" font-size="8" fill="#fbbf24" font-family="monospace">árvore de decisão</text>
    <text x="357" y="275" text-anchor="middle" font-size="8" fill="#fbbf24" font-family="monospace">~8ns por score</text>
    <text x="357" y="289" text-anchor="middle" font-size="8" fill="#fbbf24" font-family="monospace">FSM + fallback</text>
    <text x="357" y="303" text-anchor="middle" font-size="8" fill="#fbbf24" font-family="monospace">cache semântico</text>
    <text x="357" y="318" text-anchor="middle" font-size="7.5" fill="#78350f" font-family="monospace">:9002</text>
  </g>

  <!-- Kafka -->
  <g class="kpulse">
    <rect x="450" y="175" width="100" height="46" rx="8" fill="#130a28" stroke="#8b5cf6" stroke-width="1.5"/>
    <text x="500" y="197" text-anchor="middle" font-size="10" fill="#c4b5fd" font-family="monospace" font-weight="bold">Kafka</text>
    <text x="500" y="212" text-anchor="middle" font-size="8" fill="#a78bfa" font-family="monospace">Redpanda</text>
  </g>

  <!-- ledger → kafka -->
  <line x1="416" y1="148" x2="462" y2="185" stroke="#8b5cf6" stroke-width="1.2" class="flow"/>
  <!-- fraud → kafka -->
  <line x1="416" y1="268" x2="462" y2="213" stroke="#8b5cf6" stroke-width="1.2" class="flow"/>
  <!-- kafka → investigator -->
  <line x1="550" y1="198" x2="598" y2="198" stroke="#ec4899" stroke-width="1.3" class="flow"/>

  <!-- Investigator -->
  <g class="card c4">
    <rect x="598" y="148" width="118" height="110" rx="10" fill="#2d0a1e" stroke="#ec4899" stroke-width="1.5"/>
    <text x="657" y="172" text-anchor="middle" font-size="10.5" fill="#f9a8d4" font-family="monospace" font-weight="bold">investigator</text>
    <text x="657" y="188" text-anchor="middle" font-size="8" fill="#f472b6" font-family="monospace">agente Claude</text>
    <text x="657" y="202" text-anchor="middle" font-size="8" fill="#f472b6" font-family="monospace">MCP server</text>
    <text x="657" y="216" text-anchor="middle" font-size="8" fill="#f472b6" font-family="monospace">pgvector RAG</text>
    <text x="657" y="230" text-anchor="middle" font-size="8" fill="#f472b6" font-family="monospace">Slack + email</text>
    <text x="657" y="250" text-anchor="middle" font-size="7.5" fill="#701a3a" font-family="monospace">Kafka consumer</text>
  </g>

  <!-- Postgres -->
  <g class="card c5">
    <rect x="342" y="362" width="100" height="40" rx="8" fill="#0d1a2d" stroke="#334155" stroke-width="1.2"/>
    <text x="392" y="380" text-anchor="middle" font-size="9" fill="#64748b" font-family="monospace">Postgres 16</text>
    <text x="392" y="394" text-anchor="middle" font-size="7.5" fill="#475569" font-family="monospace">+ pgvector</text>
  </g>
  <line x1="357" y1="190" x2="392" y2="362" stroke="#334155" stroke-width="1" stroke-dasharray="3 3"/>
  <line x1="657" y1="258" x2="440" y2="380" stroke="#334155" stroke-width="1" stroke-dasharray="3 3"/>

  <!-- rodapé -->
  <text x="390" y="408" text-anchor="middle" font-size="9.5" fill="#374151" font-family="monospace">Prometheus + Grafana · GKE (Cloud SQL · Managed Kafka · Managed Prometheus)</text>
</svg>
</div>

---

## Detecção de fraude nativa em Go

O serviço de fraude roda no caminho síncrono de autorização com um budget de cerca de 15ms. O setup usual é um sidecar Python ou um servidor de inferência separado: mais um hop de rede, mais um runtime pra operar, mais uma serialização por chamada.

Gradient boosted trees (o modelo padrão pra dados tabulares de fraude) se reduzem, em inferência, a comparações e somas. Não tem nada que exija um runtime de ML.

O curso implementa a inferência diretamente em Go. O modelo é exportado como um arquivo JSON de arrays planos de nós, validado no startup, e percorrido diretamente. O scorer não aloca nada no hot path e senta atrás de um dynamic batcher genérico. O benchmark registrou ~8 nanosegundos por score com zero alocações.

---

## FSM com fallback determinístico

O pipeline de fraude tem cinco estados, cada um com um handler nomeado:

<div class="fsm-wrap pp">
<svg viewBox="0 0 680 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="680" height="200" rx="10" fill="#0b0f19"/>
  <text x="340" y="22" text-anchor="middle" font-size="10" fill="#4b5563" font-family="monospace">Pipeline de fraude — estados FSM</text>

  <!-- estados -->
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
    <text x="325" y="105" text-anchor="middle" font-size="7.5" fill="#78350f" font-family="monospace">árvore ~8ns</text>
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

  <!-- setas happy path -->
  <line x1="118" y1="92" x2="148" y2="92" stroke="#3b82f6" stroke-width="1.3" class="fsm-flow"/>
  <line x1="246" y1="92" x2="276" y2="92" stroke="#3b82f6" stroke-width="1.3" class="fsm-flow"/>
  <line x1="374" y1="92" x2="404" y2="92" stroke="#8b5cf6" stroke-width="1.3" class="fsm-flow"/>
  <line x1="512" y1="92" x2="542" y2="92" stroke="#10b981" stroke-width="1.3" class="fsm-flow"/>

  <!-- fallback ml_score → finalize (curva embaixo) -->
  <path d="M325 114 Q325 155 591 155 Q591 155 591 114" fill="none" stroke="#ef4444" stroke-width="1.4" class="fsm-fallback"/>
  <text x="458" y="171" text-anchor="middle" font-size="8" fill="#ef4444" font-family="monospace">fallback: degraded → manual review</text>

  <!-- legenda trace -->
  <text x="340" y="190" text-anchor="middle" font-size="8.5" fill="#374151" font-family="monospace">cada transição gravada com duração e erro · loops estruturalmente impossíveis</text>
</svg>
</div>

O ponto chave do fallback: se o `ml_score` falha ou estoura o budget, o sistema não trava a autorização. O handler marca a decisão como `degraded`, roteia para revisão manual e segue. Disponibilidade ganha sobre cobertura do modelo, e a degradação aparece na resposta em vez de ser silenciosa.

---

## Dynamic batcher genérico

O scorer de árvore fica atrás de um batcher que acumula requisições por uma janela de tempo curta antes de processar em lote. A implementação usa generics:

```go
// o batcher é parametrizado nos tipos de request e response
type Batcher[Req, Resp any] struct {
    window  time.Duration
    process func([]Req) []Resp
    // ...
}

func (b *Batcher[Req, Resp]) Submit(ctx context.Context, req Req) (Resp, error) {
    // agrupa chamadas concorrentes e despacha em lote
}
```

O mesmo `Batcher` serve o scorer de fraude, chamadas de embedding e qualquer outro hot path que precise de batching, sem duplicar a lógica de janelamento.

---

## MCP do zero em Go

O `investigator` expõe três ferramentas de investigação:

| Ferramenta | O que faz |
|---|---|
| `get_account_history` | histórico de pagamentos da conta |
| `geo_lookup` | geolocalização de IP (ipapi.co ou static) |
| `search_fraud_patterns` | similarity search via pgvector/cosine |

O servidor MCP foi implementado diretamente sobre `encoding/json` e `stdio`, sem SDK e sem dependências externas. O protocolo inteiro (JSON-RPC 2.0, handshake de `initialize`, listagem de ferramentas, semântica de `tool_call`) é código do curso.

O mesmo registry de ferramentas serve dois frontends: o stdio MCP para clientes externos (qualquer cliente MCP pode se conectar com `go run ./cmd/investigator --mcp`) e chamadas in-process para os advisors de investigação.

Por padrão, o investigator roda um advisor baseado em regras. Quando `ANTHROPIC_API_KEY` está configurada, o mesmo registry de ferramentas é passado para um agente Claude — sem mudar uma linha no registro de ferramentas.

---

## Outbox: consistência sem two-phase commit

O padrão de publicação de eventos é um ponto onde muitos sistemas têm bugs silenciosos. A sequência problemática:

```
1. BEGIN
2. INSERT payment
3. COMMIT
4. processo morre aqui
5. publish to Kafka  ← nunca acontece
```

O outbox resolve escrevendo o evento na mesma transação do pagamento:

```
1. BEGIN
2. INSERT payment
3. INSERT outbox_events (mesmo tx)
4. COMMIT
                     ← se morrer aqui, o relay recupera na próxima poll
5. relay: SELECT unpublished FROM outbox_events
6. publish to Kafka
7. UPDATE outbox_events SET published=true
```

O relay consulta a cada 200ms, publica e marca como publicado depois do ACK do broker. Delivery at-least-once, consumidores idempotentes keyed por `payment_id`.

---

## Cache sem Redis

Velocidade e cache semântico ficam in-process, sem Redis. Duas razões documentadas no ADR:

1. Um round-trip de rede no hot path de autorização custa mais do que o cache economiza
2. Redis fica indisponível, autorização degrada

A implementação usa tipos com sharding manual:

```go
// velocity: sharded TTL map para contagem de tentativas por cartão
type VelocityCounter[K comparable] struct {
    shards [N]shard[K]
}

// cache semântico: rolling window de vetores de embedding
type SemanticCache struct {
    embeddings []embeddingEntry
    mu         sync.RWMutex
}
```

Com múltiplas réplicas do serviço de fraude, cada uma tem estado independente. O balanceamento de carga via hash de fingerprint do cartão no gRPC client suaviza isso.

---

## pgvector: similarity search no Postgres

O investigator busca casos históricos similares para contextualizar a investigação. A decisão foi usar pgvector no mesmo Postgres que o ledger já usa (ADR 0002), em vez de subir um banco vetorial separado.

```sql
-- busca os 5 casos mais similares por cosine distance
SELECT id, description, decision
FROM fraud_patterns
ORDER BY embedding <=> $1  -- cosine distance operator
LIMIT 5;
```

O índice é IVFFlat para busca aproximada. O port `PatternStore` isola a implementação, então trocar por Qdrant é mudar um adapter.

---

## Observabilidade

Cada serviço expõe `/metrics` no formato Prometheus. O Grafana tem um dashboard provisionado como código no repositório — os mesmos manifestos rodam no `docker-compose`, no kind e no cluster do GCP.

O console do operador (`localhost:3001`) é uma interface web pré-construída que mostra o feed ao vivo de pagamentos e casos de revisão. Ele se conecta via SSE ao gateway e degrada progressivamente: cada painel mostra um estado bloqueado com o nome do módulo do curso que o desbloqueia.

```bash
make dashboards   # abre Grafana e Prometheus
make demo-feed    # stream global de pagamentos e revisões
```

---

## Integrações opcionais

Tudo roda offline por padrão. As integrações ativam por variável de ambiente:

<div class="int-row pp">
  <div class="int-chip"><span class="dot dot-opt"></span>ANTHROPIC_API_KEY: agente Claude no investigator</div>
  <div class="int-chip"><span class="dot dot-opt"></span>STRIPE_API_KEY: cobranças reais no test mode</div>
  <div class="int-chip"><span class="dot dot-opt"></span>SLACK_WEBHOOK_URL: relatórios de investigação no Slack</div>
  <div class="int-chip"><span class="dot dot-opt"></span>RESEND_API_KEY: relatórios por email</div>
  <div class="int-chip"><span class="dot dot-opt"></span>GEO_PROVIDER=ipapi: geolocalização real via ipapi.co</div>
</div>

Sem nenhuma dessas chaves, o sistema funciona completo com o advisor baseado em regras, geo estático e sem notificações externas.

---

## Deploy no GKE

O Terraform provisiona dois node pools no GKE: um pool padrão e um pool dedicado para o serviço de fraude, com taint e autoscaling de 1 a 8 réplicas em instâncias ARM. O banco usa Cloud SQL for PostgreSQL 16 com IP privado e pgvector nativo.

```bash
make up           # stack local completo com docker-compose
# --- depois de cobrir o módulo de infra ---
terraform init && terraform apply   # GKE + Cloud SQL + Managed Kafka
kubectl apply -k deploy/k8s/overlays/gcp
```

---

## ADRs

Cada decisão técnica do sistema tem um ADR documentando contexto, decisão e consequências (positivas e negativas). São 11 ADRs no repositório, cobrindo desde a escolha do Postgres como banco único até o console como walking skeleton.

---

## O que você vai construir

<div class="mod-grid pp">
  <div class="mod-card">
    <span class="badge">concorrência</span>
    <h4>Go avançado</h4>
    <p>Generics, goroutines, channels, sync.RWMutex, context, erros idiomáticos, dynamic batcher parametrizado por tipo.</p>
  </div>
  <div class="mod-card">
    <span class="badge">fraude</span>
    <h4>Inferência nativa</h4>
    <p>Árvore de decisão em Go, ~8ns por score, zero alocações no hot path. Sem sidecar Python.</p>
  </div>
  <div class="mod-card">
    <span class="badge">arquitetura</span>
    <h4>FSM auditável</h4>
    <p>Pipeline de fraude modelado como FSM explícita. Fallback determinístico, trace por transição, loops impossíveis.</p>
  </div>
  <div class="mod-card">
    <span class="badge">protocolo</span>
    <h4>Protocol Buffers e gRPC</h4>
    <p>Contratos entre serviços do zero. HTTP, SSE e gRPC num único gateway. SSE para o console do operador.</p>
  </div>
  <div class="mod-card">
    <span class="badge">eventos</span>
    <h4>Kafka e Outbox</h4>
    <p>Consistência entre Postgres e Kafka com outbox, idempotência por payment_id, dupla entrada contábil.</p>
  </div>
  <div class="mod-card">
    <span class="badge">ia</span>
    <h4>MCP do zero</h4>
    <p>Servidor MCP em JSON-RPC 2.0 sobre stdio. Agente Claude ou advisor baseado em regras — mesmo registry.</p>
  </div>
  <div class="mod-card">
    <span class="badge">banco</span>
    <h4>pgvector</h4>
    <p>Similarity search no mesmo Postgres do ledger. IVFFlat index, cosine distance, port para trocar por Qdrant.</p>
  </div>
  <div class="mod-card">
    <span class="badge">infra</span>
    <h4>GKE + Terraform</h4>
    <p>Deploy em Kubernetes na GCP. Dois node pools, Cloud SQL, Managed Kafka, Grafana provisionado como código.</p>
  </div>
</div>

---

Tem um vídeo de apresentação se quiser ver o sistema antes de entrar: [apresentação no YouTube](https://www.youtube.com/watch?v=X02C-HN58ko&t=5s).

Link direto para o curso: [GoLang Avançado: Microsserviços, gRPC, Kafka e IA Antifraude](https://www.udemy.com/course/golang-avancado-microsservicos-grpc-kafka-ia-antifraude/?referralCode=5D3D655AEF5FF5BE7830).

Até o próximo post!
