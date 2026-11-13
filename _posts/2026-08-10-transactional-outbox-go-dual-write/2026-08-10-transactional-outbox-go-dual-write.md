---
layout: post
title: "Seu banco confirmou. Seu evento sumiu. Transactional Outbox em Go sem mágica"
subtitle: "Como evitar o dual write que deixa banco e mensageria em estados diferentes usando Go, PostgreSQL e um worker simples"
author: MatheusIam
date: 2026-08-10 17:47:00 -0400
categories: [Go]
tags: [go, golang, transactional-outbox, postgresql, distributed-systems, event-driven, idempotency, backend, reliability, sre]
comments: true
lang: pt-BR
---

Imagine que um usuário acabou de confirmar um pedido.

Sua API recebe a requisição, valida os dados, salva o pedido no PostgreSQL e executa o `COMMIT`. Até aqui, tudo certo.

Agora falta avisar os outros sistemas. A aplicação publica um evento `order.confirmed` para que outro serviço cuide do pagamento, atualize o estoque ou envie uma notificação.

Só existe um pequeno problema.

O processo pode morrer exatamente depois do `COMMIT` e antes de publicar o evento.

O banco diz que o pedido existe. O usuário recebeu sucesso. Mas ninguém ficou sabendo.

Não é um problema específico do Kafka, RabbitMQ ou SQS. Também não é algo que mais goroutines vão resolver.

Esse problema tem nome: **dual write**.

E ele aparece sempre que uma mesma operação precisa alterar dois sistemas independentes.

## O intervalo que parece pequeno até chegar à produção

Uma implementação bastante natural em Go poderia começar assim:

```go
func (s *Service) ConfirmOrder(ctx context.Context, order Order) error {
    if err := s.orders.Save(ctx, order); err != nil {
        return err
    }

    return s.publisher.Publish(ctx, Event{
        Type: "order.confirmed",
        Data: order,
    })
}
```

Visualmente, faz sentido.

Primeiro salvamos. Depois publicamos.

Mas essas duas operações não pertencem à mesma transação.

Se `Save` funcionar e `Publish` falhar, o banco fica em um estado e a mensageria em outro.

Talvez o broker esteja indisponível durante alguns segundos. Talvez a conexão caia. Talvez o pod seja encerrado durante um deploy. Talvez o processo receba um `SIGKILL` no pior momento possível.

O intervalo entre as duas operações pode durar apenas alguns milissegundos. Para uma máquina, isso é tempo suficiente para muita coisa dar errado.

Poderíamos inverter a ordem e publicar primeiro.

Isso apenas troca o problema de lugar.

Nesse caso, o evento pode chegar ao consumidor e o `INSERT` no banco falhar depois. Agora outro serviço acredita que existe um pedido que a aplicação principal nunca conseguiu registrar.

O verdadeiro problema não é decidir qual operação vem primeiro.

É tentar tratar duas operações independentes como se fossem uma só.

Visualmente, a janela de falha é esta:

```text
Sem Outbox

PostgreSQL                 Broker
    │                        │
    │  pedido confirmado ✅  │
    │                        │
  COMMIT                     │
    │                        │
    X processo morreu        │
                             │
                        evento não chegou ❌

Resultado:
banco = "pedido confirmado"
broker = "nunca ouvi falar desse pedido"
```

## E se o evento fosse parte da transação?

É aqui que o **Transactional Outbox** muda o desenho.

Em vez de salvar o pedido e imediatamente tentar falar com outro sistema, salvamos duas coisas no mesmo banco: o pedido e um registro dizendo que existe um evento esperando para ser publicado.

As duas gravações acontecem dentro da mesma transação SQL.

Se uma delas falhar, fazemos rollback das duas.

Se o `COMMIT` acontecer, sabemos que tanto o pedido quanto a intenção de publicar o evento foram persistidos.

```text
             UMA TRANSAÇÃO SQL

        ┌──────────────────────┐
        │ INSERT pedido        │
        │ INSERT outbox_event  │
        └──────────┬───────────┘
                   │
                 COMMIT
                   │
                   ▼
             evento pendente
                   │
                   ▼
                worker
                   │
                   ▼
                broker
```

