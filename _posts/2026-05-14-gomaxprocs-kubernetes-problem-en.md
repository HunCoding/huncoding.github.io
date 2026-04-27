---
layout: post
title: "GOMAXPROCS and Kubernetes: The Problem Everyone Had and Nobody Knew About"
subtitle: "How the Go runtime created dozens of unnecessary threads in CPU-limited pods, what it caused in practice, and what changed in Go 1.25"
author: otavio_celestino
# date: 2026-05-14 08:00:00 -0300
date: 2026-04-27 08:00:00 -0300
categories: [Go, Kubernetes, Performance]
tags: [go, golang, kubernetes, gomaxprocs, cgroups, performance, cpu-throttling, k8s]
comments: true
image: "/assets/img/posts/2026-05-14-gomaxprocs-kubernetes-problem-en.png"
lang: en
original_post: "/gomaxprocs-kubernetes-problema/"
---

Hey everyone!

You've looked at a Kubernetes dashboard, seen CPU usage looking fine, watched latency climb, p99 spiking, and had no idea why. I've been there. The answer was in GOMAXPROCS.

This is one of those problems that exists in almost every Go application running on Kubernetes but rarely shows up in runbooks. The pod is not using too much CPU. It's not running out of memory. It's being throttled by the kernel, and the reason is that the Go runtime created far more threads than the container was supposed to have.

Before Go 1.25, released in August 2025, this was the default behavior. And it silently affected countless production deployments.

---

## How GOMAXPROCS works

`GOMAXPROCS` is the variable that controls how many OS threads the Go scheduler uses to execute goroutines in parallel. By default, the runtime sets this value based on the number of logical CPUs available.

You can read and set this at runtime:

```go
package main

import (
    "fmt"
    "runtime"
)

func main() {
    // Returns the current GOMAXPROCS value
    current := runtime.GOMAXPROCS(0)
    fmt.Printf("Current GOMAXPROCS: %d\n", current)

    // Set manually to 4
    runtime.GOMAXPROCS(4)
    fmt.Printf("GOMAXPROCS after setting: %d\n", runtime.GOMAXPROCS(0))
}
```

The value `0` passed to `GOMAXPROCS` is a convention: it returns the current value without changing anything.

Before Go 1.25, when the process started, the runtime called `runtime.NumCPU()`, which reads `/proc/cpuinfo` or uses system calls to find out how many CPUs the host has. The problem is that this returns the CPUs of the physical node, not the CPUs allocated to the container.

---

## What happens in a pod with a CPU limit

Imagine a common scenario: you have a node with 64 cores and a pod with the following limit:

```yaml
resources:
  requests:
    cpu: "500m"
  limits:
    cpu: "2"
```

