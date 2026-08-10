---
layout: post
title: "Sua API de pagamentos provavelmente implementa idempotência do jeito errado"
subtitle: "Idempotência não é deduplicação: retries, concorrência e consistência em APIs transacionais com Go"
author: guifranchim
date: 2026-08-10 10:00:00 -0300
categories: [Go, APIs, Pagamentos, Arquitetura]
tags: [go, golang, idempotency, payments, api-design, postgresql, redis, distributed-systems, concurrency, ledger]
comments: true
lang: pt-BR
---

E aí, pessoal!

Um cliente envia uma ordem de PIX e recebe `timeout`. Nos logs, porém, o commit da transação aparece como concluído. A API falhou ou funcionou?

As duas respostas podem ser verdade. `timeout` só diz que o cliente parou de esperar; o resultado do servidor continua desconhecido para ele. Se repetir a chamada, pode pagar duas vezes. Se não repetir, pode abandonar o pagamento.

É esse resultado desconhecido que a idempotência precisa resolver. Ela não impede o segundo request. Ela impede que o segundo request se transforme em um segundo efeito financeiro.

Uma tabela de idempotência — ou `SETNX` no Redis — cobre apenas parte do problema. Vamos implementar o núcleo do contrato em Go com PostgreSQL. Redis entra depois, para performance; a fonte de verdade continua durável.

---

## O caso que parece simples até deixar de ser

Considere esta chamada:

```http
POST /transactions HTTP/1.1
Authorization: Bearer ...
Idempotency-Key: 8c2f8a57-8e7c-4ca4-b658-d728f5333fa1
Content-Type: application/json

{
  "direction": "out",
  "amount_in_cents": 10000,
  "currency": "BRL",
  "destination_id": "pix-key-42"
}
```

O serviço cria `UUID-A`, movimenta R$ 100,00 e responde `201 Created`, mas a resposta se perde. No retry, ele deve devolver `UUID-A` sem mover dinheiro novamente. O caso interessante começa quando a chave reaparece em outro comando:

```text
A: PIX OUT | key=1 | body=X
B: PIX IN  | key=1 | body=Y
C: PIX OUT | key=1 | body=X
```

Qual deveria ser o comportamento de `B` e `C`?

| Semântica da chave | B | C |
|---|---|---|
| A chave só identifica retries dentro de cada operação | cria outra transação | devolve `UUID-A` |
| A chave identifica uma intenção financeira do cliente | rejeita o reuso | devolve `UUID-A` |
| A chave só pode aparecer uma vez, até em retry idêntico | rejeita | rejeita |

A terceira opção impede o retry. A primeira só funciona com namespaces independentes e documentados.

Aqui, escolho a segunda: para o mesmo cliente, a chave identifica uma intenção financeira. `B` recebe conflito; `C`, novamente `UUID-A`. Outro cliente ainda pode usar `key=1`, pois o escopo inclui o `tenant_id`.

Essa escolha vem antes do banco, do middleware e do código Go. Sem definir o significado da chave, a implementação apenas automatiza uma ambiguidade.

---

## Idempotência não é deduplicação

Deduplicação pergunta: “eu já vi algo parecido?”. Idempotência oferece um contrato mais forte: “você pode repetir esta intenção sem produzir outro efeito”.

Espaços e ordem dos campos podem mudar os bytes sem mudar a intenção. A mesma chave também pode acompanhar comandos diferentes. Por isso, comparar só o body ou só a chave falha.

Precisamos, então, de dois identificadores:

1. **Idempotency key:** gerada pelo cliente para declarar que tentativas diferentes pertencem à mesma intenção.
2. **Fingerprint semântico:** gerado pelo servidor para confirmar que a chave não foi reutilizada com outro comando.

O fingerprint não substitui a key. Duas transferências de R$ 100,00 para o mesmo destino podem ser pagamentos legítimos e independentes. A key diz **qual é a intenção**; o fingerprint confirma **se ela continua igual**.

No HTTP, métodos como `GET`, `PUT` e `DELETE` são idempotentes; `POST` não. O header `Idempotency-Key` sinaliza a intenção, mas o contrato do servidor torna o retry seguro.

O Internet-Draft do IETF para esse header expirou em abril de 2026 e não é um RFC, mas organiza bem três situações:

