---
layout: post
title: "Erros em Go: errors.Is, errors.As, Wrapping e Sentinel Errors"
subtitle: "Como modelar, propagar e inspecionar erros de forma idiomática em APIs e bibliotecas"
author: otavio_celestino
date: 2026-02-17 08:00:00 -0300
categories: [Go, Best Practices, APIs, Engineering]
tags: [go, errors, errors.Is, errors.As, wrapping, sentinel-errors, best-practices, api-design]
comments: true
image: "/assets/img/posts/2026-02-17-go-errors-errors-is-as-wrapping-sentinel.png"
lang: pt-BR
original_post: "/go-erros-errors-is-as-wrapping-sentinel/"
---

E aí, pessoal!

Em Go, **erros são valores**. Não existem exceções: você retorna `error` e quem chama decide o que fazer. Esse modelo é simples, mas exige que a gente saiba **criar**, **propagar** e **checar** erros de forma consistente. Do contrário viram só strings perdidas ou logs que não ajudam em produção.

Neste post vamos ver na prática: **sentinel errors**, **wrapping com `%w`**, **`errors.Is`**, **`errors.As`** e **padrões para APIs e libs** que deixam o código mais fácil de debugar e de tratar.

Se preferir ver o assunto em vídeo, confira no [no YouTube](https://www.youtube.com/watch?v=0TExBobc-MU) onde explico erros em Go na prática.

{% include embed/youtube.html id="0TExBobc-MU" %}

---

## 1) Por que erros são valores em Go

Em Go não há `try/catch`. A regra é: **função retorna `error`, quem chama trata**. Isso significa que:

- O tratamento é **explícito** em cada camada (ou você propaga de forma consciente).
- Erros podem ser **comparados** e **checados** sem truques.
- Você pode **acrescentar contexto** ao erro ao subir (wrapping) sem perder o erro original.

Para isso funcionar bem, entram em jogo: **sentinel errors** para condições conhecidas, **wrapping** para contexto e **`errors.Is`** / **`errors.As`** para checagem. Vamos por partes.

---

## 2) Sentinel errors

**Sentinel errors** são erros definidos como variáveis (em geral no nível do pacote) e usados para representar uma **condição específica** que o caller pode querer tratar.

```go
package store

import "errors"

var (
    ErrNotFound   = errors.New("store: resource not found")
    ErrConflict   = errors.New("store: conflict")
    ErrValidation = errors.New("store: validation failed")
)

func (s *Store) GetByID(ctx context.Context, id string) (*Resource, error) {
    r, err := s.db.Query(ctx, id)
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            return nil, ErrNotFound
        }
        return nil, err
    }
    return r, nil
}
```

Quem usa a API pode decidir com base no sentinel:

```go
resource, err := store.GetByID(ctx, id)
if err != nil {
    if errors.Is(err, store.ErrNotFound) {
        return nil, nil // ou 404
    }
    return nil, err
}
```

**Quando usar:** para condições de domínio ou contrato que o caller precisa distinguir (ex.: "não encontrado", "conflito", "não autorizado"). Evite criar sentinel para cada mensagem. Use só quando o fluxo ou a resposta da API mudar de fato.

---

## 3) Wrapping com `%w`

**Wrapping** é acrescentar contexto ao erro ao propagá-lo, **mantendo** o erro original na cadeia. Em Go isso é feito com `fmt.Errorf` e o verb `%w` (a partir de Go 1.13).

```go
func (s *Service) GetUser(ctx context.Context, id string) (*User, error) {
    user, err := s.repo.FindByID(ctx, id)
    if err != nil {
        return nil, fmt.Errorf("get user %s: %w", id, err)
    }
    return user, nil
}
```

Assim o caller continua podendo usar `errors.Is` e `errors.As` no erro retornado, porque o `err` original fica na cadeia. Use `%w` uma vez por nível: não faça wrap de novo do mesmo erro no mesmo pacote sem acrescentar contexto novo.

**Errado:** perder o erro original (não use `%v` quando quiser inspeção):

```go
return nil, fmt.Errorf("get user: %v", err) // errors.Is(err, ErrNotFound) não funciona
```

**Certo:** preservar com `%w`:

```go
return nil, fmt.Errorf("get user %s: %w", id, err) // cadeia intacta
```

---

## 4) errors.Is

`errors.Is(err, target)` verifica se `err` é exatamente `target` ou se, em algum ponto da cadeia de wraps, o erro chega a `target`. É a forma recomendada de checar sentinels.

```go
resource, err := store.GetByID(ctx, id)
if err != nil {
    if errors.Is(err, store.ErrNotFound) {
        return nil, nil
    }
    if errors.Is(err, store.ErrConflict) {
        return nil, ErrConflictResponse
    }
    return nil, err
}
```

Funciona com erros wrapped:

```go
// em algum lugar: return nil, fmt.Errorf("loading resource: %w", store.ErrNotFound)
if errors.Is(err, store.ErrNotFound) {
    // ainda é true
}
```

Use `errors.Is` sempre que quiser comparar com um valor conhecido (sentinel). Não use `err == store.ErrNotFound` quando houver wrapping: pode falhar.

---

## 5) errors.As

`errors.As(err, &target)` percorre a cadeia de erros e, se encontrar um erro que **implemente o tipo** de `target`, atribui a `target` e retorna `true`. Serve para erros que carregam **dados** (estruturas, códigos, campos).

```go
type ValidationError struct {
    Field   string
    Message string
}

func (e *ValidationError) Error() string {
    return fmt.Sprintf("validation: %s: %s", e.Field, e.Message)
}

func ValidateUser(u *User) error {
    if u.Email == "" {
        return &ValidationError{Field: "email", Message: "required"}
    }
    return nil
}
```

Quem chama pode extrair o tipo e usar os campos:

```go
if err := ValidateUser(user); err != nil {
    var verr *ValidationError
    if errors.As(err, &verr) {
        return fmt.Sprintf("campo %s: %s", verr.Field, verr.Message)
    }
    return err.Error()
}
```

**Quando usar:** quando o erro precisa carregar informação estruturada (campo inválido, código de negócio). Para condições simples e sem dados extras, sentinel + `errors.Is` resolve.

---

## 6) Padrões para APIs e bibliotecas

### Em bibliotecas (baixo nível)

- **Retorne sentinels** para condições que o caller deve distinguir (ex.: `ErrNotFound`).
- Não faça wrap dos erros que você mesmo retorna. Deixe o caller adicionar contexto se quiser.
- Para erros de dependências (ex.: `sql.ErrNoRows`), traduza para os seus sentinels quando fizer sentido (ex.: `ErrNotFound`) e retorne direto, sem wrap desnecessário.

```go
// Lib: retorno direto
if errors.Is(err, sql.ErrNoRows) {
    return nil, ErrNotFound
}
return nil, err
```

### Em camadas de aplicação (serviços, handlers)

- **Faça wrap** ao propagar, com contexto útil: `fmt.Errorf("get user %s: %w", id, err)`.
- **Defina sentinels** no domínio (ex.: `ErrUserNotFound`, `ErrDuplicateEmail`) e use `errors.Is` nos handlers para decidir status HTTP ou resposta.

### Tipos customizados vs sentinels

| Situação                         | Recomendação        |
|----------------------------------|---------------------|
| Condição conhecida, sem dados    | Sentinel + `Is`     |
| Erro com dados (campo, código)   | Tipo customizado + `As` |
| Só mensagem ao caller            | `fmt.Errorf` com `%w` |

---

## 7) Exemplo completo: API com repositório

```go
import (
    "context"
    "database/sql"
    "encoding/json"
    "errors"
    "fmt"
    "net/http"
)

// Pacote domain ou store
var ErrNotFound = errors.New("resource not found")

type User struct{ ID, Email string } // simplificado para o exemplo

type ValidationError struct {
    Field string
    Msg  string
}

func (e *ValidationError) Error() string { return e.Field + ": " + e.Msg }

// Repositório: retorna sentinels, sem wrap
func (r *Repo) FindByID(ctx context.Context, id string) (*User, error) {
    var u User
    err := r.db.GetContext(ctx, &u, "SELECT * FROM users WHERE id = $1", id)
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            return nil, ErrNotFound
        }
        return nil, err
    }
    return &u, nil
}

// Serviço: wrap ao propagar
func (s *Service) GetUser(ctx context.Context, id string) (*User, error) {
    user, err := s.repo.FindByID(ctx, id)
    if err != nil {
        return nil, fmt.Errorf("get user %s: %w", id, err)
    }
    return user, nil
}

// Handler HTTP: Is e As para resposta
func (h *Handler) GetUser(w http.ResponseWriter, r *http.Request) {
    user, err := h.svc.GetUser(r.Context(), r.PathValue("id"))
    if err != nil {
        if errors.Is(err, ErrNotFound) {
            http.Error(w, "user not found", http.StatusNotFound)
            return
        }
        var valErr *ValidationError
        if errors.As(err, &valErr) {
            http.Error(w, valErr.Msg, http.StatusBadRequest)
            return
        }
        http.Error(w, "internal error", http.StatusInternalServerError)
        return
    }
    json.NewEncoder(w).Encode(user)
}
```

---

## 8) O que evitar

- Não use `err == sentinel` quando houver wrapping. Prefira `errors.Is(err, sentinel)`.
- Não use `%v` para o erro interno se quiser que o caller use `Is`/`As`. Use `%w`.
- Não crie sentinels demais. Reserve para condições que o caller realmente trata de forma diferente.
- Não coloque dados voláteis ou sensíveis em tipos de erro que podem ser logados (evite senhas, tokens).

---

## Conclusão

Um bom modelo de erros em Go combina:

1. **Sentinel errors** para condições que o caller precisa identificar (`errors.Is`).
2. **Wrapping com `%w`** nas camadas de aplicação para dar contexto sem perder a cadeia.
3. **Tipos customizados** quando o erro precisa carregar dados (`errors.As`).
4. **Regras claras** em APIs e libs: sentinels onde fizer sentido, wrap na aplicação, sem exagero na mesma camada.

Com isso os erros ficam mais fáceis de logar e de tratar em handlers e clientes. Para aprofundar, o post [Por que o `context.Context` é o sistema nervoso do Go moderno](/por-que-context-e-o-sistema-nervoso-do-go/) mostra como contexto e cancelamento se integram com fluxos que retornam erro.

Até a próxima!

---

## Referências

- **[Package errors](https://pkg.go.dev/errors)** – Documentação oficial do pacote `errors` (errors.Is, errors.As, wrapping).
- **[Working with Errors in Go 1.13](https://go.dev/blog/go1.13-errors)** – Post do Go Blog sobre error wrapping e `%w` (Go 1.13).
- **[Effective Go, seção Errors](https://go.dev/doc/effective_go#errors)** – Tratamento de erros no guia oficial.
- **[Errors are values](https://go.dev/blog/errors-are-values)** – Post do Go Blog (Rob Pike) sobre erros como valores.
- **[Don't just check errors, handle them gracefully](https://dave.cheney.net/2016/04/27/dont-just-check-errors-handle-them-gracefully)** – Dave Cheney sobre sentinel errors, wrapping e boas práticas.
- **[Go Code Review Comments, Error strings](https://go.dev/wiki/CodeReviewComments#error-strings)** – Convenções para mensagens e tratamento de erros.