Podemos criar uma tabela simples para isso:

```sql
CREATE TABLE outbox_events (
    id BIGSERIAL PRIMARY KEY,
    aggregate_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ,
    locked_until TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_outbox_pending
    ON outbox_events (id)
    WHERE published_at IS NULL;
```

A tabela não precisa conhecer Kafka, RabbitMQ ou qualquer outro broker.

Ela apenas responde a uma pergunta importante:

**quais eventos meu sistema prometeu publicar e ainda não publicou?**

Essa pequena mudança transforma uma falha difícil de reproduzir em um estado que podemos consultar.

## Fazendo isso em Go

Com `database/sql`, o fluxo fica relativamente pequeno.

```go
func (s *Service) ConfirmOrder(
    ctx context.Context,
    order Order,
) error {
    tx, err := s.db.BeginTx(ctx, nil)
    if err != nil {
        return fmt.Errorf("begin transaction: %w", err)
    }

    defer tx.Rollback()

    _, err = tx.ExecContext(ctx, `
        INSERT INTO orders (id, customer_id, status, total)
        VALUES ($1, $2, $3, $4)
    `,
        order.ID,
        order.CustomerID,
        "confirmed",
        order.Total,
    )
    if err != nil {
        return fmt.Errorf("save order: %w", err)
    }

    payload, err := json.Marshal(order)
    if err != nil {
        return fmt.Errorf("marshal event: %w", err)
    }

    _, err = tx.ExecContext(ctx, `
        INSERT INTO outbox_events (
            aggregate_id,
            event_type,
            payload
        )
        VALUES ($1, $2, $3)
    `,
        order.ID,
        "order.confirmed",
        string(payload),
    )
    if err != nil {
        return fmt.Errorf("save outbox event: %w", err)
    }

    if err := tx.Commit(); err != nil {
        return fmt.Errorf("commit transaction: %w", err)
    }

    return nil
}
```

Agora existe uma diferença importante.

A confirmação do pedido não depende mais de o broker estar disponível naquele exato instante.

O PostgreSQL precisa confirmar uma única transação local. Dentro dela estão o estado do negócio e o evento que representa essa mudança.

Se o banco fizer rollback, nenhum dos dois existe.

Se fizer commit, os dois existem.

Ainda não entregamos o evento, mas deixamos de depender daquela pequena janela entre salvar o pedido e tentar publicá-lo.

## Então quem publica?

Um worker em Go.

Ele pode rodar no mesmo binário, em outro processo ou como uma aplicação separada. O importante é que consiga procurar eventos pendentes e publicá-los.

Uma primeira versão poderia simplesmente executar um `SELECT`, publicar os eventos e marcá-los como concluídos.

Isso funciona até colocarmos dois workers em produção.

Se ambos consultarem o mesmo evento ao mesmo tempo, os dois podem tentar publicá-lo.

Uma solução interessante no PostgreSQL é usar `FOR UPDATE SKIP LOCKED`.

Em termos simples, um worker pega alguns registros para trabalhar enquanto os outros ignoram temporariamente aqueles registros e procuram os próximos.

Existe um preço para essa concorrência: `ORDER BY id` organiza quais eventos tentamos reservar primeiro, mas não garante a ordem final de publicação quando vários workers trabalham ao mesmo tempo. Um worker pode estar processando o evento 100 enquanto outro já publica o 101. Se a ordem for importante para eventos relacionados ao mesmo agregado, como várias mudanças consecutivas do mesmo pedido, essa exigência precisa ser tratada separadamente.

Mas existe outro detalhe.

Eu evitaria manter uma transação do banco aberta enquanto o worker espera uma resposta da rede. O broker pode levar mais tempo para responder e, nesse período, continuaríamos segurando locks desnecessariamente.

Uma alternativa é usar uma espécie de reserva temporária, ou *lease*.

