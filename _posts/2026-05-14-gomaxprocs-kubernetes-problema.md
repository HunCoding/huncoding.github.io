---
layout: post
title: "GOMAXPROCS e Kubernetes: o problema que todo mundo tinha e ninguém sabia"
subtitle: "Como o runtime do Go criava dezenas de threads desnecessárias em pods com CPU limit, o que isso causava na prática e o que mudou no Go 1.25"
author: otavio_celestino
date: 2026-05-14 08:00:00 -0300
categories: [Go, Kubernetes, Performance]
tags: [go, golang, kubernetes, gomaxprocs, cgroups, performance, cpu-throttling, k8s]
comments: true
image: "/assets/img/posts/2026-05-14-gomaxprocs-kubernetes-problema.png"
lang: pt-BR
---

E aí, pessoal!

Você já olhou para um dashboard de Kubernetes, viu CPU usage tranquila, latência subindo, p99 explodindo, e não entendeu nada? Eu já. E a resposta estava no GOMAXPROCS.

Esse é um daqueles problemas que existe em quase toda aplicação Go rodando em Kubernetes, mas que raramente aparece nos runbooks. O pod não está consumindo CPU demais. Não está sem memória. Está sendo throttled pelo kernel, e o motivo é que o runtime do Go criou muito mais threads do que o container deveria ter.

Antes do Go 1.25, lançado em agosto de 2025, esse era o comportamento padrão. E ele afetou silenciosamente incontáveis deploys em produção.

---

## Como o GOMAXPROCS funciona

`GOMAXPROCS` é a variável que controla quantas threads do sistema operacional o scheduler do Go usa para executar goroutines em paralelo. Por padrão, o runtime define esse valor com base no número de CPUs lógicas disponíveis.

Você pode ler e configurar isso em tempo de execução:

```go
package main

import (
    "fmt"
    "runtime"
)

func main() {
    // Retorna o valor atual de GOMAXPROCS
    atual := runtime.GOMAXPROCS(0)
    fmt.Printf("GOMAXPROCS atual: %d\n", atual)

    // Define manualmente para 4
    runtime.GOMAXPROCS(4)
    fmt.Printf("GOMAXPROCS após configuração: %d\n", runtime.GOMAXPROCS(0))
}
```

O valor `0` passado para `GOMAXPROCS` é uma convenção: ele retorna o valor atual sem alterar nada.

Antes do Go 1.25, quando o processo iniciava, o runtime chamava `runtime.NumCPU()`, que lê `/proc/cpuinfo` ou usa chamadas de sistema para descobrir quantas CPUs o host tem. O problema é que isso retorna os CPUs do nó físico, não os CPUs alocados para o container.

---

## O que acontece num pod com CPU limit

Imagine um cenário comum: você tem um nó com 64 cores e um pod com o seguinte limite:

```yaml
resources:
  requests:
    cpu: "500m"
  limits:
    cpu: "2"
```

Quando sua aplicação Go sobe nesse pod, o runtime vê 64 CPUs disponíveis (os do nó) e define `GOMAXPROCS = 64`. Resultado: 64 threads OS tentando executar goroutines em paralelo.

O que acontece em seguida:

```
Host: 64 cores
Pod CPU limit: 2 cores
Go runtime GOMAXPROCS: 64 (lê o host, não o container)

  Thread 1  ─────────────────────────────┐
  Thread 2  ────────────────────────┐    │
  ...                               │    │
  Thread 64 ──────────────┐         │    │
                          │         │    │
                  ┌───────▼─────────▼────▼──┐
                  │   CFS Scheduler (kernel) │
                  │   CPU quota: 2 cores     │
                  │   Throttle quando excede │
                  └──────────────────────────┘
```

O Linux usa o CFS (Completely Fair Scheduler) para controlar o uso de CPU por container. Quando um container excede sua cota de CPU, o CFS o throttlea: congela os processos por um periodo de tempo para que a cota seja respeitada.

Com 64 threads tentando rodar ao mesmo tempo e apenas 2 cores de quota, o container é throttled com muita frequencia, mesmo que o uso medio de CPU seja baixo.

---

## CPU throttling vs CPU saturation

Esse e o ponto que confunde muita gente.

**Saturacao de CPU** acontece quando a aplicacao quer mais CPU do que tem disponivel. O uso fica alto, proximo de 100%.

**CPU throttling** no Kubernetes e diferente. O container pode ser throttled mesmo com uso de CPU baixo. O que importa nao e o uso medio, mas os picos curtos de atividade paralela.

Quando 64 threads acordam ao mesmo tempo para processar requisicoes, o burst de uso excede a cota de 2 cores por uma fracao de segundo. O kernel congela o container ate o proximo periodo de CFS (geralmente 100ms). Requests que chegaram nesse momento ficam esperando.