| Situação | Resposta sugerida |
|---|---|
| A operação exige a chave, mas ela não foi enviada | `400 Bad Request` |
| A mesma chave foi usada com outro payload | `422 Unprocessable Content` |
| O retry chegou enquanto a primeira tentativa ainda está em andamento | `409 Conflict` |

Neste artigo, `422` pede que o integrador corrija a requisição; `409` pede que aguarde antes de tentar novamente.

---

## Não calcule o hash do body cru

Um atalho comum é aplicar SHA-256 diretamente nos bytes recebidos. Isso transforma diferenças irrelevantes em conflitos:

```json
{"amount_in_cents":10000,"currency":"BRL"}
```

e

```json
{
  "currency": "BRL",
  "amount_in_cents": 10000
}
```

representam o mesmo comando, mas têm bytes diferentes.

Valide e normalize o request em um tipo de domínio antes do fingerprint. Abaixo, `cmd` já está normalizado:

```go
type CreateTransactionCommand struct {
	Direction     string `json:"direction"`
	DestinationID string `json:"destination_id"`
	AmountInCents int64  `json:"amount_in_cents"`
	Currency      string `json:"currency"`
}

func fingerprint(cmd CreateTransactionCommand, secret []byte) ([]byte, error) {
	payload := struct {
		Version   int                      `json:"version"`
		Operation string                   `json:"operation"`
		Command   CreateTransactionCommand `json:"command"`
	}{
		Version:   1,
		Operation: "create_transaction",
		Command:   cmd,
	}

	canonical, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal fingerprint: %w", err)
	}

	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write(canonical)

	return mac.Sum(nil), nil
}
```

O valor monetário usa unidade mínima (`int64`). Operação e versão entram no fingerprint; campos de transporte ficam de fora. HMAC-SHA-256 também dificulta testar valores de baixa entropia — como CPF — contra fingerprints vazados.

Se `brl` e `BRL` são equivalentes no contrato, normalize antes do fingerprint. Canonicalização não deve inventar equivalências.

Versione e proteja o segredo do HMAC; mantenha versões antigas até as chaves expirarem. Entre linguagens, adote uma regra formal como a JSON Canonicalization Scheme (RFC 8785), não a serialização de uma biblioteca.

Valide tamanho, formato e entropia da key; UUID v4 é uma escolha comum. Evite dados pessoais. O escopo vem da autenticação e acompanha a fronteira de autorização, que pode ser menor que o `tenant_id`.

---

## O PostgreSQL deve proteger a invariante

Para uma primeira versão de produção, PostgreSQL basta: idempotência, transação, ledger e outbox podem compartilhar o mesmo commit.

Uma tabela possível é esta:

```sql
CREATE TABLE idempotency_records (
    tenant_id              UUID         NOT NULL,
    idempotency_key        VARCHAR(128) NOT NULL,
    operation              VARCHAR(64)  NOT NULL,
    request_fingerprint    BYTEA        NOT NULL,
    fingerprint_version    SMALLINT     NOT NULL DEFAULT 1,
    status                 VARCHAR(16)  NOT NULL,
    transaction_id         UUID,
    response_code          SMALLINT,
    response_headers       JSONB,
    response_body          JSONB,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    expires_at             TIMESTAMPTZ  NOT NULL,

    PRIMARY KEY (tenant_id, idempotency_key),

    CHECK (status IN ('processing', 'finished')),
    CHECK (
        (status = 'processing' AND response_code IS NULL)
        OR
        (status = 'finished' AND response_code IS NOT NULL)
    )
);
```

`operation` fica fora da chave primária porque outra movimentação com a mesma key é conflito. Se o produto adotar namespaces, inclua a família do comando explicitamente.

A disputa não pode ser resolvida com `SELECT` seguido de `INSERT`: duas requisições podem observar a ausência ao mesmo tempo. A arbitragem deve ser atômica:

```sql
INSERT INTO idempotency_records (
    tenant_id,
    idempotency_key,
    operation,
    request_fingerprint,
    status,
    expires_at
)
VALUES ($1, $2, $3, $4, 'processing', $5)
ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
RETURNING tenant_id;
```

Quem recebe a linha ganhou o direito de iniciar. Quem não recebe lê o registro existente:

