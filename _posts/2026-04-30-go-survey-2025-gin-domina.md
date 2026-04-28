---
layout: post
title: "Go Survey 2025: Gin ainda domina e mais dados sobre o uso da linguagem"
subtitle: "O que os dados oficiais do Go Developer Survey e a análise do JetBrains revelam sobre frameworks, logs, erros e o estado real do ecossistema em 2026"
author: otavio_celestino
date: 2026-04-28 08:00:00 -0300
categories: [Go, Comunidade, Ecossistema]
tags: [go, golang, survey, gin, slog, zap, generics, ecosystem, frameworks]
comments: true
image: "/assets/img/posts/2026-04-28-go-survey-2025-gin-dominates.png"
lang: pt-BR
---

E aí, pessoal!

Em janeiro de 2026, o Go Developer Survey 2025 foi publicado oficialmente no blog do Go. Em novembro de 2025, o JetBrains publicou sua análise anual do ecossistema Go com base nos dados de uso do GoLand. Os dois chegaram num intervalo de meses e, juntos, formam a foto mais completa que já tivemos do que os desenvolvedores Go estão de fato usando no dia a dia.

Gin ainda lidera com folga, slog virou o padrão de logging, generics explodiram em adoção, e tratamento de erros continua sendo a principal reclamação da comunidade.

Vou passar pelo que os dados mostram, seção por seção.

---

## Frameworks web: Gin com 48%

O Gin mantém a liderança com 48% de adoção entre os respondentes do survey, subindo de 41% em 2020.

| Framework | Adoção 2025 | Tendência |
|---|---|---|
| Gin | 48% | Crescendo |
| net/http + ServeMux | ~22% | Estavel/crescendo |
| Echo | ~14% | Crescendo |
| Fiber | ~11% | Crescendo rapido |
| Chi | ~8% | Estavel |
| Gorilla Mux | ~5% | Caindo |

O que mudou desde 2020 não é a posição do Gin, mas o que está crescendo atrás dele. Fiber ganhou tração  entre desenvolvedores que vêm do Node.js e querem algo com a API do Express, mas compilado e rápido. Echo continua sendo a escolha de times que querem middleware robusto sem o estilo do Gin.

O dado mais relevante aqui é o crescimento do `net/http` puro com o novo `ServeMux` do Go 1.22. A partir do Go 1.22, o `ServeMux` passou a aceitar métodos HTTP diretamente na rota (`GET /users/{id}`) e parâmetros de path nomeados. Isso eliminou o principal argumento para usar um framework leve como o Chi. Parte da comunidade que antes pegava Chi por essa razão voltou para a stdlib.

A análise do JetBrains confirma essa movimentação: projetos novos têm mais chances de usar a stdlib do que tinham dois anos atrás, especialmente em serviços internos onde a performance do Gin não compensa a dependência extra.

Mas o Gin continua dominando em APIs expostas externamente, projetos com equipes maiores e situações onde a curva de aprendizado do time importa. Ele tem documentação extensa, exemplos por toda parte, e qualquer desenvolvedor Go contratado provavelmente já o conhece.

---

## Logging: slog venceu, mas zap ainda tem lugar

Esse foi um dos resultados mais claros do ciclo 2025. O `slog`, adicionado à stdlib no Go 1.21 (agosto de 2023), alcançou consenso como o padrão de logging estruturado para projetos novos. Dois anos foi tempo suficiente para o ecossistema absorver a mudança.

O Logrus foi declarado em "maintenance mode" pelos mantenedores: sem novas features planejadas. Para projetos legados que usam Logrus, não tem urgência de migrar, mas ninguém está começando projeto novo com ele.

A comparação de performance que mais circula na comunidade:

| Biblioteca | Performance | Notas |
|---|---|---|
| zerolog | ~280 ns/op | Mais rapido, API menos ergonomica |
| zap | ~420 ns/op | Rapido, zero-allocation, API verbose |
| slog (stdlib) | ~650 ns/op | Stdlib, boa ergonomia, integravel |
| Logrus | ~2800 ns/op | Legado, maintenance mode |

A diferencia entre zap e slog (420 vs 650 ns/op) parece grande em termos percentuais, mas na prática logging raramente é o gargalo de um serviço Go. Para 90% dos casos de uso, o slog é rápido o suficiente e você ganha a vantagem de não ter dependência externa.

O caso de uso que justifica o zap ainda: serviços com volume muito alto de logs por request, onde cada nanosegundo no hot path importa, ou times que já têm código extenso de logging em zap e não querem o custo de migrar.

O slog também tem uma vantagem estrutural: por ser stdlib, outras bibliotecas começaram a exportar handlers compatíveis com `slog.Handler`. O ecossistema de integração ficou mais coeso do que era quando cada biblioteca tinha seu próprio sistema de logging.

---

## Tratamento de erros: ainda a maior reclamação

O Go Developer Survey 2025 confirma o que os surveys anteriores já apontavam: tratamento de erros continua sendo a principal reclamação dos desenvolvedores Go, mesmo após a adição de generics em Go 1.18.

O padrão `if err != nil` não some. A discussão na comunidade evoluiu de "quando vamos ter try/catch" para "como organizar melhor o código que já temos".

O que os dados mostram em detalhe:

- Desenvolvedores que trabalham em bases de código grandes relatam que o boilerplate de erro domina a leitura do código
- A proposta de adicionar `errors.Join` (Go 1.20) foi bem recebida, mas não resolve o problema central
- Wrapping de erros com `%w` virou padrão, mas a consistência na aplicação ainda é irregular entre times

A ironia é que generics, que era a feature mais pedida antes de chegar, não resolveu o problema de erros e criou novos pontos de atrito relacionados à complexidade de tipos. O tratamento de erros continua no topo da lista de friction points.

Tem propostas em andamento na comunidade para endereçar isso de forma mais fundamental, mas o Go team tem sido conservador em mudar algo tão central à ergonomia da linguagem. A expectativa da comunidade é de que Go 1.26 ou 1.27 traga alguma melhoria concreta, mas nada está confirmado.

Por enquanto, a prática mais adotada é criar tipos de erro específicos com `errors.As`, wrapping consistente com `fmt.Errorf("%w", err)` e verificação no handler mais externo possível.

---

## Generics: de 12% para 73% em três anos

O salto dos dados de 2025: 73% dos projetos Go novos usam generics, comparado a 12% em 2022, logo após o lançamento em Go 1.18.

| Ano | Projetos novos com generics |
|---|---|
| 2022 (lancamento) | 12% |
| 2023 | 31% |
| 2024 | 58% |
| 2025 | 73% |

Os casos de uso onde generics mais apareceram nos projetos analisados pelo JetBrains:

- Funções utilitárias de coleção (`Map`, `Filter`, `Reduce`) que antes existiam por tipo específico
- Repositórios e DAOs com tipos genéricos reduzindo duplicação
- Wrappers de resultado tipo `Result[T]` e `Optional[T]`
- Clientes HTTP com resposta genérica tipada

O que os dados também mostram é que generics com constraints complexos ainda causam confusão. A maioria dos usos produtivos são relativamente simples: `[T any]` ou `[T comparable]`. Quando o código começa a ter constraints aninhadas e type parameters em tipo parameters, a legibilidade cai e alguns times estão recuando para código mais explícito.

O consenso: generics valem muito para bibliotecas e utils compartilhados. Para código de negócio específico, a explicitidade de Go sem generics muitas vezes fica mais legível.

---

## Onde Go é realmente usado

O survey 2025 confirma o que as edições anteriores já sugeriam: Go é uma linguagem de infraestrutura e backend, e isso está se aprofundando.

| Area de uso | Respondentes |
|---|---|
| Infraestrutura / DevOps / SRE | ~46% |
| APIs e servicos web | ~41% |
| Ferramentas CLI | ~32% |
| Sistemas distribuidos | ~28% |
| Processamento de dados | ~19% |
| ML / IA (integracao) | ~11% |

Quase metade dos respondentes trabalha diretamente com infraestrutura. Go se tornou a linguagem de fato para escrever controllers Kubernetes, operadores, agentes de monitoramento, daemons de sistema e ferramentas de plataforma.

Isso tem implicações para como os dados de popularidade geral devem ser lidos. Go não compete com Python no espaço de scripts e automação, nem com JavaScript no frontend. Compete com Rust e C++ em sistemas, e com Java/Kotlin em backend de serviços.

O dado de banco de dados também é relevante:

| Camada de acesso a dados | Adocao |
|---|---|
| database/sql (stdlib) | ~54% |
| sqlc | ~21% |
| GORM | ~18% |
| sqlx | ~14% |
| Bun | ~8% |

O `database/sql` ainda é maioria, mas o `sqlc` está crescendo consistentemente. O modelo do sqlc, onde você escreve SQL e ele gera código Go tipado, ressoa bem com desenvolvedores que preferem controle total sobre as queries sem o overhead de um ORM. O GORM perdeu participação nos últimos anos, embora continue sendo popular em projetos que precisam de abstração de banco rápida.

---

## O que tirar de tudo isso

Os dois surveys juntos pintam um retrato consistente: Go cresceu e está estável em seu nicho de infraestrutura e backend de alta performance.

Gin domina porque funciona bem e tem o ecossistema mais maduro para APIs. Isso vai continuar enquanto a stdlib não fechar completamente a lacuna de ergonomia, o que o Go 1.22 começou mas não terminou.

slog virou o padrão de logging para projetos novos. A não ser que você tenha um motivo específico de performance para usar zap, comece com slog.

Generics atingiram massa crítica de adoção. Se você ainda está evitando generics, vale revisitar, especialmente para código utilitário e bibliotecas compartilhadas.

Tratamento de erros vai continuar sendo atrito. Não existe solução elegante ainda. O que ajuda é consistência dentro do time e wrapping disciplinado com `%w`.

---

## Referências

- [Go Developer Survey 2025 Results](https://go.dev/blog/survey2025) - go.dev/blog, publicado em 21 de janeiro de 2026
- [JetBrains Go Ecosystem Analysis 2025](https://blog.jetbrains.com/go/2025/11/10/go-language-trends-ecosystem-2025/) - blog.jetbrains.com, publicado em 10 de novembro de 2025
- [Go 1.25 Release Notes](https://go.dev/doc/go1.25) - go.dev
- [Go 1.22 Release Notes - ServeMux enhancements](https://go.dev/doc/go1.22) - go.dev
- [slog package documentation](https://pkg.go.dev/log/slog) - pkg.go.dev
- [testing/synctest package](https://pkg.go.dev/testing/synctest) - pkg.go.dev
- [sqlc documentation](https://docs.sqlc.dev) - docs.sqlc.dev
- [Logrus maintenance mode announcement](https://github.com/sirupsen/logrus#maintenance-mode) - github.com/sirupsen/logrus
