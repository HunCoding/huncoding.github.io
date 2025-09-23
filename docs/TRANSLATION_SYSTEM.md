# Sistema de Tradução Multilíngue

Este documento explica como usar o sistema de tradução implementado no blog HunCoding.

## Visão Geral

O sistema permite que os posts sejam traduzidos para inglês sem a necessidade de criar arquivos separados. Os usuários podem alternar entre português e inglês usando o botão de idioma na barra superior.

## Como Funciona

### 1. Frontend (JavaScript)
- Botão de alternância de idioma na barra superior
- JavaScript que gerencia a troca de idiomas
- Persistência da preferência do usuário no localStorage
- Tradução dinâmica do conteúdo da página

### 2. Backend (Jekyll Plugin)
- Plugin Ruby que processa traduções durante o build
- Extrai traduções do front matter dos posts
- Gera dados JSON para o frontend

### 3. Estrutura de Dados
- Traduções armazenadas no front matter do post
- Dados injetados no HTML via script inline
- JavaScript acessa e aplica as traduções

## Como Adicionar Traduções a um Post

### Estrutura do Front Matter

```yaml
---
layout: post
title: "Título em Português"
subtitle: "Subtítulo em Português"
author: otavio_celestino
date: 2025-01-15 10:00:00 -0300
categories: [Categoria]
tags: [tag1, tag2]
comments: true
translations:
  title_en: "Title in English"
  subtitle_en: "Subtitle in English"
  content_en: |
    Content in English here...
    
    You can use **markdown** formatting.
    
    - Lists work
    - Multiple paragraphs
    - Links and code blocks
---
```

### Campos de Tradução

- `title_en`: Título em inglês
- `subtitle_en`: Subtítulo em inglês  
- `content_en`: Conteúdo completo em inglês (suporta Markdown)

### Exemplo Completo

```yaml
---
layout: post
title: "Como Criar um Operador Kubernetes"
subtitle: "Aprendendo a construir operadores do zero"
author: otavio_celestino
date: 2025-01-15 10:00:00 -0300
categories: [Kubernetes, Go]
tags: [kubernetes, operator, golang]
comments: true
translations:
  title_en: "How to Create a Kubernetes Operator"
  subtitle_en: "Learning to build operators from scratch"
  content_en: |
    Hey everyone!

    Today I'm going to show you how to create a **Kubernetes Operator** from scratch that monitors ConfigMap changes and sends events to a webhook.

    ## Why is this useful?

    Imagine you have an application running in Kubernetes and need to change a configuration. Instead of restarting the entire application, you can:

    1. Change the ConfigMap
    2. The operator detects the change
    3. Sends an event to your application
    4. Your application does hot reload of the configuration

    ## Step by Step

    ### Step 1: Creating the Base Project

    First, let's create the project structure using Kubebuilder:

    ```bash
    kubebuilder init --domain example.com --repo github.com/user/my-operator
    ```

    This will generate the complete project structure for you.
---
```

## Funcionalidades do Sistema

### Botão de Alternância
- Localizado na barra superior
- Ícone de globo com código do idioma atual
- Alterna entre PT-BR e EN
- Lembra a preferência do usuário

### Tradução Automática
- Título e subtítulo do post
- Conteúdo completo
- Elementos da interface (busca, navegação, etc.)
- Metadados do post (data, autor, etc.)

### Persistência
- Preferência salva no localStorage
- URL atualizada com parâmetro de idioma
- Funciona entre sessões do navegador

## Limitações Atuais

1. **Apenas PT-BR ↔ EN**: Sistema configurado para português e inglês
2. **Tradução Manual**: Requer tradução manual do conteúdo
3. **Markdown Básico**: Processamento limitado de Markdown nas traduções
4. **SEO**: Apenas um idioma é indexado pelos motores de busca

## Extensões Futuras

### Possíveis Melhorias
- Suporte a mais idiomas
- Tradução automática via API
- Melhor processamento de Markdown
- SEO multilíngue
- Tradução de comentários
- Sistema de contribuições de tradução

### Como Implementar Novos Idiomas

1. Adicionar novo idioma no JavaScript (`language-toggle.js`)
2. Atualizar o plugin Ruby para processar o novo idioma
3. Adicionar arquivo de localização em `_data/locales/`
4. Atualizar o botão de alternância para suportar múltiplos idiomas

## Troubleshooting

### Tradução Não Aparece
- Verifique se o front matter contém `translations:`
- Confirme que os campos `title_en`, `subtitle_en`, `content_en` estão preenchidos
- Verifique o console do navegador para erros JavaScript

### Botão Não Funciona
- Verifique se o arquivo `language-toggle.js` está sendo carregado
- Confirme que não há erros JavaScript no console
- Teste em modo incógnito para verificar cache

### Conteúdo Não Traduz
- Verifique se o plugin Ruby está sendo executado
- Confirme que os dados de tradução estão sendo injetados no HTML
- Verifique se o JavaScript está acessando os dados corretamente

## Exemplos de Uso

Veja o post de exemplo em `_posts/2025-01-15-exemplo-traducao-post.md` para uma demonstração completa do sistema.

## Suporte

Para dúvidas ou problemas com o sistema de tradução, abra uma issue no repositório ou entre em contato através dos canais oficiais do HunCoding.
