# Diretrizes de Contribuição - HunCoding

_Primeiro de tudo, obrigado por considerar contribuir para este projeto!_

Existem muitas maneiras de contribuir, desde escrever tutoriais ou posts no blog, melhorar a documentação, enviar relatórios de bugs e solicitações de recursos, ou escrever código que pode ser incorporado ao projeto.

## Índice

- [Contribuindo com Posts para o Blog](#contribuindo-com-posts-para-o-blog)
- [Relatando um Bug](#relatando-um-bug)
- [Contribuindo com Código/Documentação](#contribuindo-com-códigodocumentação)
- [Recursos Úteis](#recursos-úteis)

## Contribuindo com Posts para o Blog

Se você tem conhecimento para compartilhar, adoraríamos receber sua contribuição!

### Tipos de Posts Aceitos

- **Tutoriais práticos**: Guias passo-a-passo para implementar soluções
- **Análises técnicas**: Deep dives em tecnologias e ferramentas
- **Experiências reais**: Casos de uso e lições aprendidas em projetos
- **Comparações**: Análise comparativa entre ferramentas ou abordagens
- **Dicas e truques**: Pequenas otimizações e melhorias de produtividade

### Processo para Contribuir com Posts

1. **Proposta Inicial**: Abra uma [issue][feat-request] descrevendo sua ideia de post
2. **Aprovação**: Aguarde a aprovação da equipe antes de começar a escrever
3. **Estrutura do Post**: Siga o template padrão do blog
4. **Revisão**: Seu post passará por revisão técnica e editorial
5. **Publicação**: Após aprovação, o post será publicado com créditos

### Template para Posts

```markdown
---
layout: post
title: "Título do Seu Post"
subtitle: "Subtítulo descritivo do conteúdo"
author: seu_nome
date: YYYY-MM-DD HH:MM:SS -0300
categories: [Categoria1, Categoria2]
tags: [tag1, tag2, tag3]
comments: true
image: "/assets/img/posts/sua-imagem.png"
---

## Introdução

Breve introdução sobre o que será abordado no post.

## Desenvolvimento

Conteúdo principal do post com exemplos práticos.

## Conclusão

Resumo dos pontos principais e próximos passos.
```

### Diretrizes de Conteúdo

- **Linguagem**: Português brasileiro claro e objetivo
- **Tom**: Profissional mas acessível, como uma conversa entre colegas
- **Exemplos**: Sempre inclua exemplos práticos e código funcional
- **Imagens**: Use imagens, diagramas ou screenshots quando apropriado
- **Links**: Referencie fontes oficiais e documentação relevante
- **Tamanho**: Posts devem ter entre 1000-3000 palavras

### Estrutura de Arquivos

- **Localização**: `_posts/YYYY-MM-DD-titulo-do-post.md`
- **Imagens**: `assets/img/posts/nome-da-imagem.png`
- **Formato**: Markdown com front matter do Jekyll

### Processo de Revisão

1. **Revisão Técnica**: Verificação da precisão técnica do conteúdo
2. **Revisão Editorial**: Correção de gramática, estilo e clareza
3. **Teste Prático**: Validação de exemplos de código
4. **Aprovação Final**: Confirmação antes da publicação

### Direitos e Créditos

- Você mantém os direitos autorais do seu conteúdo
- O post será publicado sob licença CC BY 4.0
- Seu nome e biografia aparecerão no post
- Você pode republicar o conteúdo em seu próprio blog após 30 dias

## Relatando um Bug

Uma ótima maneira de contribuir para o projeto é enviar uma issue detalhada quando você encontrar um problema. Sempre apreciamos um relatório de bug bem escrito e completo.

1. Por favor, descubra por que o bug ocorreu, ou localize o módulo no projeto que causou este bug. Caso contrário, há uma alta probabilidade de que você esteja usando/configurando incorretamente.

2. Se a issue for causada por você modificar o código do projeto ou alguma configuração do Jekyll, então por favor NÃO relate tais "bugs". O HunCoding é um projeto open-source, mas isso não significa que manteremos forks específicos (como o seu). Você pode aprender sobre Jekyll e desenvolvimento Web moderno para resolver problemas causados por modificações personalizadas.

3. Faça bom uso do modo incógnito do seu navegador para solucionar problemas se o problema for causado por cache.

4. Como última opção, você pode criar um novo [Bug Report][bug-report] seguindo o template para descrever os detalhes. Se possível, fornecer uma demonstração que reproduza o erro nos ajudará a solucionar problemas mais rapidamente.

## Sugerindo uma Nova Funcionalidade

Solicitações de funcionalidades são bem-vindas! Embora consideremos todas as solicitações, não podemos garantir que sua solicitação será aceita. Queremos evitar caos no design da UI e, portanto, não aceitamos solicitações de mudanças como esquemas de cores, famílias de fontes, tipografia, etc. Queremos evitar [feature creep][feat-creep] e focar apenas nas funcionalidades principais. Se aceita, não podemos fazer nenhum compromisso em relação ao cronograma de implementação e lançamento. No entanto, você é bem-vindo a enviar um pull request para ajudar!

## Contribuindo com Código/Documentação

Se sua solicitação for sobre uma melhoria, é recomendado primeiro enviar uma [Feature Request][feat-request] para discutir se sua ideia se encaixa no projeto. Veja também: "[Sugerindo uma Nova Funcionalidade](#sugerindo-uma-nova-funcionalidade)". Além disso, você pode iniciar o processo de PR.

1. Faça um fork deste projeto no GitHub e clone seu repositório localmente.
2. Configure o [ambiente de desenvolvimento e teste][dev-env].
3. Criando uma nova branch da branch padrão e dê a ela um nome descritivo (ex. `add-a-new-feat` ou `fix-a-bug`). Quando o desenvolvimento estiver completo, crie um [Conventional Commit][cc] com Git.
4. Enviando um [Pull Request][gh-pr].

## Recursos Úteis

- [Código de conduta](CODE_OF_CONDUCT.md)
- [Política de segurança](SECURITY.md)
- [Como Fazer Perguntas da Maneira Inteligente][ext-reading]

[latest-ver]: https://github.com/HunCoding/huncoding.github.io/releases/latest
[issues]: https://github.com/HunCoding/huncoding.github.io/issues?q=is%3Aissue
[pr]: https://github.com/HunCoding/huncoding.github.io/pulls
[discus]: https://github.com/HunCoding/huncoding.github.io/discussions
[ext-reading]: http://www.catb.org/~esr/faqs/smart-questions.html
[jekyll-talk]: https://talk.jekyllrb.com/
[stack-overflow]: https://stackoverflow.com/questions/tagged/jekyll
[rtfm]: https://en.wikipedia.org/wiki/RTFM
[stfw]: https://www.webster-dictionary.org/definition/STFW
[gh-reactions]: https://github.blog/2016-03-10-add-reactions-to-pull-requests-issues-and-comments/
[bug-report]: https://github.com/HunCoding/huncoding.github.io/issues/new?assignees=&labels=&projects=&template=bug_report.yml
[feat-request]: https://github.com/HunCoding/huncoding.github.io/issues/new?assignees=&labels=enhancement&projects=&template=feature_request.yml
[feat-creep]: https://en.wikipedia.org/wiki/Feature_creep
[dev-env]: https://jekyllrb.com/docs/
[cc]: https://www.conventionalcommits.org/
[gh-pr]: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests
