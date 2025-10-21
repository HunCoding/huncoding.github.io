---
layout: post
title: "Why Go's Cold Start in AWS Lambda is Still Underestimated"
subtitle: "Real data, practical experiments, and deep analysis of a persistent myth in the Go ecosystem"
date: 2025-10-20 20:00:00 -0300
categories: [Go, Serverless, Performance, DevOps, AWS]
tags: [go, aws, lambda, cold-start, performance, observability, graviton, provisioned-concurrency, benchmarking]
author: otavio_celestino
lang: en
image: "/assets/img/posts/2025-10-20-lambda-golang-coldstart.png"
original_post: "/por-que-o-cold-start-do-go-no-aws-lambda-ainda-e-subestimado/"
---

Hey everyone!

This post is a **deep dive** into a very common myth in the Go ecosystem: **"Go doesn't have cold start"**.

Spoiler: *Go tends to be faster than Node/Python in many scenarios, but Go's cold start **exists**, varies significantly, and has technical causes that many people ignore.*

I'll show real data, explain why, and finish with practical recommendations you can apply today to your pipeline.

## **Summary**

* **Central observation:** Go tends to have smaller *init durations* than Node.js in simple functions, but still suffers from cold starts that can be relevant for latency-sensitive APIs. Published evidence shows typical `Init Duration` of ~**40 ms** for Go (128MB) in public benchmarks, compared to >100ms for Node in similar scenarios.

* **Main causes:** artifact size (zip/image), dependencies, packaging method (zip vs container), architecture (x86 vs ARM/Graviton), and runtime + init code initialization.

* **Real tools/mitigations:** reduce binary size, `GOOS=linux GOARCH=arm64` with Graviton, minimal images (scratch/distroless), `Provisioned Concurrency`, and instrumentation to measure `Init Duration` via CloudWatch Logs/X-Ray.

---

## **What is "Init Duration" (what we actually measure)**

When we talk about *cold start* in AWS Lambda, the number that appears in REPORT logs as **Init Duration** is the metric of interest: it represents the time spent in the **initialization phase** (container creation, runtime loading, code download/extraction, and dependency resolution) before your function starts executing.

In production, this is the extra latency presented to the end user when the invocation happened in a newly created environment.

> **Important Insight**
> 
> Many developers only measure API response time, but this includes both Init Duration and execution time. To optimize cold starts, we need to focus specifically on Init Duration.

---

## **Real Data: What Benchmarks Show**

### **Go / Node / Rust Comparison (2024 Benchmark)**

A reproducible benchmark comparing simple functions (parse JSON + response) showed interesting results:

| Runtime | Avg Exec (ms) | Avg Init (ms) |
|---|---:|---:|
| **Rust** | ~1.1 ms | ~20–25 ms |
| **Go** | ~1.3 ms | ~35–50 ms |
| **Java** | ~2–5 ms | ~200–1000+ ms |
| **Node.js** | ~20 ms | ~120–200+ ms |
| **Python** | ~5–10 ms | ~100–300+ ms |

## Main findings (based on the new table)

1. **Rust leads with the lowest absolute cold start** — in known tests, it's the runtime that most frequently presents *Init Duration* below 30 ms.

2. **Go maintains consistent advantage over interpreted runtimes** — even though it's not "zero", Go's cold start tends to stay in the range of a few tens of ms, below Python/Node/Java in equivalent scenarios.

3. **Java is the worst in cold start**, even when delivering very fast executions after initialization. The JVM is expensive in bootstrap and can easily exceed 500–1000 ms of init in real scenarios, which is why SnapStart/Provisioned Concurrency are practically mandatory when latency matters.

4. **Node and Python suffer from two combined reasons**: interpreter + typical dependency weight. In serverless systems with cold invocations, they frequently present init in the hundreds of ms range.

5. **The difference is not academic** — if your API depends on <100ms response in P99/P999, a cold start of 150–400ms is enough to break SLA even with fast execution.

### **Thesis "Size is (almost) all that matters"**

Experiments that swept functions with sizes from 1 KB to tens of MB show that **artifact size impacts linearly** on cold start time. Node.js can go from ~171 ms to several seconds as the package grows.

> **Data Conclusion**
> 
> Reducing artifact size is one of the most effective levers to cut init durations.

---

## **Why is There Still Cold Start in Go? (Technical Causes)**

- ## Download / Unpack of Artifact
    - More bytes = more time in INIT phase
    - Large Go binaries (dependencies, embedded assets, debug info) increase time
    - **Strong correlation** between size and init duration

- ## Runtime Initialization
    - Lambda runtime loads environment, handlers
    - For custom runtimes and container images there may be extra overhead
    - Even compiled binaries need to execute global initializers

- ## App Initialization Code
    - Logic in `init()` or global variables
    - DB connections, config loading, SDK clients
    - Executed during INIT and pushes time up

- ## Packaging Format
    - Large container images (ECR pull) cost more than small zip
    - Optimized images (scratch/distroless + multi-stage) reduce latency

- ## CPU Architecture (x86 vs ARM/Graviton)
    - Migrating to ARM (Graviton2/Graviton3) reduces cost and improves work/$
    - In some cases of large container images, pull can increase init
    - **AWS tests showed average gains with Graviton**

---

## **Measurement Methodology (Reproducible)**

> **Fundamental Principle**
> 
> Measure *Init Duration* (CloudWatch REPORT) — not just API response time. Use CloudWatch Logs Insights / X-Ray to separate INIT from EXECUTION.