- fingerprint diferente: retorna `422` sem executar nada;
- status `finished`: devolve a resposta persistida;
- status `processing`: aguarda por um intervalo curto ou retorna `409` com `Retry-After`.

No fluxo local, o segundo `INSERT` pode esperar o vencedor e, depois do commit, ler `finished`. Se usar um `lock_timeout` curto, faça rollback da transação que expirou antes de mapear o erro para `409`. No fluxo assíncrono, a idempotência pode estar `finished` com `202` enquanto a transação financeira continua `pending`: são estados diferentes.

No PostgreSQL, a restrição única é a última linha de defesa contra a corrida. Um lock em memória ou no Redis pode reduzir contenção, mas não substitui essa restrição.

---

## A chave e o dinheiro precisam participar do mesmo commit

O fluxo local ideal é curto:

```text
BEGIN
  1. reserva a idempotency key
  2. cria a transação
  3. grava débito e crédito no ledger
  4. grava o evento na outbox
  5. salva a resposta da operação
COMMIT
```

Se qualquer etapa falhar, tudo volta. Não pode haver débito confirmado sem idempotência, nem chave finalizada apontando para uma transação desfeita.

O código abaixo omite detalhes de repositório para deixar visível a fronteira importante:

```go
func (s *Service) Execute(
	ctx context.Context,
	tenantID string,
	key string,
	cmd CreateTransactionCommand,
) (StoredResponse, error) {
	cmd, err := normalizeAndValidate(cmd)
	if err != nil {
		return StoredResponse{}, err
	}

	requestFingerprint, err := fingerprint(cmd, s.fingerprintSecret)
	if err != nil {
		return StoredResponse{}, err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return StoredResponse{}, fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback()

	acquired, err := s.idempotency.TryStart(
		ctx, tx, tenantID, key, requestFingerprint,
	)
	if err != nil {
		return StoredResponse{}, err
	}

	if !acquired {
		record, err := s.idempotency.Get(ctx, tx, tenantID, key)
		if err != nil {
			return StoredResponse{}, err
		}

		if !hmac.Equal(record.Fingerprint, requestFingerprint) {
			return StoredResponse{}, ErrIdempotencyKeyReused
		}
		if record.Status == "processing" {
			return StoredResponse{}, ErrRequestInProgress
		}

		return record.Response.AsReplay(), nil
	}

	transaction, err := s.ledger.CreateTransaction(ctx, tx, tenantID, cmd)
	if err != nil {
		return StoredResponse{}, err
	}

	response := newCreateTransactionResponse(transaction)

	if err := s.outbox.AppendTransactionCreated(ctx, tx, transaction); err != nil {
		return StoredResponse{}, err
	}
	if err := s.idempotency.Finish(ctx, tx, tenantID, key, response); err != nil {
		return StoredResponse{}, err
	}

	if err := tx.Commit(); err != nil {
		// O commit pode ter sido aplicado. O retry deve consultar a key.
		return StoredResponse{}, ErrOutcomeUnknown
	}

	return response, nil
}
```

O exemplo mostra o sucesso. Um request inválido pode ser corrigido com a mesma chave antes da reserva. Depois dela, persista falhas terminais com `Finish` e commit; somente falhas transitórias sem efeito durável fazem rollback.

O detalhe decisivo está no `Commit`: erro ao confirmar não prova rollback. A conexão pode cair depois que o PostgreSQL tornou os dados duráveis. A recuperação abre outra conexão e consulta a key; debitar novamente “por garantia” recria o problema.

---

## Não segure uma transação do banco enquanto chama outro provedor

O exemplo funciona quando o efeito cabe no mesmo banco. Uma chamada a PSP, banco ou iniciador PIX não participa da transação do PostgreSQL. Mantê-la aberta durante a chamada remota aumenta locks, mas não cria atomicidade entre os sistemas.

Se o provedor executa, a resposta se perde e a transação local volta, o banco fez rollback — o dinheiro não.

Para fluxos externos, prefira uma operação durável e assíncrona:

1. crie a transação interna com status `pending`;
2. grave a idempotency key e uma mensagem de outbox no mesmo commit;
3. responda `202 Accepted` com o `transaction_id` e um `Location` para consulta;
4. um worker envia a ordem usando uma chave derivada do `transaction_id`, sob controle do seu domínio;
5. webhook e reconciliação atualizam o estado sem criar um segundo lançamento.

