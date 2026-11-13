---
layout: post
title: "Implementando Chaos Engineering em Go"
subtitle: "Como construir um proxy de injeção de falhas em Go puro para testar resiliência real em sistemas distribuídos"
author: jorgegabrielti
date: 2026-08-13 08:00:00 -0300
categories: [Go, SRE, DevOps]
tags: [go, golang, chaos-engineering, sre, devops, resiliencia, kubernetes, circuit-breaker]
comments: true
image: "/assets/img/posts/2026-08-13-chaos-engineering-em-go.jpg"
lang: pt-BR
---

## Introdução

Todo serviço distribuído tem, em algum lugar, uma linha de código que diz "se der erro, tenta de novo". É quase um reflexo: um `http.Client` com timeout, uma chamada dentro de um loop de retry, talvez uma pequena espera entre tentativas, e segue-se em frente. Funciona nos testes. Funciona em homologação. Funciona, inclusive, na maior parte do tempo em produção — até o dia em que uma dependência começa a responder devagar demais, mas não devagar o suficiente para disparar um alarme, nem rápido o suficiente para respeitar o tempo que quem a chama está disposto a esperar. Esse ponto no meio — a falha parcial, não a queda total — é onde a maioria das estratégias de resiliência escritas correndo não dá conta do recado. Um retry mal calibrado, sob a falha certa, não resolve o problema: ele o piora, jogando três ou quatro vezes mais carga sobre um sistema que já está no limite.

Se você não vem do mundo de infraestrutura ou operações, talvez essa descrição pareça abstrata — mas a ideia por trás dela é bem simples. Pense num sistema de saques de um banco. Ele não depende de uma coisa só: depende do serviço que verifica saldo, do serviço que registra a transação, do serviço que conversa com o processador de pagamento, e por aí vai. Cada um desses serviços, na maior parte do tempo, está de pé e respondendo rápido. O problema é o que acontece quando um deles não está — não porque caiu de vez (isso é fácil de perceber), mas porque está lento, ou respondendo errado só às vezes, ou porque a conexão de rede entre dois deles simplesmente morre no meio do caminho. É justamente para expor esse tipo de comportamento, de forma controlada e antes que ele aconteça sozinho em produção, que existe a prática que este artigo explica: Chaos Engineering, ou engenharia do caos.

Este post tem dois objetivos que caminham juntos. O primeiro é explicar, com profundidade e sem assumir que você já conhece o assunto, o que é engenharia do caos, de onde ela veio e por que grandes empresas de tecnologia a adotaram como prática permanente — não como um teste pontual. O segundo é mostrar essa prática em ação através de um laboratório real que construí em Go: um proxy que injeta falhas de rede de forma controlada, com três serviços e uma API de controle em tempo real.

## O que é Chaos Engineering, na prática

