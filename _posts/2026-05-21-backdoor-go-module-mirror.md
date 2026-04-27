---
layout: post
title: "O backdoor que ficou escondido no Go Module Mirror por 3 anos"
subtitle: "Como um pacote malicioso se passou pelo BoltDB no proxy oficial do Go por três anos, o que isso expõe sobre a segurança do ecossistema de módulos e o que fazer para se proteger"
author: otavio_celestino
# date: 2026-05-21 08:00:00 -0300
date: 2026-04-27 08:00:00 -0300
categories: [Go, Segurança, Supply Chain]
tags: [go, golang, security, modules, supply-chain, govulncheck, boltdb, proxy]
comments: true
image: "/assets/img/posts/2026-05-21-backdoor-go-module-mirror.png"
lang: pt-BR
---

E aí, pessoal!

Em abril de 2025, pesquisadores da Socket divulgaram um ataque de supply chain que ficou ativo no proxy oficial de módulos do Go por três anos. O pacote `github.com/boltdb-go/bolt` ficou indexado no `proxy.golang.org` de 2022 a 2025 se passando pelo BoltDB legítimo. Qualquer projeto que instalasse essa dependência estaria executando código malicioso sem saber.

O que torna esse caso diferente dos ataques de typosquatting comuns é a combinação de fatores que permitiu a sobrevivência: o BoltDB real estava arquivado, o proxy do Go armazena módulos para sempre, e o banco de dados de checksums não verifica autenticidade, só integridade.

Isso não é um bug isolado. É uma exposição sistêmica no modelo de segurança do ecossistema de módulos Go.

---

## O ataque

O pacote legítimo é `github.com/boltdb/bolt`. Trata-se de um banco de dados chave-valor embarcado escrito em Go, muito usado nos anos anteriores. Em 2021 o repositório original foi arquivado: sem novos commits, sem manutenção ativa.

Quem precisava de "BoltDB com manutenção ativa" ou "fork mantido do BoltDB" e fazia uma busca pública encontrava diversas opções. O pacote `github.com/boltdb-go/bolt` aparecia nessa lista.

A diferença no nome é sutil. `boltdb/bolt` é o original. `boltdb-go/bolt` é o falso. Um traço a mais no path do GitHub. Visualmente, o nome é quase idêntico.

O pacote malicioso foi publicado e indexado pelo `proxy.golang.org`. A partir daí, qualquer instalação via `go get github.com/boltdb-go/bolt` baixava o código comprometido, que ficava armazenado no cache local em `GOMODCACHE`.

Os pesquisadores da Socket confirmaram que o pacote ficou disponível de 2022 até a descoberta em abril de 2025. Três anos no proxy oficial.

---

## Como o module proxy funciona

Para entender por que isso aconteceu, é preciso entender a arquitetura do sistema de módulos do Go.

Quando você executa `go get github.com/algum/pacote`, o toolchain do Go não vai diretamente ao GitHub buscar o código. Ele consulta o `proxy.golang.org` primeiro.

O proxy faz o download do módulo, armazena uma cópia e serve essa cópia em requisições futuras. O objetivo é disponibilidade: mesmo que o repositório original seja apagado, o módulo continua acessível.

Junto com o proxy existe o `sum.golang.org`, o banco de dados de checksums. Ele registra o hash de cada versão de cada módulo que passou pelo proxy. Quando você instala um módulo, o Go verifica se o hash do que foi baixado corresponde ao que está registrado no sum database.

O arquivo `go.sum` no seu projeto é a manifestação local disso. Cada linha representa um módulo em uma versão específica com seu hash esperado.

```
github.com/boltdb/bolt v1.3.1 h1:IFsbd7dp9kbKA2M9GA8LJKnyjTD4Uc0Kzv7s3mLSmwQ=
github.com/boltdb/bolt v1.3.1/go.mod h1:clJnj/oiGkjum5o1McbSZDSLxVThjynRyGBgiAx27Ps=
```

O problema: o sum database garante que o pacote que você baixa hoje é o mesmo que foi registrado na primeira vez. Ele não garante que aquele pacote é seguro, que vem de uma fonte confiável, ou que o mantenedor tem alguma relação com o nome que está usando.

O hash do `github.com/boltdb-go/bolt` era consistente. O sum database estava verificando a integridade de um pacote malicioso com perfeita fidelidade.

---

## Por que durou 3 anos

Três fatores combinados explicam a longevidade do ataque.

**Cache permanente.** O `proxy.golang.org` não expira módulos. Uma vez que um módulo é indexado, ele fica disponível indefinidamente. Não existe mecanismo de remoção automática por inatividade, por denúncia, ou por falta de uso. O módulo malicioso ficou lá porque o proxy não tem razão para remover nada.

**Sem sistema de propriedade de nomes.** No npm existe um registro centralizado onde cada nome de pacote pertence a um usuário específico. No Go, o módulo path é derivado do repositório Git. Qualquer pessoa que crie `github.com/boltdb-go` no GitHub pode publicar `github.com/boltdb-go/bolt`. Não existe proteção de namespace baseada em similaridade com pacotes existentes. A equipe do BoltDB original não tem controle sobre o que pode ser publicado em paths similares.

**BoltDB arquivado criou uma lacuna.** O repositório original `github.com/boltdb/bolt` está arquivado. Isso significa que aparecem em buscas como "unmaintained" ou "archived". Quem buscava por uma alternativa mantida estava num estado de busca ativa, o que aumenta a chance de instalar o que parece ser a versão certa.

Esses três fatores juntos criaram uma janela que ficou aberta por três anos sem alertas automáticos, sem expiração e sem revisão.

---

## O que o BoltDB tem a ver com isso

O BoltDB é uma escolha de caso de uso específico: banco de dados embarcado, sem servidor, para aplicações que precisam de persistência local simples. Competia com bbolt, badger e o próprio SQLite com driver CGO-free.

O repositório `github.com/boltdb/bolt` foi arquivado porque o projeto cumpriu seu objetivo. Existe um fork oficial chamado `go.etcd.io/bbolt`, mantido pela equipe do etcd, que é a continuação recomendada. Mas muitos projetos mais antigos ainda referenciam o path original e alguém que descobriu o projeto por documentação antiga poderia naturalmente pesquisar "bolt go module maintained fork".

O atacante explorou exatamente isso. O nome `boltdb-go` soa como um fork organizado: "BoltDB, mas em formato de módulo Go". Para quem está buscando sem conhecer o histórico, parece legítimo.

Esse padrão se repete em outros ataques. Em maio de 2025 o The Hacker News reportou um caso separado onde módulos Go maliciosos entregavam malware que apagava discos em sistemas Linux. O vetor de entrada era o mesmo: nomes plausíveis, descrições convincentes, e a ausência de verificação de autenticidade no ecossistema.

---

## Como auditar suas dependências agora

A primeira ferramenta é o `govulncheck`. Ela verifica vulnerabilidades conhecidas nas dependências do seu projeto usando o banco de dados de vulnerabilidades do Go.

Instala:

```bash
go install golang.org/x/vuln/cmd/govulncheck@latest
```

Roda na raiz do projeto:

```bash
govulncheck ./...
```

O output lista vulnerabilidades encontradas com o CVE correspondente, a versão afetada e a versão corrigida quando disponível. Para vulnerabilidades no banco de dados oficial, isso funciona bem. Para pacotes maliciosos sem CVE registrado, o govulncheck não vai encontrar nada.

Para investigar o grafo de dependências, o `go mod graph` mostra todas as relações entre módulos:

```bash
go mod graph | grep boltdb
```

Isso filtra as linhas do grafo que contêm "boltdb" e mostra se o pacote legítimo ou o malicioso está presente, e por qual dependência ele foi puxado.

Para entender por que um módulo específico está no seu projeto:

```bash
go mod why github.com/boltdb/bolt
```

O output mostra o caminho de importação: qual arquivo do seu projeto importa qual pacote que por sua vez depende do módulo em questão. Se a resposta for surpreendente, você tem uma dependência transitiva inesperada para investigar.

Para uma visão completa do que está instalado localmente, o `GOMODCACHE` guarda todos os módulos baixados:

```bash
ls $GOPATH/pkg/mod/github.com/ | grep bolt
```

Ou usando a variável padrão:

```bash
ls $(go env GOMODCACHE)/github.com/ | grep bolt
```

Se você encontrar `boltdb-go` em vez de `boltdb`, o pacote malicioso passou pelo seu ambiente.

