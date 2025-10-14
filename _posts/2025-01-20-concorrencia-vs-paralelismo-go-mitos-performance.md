---
layout: post
title: "Concorrência vs Paralelismo em Go: Desmistificando Mitos de Performance"
subtitle: "Por que concorrência nem sempre é mais rápida e quando usar cada abordagem"
date: 2025-10-13 10:00:00 -0300
categories: [Go, Performance, Concorrência]
tags: [go, concurrency, parallelism, performance, goroutines, scheduler]
author: otavio_celestino
lang: pt
comments: true
image: "/assets/img/posts/2025-10-13-concorrencia-vs-paralelismo-go-mitos-performance.png"
original_post: "/concorrencia-vs-paralelismo-go-mitos-performance/"
translations:
  title_en: "Concurrency vs Parallelism in Go: Debunking Performance Myths"
  subtitle_en: "Why concurrency isn't always faster and when to use each approach"
  content_en: |
    A misconception among many developers is believing that a concurrent solution is always faster than a sequential one. This couldn't be more wrong. The overall performance of a solution depends on many factors, such as the efficiency of our code structure (concurrency), which parts can be tackled in parallel, and the level of contention among the computation units. This post reminds us about some fundamental knowledge of concurrency in Go; then we will see a concrete example where a concurrent solution isn't necessarily faster.

    ## Go Scheduling

    A thread is the smallest unit of processing that an OS can perform. If a process wants to execute multiple actions simultaneously, it spins up multiple threads. These threads can be:

    * _Concurrent_ — Two or more threads can start, run, and complete in overlapping time periods.
    * _Parallel_ — The same task can be executed multiple times at once.

    The OS is responsible for scheduling the thread's processes optimally so that:

    * All the threads can consume CPU cycles without being starved for too much time.
    * The workload is distributed as evenly as possible among the different CPU cores.

    A CPU core executes different threads. When it switches from one thread to another, it executes an operation called _context switching_. The active thread consuming CPU cycles was in an _executing_ state and moves to a _runnable_ state, meaning it's ready to be executed pending an available core. Context switching is considered an expensive operation because the OS needs to save the current execution state of a thread before the switch (such as the current register values).

    As Go developers, we can't create threads directly, but we can create goroutines, which can be thought of as application-level threads. However, whereas an OS thread is context-switched on and off a CPU core by the OS, a goroutine is context-switched on and off an OS thread by the Go runtime. Also, compared to an OS thread, a goroutine has a smaller memory footprint: 2 KB for goroutines from Go 1.4. An OS thread depends on the OS, but, for example, on Linux/x86–32, the default size is 2 MB.

    Context switching a goroutine versus a thread is about 80% to 90% faster, depending on the architecture.

    Let's now discuss how the Go scheduler works to overview how goroutines are handled. Internally, the Go scheduler uses the following terminology:

    * _G_ — Goroutine
    * _M_ — OS thread (stands for machine)
    * _P_ — CPU core (stands for processor)

    Each OS thread (M) is assigned to a CPU core (P) by the OS scheduler. Then, each goroutine (G) runs on an M. The GOMAXPROCS variable defines the limit of Ms in charge of executing user-level code simultaneously. But if a thread is blocked in a system call (for example, I/O), the scheduler can spin up more Ms. As of Go 1.5, GOMAXPROCS is by default equal to the number of available CPU cores.

    A goroutine has a simpler lifecycle than an OS thread. It can be doing one of the following:

    * _Executing_ — The goroutine is scheduled on an M and executing its instructions.
    * _Runnable_ — The goroutine is waiting to be in an executing state.
    * _Waiting_ — The goroutine is stopped and pending something completing, such as a system call or a synchronization operation (such as acquiring a mutex).

    There's one last stage to understand about the implementation of Go scheduling: when a goroutine is created but cannot be executed yet; for example, all the other Ms are already executing a G. In this scenario, what will the Go runtime do about it? The answer is queuing. The Go runtime handles two kinds of queues: one local queue per P and a global queue shared among all the Ps.

    ![Go Scheduler]({{ '/assets/img/posts/go-scheduler.png' | relative_url }})

    Figure 1 shows a given scheduling situation on a four-core machine with GOMAXPROCS equal to 4. The parts are the logical cores (Ps), goroutines (Gs), OS threads (Ms), local queues, and global queue.

    First, we can see five Ms, whereas GOMAXPROCS is set to 4. But as we mentioned, if needed, the Go runtime can create more OS threads than the GOMAXPROCS value.

    P0, P1, and P3 are currently busy executing Go runtime threads. But P2 is presently idle as M3 is switched off P2, and there's no goroutine to be executed. This isn't a good situation because six runnable goroutines are pending being executed, some in the global queue and some in other local queues. How will the Go runtime handle this situation? Here's the scheduling implementation in pseudocode:

    ```
    runtime.schedule() {
        // Only 1/61 of the time, check the global runnable queue for a G.
        // If not found, check the local queue.
        // If not found,
        //     Try to steal from other Ps.
        //     If not, check the global runnable queue.
        //     If not found, poll network.
    }
    ```

    Every sixty-first execution, the Go scheduler will check whether goroutines from the global queue are available. If not, it will check its local queue. Meanwhile, if both the global and local queues are empty, the Go scheduler can pick up goroutines from other local queues. This principle in scheduling is called _work stealing_, and it allows an underutilized processor to actively look for another processor's goroutines and _steal_ some.

    One last important thing to mention: prior to Go 1.14, the scheduler was cooperative, which meant a goroutine could be context-switched off a thread only in specific blocking cases (for example, channel send or receive, I/O, waiting to acquire a mutex). Since Go 1.14, the Go scheduler is now preemptive: when a goroutine is running for a specific amount of time (10 ms), it will be marked preemptible and can be context-switched off to be replaced by another goroutine. This allows a long-running job to be forced to share CPU time.

    Now that we understand the fundamentals of scheduling in Go, let's look at a concrete example: implementing a merge sort in a parallel manner.

    ## Parallel Merge Sort

    First, let's briefly review how the merge sort algorithm works. Then we will implement a parallel version. Note that the objective isn't to implement the most efficient version but to support a concrete example showing why concurrency isn't always faster.

    The merge sort algorithm works by breaking a list repeatedly into two sublists until each sublist consists of a single element and then merging these sublists so that the result is a sorted list. Each split operation splits the list into two sublists, whereas the merge operation merges two sublists into a sorted list.

    ![Merge Sort Algorithm]({{ '/assets/img/posts/mergesort.png' | relative_url }})

    Figure 2: Applying the merge sort algorithm repeatedly breaks each list into two sublists. Then the algorithm uses a merge operation such that the resulting list is sorted.

    Here is the sequential implementation of this algorithm:

    ```go
    func sequentialMergesort(s []int) {
        if len(s) <= 1 {
            return
        }

        middle := len(s) / 2
        sequentialMergesort(s[:middle]) // First half
        sequentialMergesort(s[middle:]) // Second half
        merge(s, middle) // Merges the two halves
    }

    func merge(s []int, middle int) {
        // Implementation details...
    }
    ```

    This algorithm has a structure that makes it open to concurrency. Indeed, as each _sequentialMergesort_ operation works on an independent set of data that doesn't need to be fully copied (here, an independent view of the underlying array using slicing), we could distribute this workload among the CPU cores by spinning up each _sequentialMergesort_ operation in a different goroutine. Let's write a first parallel implementation:

    ```go
    func parallelMergesortV1(s []int) {
        if len(s) <= 1 {
            return
        }

        middle := len(s) / 2

        var wg sync.WaitGroup
        wg.Add(2)

        go func() { // Spins up the first half of the work in a goroutine
            defer wg.Done()
            parallelMergesortV1(s[:middle])
        }()

        go func() { // Spins up the second half of the work in a goroutine
            defer wg.Done()
            parallelMergesortV1(s[middle:])
        }()

        wg.Wait()
        merge(s, middle) // Merges the halves
    }
    ```

    In this version, each half of the workload is handled in a separate goroutine. The parent goroutine waits for both parts by using _sync.WaitGroup_. Hence, we call the Wait method before the merge operation.

    We now have a parallel version of the merge sort algorithm. Therefore, if we run a benchmark to compare this version against the sequential one, the parallel version should be faster, correct? Let's run it on a four-core machine with 10,000 elements:

    ```
    Benchmark_sequentialMergesort-4       2278993555 ns/op
    Benchmark_parallelMergesortV1-4      17525998709 ns/op
    ```

    Surprisingly, the parallel version is almost an order of magnitude slower. How can we explain this result? How is it possible that a parallel version that distributes a workload across four cores is slower than a sequential version running on a single machine? Let's analyze the problem.

    If we have a slice of, say, 1,024 elements, the parent goroutine will spin up two goroutines, each in charge of handling a half consisting of 512 elements. Each of these goroutines will spin up two new goroutines in charge of handling 256 elements, then 128, and so on, until we spin up a goroutine to compute a single element.

    If the workload that we want to parallelize is too small, meaning we're going to compute it too fast, the benefit of distributing a job across cores is destroyed: the time it takes to create a goroutine and have the scheduler execute it is much too high compared to directly merging a tiny number of items in the current goroutine. Although goroutines are lightweight and faster to start than threads, we can still face cases where a workload is too small.

    So what can we conclude from this result? Does it mean the merge sort algorithm cannot be parallelized? Wait, not so fast.

    Let's try another approach. Because merging a tiny number of elements within a new goroutine isn't efficient, let's define a threshold. This threshold will represent how many elements a half should contain in order to be handled in a parallel manner. If the number of elements in the half is fewer than this value, we will handle it sequentially. Here's a new version:

    ```go
    const max = 2048 // Defines the threshold

    func parallelMergesortV2(s []int) {
        if len(s) <= 1 {
            return
        }

        if len(s) <= max {
            sequentialMergesort(s) // Calls our initial sequential version
        } else { // If bigger than the threshold, keeps the parallel version
            middle := len(s) / 2

            var wg sync.WaitGroup
            wg.Add(2)

            go func() {
                defer wg.Done()
                parallelMergesortV2(s[:middle])
            }()

            go func() {
                defer wg.Done()
                parallelMergesortV2(s[middle:])
            }()

            wg.Wait()
            merge(s, middle)
        }
    }
    ```

    If the number of elements in the s slice is smaller than max, we call the sequential version. Otherwise, we keep calling our parallel implementation. Does this approach impact the result? Yes, it does:

    ```
    Benchmark_sequentialMergesort-4       2278993555 ns/op
    Benchmark_parallelMergesortV1-4      17525998709 ns/op
    Benchmark_parallelMergesortV2-4       1313010260 ns/op
    ```

    Our v2 parallel implementation is more than 40% faster than the sequential one, thanks to this idea of defining a threshold to indicate when parallel should be more efficient than sequential.

    Why did I set the threshold to 2,048? Because it was the optimal value for this specific workload on my machine. In general, such magic values should be defined carefully with benchmarks (running on an execution environment similar to production). It's also pretty interesting to note that running the same algorithm in a programming language that doesn't implement the concept of goroutines has an impact on the value. For example, running the same example in Java using threads means an optimal value closer to 8,192. This tends to illustrate how goroutines are more efficient than threads.

    ## Conclusion

    We have seen throughout this post the fundamental concepts of scheduling in Go: the differences between a thread and a goroutine and how the Go runtime schedules goroutines. Meanwhile, using the parallel merge sort example, we illustrated that concurrency isn't always necessarily faster. As we have seen, spinning up goroutines to handle minimal workloads (merging only a small set of elements) demolishes the benefit we could get from parallelism.

    So, where should we go from here? We must keep in mind that concurrency isn't always faster and shouldn't be considered the default way to go for all problems. First, it makes things more complex. Also, modern CPUs have become incredibly efficient at executing sequential code and predictable code. For example, a superscalar processor can parallelize instruction execution over a single core with high efficiency.

    Does this mean we shouldn't use concurrency? Of course not. However, it's essential to keep these conclusions in mind. If we're not sure that a parallel version will be faster, the right approach may be to start with a simple sequential version and build from there using profiling and benchmarks, for example. It can be the only way to ensure that a concurrent implementation is worth it.

    ## References

    - [100 Go Mistakes - Thinking concurrency is always faster](https://100go.co/56-concurrency-faster/)
    - [Go Concurrency Patterns](https://go.dev/blog/pipelines)
    - [Effective Go - Concurrency](https://go.dev/doc/effective_go#concurrency)
    - [Go Memory Model](https://go.dev/ref/mem)
    - [Go Scheduler Design](https://docs.google.com/document/d/1TTj4T2JO42uD5ID9e89oa0sLKhJYD0Y_kqxDv3I3XMw/edit)
    - [Concurrency is not Parallelism - Rob Pike](https://www.youtube.com/watch?v=cN_DpYBzKso)
    - [Go Runtime Scheduler](https://golang.org/src/runtime/proc.go)
    - [Performance Optimization in Go](https://go.dev/doc/diagnostics)
    - [Go Profiling Guide](https://go.dev/blog/pprof)
    - [Concurrent Programming Patterns](https://github.com/golang/go/wiki/LearnConcurrency)
---
E aí, pessoal! Hoje vou esclarecer um dos conceitos mais mal compreendidos em Go: **concorrência vs paralelismo**. Muitos desenvolvedores acreditam que soluções concorrentes são sempre mais rápidas, mas essa é uma concepção perigosa que pode levar a pior performance.

## O Agendamento do Go

Um thread é a menor unidade de processamento que um SO pode executar. Se um processo quer executar múltiplas ações simultaneamente, ele cria múltiplos threads. Esses threads podem ser:

* _Concorrentes_ — Dois ou mais threads podem começar, executar e completar em períodos de tempo sobrepostos.
* _Paralelos_ — A mesma tarefa pode ser executada múltiplas vezes ao mesmo tempo.

O SO é responsável por agendar os processos dos threads de forma otimizada para que:

* Todos os threads possam consumir ciclos de CPU sem ficar famintos por muito tempo.
* A carga de trabalho seja distribuída o mais uniformemente possível entre os diferentes cores de CPU.

Um core de CPU executa diferentes threads. Quando ele muda de um thread para outro, executa uma operação chamada _context switching_. O thread ativo consumindo ciclos de CPU estava em um estado _executando_ e move para um estado _executável_, significando que está pronto para ser executado pendente de um core disponível. Context switching é considerado uma operação cara porque o SO precisa salvar o estado atual de execução de um thread antes da mudança (como os valores atuais dos registradores).

Como desenvolvedores Go, não podemos criar threads diretamente, mas podemos criar goroutines, que podem ser pensadas como threads de nível de aplicação. No entanto, enquanto um thread do SO é context-switched dentro e fora de um core de CPU pelo SO, uma goroutine é context-switched dentro e fora de um thread do SO pelo runtime do Go. Além disso, comparado a um thread do SO, uma goroutine tem uma pegada de memória menor: 2 KB para goroutines do Go 1.4. Um thread do SO depende do SO, mas, por exemplo, no Linux/x86–32, o tamanho padrão é 2 MB.

Context switching uma goroutine versus um thread é cerca de 80% a 90% mais rápido, dependendo da arquitetura.

> **Observação Importante**
> 
> A diferença de performance entre goroutines e threads é significativa. Enquanto um thread do SO tem 2MB de stack (Linux/x86-32), uma goroutine tem apenas 2KB. Isso significa que o Go pode criar milhares de goroutines com o mesmo overhead de memória que algumas dezenas de threads.

Vamos agora discutir como o scheduler do Go funciona para ter uma visão geral de como as goroutines são tratadas. Internamente, o scheduler do Go usa a seguinte terminologia:

* _G_ — Goroutine
* _M_ — Thread do SO (significa machine)
* _P_ — Core de CPU (significa processor)

Cada thread do SO (M) é atribuído a um core de CPU (P) pelo scheduler do SO. Então, cada goroutine (G) executa em um M. A variável GOMAXPROCS define o limite de Ms responsáveis por executar código de nível de usuário simultaneamente. Mas se um thread está bloqueado em uma chamada de sistema (por exemplo, I/O), o scheduler pode criar mais Ms. A partir do Go 1.5, GOMAXPROCS é por padrão igual ao número de cores de CPU disponíveis.

Uma goroutine tem um ciclo de vida mais simples que um thread do SO. Ela pode estar fazendo uma das seguintes coisas:

* _Executando_ — A goroutine está agendada em um M e executando suas instruções.
* _Executável_ — A goroutine está esperando para estar em um estado executando.
* _Esperando_ — A goroutine está parada e pendente de algo completar, como uma chamada de sistema ou uma operação de sincronização (como adquirir um mutex).

Há um último estágio para entender sobre a implementação do agendamento do Go: quando uma goroutine é criada mas não pode ser executada ainda; por exemplo, todos os outros Ms já estão executando um G. Neste cenário, o que o runtime do Go fará sobre isso? A resposta é enfileiramento. O runtime do Go trata dois tipos de filas: uma fila local por P e uma fila global compartilhada entre todos os Ps.

![Go Scheduler]({{ '/assets/img/posts/go-scheduler.png' | relative_url }})

A Figura 1 mostra uma situação de agendamento específica em uma máquina de quatro cores com GOMAXPROCS igual a 4. As partes são os cores lógicos (Ps), goroutines (Gs), threads do SO (Ms), filas locais e fila global.

Primeiro, podemos ver cinco Ms, enquanto GOMAXPROCS está definido como 4. Mas como mencionamos, se necessário, o runtime do Go pode criar mais threads do SO que o valor GOMAXPROCS.

P0, P1 e P3 estão atualmente ocupados executando threads do runtime do Go. Mas P2 está atualmente ocioso enquanto M3 está desligado de P2, e não há goroutine para ser executada. Esta não é uma boa situação porque seis goroutines executáveis estão pendentes de serem executadas, algumas na fila global e algumas em outras filas locais. Como o runtime do Go lidará com esta situação? Aqui está a implementação do agendamento em pseudocódigo:

```
runtime.schedule() {
    // Apenas 1/61 do tempo, verifica a fila global executável por um G.
    // Se não encontrado, verifica a fila local.
    // Se não encontrado,
    //     Tenta roubar de outros Ps.
    //     Se não, verifica a fila global executável.
    //     Se não encontrado, faz polling da rede.
}
```

A cada sexagésima primeira execução, o scheduler do Go verificará se goroutines da fila global estão disponíveis. Se não, verificará sua fila local. Enquanto isso, se tanto as filas global quanto local estiverem vazias, o scheduler do Go pode pegar goroutines de outras filas locais. Este princípio no agendamento é chamado _work stealing_, e permite que um processador subutilizado procure ativamente por goroutines de outro processador e _roube_ algumas.

> **Conceito Chave: Work Stealing**
> 
> Work stealing é uma técnica fundamental do scheduler do Go. Quando um processador (P) fica ocioso, ele não fica parado esperando - ele ativamente "rouba" goroutines de outros processadores que estão sobrecarregados. Isso garante que todos os cores sejam utilizados eficientemente.

Uma última coisa importante a mencionar: antes do Go 1.14, o scheduler era cooperativo, o que significava que uma goroutine poderia ser context-switched fora de um thread apenas em casos específicos de bloqueio (por exemplo, envio ou recebimento de channel, I/O, esperando adquirir um mutex). Desde o Go 1.14, o scheduler do Go agora é preemptivo: quando uma goroutine está executando por uma quantidade específica de tempo (10 ms), ela será marcada como preemptível e pode ser context-switched fora para ser substituída por outra goroutine. Isso permite que um trabalho de longa duração seja forçado a compartilhar tempo de CPU.

Agora que entendemos os fundamentos do agendamento em Go, vamos ver um exemplo concreto: implementar um merge sort de forma paralela.

## Merge Sort Paralelo

Primeiro, vamos revisar brevemente como o algoritmo de merge sort funciona. Então implementaremos uma versão paralela. Note que o objetivo não é implementar a versão mais eficiente, mas apoiar um exemplo concreto mostrando por que concorrência nem sempre é mais rápida.

O algoritmo de merge sort funciona quebrando uma lista repetidamente em duas sublistas até que cada sublista consista de um único elemento e então mesclando essas sublistas para que o resultado seja uma lista ordenada. Cada operação de divisão divide a lista em duas sublistas, enquanto a operação de mesclagem mescla duas sublistas em uma lista ordenada.

![Merge Sort Algorithm]({{ '/assets/img/posts/mergesort.png' | relative_url }})

Figura 2: Aplicando o algoritmo de merge sort quebra repetidamente cada lista em duas sublistas. Então o algoritmo usa uma operação de mesclagem para que a lista resultante seja ordenada.

Aqui está a implementação sequencial deste algoritmo:

```go
func mergeSortSequencial(s []int) {
    if len(s) <= 1 {
        return
    }

    meio := len(s) / 2
    mergeSortSequencial(s[:meio]) // Primeira metade
    mergeSortSequencial(s[meio:]) // Segunda metade
    merge(s, meio) // Mescla as duas metades
}

func merge(s []int, meio int) {
    // Detalhes da implementação...
}
```

Este algoritmo tem uma estrutura que o torna aberto à concorrência. De fato, como cada operação _mergeSortSequencial_ trabalha em um conjunto independente de dados que não precisa ser totalmente copiado (aqui, uma visão independente do array subjacente usando slicing), poderíamos distribuir esta carga de trabalho entre os cores de CPU criando cada operação _mergeSortSequencial_ em uma goroutine diferente. Vamos escrever uma primeira implementação paralela:

```go
func mergeSortParaleloV1(s []int) {
    if len(s) <= 1 {
        return
    }

    meio := len(s) / 2

    var wg sync.WaitGroup
    wg.Add(2)

    go func() { // Cria a primeira metade do trabalho em uma goroutine
        defer wg.Done()
        mergeSortParaleloV1(s[:meio])
    }()

    go func() { // Cria a segunda metade do trabalho em uma goroutine
        defer wg.Done()
        mergeSortParaleloV1(s[meio:])
    }()

    wg.Wait()
    merge(s, meio) // Mescla as metades
}
```

Nesta versão, cada metade da carga de trabalho é tratada em uma goroutine separada. A goroutine pai espera por ambas as partes usando _sync.WaitGroup_. Portanto, chamamos o método Wait antes da operação de mesclagem.

Agora temos uma versão paralela do algoritmo de merge sort. Portanto, se executarmos um benchmark para comparar esta versão com a sequencial, a versão paralela deveria ser mais rápida, correto? Vamos executá-la em uma máquina de quatro cores com 10.000 elementos:

```
Benchmark_mergeSortSequencial-4       2278993555 ns/op
Benchmark_mergeSortParaleloV1-4      17525998709 ns/op
```

Surpreendentemente, a versão paralela é quase uma ordem de magnitude mais lenta. Como podemos explicar este resultado? Como é possível que uma versão paralela que distribui uma carga de trabalho através de quatro cores seja mais lenta que uma versão sequencial executando em uma única máquina? Vamos analisar o problema.

> **Resultado**
> 
> Este é um exemplo perfeito de como a intuição pode nos enganar! A versão paralela é **7.7x mais lenta** que a sequencial. Isso acontece porque o overhead de criar e gerenciar goroutines para tarefas muito pequenas supera os benefícios do paralelismo.

Se temos uma slice de, digamos, 1.024 elementos, a goroutine pai criará duas goroutines, cada uma responsável por tratar uma metade consistindo de 512 elementos. Cada uma dessas goroutines criará duas novas goroutines responsáveis por tratar 256 elementos, então 128, e assim por diante, até criarmos uma goroutine para computar um único elemento.

Se a carga de trabalho que queremos paralelizar é muito pequena, significando que vamos computá-la muito rapidamente, o benefício de distribuir um trabalho através de cores é destruído: o tempo que leva para criar uma goroutine e ter o scheduler executá-la é muito alto comparado a mesclar diretamente um número minúsculo de itens na goroutine atual. Embora goroutines sejam leves e mais rápidas de iniciar que threads, ainda podemos enfrentar casos onde uma carga de trabalho é muito pequena.

Então o que podemos concluir deste resultado? Isso significa que o algoritmo de merge sort não pode ser paralelizado? Espere, não tão rápido.

Vamos tentar outra abordagem. Porque mesclar um número minúsculo de elementos dentro de uma nova goroutine não é eficiente, vamos definir um threshold. Este threshold representará quantos elementos uma metade deve conter para ser tratada de forma paralela. Se o número de elementos na metade for menor que este valor, trataremos sequencialmente. Aqui está uma nova versão:

```go
const max = 2048 // Define o threshold

func mergeSortParaleloV2(s []int) {
    if len(s) <= 1 {
        return
    }

    if len(s) <= max {
        mergeSortSequencial(s) // Chama nossa versão sequencial inicial
    } else { // Se maior que o threshold, mantém a versão paralela
        meio := len(s) / 2

        var wg sync.WaitGroup
        wg.Add(2)

        go func() {
            defer wg.Done()
            mergeSortParaleloV2(s[:meio])
        }()

        go func() {
            defer wg.Done()
            mergeSortParaleloV2(s[meio:])
        }()

        wg.Wait()
        merge(s, meio)
    }
}
```

Se o número de elementos na slice s for menor que max, chamamos a versão sequencial. Caso contrário, continuamos chamando nossa implementação paralela. Esta abordagem impacta o resultado? Sim, impacta:

```
Benchmark_mergeSortSequencial-4       2278993555 ns/op
Benchmark_mergeSortParaleloV1-4      17525998709 ns/op
Benchmark_mergeSortParaleloV2-4       1313010260 ns/op
```

Nossa implementação paralela v2 é mais de 40% mais rápida que a sequencial, graças a esta ideia de definir um threshold para indicar quando paralelo deve ser mais eficiente que sequencial.

Por que defini o threshold como 2.048? Porque era o valor ótimo para esta carga de trabalho específica na minha máquina. Em geral, tais valores mágicos devem ser definidos cuidadosamente com benchmarks (executando em um ambiente de execução similar à produção). Também é bastante interessante notar que executar o mesmo algoritmo em uma linguagem de programação que não implementa o conceito de goroutines tem um impacto no valor.

## Conclusão

Vimos ao longo deste post os conceitos fundamentais de agendamento em Go: as diferenças entre um thread e uma goroutine e como o runtime do Go agenda goroutines. Enquanto isso, usando o exemplo do merge sort paralelo, ilustramos que concorrência nem sempre é necessariamente mais rápida. Como vimos, criar goroutines para tratar cargas de trabalho mínimas (mesclando apenas um pequeno conjunto de elementos) destrói o benefício que poderíamos obter do paralelismo.

Então, para onde devemos ir a partir daqui? Devemos ter em mente que concorrência nem sempre é mais rápida e não deve ser considerada a forma padrão de ir para todos os problemas. Primeiro, torna as coisas mais complexas. Além disso, CPUs modernas se tornaram incrivelmente eficientes em executar código sequencial e código previsível. Por exemplo, um processador superscalar pode paralelizar execução de instruções sobre um único core com alta eficiência.

Isso significa que não devemos usar concorrência? Claro que não. No entanto, é essencial manter essas conclusões em mente. Se não temos certeza de que uma versão paralela será mais rápida, a abordagem correta pode ser começar com uma versão sequencial simples e construir a partir daí usando profiling e benchmarks, por exemplo. Pode ser a única forma de garantir que uma implementação concorrente vale a pena.

## Referências

- [Go Concurrency Patterns](https://go.dev/blog/pipelines)
- [Effective Go - Concurrency](https://go.dev/doc/effective_go#concurrency)
- [Go Scheduler Design](https://docs.google.com/document/d/1TTj4T2JO42uD5ID9e89oa0sLKhJYD0Y_kqxDv3I3XMw/edit)
- [Concorrência não é Paralelismo - Rob Pike](https://www.youtube.com/watch?v=cN_DpYBzKso)
- [Go Runtime Scheduler](https://golang.org/src/runtime/proc.go)
- [Performance Optimization in Go](https://go.dev/doc/diagnostics)
- [Go Profiling Guide](https://go.dev/blog/pprof)
- [Concurrent Programming Patterns](https://github.com/golang/go/wiki/LearnConcurrency)