Se a experiência exigir resposta síncrona, confirme a operação interna antes da chamada externa. Propague a identidade estável ao provedor e trate timeout como resultado desconhecido: consulte ou reconcilie antes de reenviar.

`context.Context` cancelado também não é rollback distribuído: fechar a conexão cancela a espera HTTP, não um commit ou uma ordem já aceita.

---

## Qual resposta deve voltar no retry?

As políticas variam. A Stripe repete o status code e o body iniciais, inclusive `500`; o PayPal devolve o estado atual; a AWS pede uma resposta semanticamente equivalente. Documente a sua escolha.

Para transações, prefiro separar comando e consulta. O `POST` sempre aponta ao mesmo `transaction_id`; o `GET /transactions/{id}` mostra o estado atual. Persista apenas headers estáveis, como `Location`, e gere um novo `request_id` para cada tentativa.

Uma matriz de respostas pode ficar assim:

| Cenário | Resposta |
|---|---|
| Primeira requisição concluída | `201 Created` ou `202 Accepted` |
| Retry idêntico concluído | mesma resposta lógica e mesmo `transaction_id` |
| Mesma chave, outra intenção | `422 Unprocessable Content` |
| Mesma intenção ainda processando | `409 Conflict` + `Retry-After` |
| Falha de validação antes da aceitação | `4xx`, sem consumir a chave |
| Falha terminal de negócio após a aceitação | repete o mesmo `4xx` |
| Falha transitória antes de qualquer efeito durável | `5xx`, retry permitido com a mesma chave |
| Falha depois do commit, antes da resposta | retry consulta e devolve o resultado já gravado |

Do lado do cliente, timeout, `409` e erros explicitamente transitórios usam a mesma key, com backoff e jitter. Trocar a key cria outra intenção.

---

## TTL não pode ser escolhido copiando a Stripe

Vinte e quatro horas viraram um número mágico, mas os provedores divergem. A Stripe permite remover registros depois de pelo menos 24 horas. A Adyen mantém por no mínimo sete dias. No PayPal, a janela depende de cada API.

O TTL deve cobrir retries do cliente e do provedor, atrasos de filas, reentrega de webhooks e reconciliação.

Em pagamentos, vale separar duas retenções:

1. **Resposta idempotente:** body necessário para reproduzir o contrato HTTP, mantido por uma janela limitada.
2. **Identidade financeira:** vínculo mínimo entre chave, fingerprint, `transaction_id` e referência externa, retido por mais tempo ou protegido também por uma restrição de negócio.

Assim, é possível remover um body sensível sem esquecer que a ordem financeira existiu. A expiração da chave não deve ser a única barreira contra a mesma referência entrar duas vezes no ledger.

Publique se, depois do TTL, a chave será tratada como nova. Indexe `expires_at` e remova registros em lotes pequenos, sem disputar I/O com pagamentos.

---

## Exactly-once é uma promessa grande demais

A rede, a fila e o webhook podem entregar mais de uma vez ou fora de ordem. A garantia precisa ser mais precisa que “exactly once”: **um efeito financeiro para a mesma intenção, dentro de escopo e janela documentados**.

As defesas vivem em camadas. Na API, key e fingerprint. No banco, restrição única, transação e lançamentos balanceados. No fluxo assíncrono, outbox no produtor e inbox — IDs de eventos persistidos — nos consumidores. Por fim, webhooks com transições válidas e reconciliação com o provedor.

A outbox resolve o dual write entre banco e broker, mas o publicador ainda pode enviar mais de uma vez; o consumidor continua idempotente.

Ignorar webhook duplicado também não basta: eventos diferentes podem falar do mesmo objeto e chegar fora de ordem. A máquina de estados deve impedir regressões, como transformar um pagamento liquidado em `pending` por uma notificação atrasada.

“Não executar a função duas vezes” é uma propriedade local. “Não debitar duas vezes” é uma invariante do sistema inteiro.

---

## Onde Redis entra — e onde não entra

A versão somente com PostgreSQL é uma base de produção. Antes de adicionar infraestrutura, meça contenção, latência e volume.