```go
type Event struct {
    ID      int64
    Type    string
    Payload []byte
}

func (w *Worker) claimBatch(
    ctx context.Context,
    limit int,
) ([]Event, error) {
    tx, err := w.db.BeginTx(ctx, nil)
    if err != nil {
        return nil, err
    }

    defer tx.Rollback()

    rows, err := tx.QueryContext(ctx, `
        WITH next_events AS (
            SELECT id
            FROM outbox_events
            WHERE published_at IS NULL
              AND (
                  locked_until IS NULL
                  OR locked_until < now()
              )
            ORDER BY id
            FOR UPDATE SKIP LOCKED
            LIMIT $1
        )
        UPDATE outbox_events AS event
        SET
            locked_until = now() + interval '30 seconds',
            attempts = attempts + 1
        FROM next_events
        WHERE event.id = next_events.id
        RETURNING
            event.id,
            event.event_type,
            event.payload
    `, limit)
    if err != nil {
        return nil, err
    }
    defer rows.Close()

    var events []Event

    for rows.Next() {
        var event Event

        if err := rows.Scan(
            &event.ID,
            &event.Type,
            &event.Payload,
        ); err != nil {
            return nil, err
        }

        events = append(events, event)
    }

    if err := rows.Err(); err != nil {
        return nil, err
    }

    if err := tx.Commit(); err != nil {
        return nil, err
    }

    return events, nil
}
```

O worker reserva os eventos e encerra a transação rapidamente.

Depois disso, a chamada ao broker acontece sem segurar aquela transação.

Podemos esconder a tecnologia de mensageria atrás de uma interface pequena:

```go
type Publisher interface {
    Publish(ctx context.Context, event Event) error
}
```

Assim, o restante da aplicação não precisa saber se estamos publicando em Kafka, RabbitMQ, SQS ou outra solução.

Depois que o broker confirma a publicação, marcamos o evento:

```go
func (w *Worker) markPublished(
    ctx context.Context,
    id int64,
) error {
    _, err := w.db.ExecContext(ctx, `
        UPDATE outbox_events
        SET
            published_at = now(),
            locked_until = NULL
        WHERE id = $1
    `, id)

    return err
}
```

Se a publicação falhar, o evento continua na tabela.

Quando o `locked_until` expirar, outro ciclo pode tentar novamente.

Os 30 segundos são apenas um valor de exemplo. Em produção, o tempo do *lease* precisa considerar quanto a publicação pode demorar ou ser renovado enquanto o worker continua trabalhando. Se ele expirar antes de o primeiro worker terminar, outro worker poderá reservar o mesmo evento e gerar uma publicação duplicada. Esse é mais um motivo para não depender de uma promessa de *exactly once*.

A partir daqui podemos acrescentar backoff, limite de tentativas, dead-letter queue e outras proteções. Mas elas são evolução operacional. O núcleo do padrão continua pequeno.

## O problema que ainda não desapareceu

É tentador chegar até aqui e chamar a solução de “exactly once”.

Eu não faria isso.

Existe uma janela muito importante que ainda precisamos considerar.

Imagine que o worker publicou o evento com sucesso. O broker respondeu `OK`. Logo depois, antes de executar `markPublished`, o processo morreu.

Para o nosso banco, aquele evento continua pendente.

Depois de 30 segundos, outro worker vai encontrá-lo e publicar novamente.

Agora temos uma duplicata.

Isso não significa que o Outbox falhou.

Na verdade, essa é uma das características mais importantes de entender sobre o padrão: **é muito mais seguro lidar com um evento repetido do que perder silenciosamente um evento que deveria existir.**

É por isso que idempotência entra nessa arquitetura.

Um consumidor pode utilizar o identificador do evento para reconhecer algo que já processou.

Uma solução simples, quando o efeito também está no banco, é registrar os eventos consumidos:

```sql
CREATE TABLE processed_events (
    event_id BIGINT PRIMARY KEY,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Ao receber um evento, o consumidor tenta registrar seu `event_id`.

```sql
INSERT INTO processed_events (event_id)
VALUES ($1)
ON CONFLICT DO NOTHING;
```

Se a inserção realmente criar uma linha, o evento ainda não havia sido registrado. Se houver conflito com a chave já existente, a aplicação pode tratá-lo como uma mensagem repetida.

Existe um detalhe essencial aqui: registrar o `event_id` não basta. Quando o efeito do evento também acontece no mesmo banco, o registro em `processed_events` e a alteração de negócio devem fazer parte da mesma transação. Assim, ou marcamos a mensagem como processada **e** aplicamos seu efeito, ou fazemos rollback dos dois.

Sem isso, apenas deslocaríamos o dual write para o consumidor. O processo poderia registrar o `event_id`, morrer antes de atualizar o estado de negócio e, na próxima entrega, ignorar a mensagem por acreditar que ela já foi processada.

Em cenários mais complexos, principalmente quando o efeito envolve outro sistema externo, a estratégia de idempotência precisa acompanhar a natureza daquela operação. Não existe um `ON CONFLICT` universal que torne qualquer integração exatamente uma vez.

E admitir isso deixa a arquitetura mais confiável, não menos.

## O Outbox também melhora a operação

Existe um benefício que às vezes passa despercebido.

No modelo tradicional, quando o banco é atualizado e a publicação falha, podemos ter apenas um erro perdido no meio dos logs.

Com o Outbox, o problema possui estado.

Podemos perguntar ao banco quantos eventos estão pendentes, há quanto tempo o evento mais antigo espera, quantas tentativas estão sendo necessárias e se o backlog está crescendo.

Isso permite criar métricas como `outbox_pending_events`, `outbox_oldest_event_seconds` e `outbox_publish_errors_total`.

Se o broker ficar indisponível durante cinco minutos, a aplicação principal não precisa necessariamente parar de aceitar operações. Os eventos se acumulam no Outbox e o worker começa a drenar o backlog quando a dependência se recupera.

Claro que isso também exige limites.

Se o broker permanecer fora por horas, a tabela pode crescer rapidamente. O time precisa definir retenção, alertas e a quantidade de eventos que consegue processar depois de uma recuperação.

Esse é um ponto que gosto no padrão: ele não elimina falhas.

Ele torna a falha **visível, persistente e recuperável**.

## E quando eu não usaria isso?

Transactional Outbox adiciona código, uma tabela, um worker e uma preocupação nova de operação.

Portanto, colocar esse padrão em toda aplicação Go apenas porque ele existe seria trocar um problema por complexidade desnecessária.

Se o sistema não publica eventos a partir de alterações no banco, provavelmente não há dual write para resolver.

Se perder uma determinada notificação for aceitável, talvez a complexidade também não se justifique.

Mas quando uma alteração persistida precisa obrigatoriamente provocar uma ação em outro sistema, depender de duas chamadas consecutivas começa a ficar perigoso.

É nesse ponto que o Outbox deixa de ser arquitetura “sofisticada” e passa a ser uma forma relativamente simples de remover uma janela de inconsistência.

## O que realmente mudou?

No começo, tínhamos isto:

```text
pedido -> COMMIT -> publicar evento
                    ^
                    |
              processo morreu
```

Depois do Outbox:

```text
pedido + evento pendente
        |
        v
     COMMIT
        |
        v
      worker
        |
        v
      broker
```

Parece uma mudança pequena.

Mas agora a única etapa que precisa ser atômica acontece dentro de um sistema que já sabe oferecer transações: o banco.

A comunicação externa passa a funcionar de forma assíncrona, com retry e estado persistido.

Não criamos uma transação distribuída.

Não fizemos o PostgreSQL conversar magicamente com o Kafka.

E não eliminamos a possibilidade de mensagens duplicadas.

Fizemos algo mais simples: **trocamos a possibilidade de perder silenciosamente um evento por uma fila persistente que podemos observar e tentar novamente.**

Para mim, essa é a principal ideia por trás do Transactional Outbox.

Sistemas distribuídos sempre terão pontos de falha. Uma boa arquitetura não finge que eles não existem.

Ela decide quais falhas podem acontecer e garante que, quando acontecerem, ainda exista um caminho para se recuperar.
