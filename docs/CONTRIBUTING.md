# Diretrizes de Contribuição - HunCoding

_Primeiro de tudo, obrigado por considerar contribuir para este projeto!_

Existem muitas maneiras de contribuir, desde escrever tutoriais ou posts no blog, melhorar a documentação, enviar relatórios de bugs e solicitações de recursos, ou escrever código que pode ser incorporado ao projeto. Para proporcionar uma boa experiência tanto para contribuidores quanto para mantenedores, comece com as "[Regras Gerais](#regras-gerais)" antes de tomar outras ações.

## Índice

- [Regras Gerais](#regras-gerais)
- [Perguntas e Solicitações de Ajuda](#perguntas-e-solicitações-de-ajuda)
- [Relatando um Bug](#relatando-um-bug)
- [Sugerindo uma Nova Funcionalidade](#sugerindo-uma-nova-funcionalidade)
- [Contribuindo com Código/Documentação](#contribuindo-com-códigodocumentação)
- [Recursos Úteis](#recursos-úteis)

## Regras Gerais

Todos os tipos de contribuições (_pull requests_, _issues_ e _discussions_) devem seguir estas regras:

- Você deve ler a documentação do projeto para entender as funcionalidades e como usá-lo adequadamente. Isso é para respeitar o tempo dos desenvolvedores e mantenedores do projeto e economizar sua energia para outros problemas que realmente precisam ser resolvidos.

- Use a [versão mais recente][latest-ver]. Se sua contribuição envolver mudanças de código/documentação, atualize para a versão mais recente da branch padrão (`main`).

- Evite fazer contribuições duplicadas pesquisando por [issues][issues] / [discussions][discus] / [pull requests][pr] existentes, mas não deixe comentários inúteis como "Tenho o mesmo problema". Prefira usar [reações][gh-reactions] se você simplesmente quiser "+1" uma issue existente.

- NÃO envie e-mails ou tweets diretamente para os desenvolvedores e mantenedores do projeto, tudo sobre o projeto deve ser deixado no GitHub.

**Dica**: Se você é novo na comunidade open-source, leia "[Como Fazer Perguntas da Maneira Inteligente][ext-reading]" antes de contribuir.

## Perguntas e Solicitações de Ajuda

Esperamos que toda pergunta razoável que você fizer seja respondida adequadamente. Se você quiser uma resposta rápida e oportuna, faça perguntas no [Jekyll Talk][jekyll-talk] e [StackOverflow][stack-overflow], onde há muitos geeks entusiasmados que responderão positivamente suas perguntas desafiadoras.

Se você não conseguir uma resposta de nenhuma das maneiras acima, crie uma nova [discussion][discus]. Contanto que não seja uma duplicata e um problema [RTFM][rtfm] / [STFW][stfw], responderemos o mais rápido possível.

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
