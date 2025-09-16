---
layout: post
title: "Utilizando Reusable Workflow com Github Actions"
subtitle: Aprendendo a construir pipeline com Github Actions.
date: 2025-09-15 00:00:00 -0000
author: Ronaldosoaresdeb
categories: [DevOps]
tags: [go, Github, Actions, CI,CD,Reusables,Workflows]
comments: true
image: "/assets/img/posts/github-actions-reusable.png"
---


Fala Galera!

Hoje vim falar sobre GitHub actions, mais precisamente sobre Reusable workflows, uma prática bem recomendada e utilizada nos dias de hoje. 
mas antes de começar...

## O que é reusable workflow ?

O GitHub Actions foi lançado em 2018 na conferência GitHub Universe. No início, o foco eram as Actions individuais (normalmente escritas em JavaScript ou como contêineres Docker), a reutilização era limitada a esses pequenos componentes. Com a adoção em massa, as organizações começaram a criar workflows complexos,a duplicação de código YAML explodiu 💣 workflows quase idênticos. Manter e atualizar essas dezenas ou centenas de arquivos YAML tornou-se um pesadelo sem precedentes. Com isso, o Github introduziu duas soluções poderosas para combater a duplicação.
Composite Actions (podemos falar dele em um outro post) e Reusable Workflows. 
O Reusable ganhou bastante popularidade nos últimos tempos, mas o que seria essa prática?
Vamos começar pelo conceito de DRY (Don’t Repeat Yourself) ou seja evitar duplicação de códigos ou logica reutilizar o código por isso o #reusable
o que se ganha com no Reusables ?


## Mas porque utilizar o reusable ?

Antes de pensar em usar vamos entender o fundamento 🎓 
- **DRY:**  (Don't Repeat Yourself) na CI/CD:

Este é o princípio fundamental. Por que copiar e colar 100 linhas de YAML em 50 repositórios torna voce um NOOB, 
porque a ideia de automatização é...Automatizarrrr.. não virar com COPY past profissional 
o Dry é feito para que não se repita o codigo e um conceito de clean code e deixa tudo organizado e bonitinho para os colegas 🧠

- **Consistência e Padronização**:
- **Facilidade de Manutenção**:
- **Governança e Segurança**:
- **Experiência do Desenvolvedor (DEVEX)**

Manter um workflow com meia dúzia de sistemas padronizados em uma unica arquitetura e tecnologia, é tranquilo agora imagine uma empresa com mais de 40 mil repositórios uma infinidade de tecnologia e cada dia lançando uma nova é um missão daquelas,

## Vamos entender o Caller

Junto com workflow vem uma outro termo chamado "caller" (chamador) no contexto de Reusable Workflows no GitHub Actions, o caller é simplesmente o workflow que chama outro workflow reutilizável.

    .github/ 
    └── workflows/ 
    ├── ci.yml # Workflow "principal" (caller) 
    └── reusable-build.yml # Workflow "reutilizável" (reusable)

Caller é o arquivo .yml em .github/workflows/ que invoca um outro workflow ele usa a chave "uses" para apontar para o workflow reutilizável.

### olhe o exemplo aqui 👇🏻


```yaml

name: CI Reusable

on:
  push:
    branches: [ "main" ]

jobs:
  build:
    uses: ./.github/workflows/reusable-build.yml # 👈🏽 Nosso querido amigo caller
    with:
      node-version: 18
    secrets: inherit

```

### Exemplo de reusable workflow com caller

```yaml

name: Reusable Build

on:
  workflow_call:   # 👈🏽 só funciona se tiver isso
    inputs:
      node-version:
        required: true
        type: string

jobs:
  setup-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}
      - run: npm install && npm run build
```

### Funcionamento na pratica


![Diagrama do Fluxo Workflow](/assets/img/posts/fluxo-workflow.png)
*Figura: Fluxo de funcionamento do Reusable Workflow*

### Mas, porém, contudo, todavia, entretanto..."


Pense na construção de uma casa, você não vai querer construir uma casa e no meio da cozinha um chafariz, não dá ne meu amigo minha amiga...
Você define a estrutura completa (onde vai a pia, o mesa, as tomadas) e simplesmente "instancia" essa planta em diferentes casas (repositórios) 
construir algo bom simples e facil de manter vai ajudar seu dia a dia da melhor forma naquele modelo,
Se você chegou ate aqui obrigado pela sua atenção e seu comprometimento com uma T.I mais linda digite reusable que vou mandar o link ... não pera!