O resultado e classico: media de CPU em 20%, p50 de latencia normal, p99 explodindo.

```
Latencia por percentil:
  p50:  12ms  (maioria das requisicoes passa tranquila)
  p90:  45ms  (algumas pegam uma janela ruim)
  p99: 280ms  (as que chegam no momento do throttle ficam esperando 100ms+)
  p99.9: 800ms
```

O usuario medio nao percebe nada. O usuario que cai no percentil ruim acha que seu sistema e lento. E o dashboard de CPU mostra verde.

---

## Como diagnosticar

### Prometheus

Se voce usa Prometheus com cAdvisor (padrao na maioria dos clusters gerenciados), essa metrica mostra o throttling:

```promql
# Taxa de throttling por pod
rate(container_cpu_cfs_throttled_seconds_total{
  container!="",
  pod=~"meu-app-.*"
}[5m])
```

Uma forma mais direta de ver o percentual de throttle:

```promql
# Percentual de periodos throttled em relacao ao total
sum(rate(container_cpu_cfs_throttled_periods_total{
  container!="",
  pod=~"meu-app-.*"
}[5m]))
/
sum(rate(container_cpu_cfs_periods_total{
  container!="",
  pod=~"meu-app-.*"
}[5m]))
```

Se esse valor passar de 25%, voce tem um problema de throttling que vale investigar.

### kubectl

Para uma visao rapida:

```bash
kubectl top pod -n meu-namespace --sort-by=cpu
```

Mas lembre: `kubectl top` mostra uso medio, nao throttling. Um pod com CPU baixa no `top` pode estar sendo muito throttled.

Para inspecionar os limits configurados:

```bash
kubectl get pod meu-pod -o jsonpath='{.spec.containers[*].resources}'
```

### Log no startup da aplicacao

A forma mais direta de confirmar o GOMAXPROCS que o runtime escolheu e logar no inicio da aplicacao:

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

    // resto da aplicacao
}
```

Se voce ver `GOMAXPROCS=64, NumCPU=64` num pod com `cpu limit: 2`, o problema esta confirmado.

---

## A solucao antes do Go 1.25

A Uber lancou a biblioteca `go.uber.org/automaxprocs` exatamente para resolver isso. Ela le as informacoes de cgroups do container (v1 ou v2) e ajusta o GOMAXPROCS para refletir o CPU limit configurado.

O uso e simples. So importar com blank identifier:

```go
package main

import (
    "fmt"
    "runtime"

    _ "go.uber.org/automaxprocs"
)

func main() {
    // automaxprocs ja rodou no init()
    // GOMAXPROCS agora reflete o CPU limit do container
    fmt.Printf("GOMAXPROCS=%d\n", runtime.GOMAXPROCS(0))
}
```

Para adicionar ao projeto:

```bash
go get go.uber.org/automaxprocs
```

A biblioteca funciona assim:

1. No `init()`, le `/sys/fs/cgroup/cpu/cpu.cfs_quota_us` e `cpu.cfs_period_us` (cgroups v1)
2. Ou le `/sys/fs/cgroup/cpu.max` (cgroups v2)
3. Calcula quantos CPUs o container tem direito (quota / period)
4. Chama `runtime.GOMAXPROCS` com esse valor

### cgroups v1 vs v2

A maioria dos clusters Kubernetes modernos (1.25+) usa cgroups v2 por padrao. A diferenca pratica para o automaxprocs e onde ele le os arquivos:

```
cgroups v1:
  /sys/fs/cgroup/cpu/cpu.cfs_quota_us    (ex: 200000)
  /sys/fs/cgroup/cpu/cpu.cfs_period_us   (ex: 100000)
  CPU disponivel = 200000 / 100000 = 2 cores

cgroups v2:
  /sys/fs/cgroup/cpu.max   (ex: "200000 100000")
  CPU disponivel = 200000 / 100000 = 2 cores
```

O automaxprocs lida com os dois formatos automaticamente.

---

## O que mudou no Go 1.25

O Go 1.25, lancado em agosto de 2025, trouxe a correcao nativa. O runtime agora le os limites de cgroups automaticamente ao iniciar, sem precisar de nenhuma biblioteca externa.

O comportamento padrao passou a ser:

1. O runtime verifica se esta rodando dentro de um container (detecta cgroups)
2. Se houver CPU limit configurado, usa esse valor para definir GOMAXPROCS
3. Se nao houver limit (container sem CPU limit), mantem o comportamento anterior (numero de CPUs do host)

Para verificar que o Go 1.25 esta fazendo a coisa certa, use o mesmo log de startup:

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

    // Em Go 1.25+ num container com cpu limit: 2
    // voce deve ver: GOMAXPROCS=2 NumCPU=64
}
```

### Como desativar o novo comportamento