When your Go application starts in this pod, the runtime sees 64 CPUs available (the node's) and sets `GOMAXPROCS = 64`. Result: 64 OS threads trying to execute goroutines in parallel.

What happens next:

```
Host: 64 cores
Pod CPU limit: 2 cores
Go runtime GOMAXPROCS: 64 (reads the host, not the container)

  Thread 1  ─────────────────────────────┐
  Thread 2  ────────────────────────┐    │
  ...                               │    │
  Thread 64 ──────────────┐         │    │
                          │         │    │
                  ┌───────▼─────────▼────▼──┐
                  │   CFS Scheduler (kernel) │
                  │   CPU quota: 2 cores     │
                  │   Throttles when exceeded│
                  └──────────────────────────┘
```

Linux uses the CFS (Completely Fair Scheduler) to control CPU usage per container. When a container exceeds its CPU quota, CFS throttles it: it freezes the processes for a period of time so the quota is respected.

With 64 threads trying to run simultaneously and only 2 cores of quota, the container gets throttled very frequently, even when average CPU usage is low.

---

## CPU throttling vs CPU saturation

This is the point that confuses a lot of people.

**CPU saturation** happens when the application wants more CPU than it has available. Usage stays high, close to 100%.

**CPU throttling** in Kubernetes is different. The container can be throttled even with low CPU usage. What matters is not the average usage, but short bursts of parallel activity.

When 64 threads wake up at the same time to process requests, the burst of usage exceeds the 2-core quota for a fraction of a second. The kernel freezes the container until the next CFS period (usually 100ms). Requests that arrived during that moment are left waiting.

The result is classic: 20% average CPU, normal p50 latency, p99 exploding.

```
Latency by percentile:
  p50:  12ms  (most requests go through fine)
  p90:  45ms  (some hit a bad window)
  p99: 280ms  (those that arrive during throttle wait 100ms+)
  p99.9: 800ms
```

The average user notices nothing. The user who falls in the bad percentile thinks your system is slow. And the CPU dashboard shows green.

---

## How to diagnose

### Prometheus

If you use Prometheus with cAdvisor (default in most managed clusters), this metric shows throttling:

```promql
# Throttling rate per pod
rate(container_cpu_cfs_throttled_seconds_total{
  container!="",
  pod=~"my-app-.*"
}[5m])
```

A more direct way to see the throttle percentage:

```promql
# Percentage of throttled periods relative to total
sum(rate(container_cpu_cfs_throttled_periods_total{
  container!="",
  pod=~"my-app-.*"
}[5m]))
/
sum(rate(container_cpu_cfs_periods_total{
  container!="",
  pod=~"my-app-.*"
}[5m]))
```

If this value goes above 25%, you have a throttling problem worth investigating.

### kubectl

For a quick view:

```bash
kubectl top pod -n my-namespace --sort-by=cpu
```

But remember: `kubectl top` shows average usage, not throttling. A pod with low CPU in `top` can still be heavily throttled.

To inspect the configured limits:

```bash
kubectl get pod my-pod -o jsonpath='{.spec.containers[*].resources}'
```

### Log at application startup

The most direct way to confirm which GOMAXPROCS the runtime chose is to log it at startup:

```go
package main

import (
    "fmt"
    "runtime"
)

func main() {
    fmt.Printf("GOMAXPROCS=%d, NumCPU=%d\n",
        runtime.GOMAXPROCS(0),
        runtime.NumCPU(),
    )

    // rest of application
}
```

If you see `GOMAXPROCS=64, NumCPU=64` in a pod with `cpu limit: 2`, the problem is confirmed.

---

## The solution before Go 1.25

Uber released the `go.uber.org/automaxprocs` library precisely to solve this. It reads the container's cgroups information (v1 or v2) and adjusts GOMAXPROCS to reflect the configured CPU limit.

Usage is simple. Just import with a blank identifier:

```go
package main

import (
    "fmt"
    "runtime"

    _ "go.uber.org/automaxprocs"
)

func main() {
    // automaxprocs already ran in init()
    // GOMAXPROCS now reflects the container's CPU limit
    fmt.Printf("GOMAXPROCS=%d\n", runtime.GOMAXPROCS(0))
}
```

To add it to your project:

```bash
go get go.uber.org/automaxprocs
```

The library works like this:

1. In `init()`, reads `/sys/fs/cgroup/cpu/cpu.cfs_quota_us` and `cpu.cfs_period_us` (cgroups v1)
2. Or reads `/sys/fs/cgroup/cpu.max` (cgroups v2)
3. Calculates how many CPUs the container is entitled to (quota / period)
4. Calls `runtime.GOMAXPROCS` with that value

### cgroups v1 vs v2

Most modern Kubernetes clusters (1.25+) use cgroups v2 by default. The practical difference for automaxprocs is where it reads the files:

```
cgroups v1:
  /sys/fs/cgroup/cpu/cpu.cfs_quota_us    (e.g.: 200000)
  /sys/fs/cgroup/cpu/cpu.cfs_period_us   (e.g.: 100000)
  Available CPU = 200000 / 100000 = 2 cores

cgroups v2:
  /sys/fs/cgroup/cpu.max   (e.g.: "200000 100000")
  Available CPU = 200000 / 100000 = 2 cores
```

automaxprocs handles both formats automatically.

---

## What changed in Go 1.25

Go 1.25, released in August 2025, brought the native fix. The runtime now reads cgroups limits automatically at startup, without needing any external library.

The new default behavior is:

1. The runtime checks whether it's running inside a container (detects cgroups)
2. If there's a CPU limit configured, it uses that value to set GOMAXPROCS
3. If there's no limit (container without CPU limit), it keeps the previous behavior (host CPU count)

To verify that Go 1.25 is doing the right thing, use the same startup log:

```go
package main

import (
    "fmt"
    "runtime"
)

func main() {
    procs := runtime.GOMAXPROCS(0)
    cpus := runtime.NumCPU()

    fmt.Printf("GOMAXPROCS=%d NumCPU=%d\n", procs, cpus)

    // In Go 1.25+ in a container with cpu limit: 2
    // you should see: GOMAXPROCS=2 NumCPU=64
}
```

### How to disable the new behavior

If for some reason you need the previous behavior (for example, your application sets GOMAXPROCS manually via environment variable), you can disable cgroups reading:

```bash
GODEBUG=containeraware=0 ./my-application
```

Or in code:

```go
package main

import (
    "os"
    "runtime"
)

func init() {
    // Disables Go 1.25 container detection
    // Useful if you configure GOMAXPROCS via environment variable
    if v := os.Getenv("GOMAXPROCS"); v != "" {
        // GOMAXPROCS will be applied by the environment variable
        // the runtime respects this variable before cgroups detection
    }
}

func main() {
    runtime.GOMAXPROCS(4) // manual configuration
}
```

In practice, the `GOMAXPROCS` environment variable continues to be respected and takes precedence over automatic detection.

---

## What to do today

### Checklist

**If you're on Go 1.25 or later:**
- [ ] Confirm that Go 1.25+ is being used: `go version` inside the container
- [ ] Add the startup log to confirm GOMAXPROCS is correct
- [ ] Verify that the CPU limit is configured in the pod (without a limit, detection doesn't help)
- [ ] Monitor `container_cpu_cfs_throttled_periods_total` in Prometheus

**If you're on a version before Go 1.25:**
- [ ] Add `go.uber.org/automaxprocs` as a dependency
- [ ] Import with a blank identifier in the main file
- [ ] Deploy and confirm GOMAXPROCS in the startup log
- [ ] Compare p99 latency before and after

**For any version:**
- [ ] Make sure all pods have CPU limit configured
- [ ] Set up Prometheus alerts for throttling above 25%
- [ ] Document the expected GOMAXPROCS per service

### Complete example with automaxprocs and logging

```go
package main

import (
    "fmt"
    "net/http"
    "runtime"

    _ "go.uber.org/automaxprocs"
)

func main() {
    fmt.Printf("Starting server: GOMAXPROCS=%d NumCPU=%d\n",
        runtime.GOMAXPROCS(0),
        runtime.NumCPU(),
    )

    http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        fmt.Fprintln(w, "ok")
    })

    fmt.Println("Server running on port 8080")
    if err := http.ListenAndServe(":8080", nil); err != nil {
        fmt.Printf("Error: %v\n", err)
    }
}
```

### CPU request vs CPU limit: the difference matters

Before wrapping up, it's worth clarifying the distinction between `request` and `limit` in Kubernetes:

```yaml
resources:
  requests:
    cpu: "500m"   # 0.5 CPU - minimum guarantee for scheduling
  limits:
    cpu: "2"      # 2 CPUs - maximum the container can use
```

**CPU request**: used by the Kubernetes scheduler to decide which node to place the pod on. Does not limit actual CPU usage. A pod with a 500m request can use more if the node has available resources.

**CPU limit**: this is the value the CFS uses for throttling. If the container tries to use more than this limit, the kernel throttles it. And this is the value that automaxprocs and Go 1.25 use to calculate the correct GOMAXPROCS.

Applications without a configured CPU limit don't get the protection from automaxprocs or Go 1.25, because there's no limit to respect. In that case, GOMAXPROCS continues to be the number of host CPUs.

---

## References

- **[go.uber.org/automaxprocs](https://github.com/uber-go/automaxprocs)** - Official repository for Uber's library
- **[Go 1.25 Release Notes](https://go.dev/doc/go1.25)** - Go 1.25 release notes with details on container awareness
- **[runtime.GOMAXPROCS](https://pkg.go.dev/runtime#GOMAXPROCS)** - Official function documentation
- **[Linux CFS Bandwidth Control](https://www.kernel.org/doc/html/latest/scheduler/sched-bwc.html)** - Kernel documentation on CFS and throttling
- **[Kubernetes Resource Management](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)** - Official documentation on requests and limits
- **[cgroups v2](https://docs.kernel.org/admin-guide/cgroup-v2.html)** - Kernel documentation on cgroups v2
- **[container_cpu_cfs_throttled_seconds_total](https://github.com/google/cadvisor/blob/master/docs/storage/prometheus.md)** - cAdvisor metrics in Prometheus
- **[A Practical Guide to Bandwidth Control](https://www.kernel.org/doc/Documentation/scheduler/sched-bwc.txt)** - CFS bandwidth control guide