### **Minimal Deploy (Practical Example)**

**Simple handler (main.go):**

```go
package main

import (
  "context"
  "github.com/aws/aws-lambda-go/lambda"
)

func Handler(ctx context.Context, ev map[string]interface{}) (map[string]string, error) {
  return map[string]string{"msg":"hello"}, nil
}

func main() { lambda.Start(Handler) }
```

**Build (zip / managed runtime):**

```bash
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o bootstrap main.go
zip function.zip bootstrap
# deploy via AWS CLI / SAM / Terraform
```

**Build for ARM (Graviton) container image (multi-stage):**

```dockerfile
# builder
FROM golang:1.21-alpine AS build
WORKDIR /src
COPY . .
RUN GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/bootstrap main.go

# final
FROM public.ecr.aws/lambda/provided:al2
COPY --from=build /out/bootstrap /var/task/bootstrap
CMD [ "bootstrap" ]
```

> **Important Tip**
> 
> `-ldflags "-s -w"` reduces the binary (removes debug symbols) and usually cuts a few KBs — always useful for cold starts.

### **Force Cold Starts for Testing**

1. Deploy the version
2. Wait 10+ minutes (or do `UpdateFunctionConfiguration` to force recycling)
3. Execute `aws lambda invoke --function-name myfunc /dev/null` and check logs
4. Repeat 10x with wait to force cold starts

### **CloudWatch Logs Insights Query**

Paste this query in CloudWatch Logs Insights in the function's log group:

```sql
fields @timestamp, @message
| filter @message like /REPORT/
| parse @message /Init Duration: (?<init>[\d\.]+) ms/
| stats avg(toNumber(init)) as avgInit, max(toNumber(init)) as maxInit, count() as invocations by bin(1h)
| sort avgInit desc
```

This gives you average / maximum of `Init Duration` — exactly what we want to compare.

---

## **Experiment Matrix (Recommended)**

Execute sweep crossing:

* **Memory**: 128, 256, 512, 1024 MB
* **Package**: zip (runtime) vs container image (distroless)
* **Architecture**: x86_64 vs arm64 (Graviton)
* **Init Code**: trivial vs `init()` that connects to a DB (simulate delay)
* **Provisioned**: on/off

**Main metric:** Init Duration  
**Secondary metrics:** Exec Duration, Max Memory Used, cost per 1M requests

> **Advanced Tip**
> 
> Use **AWS Lambda Power Tuning** to automate memory vs duration/cost sweep.

---

## **Typical Results (What to Expect)**

Based on public benchmarks and practical experience:

* **Go (zip) with lean binary: Init ≈ 20–70 ms** in many regions with low memory (128–256 MB) for trivial functions
* **Node.js** in equivalent situations usually presents **init >100 ms** in many setups
* **Size impact**: increasing "code size" from KB → MB can amplify init durations by hundreds of ms to seconds
* **ARM/Graviton**: usually brings **improvement in performance and cost**, but needs case-by-case validation

---

## **Practical Mitigations (What Really Works)**

- ## Make the Binary Smaller
    - `-ldflags "-s -w"`, strip symbols, remove embedded assets
    - Minimize dependencies
    - Prefer layer/shared libs only when reducing total transferred

- ## Avoid Heavy Work in `init()`
    - Defer connections (lazy init) — open connection on demand in first request
    - If you need to pre-initialize, use **Provisioned Concurrency** to keep environments ready

- ## Choose ARM/Graviton When It Makes Sense
    - In many tests ARM reduces cost and improves work/$
    - Migration usually pays off, but validate with your workloads

- ## Use Minimal Images for Container Images
    - Multi-stage build → distroless/scratch
    - Minimize layers and content (remove apt, docs, etc.)
    - Pull time + image size affect cold start

- ## Provisioned Concurrency / SnapStart
    - `Provisioned Concurrency` eliminates observable cold start for covered invocations
    - SnapStart improves long initialization cases, but **is not** supported for all runtimes

- ## Monitor and Alert
    - Alert on SLO for p95/p99 of `Init Duration`
    - Instrument with OpenTelemetry/X-Ray to identify specific causes

---

## **Production Checklist**

* [ ] Build with `-ldflags "-s -w"` and `CGO_ENABLED=0`
* [ ] Test ARM version (`GOARCH=arm64`) and x86; validate cost/perf
* [ ] Remove unused dependencies; review vendor
* [ ] Move assets >1KB to S3/Layers when it makes sense
* [ ] Ensure lazy init of DB/clients
* [ ] Add CloudWatch Logs Insights query to runbook
* [ ] If API is sensitive to interactive latency, configure Provisioned Concurrency

---

## References

* **[AWS — Understanding and Remediating Cold Starts](https://aws.amazon.com/blogs/compute/understanding-and-remediating-cold-starts-an-aws-lambda-perspective/)** — official explanation of phases, SnapStart, Provisioned Concurrency
* **[Size is (almost) all that matters for optimizing AWS Lambda cold starts](https://medium.com/%40adtanasa/size-is-almost-all-that-matters-for-optimizing-aws-lambda-cold-starts-cad54f65cbb)** — extensive experiment on size impact
* **[Benchmark: Go / Node / Rust comparison](https://nebjak.dev/blog/benchmarking-aws-lambda-with-node-js-go-and-rust/)** — shows real `Init Duration` for simple functions
* **[lambda-perf (public dashboard)](https://maxday.github.io/lambda-perf/)** — panel with cold start runs by runtime