Se por algum motivo voce precisar do comportamento anterior (por exemplo, sua aplicacao define GOMAXPROCS manualmente via variavel de ambiente), voce pode desativar a leitura de cgroups:

```bash
GODEBUG=containeraware=0 ./minha-aplicacao
```

Ou no codigo:

```go
package main

import (
    "os"
    "runtime"
)

func init() {
    // Desativa a deteccao de container do Go 1.25
    // Util se voce configura GOMAXPROCS via variavel de ambiente
    if v := os.Getenv("GOMAXPROCS"); v != "" {
        // GOMAXPROCS sera aplicado pela variavel de ambiente
        // o runtime respeita essa variavel antes da deteccao de cgroups
    }
}

func main() {
    runtime.GOMAXPROCS(4) // configuracao manual
}
```

Na pratica, a variavel de ambiente `GOMAXPROCS` continua sendo respeitada e tem precedencia sobre a deteccao automatica.

---

## O que fazer hoje

### Checklist

**Se voce esta no Go 1.25 ou superior:**
- [ ] Confirme que o Go 1.25+ esta sendo usado: `go version` no container
- [ ] Adicione o log de startup para confirmar que GOMAXPROCS esta correto
- [ ] Verifique que o CPU limit esta configurado no pod (sem limit, a deteccao nao ajuda)
- [ ] Monitore `container_cpu_cfs_throttled_periods_total` no Prometheus

**Se voce esta em uma versao anterior ao Go 1.25:**
- [ ] Adicione `go.uber.org/automaxprocs` como dependencia
- [ ] Importe com blank identifier no arquivo principal
- [ ] Faca o deploy e confirme o GOMAXPROCS no log de startup
- [ ] Compare o p99 de latencia antes e depois

**Para qualquer versao:**
- [ ] Certifique-se de que todos os pods tem CPU limit configurado
- [ ] Configure alertas no Prometheus para throttling acima de 25%
- [ ] Documente o GOMAXPROCS esperado por servico

### Exemplo completo com automaxprocs e log

```go
package main

import (
    "fmt"
    "net/http"
    "runtime"

    _ "go.uber.org/automaxprocs"
)

func main() {
    fmt.Printf("Iniciando servidor: GOMAXPROCS=%d NumCPU=%d\n",
        runtime.GOMAXPROCS(0),
        runtime.NumCPU(),
    )

    http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        fmt.Fprintln(w, "ok")
    })

    fmt.Println("Servidor rodando na porta 8080")
    if err := http.ListenAndServe(":8080", nil); err != nil {
        fmt.Printf("Erro: %v\n", err)
    }
}
```

### CPU request vs CPU limit: a diferenca importa

Antes de fechar, vale esclarecer a distincao entre `request` e `limit` no Kubernetes:

```yaml
resources:
  requests:
    cpu: "500m"   # 0.5 CPU - garantia minima para scheduling
  limits:
    cpu: "2"      # 2 CPUs - maximo que o container pode usar
```

**CPU request**: usado pelo scheduler do Kubernetes para decidir em qual no alocar o pod. Nao limita o uso real de CPU. Um pod com request de 500m pode usar mais se o no tiver recursos disponiveis.

**CPU limit**: esse e o valor que o CFS usa para throttling. Se o container tentar usar mais do que esse limite, o kernel o throttlea. E esse e o valor que o automaxprocs e o Go 1.25 usam para calcular o GOMAXPROCS correto.

Aplicacoes sem CPU limit configurado nao tem a protecao do automaxprocs nem do Go 1.25, porque nao ha limite para respeitar. Nesse caso, o GOMAXPROCS continua sendo o numero de CPUs do host.

---

## Referencias

- **[go.uber.org/automaxprocs](https://github.com/uber-go/automaxprocs)** - Repositorio oficial da biblioteca da Uber
- **[Go 1.25 Release Notes](https://go.dev/doc/go1.25)** - Notas de release do Go 1.25 com detalhes sobre container awareness
- **[runtime.GOMAXPROCS](https://pkg.go.dev/runtime#GOMAXPROCS)** - Documentacao oficial da funcao
- **[Linux CFS Bandwidth Control](https://www.kernel.org/doc/html/latest/scheduler/sched-bwc.html)** - Documentacao do kernel sobre o CFS e throttling
- **[Kubernetes Resource Management](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)** - Documentacao oficial sobre requests e limits
- **[cgroups v2](https://docs.kernel.org/admin-guide/cgroup-v2.html)** - Documentacao do kernel sobre cgroups v2
- **[container_cpu_cfs_throttled_seconds_total](https://github.com/google/cadvisor/blob/master/docs/storage/prometheus.md)** - Metricas do cAdvisor no Prometheus
- **[A Practical Guide to Bandwidth Control](https://www.kernel.org/doc/Documentation/scheduler/sched-bwc.txt)** - Guia do CFS bandwidth control