Quando os números justificarem, Redis pode:

1. cachear respostas finalizadas para retries muito frequentes;
2. aplicar um gate curto para reduzir tempestades de chamadas concorrentes;
3. aliviar leituras repetidas de registros quentes.

O fluxo continua seguro:

```text
request normalizado + fingerprint
  -> lê fingerprint + resposta no Redis por escopo/key
  -> em cache hit, compara o fingerprint
  -> em cache miss, consulta/reserva no PostgreSQL
  -> executa e faz commit no PostgreSQL
  -> atualiza o Redis como best effort
```

Cache hit divergente retorna `422`; cache miss nunca autoriza a movimentação. Sem Redis, o sistema volta ao PostgreSQL e à sua restrição única. O TTL do cache não ultrapassa a retenção durável.

Expiração, eviction, failover e replicação assíncrona podem fazer um lock desaparecer. A documentação do Redis descreve o caso em que uma réplica é promovida antes de receber o lock, permitindo outra aquisição.

Se perder o lock puder criar um segundo PIX, o lock está protegendo coisa demais.

---

## Como testar o que realmente quebra

Um teste que chama o handler duas vezes em sequência cobre o caso mais fácil. A suíte precisa explorar as janelas de falha:

| Teste | Invariante esperada |
|---|---|
| mesma chave e mesmo comando, em sequência | um `transaction_id`, uma movimentação |
| mesma chave com outro valor, direção ou destino | `422`, nenhum novo efeito |
| dezenas de chamadas simultâneas com a mesma chave | um vencedor, nenhum débito duplicado |
| processo cai depois do commit e antes da resposta | retry encontra e devolve a operação existente |
| timeout do provedor depois de possível aceite | reconciliação, sem nova identidade financeira |
| webhook duplicado ou atrasado | uma transição e nenhuma regressão de estado |
| Redis indisponível | PostgreSQL preserva a correção |

Nos testes concorrentes, não confira apenas o status HTTP. Conte as linhas de transação, some os lançamentos do ledger e verifique a referência enviada ao provedor. O bug importante costuma estar no efeito, não na resposta.

Instrumente `new`, `replay`, `conflict`, `in_progress` e registros presos. Nos logs, use `tenant_id`, decisão e `transaction_id`; não grave bodies sensíveis e prefira um hash da key.

---

## Conclusão

Boa idempotência permite repetir uma intenção até descobrir o resultado, sem criar outra movimentação financeira.

Para chegar lá:

- defina o escopo e a validade da chave;
- compare a intenção com um fingerprint semântico;
- arbitre concorrência com uma restrição única;
- grave chave, ledger, resposta e outbox na mesma transação quando o efeito for local;
- trate erro de commit e timeout externo como resultado desconhecido;
- faça consumidores e webhooks idempotentes;
- use Redis depois, como otimização que pode falhar sem comprometer a correção.

Se a implementação atual só faz `key -> transaction_id`, ela é um começo. Ainda faltam contrato de reuso, fingerprint, fronteira transacional, recuperação, retenção e defesas do ledger.

A idempotency key não é trava de duplo clique. Em pagamentos, é parte do protocolo de consistência.

---

## Referências

- [RFC 9110 — HTTP Semantics: Idempotent Methods](https://www.rfc-editor.org/rfc/rfc9110.html#name-idempotent-methods)
- [IETF Internet-Draft — The Idempotency-Key HTTP Header Field (versão 07, expirada)](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07)
- [Stripe — Idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- [Adyen — API idempotency](https://docs.adyen.com/development-resources/api-idempotency)
- [PayPal — Idempotency](https://developer.paypal.com/api/rest/reference/idempotency/)
- [AWS Builders' Library — Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)
- [PostgreSQL — INSERT e ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html)
- [Go — Executing transactions](https://go.dev/doc/database/execute-transactions)
- [RFC 8785 — JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785.html)
- [AWS Prescriptive Guidance — Transactional outbox pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)
- [Stripe — Boas práticas para webhooks e eventos duplicados](https://docs.stripe.com/webhooks)
- [Redis — Distributed Locks](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/)
- [Modern Treasury — Ledgers Guarantees](https://docs.moderntreasury.com/ledgers/docs/ledgers-guarantees)