Uma abordagem de auditoria mais sistemática é verificar os repositórios das dependências diretas. Para cada entrada no `go.mod`, confirme que o repositório referenciado existe, que o autor faz sentido, e que não foi arquivado recentemente de forma suspeita.

---

## Boas praticas pra nao ser a proxima vitima

**Pin de versoes com go.sum.** O arquivo `go.sum` garante que a versao instalada nao mudou desde que foi registrada. Nunca comite um `go.sum` incompleto. Nunca rode `go mod tidy` sem verificar o diff do `go.sum` no code review.

**Auditoria de dependencias no CI.** Adicione o `govulncheck` ao pipeline de CI como passo obrigatorio:

```bash
govulncheck ./...
```

Se retornar exit code diferente de zero, o build falha. Simples.

**Vendor mode como camada extra.** O flag `-mod=vendor` faz o Go usar apenas o diretorio `vendor/` local em vez de baixar do proxy:

```bash
go build -mod=vendor ./...
```

Com vendor commiteado no repositorio, o CI nao depende de rede e o que esta sendo compilado e exatamente o que foi revisado por humanos. Nao e pratico para todos os projetos, mas e a protecao mais forte contra ataques de supply chain via proxy.

**GOFLAGS para ambientes controlados.** Voce pode definir o flag de vendor por padrao:

```bash
export GOFLAGS=-mod=vendor
```

**Revisar dependencias novas em code review.** Qualquer adicao ao `go.mod` deve ser justificada. Perguntas uteis: quem mantem esse modulo? O repositorio esta ativo? Quantos dependentes ele tem? O path do modulo faz sentido em relacao ao nome do repositorio?

**GONOSUMCHECK e GONOSUMDB com cuidado.** Essas variaveis permitem pular a verificacao de checksum para paths especificos. Sao uteis para modulos internos privados. Nunca use `GONOSUMCHECK=*` em producao: voce desativa a unica verificacao de integridade que o toolchain faz.

---

## O que o ecossistema Go mudou apos isso

A descoberta gerou pressao para mudancas no modelo de seguranca do ecossistema.

O banco de dados de vulnerabilidades do Go (`vuln.go.dev`) foi atualizado com o caso do `boltdb-go`. Isso significa que o `govulncheck` agora detecta o pacote especifico.

A equipe do Go discutiu publicamente a adicao de verificacoes de similaridade de nome no proxy: antes de indexar um modulo novo, verificar se o path e visualmente similar a modulos ja existentes com alta popularidade. Essa funcionalidade nao estava disponivel no momento em que esse post foi escrito, mas estava em discussao no issue tracker publico do Go.

O `pkg.go.dev`, o portal de documentacao de pacotes Go, passou a exibir alertas mais proeminentes quando um modulo e similar a outro existente. Nao e uma barreira tecnica, mas aumenta a visibilidade.

O problema estrutural permanece: o Go nao tem um registro centralizado com propriedade de nomes. Isso e uma decisao de design deliberada, mas tem custo de seguranca. Linguagens com registros centralizados como npm e PyPI ja passaram por crises similares e implementaram controles adicionais.

O caso do `boltdb-go` provavelmente nao sera o ultimo. A diferenca e que agora ha mais consciencia do vetor e mais ferramentas para monitorar.

---

## Referencias

- [Socket Research: Malicious Go Module on Go Module Proxy for 3 Years](https://socket.dev/blog/malicious-go-package-on-go-module-proxy)
- [The Register: Go module mirror served backdoored packages for three years](https://www.theregister.com/2025/04/03/go_module_mirror_served_backdoored/)
- [The Hacker News: Malicious Go Modules Deliver Disk-Wiping Linux Malware in Advanced Supply Chain Attack](https://thehackernews.com/2025/05/malicious-go-modules-deliver-disk.html)
- [Security Boulevard: Go Module Supply Chain Attack Exposes Millions to Risk](https://securityboulevard.com/2025/04/go-module-supply-chain-attack/)
- [Go Vulnerability Database](https://vuln.go.dev)
- [govulncheck: documentacao oficial](https://pkg.go.dev/golang.org/x/vuln/cmd/govulncheck)
- [Go Module Proxy: documentacao oficial](https://go.dev/ref/mod#module-proxy)
- [Go Checksum Database](https://sum.golang.org)
- [bbolt: fork mantido do BoltDB](https://github.com/etcd-io/bbolt)
