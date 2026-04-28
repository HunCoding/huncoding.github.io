---
layout: post
title: "The Backdoor Hidden in the Go Module Mirror for 3 Years"
subtitle: "How a malicious package impersonated BoltDB on the official Go proxy for three years, what this exposes about module ecosystem security, and how to protect yourself"
author: otavio_celestino
date: 2026-05-21 08:00:00 -0300
categories: [Go, Security, Supply Chain]
tags: [go, golang, security, modules, supply-chain, govulncheck, boltdb, proxy]
comments: true
image: "/assets/img/posts/2026-05-21-go-module-mirror-backdoor-en.png"
lang: en
original_post: "/backdoor-go-module-mirror/"
---

Hey everyone!

In April 2025, Socket security researchers disclosed a supply chain attack that stayed active on the official Go module proxy for three years. The package `github.com/boltdb-go/bolt` was indexed on `proxy.golang.org` from 2022 to 2025, impersonating the legitimate BoltDB. Any project that installed this dependency was running malicious code without knowing it.

What sets this case apart from common typosquatting attacks is the combination of factors that allowed it to survive: the real BoltDB was archived, the Go proxy stores modules permanently, and the checksum database does not verify authenticity, only integrity.

This is not an isolated bug. It is a systemic exposure in the security model of the Go module ecosystem.

---

## The attack

The legitimate package is `github.com/boltdb/bolt`. It is an embedded key-value database written in Go, widely used in earlier years. In 2021 the original repository was archived: no new commits, no active maintenance.

Anyone who needed "BoltDB with active maintenance" or "a maintained BoltDB fork" and ran a public search would find several options. The package `github.com/boltdb-go/bolt` showed up on those lists.

The name difference is subtle. `boltdb/bolt` is the original. `boltdb-go/bolt` is the fake. One extra hyphen in the GitHub path. Visually, the names are nearly identical.

The malicious package was published and indexed by `proxy.golang.org`. From that point on, any install via `go get github.com/boltdb-go/bolt` downloaded the compromised code, which was stored in the local cache at `GOMODCACHE`.

Socket researchers confirmed the package was available from 2022 until it was discovered in April 2025. Three years on the official proxy.

---

## How the module proxy works

To understand why this happened, you need to understand the architecture of the Go module system.

When you run `go get github.com/some/package`, the Go toolchain does not go directly to GitHub to fetch the code. It queries `proxy.golang.org` first.

The proxy downloads the module, stores a copy, and serves that copy on future requests. The goal is availability: even if the original repository is deleted, the module stays accessible.

Alongside the proxy sits `sum.golang.org`, the checksum database. It records the hash of every version of every module that has passed through the proxy. When you install a module, Go verifies that the hash of what was downloaded matches what is registered in the sum database.

The `go.sum` file in your project is the local manifestation of this. Each line represents a module at a specific version with its expected hash.

```
github.com/boltdb/bolt v1.3.1 h1:IFsbd7dp9kbKA2M9GA8LJKnyjTD4Uc0Kzv7s3mLSmwQ=
github.com/boltdb/bolt v1.3.1/go.mod h1:clJnj/oiGkjum5o1McbSZDSLxVThjynRyGBgiAx27Ps=
```

The problem: the sum database guarantees that the package you download today is the same one that was registered the first time. It does not guarantee that the package is safe, that it comes from a trustworthy source, or that the maintainer has any legitimate claim to the name they are using.

The hash of `github.com/boltdb-go/bolt` was consistent. The sum database was verifying the integrity of a malicious package with perfect fidelity.

---

## Why it lasted 3 years

Three combined factors explain the longevity of the attack.

**Permanent cache.** The `proxy.golang.org` does not expire modules. Once a module is indexed, it stays available indefinitely. There is no automatic removal mechanism for inactivity, reports, or lack of use. The malicious module stayed there because the proxy has no reason to remove anything.

**No name ownership system.** In npm there is a centralized registry where each package name belongs to a specific user. In Go, the module path is derived from the Git repository. Anyone who creates `github.com/boltdb-go` on GitHub can publish `github.com/boltdb-go/bolt`. There is no namespace protection based on similarity with existing packages. The original BoltDB team has no control over what can be published under similar paths.

**Archived BoltDB created a gap.** The original repository `github.com/boltdb/bolt` is archived. It shows up in searches tagged as "unmaintained" or "archived". Anyone looking for a maintained alternative was in an active search state, which increases the chance of installing whatever looks right.

These three factors together created a window that stayed open for three years with no automatic alerts, no expiration, and no review.

---

## What BoltDB has to do with this

BoltDB is a specific use-case choice: an embedded, serverless database for applications that need simple local persistence. It competed with bbolt, badger, and SQLite with CGO-free drivers.

The `github.com/boltdb/bolt` repository was archived because the project fulfilled its purpose. There is an official fork called `go.etcd.io/bbolt`, maintained by the etcd team, which is the recommended continuation. But many older projects still reference the original path, and someone discovering the project through old documentation would naturally search for "bolt go module maintained fork".

The attacker exploited exactly this. The name `boltdb-go` sounds like an organized fork: "BoltDB, but in Go module format". For someone searching without knowing the history, it looks legitimate.