A definição mais usada da área vem do time de resiliência da [Netflix](https://en.wikipedia.org/wiki/Netflix), uma das primeiras empresas a formalizar a prática em escala: Chaos Engineering é a disciplina de fazer experimentos num sistema distribuído para ganhar confiança de que ele aguenta condições instáveis em produção. Vale entender essa frase por partes, porque cada palavra ali importa.

"Experimentar" é a palavra-chave, e é o que diferencia essa prática de um teste comum. Um teste tradicional — um teste unitário, um teste de integração — parte de uma entrada conhecida e verifica uma saída esperada: você já sabe o que deveria acontecer, e confirma que acontece. Um experimento de caos parte de uma pergunta realmente aberta: "eu acredito que o sistema se comporta de tal forma sob tal falha — será que isso é verdade?" Essa crença inicial tem até um nome técnico, "steady-state hypothesis" (hipótese de estado estável): antes de injetar qualquer falha, você define um comportamento normal do sistema que dá pra medir — por exemplo, "95% das requisições respondem em menos de 300ms" — e depois observa se esse comportamento se mantém, piora um pouco de forma aceitável, ou quebra de vez quando uma falha específica é introduzida. Se a hipótese se confirma, você ganhou confiança real, baseada em evidência, não em suposição. Se ela falha, você acabou de descobrir — num ambiente controlado, no seu horário, com sua equipe de prontidão — exatamente o tipo de ponto fraco que, sem esse experimento, só apareceria numa madrugada de produção.

A prática nasceu de um problema concreto. Por volta de 2010, a Netflix estava migrando sua infraestrutura para a nuvem da AWS, um ambiente onde máquinas individuais falham com regularidade — não é uma questão de "se", é uma questão de "quando". Em vez de torcer para que isso não acontecesse em horário de pico, a engenharia da Netflix construiu uma ferramenta chamada Chaos Monkey, que desligava máquinas de produção aleatoriamente, durante o horário comercial, de propósito. A lógica por trás disso parece estranha à primeira vista, mas faz sentido: se uma máquina vai cair de qualquer forma, mais cedo ou mais tarde, é melhor que ela caia enquanto todo mundo está acordado, olhando os painéis, e pronto para agir — do que às três da manhã, sem ninguém percebendo até o problema já estar grande. Esse princípio depois virou um conjunto de regras mais formal — os "Principles of Chaos Engineering" — e cresceu de "matar servidores aleatoriamente" para uma prática bem mais ampla, com uma ideia central que qualquer implementação séria respeita: raio de impacto controlado (blast radius). Você não injeta caos sem limite; você define, antes de começar, o quanto de impacto está disposto a aceitar, em quem, e por quanto tempo — e só então aumenta esse raio conforme ganha confiança.

Hoje a prática existe em diferentes níveis de maturidade. No nível mais simples, ela acontece manualmente, em ambiente de teste, como um exercício pontual — o que chamamos de "Game Day": uma sessão marcada onde o time de propósito injeta uma falha conhecida (derruba um banco de dados, sobrecarrega uma fila, deixa a rede mais lenta) e observa, ao vivo, como o sistema e a própria equipe reagem. No nível seguinte, os testes são automatizados e rodam de tempos em tempos contra ambientes de homologação, como parte do processo de qualidade. No nível mais avançado — onde opera a própria Netflix, por exemplo — o caos roda o tempo todo em produção, de forma automática, com sistemas de segurança que param o teste sozinhos se ele começar a causar dano de verdade. Ferramentas como [Gremlin](https://www.gremlin.com/chaos-engineering), [LitmusChaos](https://litmuschaos.io/), [Chaos Mesh](https://chaos-mesh.org/) e o [AWS Fault Injection Service](https://aws.amazon.com/pt/fis/) existem justamente para colocar esses níveis mais avançados em prática, sem que cada empresa precise construir tudo isso do zero.

O laboratório que este artigo apresenta fica de propósito no primeiro desses níveis — um ambiente controlado, manual, pensado para aprender — mas usa, em miniatura, os mesmos mecanismos que sustentam os níveis mais avançados: um jeito de injetar falha de propósito, um jeito de ligar e desligar essa falha sem reiniciar nada, e — o mais importante — um jeito de observar, com evidência real (logs, comportamento do cliente), se o sistema se comporta como deveria.

## Por que testar carga não é suficiente

Antes de entrar na arquitetura da solução, vale explicar por que um teste de carga tradicional — algo que a maioria dos times de engenharia já faz — não substitui um experimento de caos. Teste de carga responde uma pergunta de volume: quantas requisições por segundo o sistema aguenta antes de piorar? É uma pergunta importante, mas é diferente de: o que acontece quando uma dependência específica falha de um jeito específico, independente do volume?

Pense em três cenários bem diferentes, todos possíveis em qualquer arquitetura de microsserviços: um backend que está de pé, mas responde com latência bem acima do normal — talvez por uma consulta lenta ou um problema pontual de leitura/escrita; um backend que está de pé, mas retorna erro numa parte das requisições — talvez porque uma réplica específica, entre várias, está com problema; ou uma conexão que simplesmente morre no meio da transmissão, sem nenhum cabeçalho HTTP de resposta — um cenário mais comum do que parece, quando há balanceadores de carga, proxies no meio do caminho, ou containers sendo reiniciados no meio de uma requisição. Cada um desses cenários exige uma resposta diferente de quem consome esse backend, e a única forma confiável de saber se o seu código responde do jeito certo é reproduzi-los de forma controlada, repetida e observável — não esperar que aconteçam sozinhos em produção, e não assumir que "ter um timeout" já resolve o problema.

## O laboratório: transformando o conceito em código

Foi para tornar esses conceitos concretos — e para entender, na raiz, os mecanismos que ferramentas prontas como Gremlin ou Litmus escondem por baixo de uma interface — que construí o [go-to-chaos](https://github.com/jorgegabrielti/go-to-chaos): um laboratório em Go puro, sem nenhuma dependência externa além da biblioteca padrão, com três serviços que juntos simulam os três tipos de falha descritos acima, mais um cliente para observar, na prática, como cada cenário se comporta.

Se o termo "proxy reverso" não for familiar: pense nele como um intermediário que fica entre quem faz um pedido e quem de fato atende, passando o tráfego de um lado para o outro — como uma recepcionista que repassa ligações para o ramal certo, mas que também pode, se for instruída, atrasar a ligação, desligar na sua cara, ou dizer que o ramal está ocupado mesmo quando não está. É exatamente esse papel de intermediário controlável que o proxy deste laboratório faz.

Os três serviços têm responsabilidades bem separadas. O **backend** é um servidor HTTP simples que simula um serviço real de produção — recebe a requisição, responde com um JSON de sucesso, sem nenhuma lógica de negócio real. O **client** é quem consome esse backend através do proxy, com um tempo de espera curto e uma lógica de nova tentativa em caso de falha — o comportamento "resiliente" que estamos, na verdade, testando. E o **proxy**, o centro do projeto, expõe duas portas com responsabilidades separadas de propósito: a porta `8080` recebe o tráfego real (cliente → backend) e passa por uma etapa de decisão de caos antes de encaminhar a requisição; a porta `8081` é uma API administrativa separada, usada só para configurar, em tempo real, qual falha está ativa — sem precisar reiniciar nenhum dos três serviços.

Essa separação de portas não é por acaso, e segue o mesmo princípio de raio de impacto controlado explicado antes: misturar o controle (a configuração do caos) com os dados (o tráfego que está sendo testado) na mesma porta criaria uma dependência desnecessária entre as duas coisas — e, mais importante, um raio de impacto maior. Separar as duas segue o mesmo princípio que vale para qualquer API de administração de um sistema real, de um endpoint de health check a um painel de feature flags: ela deve poder falhar, ou ficar sobrecarregada, sem derrubar o caminho principal.

## Concorrência segura: o gerenciador de configuração de caos

Um detalhe técnico que costuma passar despercebido em ferramentas como essa: a configuração de caos (qual falha está ativa, e com que intensidade) precisa ser lida a cada requisição — possivelmente por muitas requisições ao mesmo tempo — e escrita de vez em quando, sempre que alguém chama a API admin. Em Go, quando várias goroutines acessam o mesmo dado ao mesmo tempo, é preciso algum jeito de coordenar isso para evitar dado corrompido ou comportamento estranho. Essa coordenação, aqui, é feita por um `sync.RWMutex`:

```go
// ChaosConfig armazena as configurações de injeção de falhas.
// Cada campo representa um modo de caos independente.
type ChaosConfig struct {
    LatencyMs        int     `json:"latency_ms"`        // Latência a injetar em milissegundos (0 = desabilitado)
    ErrorProbability float64 `json:"error_probability"` // Probabilidade de retornar erro HTTP (0.0 a 1.0)
    TCPHijack        bool    `json:"tcp_hijack"`        // Abortar conexão TCP abruptamente
}

// ChaosManager gerencia o estado da configuração de caos de forma concorrente.
// Usa sync.RWMutex: múltiplas goroutines podem ler simultaneamente,
// mas somente uma pode escrever por vez (quando o admin atualiza a config).
type ChaosManager struct {
    mu     sync.RWMutex
    config ChaosConfig
}

// Get retorna uma cópia segura da configuração atual.
func (cm *ChaosManager) Get() ChaosConfig {
    cm.mu.RLock()
    defer cm.mu.RUnlock()
    return cm.config
}

// Set atualiza a configuração com exclusão mútua total.
func (cm *ChaosManager) Set(cfg ChaosConfig) {
    cm.mu.Lock()
    defer cm.mu.Unlock()
    cm.config = cfg
    log.Printf("[PROXY] Configuração de caos atualizada: latency=%dms | error=%.0f%% | hijack=%v",
        cfg.LatencyMs, cfg.ErrorProbability*100, cfg.TCPHijack)
}
```

A escolha de `RWMutex` em vez de um `Mutex` simples não é só estilo — ela segue o jeito real como o sistema é usado. Toda requisição que passa pelo proxy chama `Get()`, possivelmente centenas delas ao mesmo tempo sob carga, enquanto `Set()` só é chamado quando alguém mexe na API admin, algo bem mais raro. Um `Mutex` comum faria até as leituras esperarem a vez umas das outras — mesmo que nenhuma delas estivesse mudando nada — criando uma fila desnecessária bem no ponto mais usado do sistema. Um `RWMutex` deixa todas as leituras acontecerem ao mesmo tempo, e só trava de verdade quando uma escrita precisa acontecer: a ferramenta certa para o jeito certo de usar, não a mais familiar.

## Os três tipos de falha

O `chaosMiddleware` intercepta toda requisição antes dela chegar ao proxy reverso de verdade, e decide — com base na configuração atual — se deixa a requisição seguir normal ou aplica um dos três tipos de falha a seguir.

### Latência: a falha mais enganosa

De todos os três, este é o mais difícil de lidar direito, porque não é uma coisa clara de "funciona" ou "não funciona" — é "funciona, mas devagar demais para importar". No mundo real, isso simula qualquer coisa entre uma consulta de banco de dados lenta e uma rede sobrecarregada.

O jeito mais simples (e errado) de simular esse atraso em código seria só pausar a execução por alguns segundos antes de responder. O problema é que, se quem chamou já desistiu de esperar — porque bateu no próprio tempo limite — essa pausa continua rodando de qualquer forma, presa numa goroutine que não serve mais pra nada, gastando memória até terminar sozinha. Sob carga, com milhares de requisições canceladas por segundo, isso é um vazamento de recursos silencioso: nada quebra na hora, mas o sistema vai piorando aos poucos, sem nenhum erro óbvio apontando a causa.

O jeito certo usa o `context.Context` do Go — uma espécie de "sinal de desistência" que acompanha cada requisição HTTP e é ativado sozinho quando quem chamou fecha a conexão, seja porque bateu no próprio tempo limite, seja porque o processo foi encerrado. O código deixa duas coisas competindo ao mesmo tempo, usando a construção `select`, e reage à que terminar primeiro:

```go
if cfg.LatencyMs > 0 {
    delay := time.Duration(cfg.LatencyMs) * time.Millisecond
    log.Printf("[PROXY] [CAOS] Injetando latência de %v para %s...", delay, clientIP)

    select {
    case <-time.After(delay):
        // Delay concluído normalmente - a requisição segue para o backend.
        log.Printf("[PROXY] Latência de %v concluída. Encaminhando para o backend.", delay)
    case <-r.Context().Done():
        // O CLIENTE DESISTIU ANTES DO DELAY TERMINAR!
        // Isso é o uso correto de context.Context em Go:
        // paramos o sleep imediatamente, liberando a goroutine e a memória.
        log.Printf("[PROXY] [CONTEXTO] Cliente %s cancelou a requisição durante o delay! Goroutine liberada.", clientIP)
        return
    }
}
```

Sem esse `select`, cada requisição que sofre timeout no cliente deixaria uma goroutine presa no proxy até o atraso artificial terminar sozinho. Testamos exatamente esse cenário no laboratório — dois segundos de latência injetada contra um cliente com só um segundo de paciência — e o resultado aparece nos logs em tempo real:

```
[PROXY] [CAOS] Injetando latência de 2s para 172.18.0.4:xxxx...
[PROXY] [CONTEXTO] Cliente 172.18.0.4:xxxx cancelou a requisição durante o delay! Goroutine liberada.
```

### Erro intermitente: a falha que aparece e some

O segundo tipo simula uma dependência que está de pé, mas instável — respondendo com erro numa parte das requisições, algo comum quando uma réplica específica, entre várias por trás de um balanceador, está com problema. O proxy responde com `503 Service Unavailable`, com uma chance configurável, sem sequer tentar chegar no backend real:

```go
if cfg.ErrorProbability > 0 && rand.Float64() < cfg.ErrorProbability {
    log.Printf("[PROXY] [CAOS] Erro injetado (prob=%.0f%%) — retornando HTTP 503 para %s",
        cfg.ErrorProbability*100, clientIP)
    w.Header().Set("Content-Type", "application/json")
    w.Header().Set("X-Chaos-Mode", "error-injection")
    w.WriteHeader(http.StatusServiceUnavailable)
    fmt.Fprintf(w, `{"error":"Service Unavailable","chaos":"error-injection","probability":"%.0f%%"}`,
        cfg.ErrorProbability*100)
    return
}
```

### TCP Hijack: quando não sobra nem um código de erro

O terceiro tipo é o mais agressivo dos três, e também o que menos costuma aparecer testado na prática, justamente por ser mais difícil de simular. Ele não devolve um erro HTTP — ele mata a conexão TCP no meio do caminho, sem devolver nada organizado. Isso simula, por exemplo, um balanceador de carga reciclando uma conexão, ou um container sendo encerrado no meio de uma resposta — cenários onde quem chama não recebe um "erro 500" arrumadinho, recebe só o silêncio de uma conexão que não existe mais.

Go dá esse controle de baixo nível através da interface `http.Hijacker`, que deixa "sequestrar" a conexão TCP de dentro de um handler HTTP comum, tirando ela do controle automático do servidor:

```go
if cfg.TCPHijack {
    log.Printf("[PROXY] [CAOS] TCP Hijack ativo — encerrando conexão de %s abruptamente!", clientIP)

    hijacker, ok := w.(http.Hijacker)
    if !ok {
        log.Printf("[PROXY] Hijack não suportado pelo servidor HTTP atual.")
        http.Error(w, "Hijack não suportado", http.StatusInternalServerError)
        return
    }
    conn, _, err := hijacker.Hijack()
    if err != nil {
        log.Printf("[PROXY] Erro ao fazer hijack da conexão: %v", err)
        return
    }
    // Fecha o socket TCP raw - o cliente recebe "connection reset by peer"
    conn.Close()
    return
}
```

Ao fechar o socket direto, sem escrever nenhuma resposta, quem chamou não recebe um erro HTTP — recebe um erro de rede puro, geralmente `connection reset by peer` ou `EOF`, exatamente como aconteceria numa falha real de infraestrutura. Nos logs, a diferença de comportamento em relação aos outros dois tipos é imediata:

```
[PROXY] [CAOS] TCP Hijack ativo — encerrando conexão de 172.18.0.4:xxxx abruptamente!
[CLIENTE] [TCP RESET] Tentativa 1: Conexão abortada abruptamente pelo proxy. Isso é o modo TCP Hijack em ação!
[CLIENTE] [TCP RESET] Tentativa 2: Conexão abortada abruptamente pelo proxy. Isso é o modo TCP Hijack em ação!
[CLIENTE] [TCP RESET] Tentativa 3: Conexão abortada abruptamente pelo proxy. Isso é o modo TCP Hijack em ação!
```

## O cliente resiliente

Do outro lado do laboratório está o client: faz requisições em ciclo para o proxy usando um `http.Client` com tempo limite curto de 1 segundo, e até 3 tentativas em caso de falha. Cada erro é classificado para gerar um log com contexto — foi timeout? Foi um reset de conexão? Foi outro tipo de erro?

```go
func classificarErro(err error, tentativa int) {
    errStr := err.Error()

    switch {
    case isTimeout(err):
        log.Printf("[CLIENTE] [TIMEOUT] Tentativa %d: O cliente atingiu o limite de %v. "+
            "O Chaos Proxy estava injetando latência maior que o timeout configurado.",
            tentativa, clientTimeout)
    case contains(errStr, "connection reset by peer"), contains(errStr, "EOF"):
        log.Printf("[CLIENTE] [TCP RESET] Tentativa %d: Conexão abortada abruptamente pelo proxy. "+
            "Isso é o modo TCP Hijack em ação!",
            tentativa)
    case contains(errStr, "connection refused"):
        log.Printf("[CLIENTE] [CONN REFUSED] Tentativa %d: Proxy offline ou porta errada.",
            tentativa)
    default:
        log.Printf("[CLIENTE] [ERRO] Tentativa %d: %v", tentativa, err)
    }
}
```

Essa classificação é o que transforma um log genérico de erro num log que já diz, de cara, qual dos três tipos de caos causou a falha — o tipo de informação que economiza tempo de investigação quando o mesmo problema acontece de verdade em produção.

## Rodando o laboratório

O ambiente completo sobe com um único comando, sem nenhuma dependência além de Docker:

```bash
git clone https://github.com/jorgegabrielti/go-to-chaos.git
cd go-to-chaos
docker compose up --build
```

Com os três serviços no ar, o fluxo de um teste é simples: usar a API admin para ligar um tipo de caos, e observar o comportamento nos logs do proxy e do cliente em tempo real — a mesma lógica de um Game Day, só que em escala de laboratório pessoal. Ativando o TCP Hijack, por exemplo:

```bash
curl -X POST http://localhost:8081/config \
  -H "Content-Type: application/json" \
  -d '{"latency_ms": 0, "error_probability": 0, "tcp_hijack": true}'
```

E desligando qualquer tipo de caos, voltando ao comportamento normal, a qualquer momento:

```bash
curl -X POST http://localhost:8081/config \
  -d '{"latency_ms": 0, "error_probability": 0, "tcp_hijack": false}'
```

## Da prática de volta ao princípio: por que isso importa em escala

O laboratório mostra, de forma direta, um risco que costuma passar despercebido até acontecer de verdade em produção: configure `error_probability: 1.0` (falha em 100% das requisições) e observe que o cliente faz três tentativas seguidas antes de desistir. Agora multiplique isso por mil, dez mil, ou cem mil clientes fazendo exatamente o mesmo — todos tentando de novo ao mesmo tempo, no exato momento em que o backend volta ao ar depois de uma instabilidade. Isso tem nome: **Thundering Herd** (manada trovejante) — o próprio mecanismo de resiliência do cliente, em escala, vira a causa da próxima queda.

Esse é exatamente o tipo de cenário que um **Circuit Breaker** (disjuntor de circuito) existe para evitar: depois de um número de falhas seguidas, ele para de tentar completamente por um tempo, dando ao backend a chance de se recuperar sem uma avalanche de novas tentativas. É também o motivo pelo qual um tempo de espera fixo entre tentativas — como o usado, por simplicidade, neste laboratório — não é suficiente sozinho em produção: sem alguma variação aleatória nesse tempo (jitter), todos os clientes tendem a tentar de novo no mesmo instante, recriando o mesmo problema que a espera deveria evitar. Nenhuma dessas soluções está implementada no laboratório de propósito — o objetivo aqui não é entregar uma biblioteca de resiliência pronta para produção, mas mostrar, com evidência concreta, por que essas técnicas existem e o que elas evitam. Esse é, afinal, o valor central da engenharia do caos: ela não substitui Circuit Breaker, jitter ou qualquer outro padrão de resiliência — ela é o que te dá a prova de que você realmente precisa deles, e confirma, depois, que eles realmente funcionam.

## Conclusão

Chaos Engineering, na prática, não é sobre quebrar sistemas por esporte — é sobre trocar suposição por evidência, de propósito, num horário e numa escala que você escolhe, em vez de deixar a produção escolher por você. É fácil escrever um `http.Client` com timeout e um loop de retry e assumir que isso resolve resiliência; é bem mais raro parar para provar, de forma controlada e repetível, que esse código se comporta como esperado sob os tipos específicos de falha que vão acontecer, mais cedo ou mais tarde, em produção. O go-to-chaos nasceu dessa necessidade de prova, não de suposição.

Se você trabalha com sistemas distribuídos — ou está começando a entender como eles funcionam por dentro — o convite é direto: clone o repositório, suba o ambiente, e tente quebrar o seu próprio código do mesmo jeito, trocando o alvo do proxy pelo seu serviço real. É provável que você descubra, como eu descobri, que o "resiliente" no seu cliente HTTP está fazendo bem menos do que você imagina — e que a única forma de saber ao certo é, de fato, testar.

O código completo está disponível em [github.com/jorgegabrielti/go-to-chaos](https://github.com/jorgegabrielti/go-to-chaos).

## Fontes

- Definição, princípios, hipótese de estado estável e raio de impacto (blast radius) do Chaos Engineering: [Principles of Chaos Engineering](https://principlesofchaos.org/)
- Origem do Chaos Monkey na Netflix: [The Netflix Simian Army — Netflix Technology Blog](https://netflixtechblog.com/the-netflix-simian-army-16e57fbab116)
- Gremlin (ferramenta de chaos engineering): [documentação oficial do Gremlin](https://www.gremlin.com/docs)
- LitmusChaos (ferramenta de chaos engineering para Kubernetes): [documentação oficial do LitmusChaos](https://docs.litmuschaos.io/)
- Chaos Mesh (ferramenta de chaos engineering para Kubernetes): [documentação oficial do Chaos Mesh](https://chaos-mesh.org/docs/)
- AWS Fault Injection Service: [documentação oficial da AWS](https://docs.aws.amazon.com/fis/latest/userguide/)
- `net/http` (http.Client, http.Hijacker, códigos de status HTTP): [documentação oficial do pacote](https://pkg.go.dev/net/http)
- `net/http/httputil` (ReverseProxy): [documentação oficial do pacote](https://pkg.go.dev/net/http/httputil)
- `context` (context.Context, cancelamento): [documentação oficial do pacote](https://pkg.go.dev/context)
- `sync` (RWMutex): [documentação oficial do pacote](https://pkg.go.dev/sync)
- Docker Compose: [documentação oficial do Docker](https://docs.docker.com/compose/)
- Circuit Breaker: [Martin Fowler — bliki: Circuit Breaker](https://martinfowler.com/bliki/CircuitBreaker.html)
- Jitter e Thundering Herd: [Exponential Backoff and Jitter — AWS Architecture Blog](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)