This pattern repeats in other attacks. In May 2025 The Hacker News reported a separate case where malicious Go modules delivered malware that wiped disks on Linux systems. The entry vector was the same: plausible names, convincing descriptions, and the absence of authenticity verification in the ecosystem.

---

## How to audit your dependencies now

The first tool is `govulncheck`. It checks for known vulnerabilities in your project's dependencies using the Go vulnerability database.

Install it:

```bash
go install golang.org/x/vuln/cmd/govulncheck@latest
```

Run it from your project root:

```bash
govulncheck ./...
```

The output lists vulnerabilities found with the corresponding CVE, the affected version, and the fixed version when available. For vulnerabilities in the official database, this works well. For malicious packages without a registered CVE, govulncheck will not find anything.

To investigate the dependency graph, `go mod graph` shows all relationships between modules:

```bash
go mod graph | grep boltdb
```

This filters the graph lines containing "boltdb" and shows whether the legitimate or the malicious package is present, and which dependency pulled it in.

To understand why a specific module is in your project:

```bash
go mod why github.com/boltdb/bolt
```

The output shows the import path: which file in your project imports which package that in turn depends on the module in question. If the answer is surprising, you have an unexpected transitive dependency to investigate.

For a complete view of what is installed locally, `GOMODCACHE` stores all downloaded modules:

```bash
ls $GOPATH/pkg/mod/github.com/ | grep bolt
```

Or using the standard variable:

```bash
ls $(go env GOMODCACHE)/github.com/ | grep bolt
```

If you find `boltdb-go` instead of `boltdb`, the malicious package passed through your environment.

A more systematic auditing approach is to check the repositories of direct dependencies. For each entry in `go.mod`, confirm that the referenced repository exists, that the author makes sense, and that it was not archived recently in a suspicious way.

---

## Best practices to not be the next victim

**Version pinning with go.sum.** The `go.sum` file ensures that the installed version has not changed since it was registered. Never commit an incomplete `go.sum`. Never run `go mod tidy` without checking the `go.sum` diff in code review.

**Dependency auditing in CI.** Add `govulncheck` to your CI pipeline as a required step:

```bash
govulncheck ./...
```

If it returns a non-zero exit code, the build fails. Simple.

**Vendor mode as an extra layer.** The `-mod=vendor` flag makes Go use only the local `vendor/` directory instead of downloading from the proxy:

```bash
go build -mod=vendor ./...
```

With vendor committed to the repository, CI does not depend on network access and what is being compiled is exactly what humans reviewed. Not practical for every project, but it is the strongest protection against supply chain attacks via proxy.

**GOFLAGS for controlled environments.** You can set the vendor flag by default:

```bash
export GOFLAGS=-mod=vendor
```

**Review new dependencies in code review.** Any addition to `go.mod` should be justified. Useful questions: who maintains this module? Is the repository active? How many dependents does it have? Does the module path make sense relative to the repository name?

**GONOSUMCHECK and GONOSUMDB with care.** These variables allow skipping checksum verification for specific paths. They are useful for private internal modules. Never use `GONOSUMCHECK=*` in production: you disable the only integrity check the toolchain performs.

---

## What the Go ecosystem changed after this

The discovery created pressure for changes in the ecosystem security model.

The Go vulnerability database (`vuln.go.dev`) was updated with the `boltdb-go` case. This means `govulncheck` now detects that specific package.

The Go team publicly discussed adding name similarity checks to the proxy: before indexing a new module, check if the path is visually similar to existing modules with high popularity. This functionality was not available at the time this post was written, but it was under discussion in the public Go issue tracker.

`pkg.go.dev`, the Go package documentation portal, started displaying more prominent warnings when a module is similar to an existing one. It is not a technical barrier, but it raises visibility.

The structural problem remains: Go does not have a centralized registry with name ownership. This is a deliberate design decision, but it has a security cost. Languages with centralized registries like npm and PyPI have gone through similar crises and implemented additional controls.

The `boltdb-go` case will probably not be the last. The difference is that there is now more awareness of the attack vector and more tools to monitor for it.

---

## References

- [Socket Research: Malicious Go Module on Go Module Proxy for 3 Years](https://socket.dev/blog/malicious-go-package-on-go-module-proxy)
- [The Register: Go module mirror served backdoored packages for three years](https://www.theregister.com/2025/04/03/go_module_mirror_served_backdoored/)
- [The Hacker News: Malicious Go Modules Deliver Disk-Wiping Linux Malware in Advanced Supply Chain Attack](https://thehackernews.com/2025/05/malicious-go-modules-deliver-disk.html)
- [Security Boulevard: Go Module Supply Chain Attack Exposes Millions to Risk](https://securityboulevard.com/2025/04/go-module-supply-chain-attack/)
- [Go Vulnerability Database](https://vuln.go.dev)
- [govulncheck: official documentation](https://pkg.go.dev/golang.org/x/vuln/cmd/govulncheck)
- [Go Module Proxy: official documentation](https://go.dev/ref/mod#module-proxy)
- [Go Checksum Database](https://sum.golang.org)
- [bbolt: maintained BoltDB fork](https://github.com/etcd-io/bbolt)
