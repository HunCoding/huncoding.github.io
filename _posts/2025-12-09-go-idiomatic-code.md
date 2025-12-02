---
layout: post
title: "Como Escrever Código Go Idiomático: Princípios e Práticas"
subtitle: "Guia prático com exemplos reais: do código não idiomático ao código que segue os princípios do Go."
author: otavio_celestino
date: 2025-12-09 08:00:00 -0300
categories: [Go, Best Practices, Code Quality]
tags: [go, idiomatic, best-practices, code-quality, golang, clean-code]
comments: true
image: "/assets/img/posts/2025-12-09-go-idiomatic-code.png"
lang: pt-BR
original_post: "/go-idiomatic-code/"
---

E aí, pessoal!

Escrever código Go que funciona é uma coisa. Escrever código Go **idiomático** — que segue os princípios e convenções da linguagem — é outra completamente diferente.

Código idiomático é mais legível, mais fácil de manter, mais eficiente e mais fácil de revisar. É o tipo de código que outros desenvolvedores Go reconhecem imediatamente como "bom código Go".

Neste post, vamos ver exemplos práticos de como transformar código não idiomático em código que segue os princípios do Go.

---

## O que é código idiomático?

Código idiomático em Go segue:

- **Simplicidade**: código claro e direto, sem complexidade desnecessária
- **Composição**: pequenas funções que se combinam para resolver problemas maiores
- **Interfaces pequenas**: interfaces com poucos métodos, focadas em uma responsabilidade
- **Tratamento de erros explícito**: erros são valores, não exceções
- **Convenções da comunidade**: nomes, estrutura e padrões aceitos pela comunidade Go

---

## 1. Tratamento de erros: explícito e claro

### ❌ Não idiomático

```go
func processUser(id int) {
    user, err := getUser(id)
    if err != nil {
        log.Println(err)
        return
    }
    
    result, err := validateUser(user)
    if err != nil {
        log.Println(err)
        return
    }
    
    saveUser(result)
}
```

**Problemas**:
- Erros são apenas logados, sem contexto
- Não há como distinguir tipos de erro
- Código que chama não sabe o que aconteceu

### ✅ Idiomático

```go
func processUser(id int) error {
    user, err := getUser(id)
    if err != nil {
        return fmt.Errorf("get user %d: %w", id, err)
    }
    
    result, err := validateUser(user)
    if err != nil {
        return fmt.Errorf("validate user: %w", err)
    }
    
    if err := saveUser(result); err != nil {
        return fmt.Errorf("save user: %w", err)
    }
    
    return nil
}
```

**Melhorias**:
- Erros são propagados com contexto usando `%w` (error wrapping)
- Função retorna erro, permitindo tratamento adequado no caller
- Contexto claro sobre onde o erro ocorreu

---

## 2. Nomes claros e consistentes

### ❌ Não idiomático

```go
func proc(d []byte) ([]byte, error) {
    var r []byte
    for i := 0; i < len(d); i++ {
        if d[i] != 0 {
            r = append(r, d[i])
        }
    }
    return r, nil
}
```

**Problemas**:
- Nomes abreviados (`proc`, `d`, `r`) não são claros
- Não segue convenções Go (nomes devem ser descritivos)

### ✅ Idiomático

```go
func removeNullBytes(data []byte) ([]byte, error) {
    var result []byte
    for _, b := range data {
        if b != 0 {
            result = append(result, b)
        }
    }
    return result, nil
}
```

**Melhorias**:
- Nomes descritivos e claros
- Usa `range` ao invés de índice manual
- Nome da função descreve o que faz

---

## 3. Evite ponteiros desnecessários

### ❌ Não idiomático

```go
func processUser(u *User) *User {
    u.Name = strings.ToUpper(u.Name)
    u.Email = strings.ToLower(u.Email)
    return u
}

func main() {
    user := &User{Name: "John", Email: "JOHN@EXAMPLE.COM"}
    user = processUser(user)
}
```

**Problemas**:
- Ponteiros quando valores seriam suficientes
- Mutação in-place pode causar bugs sutis

### ✅ Idiomático

```go
func normalizeUser(u User) User {
    u.Name = strings.ToUpper(u.Name)
    u.Email = strings.ToLower(u.Email)
    return u
}

func main() {
    user := User{Name: "John", Email: "JOHN@EXAMPLE.COM"}
    user = normalizeUser(user)
}
```

**Ou, se mutação for necessária:**

```go
func normalizeUser(u *User) {
    u.Name = strings.ToUpper(u.Name)
    u.Email = strings.ToLower(u.Email)
}
```

**Melhorias**:
- Usa valores quando possível (mais seguro, mais fácil de testar)
- Ponteiros apenas quando mutação é necessária ou para evitar cópias grandes

---

## 4. Use `defer` para limpeza

### ❌ Não idiomático

```go
func processFile(filename string) error {
    file, err := os.Open(filename)
    if err != nil {
        return err
    }
    
    data, err := ioutil.ReadAll(file)
    if err != nil {
        file.Close() // Pode ser esquecido em outros paths
        return err
    }
    
    // processar data...
    
    file.Close()
    return nil
}
```

**Problemas**:
- Fácil esquecer `Close()` em algum path de erro
- Código duplicado

### ✅ Idiomático

```go
func processFile(filename string) error {
    file, err := os.Open(filename)
    if err != nil {
        return err
    }
    defer file.Close() // Sempre executado, mesmo em caso de erro
    
    data, err := ioutil.ReadAll(file)
    if err != nil {
        return err
    }
    
    // processar data...
    return nil
}
```

**Melhorias**:
- `defer` garante limpeza mesmo em caso de erro ou panic
- Código mais limpo e seguro

---

## 5. Evite variáveis desnecessárias

### ❌ Não idiomático

```go
func getUserName(id int) string {
    user, err := getUser(id)
    if err != nil {
        return ""
    }
    
    name := user.Name
    return name
}
```

**Problemas**:
- Variável intermediária desnecessária

### ✅ Idiomático

```go
func getUserName(id int) string {
    user, err := getUser(id)
    if err != nil {
        return ""
    }
    return user.Name
}
```

**Ou, se precisar de validação:**

```go
func getUserName(id int) (string, error) {
    user, err := getUser(id)
    if err != nil {
        return "", err
    }
    return user.Name, nil
}
```

**Melhorias**:
- Código mais direto
- Retorna erro quando apropriado

---

## 6. Use `context` para cancelamento e timeouts

### ❌ Não idiomático

```go
func fetchUserData(id int) (*User, error) {
    // Sem timeout, pode travar indefinidamente
    resp, err := http.Get(fmt.Sprintf("https://api.example.com/users/%d", id))
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    
    // processar resposta...
    return user, nil
}
```

**Problemas**:
- Sem controle de timeout
- Não pode ser cancelado
- Pode travar a goroutine

### ✅ Idiomático

```go
func fetchUserData(ctx context.Context, id int) (*User, error) {
    req, err := http.NewRequestWithContext(ctx, "GET", 
        fmt.Sprintf("https://api.example.com/users/%d", id), nil)
    if err != nil {
        return nil, err
    }
    
    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    
    // Verificar se contexto foi cancelado
    if err := ctx.Err(); err != nil {
        return nil, err
    }
    
    // processar resposta...
    return user, nil
}

// Uso com timeout
func main() {
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()
    
    user, err := fetchUserData(ctx, 123)
    if err != nil {
        log.Fatal(err)
    }
}
```

**Melhorias**:
- Controle de timeout e cancelamento
- Evita goroutines travadas
- Padrão Go para operações assíncronas

---

## 7. Prefira composição sobre herança

### ❌ Não idiomático (tentando imitar OOP)

```go
type Animal struct {
    Name string
}

func (a *Animal) Speak() string {
    return "Some sound"
}

type Dog struct {
    Animal // "Herança"
}

func (d *Dog) Speak() string {
    return "Woof"
}
```

**Problemas**:
- Go não tem herança, apenas composição
- Embedding pode ser confuso se mal usado

### ✅ Idiomático

```go
type Speaker interface {
    Speak() string
}

type Animal struct {
    Name string
}

type Dog struct {
    Animal
}

func (d *Dog) Speak() string {
    return "Woof"
}

// Uso
func makeSound(s Speaker) {
    fmt.Println(s.Speak())
}
```

**Melhorias**:
- Usa interfaces para polimorfismo
- Composição clara e explícita
- Mais flexível e testável

---

## 8. Evite `panic` em código normal

### ❌ Não idiomático

```go
func divide(a, b int) int {
    if b == 0 {
        panic("division by zero")
    }
    return a / b
}
```

**Problemas**:
- `panic` deve ser usado apenas para erros de programação
- Código que chama não pode tratar o erro

### ✅ Idiomático

```go
func divide(a, b int) (int, error) {
    if b == 0 {
        return 0, fmt.Errorf("division by zero: %d / %d", a, b)
    }
    return a / b, nil
}
```

**Melhorias**:
- Erro retornado como valor
- Caller pode decidir como tratar
- Mais seguro e previsível

---

## 9. Use `make` e `len` apropriadamente

### ❌ Não idiomático

```go
func processItems(items []Item) {
    result := []Item{} // Slice vazio, mas pode causar realocações
    
    for i := 0; i < len(items); i++ {
        if items[i].IsValid() {
            result = append(result, items[i])
        }
    }
}
```

**Problemas**:
- Slice vazio pode causar múltiplas realocações
- Loop manual com índice

### ✅ Idiomático

```go
func processItems(items []Item) []Item {
    // Pré-alocar com capacidade estimada
    result := make([]Item, 0, len(items))
    
    for _, item := range items {
        if item.IsValid() {
            result = append(result, item)
        }
    }
    return result
}
```

**Melhorias**:
- `make` com capacidade previne realocações
- `range` é mais idiomático e seguro
- Melhor performance

---

## 10. Tratamento de erros: sentinel errors

### ❌ Não idiomático

```go
func getUser(id int) (*User, error) {
    if id < 0 {
        return nil, fmt.Errorf("invalid id")
    }
    // ...
}

// No caller
user, err := getUser(-1)
if err != nil {
    if strings.Contains(err.Error(), "invalid") {
        // Tratamento frágil
    }
}
```

**Problemas**:
- Comparação de strings é frágil
- Não há como verificar tipo de erro de forma segura

### ✅ Idiomático

```go
var ErrInvalidID = errors.New("invalid user id")
var ErrUserNotFound = errors.New("user not found")

func getUser(id int) (*User, error) {
    if id < 0 {
        return nil, ErrInvalidID
    }
    // ...
    return nil, ErrUserNotFound
}

// No caller
user, err := getUser(-1)
if err != nil {
    if errors.Is(err, ErrInvalidID) {
        // Tratamento específico
    }
}
```

**Melhorias**:
- Sentinel errors permitem comparação segura
- `errors.Is` funciona com error wrapping
- Mais robusto e testável

---

## 11. Use type assertions com segurança

### ❌ Não idiomático

```go
func processValue(v interface{}) {
    str := v.(string) // Panic se não for string!
    fmt.Println(str)
}
```

**Problemas**:
- Type assertion pode causar panic
- Não verifica tipo antes

### ✅ Idiomático

```go
func processValue(v interface{}) {
    str, ok := v.(string)
    if !ok {
        return // ou retornar erro
    }
    fmt.Println(str)
}

// Ou com type switch
func processValue(v interface{}) {
    switch val := v.(type) {
    case string:
        fmt.Println(val)
    case int:
        fmt.Printf("%d\n", val)
    default:
        fmt.Printf("unknown type: %T\n", val)
    }
}
```

**Melhorias**:
- Verificação segura com `ok`
- Type switch para múltiplos tipos
- Sem risco de panic

---

## 12. Evite variáveis globais

### ❌ Não idiomático

```go
var db *sql.DB

func init() {
    var err error
    db, err = sql.Open("postgres", "...")
    if err != nil {
        log.Fatal(err)
    }
}

func getUser(id int) (*User, error) {
    // Usa db global
    row := db.QueryRow("SELECT ...", id)
    // ...
}
```

**Problemas**:
- Dificulta testes (não pode injetar mock)
- Estado global é difícil de gerenciar
- Dependências implícitas

### ✅ Idiomático

```go
type UserRepository struct {
    db *sql.DB
}

func NewUserRepository(db *sql.DB) *UserRepository {
    return &UserRepository{db: db}
}

func (r *UserRepository) GetUser(id int) (*User, error) {
    row := r.db.QueryRow("SELECT ...", id)
    // ...
}

// Uso
func main() {
    db, _ := sql.Open("postgres", "...")
    repo := NewUserRepository(db)
    user, _ := repo.GetUser(123)
}
```

**Melhorias**:
- Dependências explícitas via construtor
- Fácil de testar (pode injetar mock)
- Sem estado global

---

## 13. Use `sync` package apropriadamente

### ❌ Não idiomático

```go
type Counter struct {
    count int
}

func (c *Counter) Increment() {
    c.count++ // Race condition!
}

func (c *Counter) Get() int {
    return c.count // Race condition!
}
```

**Problemas**:
- Race conditions em código concorrente
- Não thread-safe

### ✅ Idiomático

```go
type Counter struct {
    mu    sync.RWMutex
    count int
}

func (c *Counter) Increment() {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.count++
}

func (c *Counter) Get() int {
    c.mu.RLock()
    defer c.mu.RUnlock()
    return c.count
}

// Ou, para contadores simples
type Counter struct {
    count int64
}

func (c *Counter) Increment() {
    atomic.AddInt64(&c.count, 1)
}

func (c *Counter) Get() int64 {
    return atomic.LoadInt64(&c.count)
}
```

**Melhorias**:
- Thread-safe com mutex ou atomic
- `defer` garante unlock mesmo em caso de panic
- RWMutex para otimizar leituras concorrentes

---

## 14. Documentação: comentários úteis

### ❌ Não idiomático

```go
// getUser gets a user
func getUser(id int) (*User, error) {
    // ...
}

// Process processes data
func process(data []byte) {
    // ...
}
```

**Problemas**:
- Comentários óbvios que não agregam valor
- Não seguem convenção Go (devem começar com nome da função)

### ✅ Idiomático

```go
// getUser retrieves a user by ID from the database.
// It returns ErrUserNotFound if the user doesn't exist.
func getUser(id int) (*User, error) {
    // ...
}

// process validates and normalizes user data before storage.
// It removes null bytes and trims whitespace.
func process(data []byte) ([]byte, error) {
    // ...
}
```

**Melhorias**:
- Comentários explicam o "porquê", não o "o quê"
- Seguem convenção Go (começam com nome da função)
- Documentam comportamento e casos especiais

---

## Checklist de código idiomático

Ao revisar seu código Go, verifique:

- [ ] Erros são retornados e propagados com contexto (`%w`)
- [ ] Nomes são descritivos e claros
- [ ] `defer` é usado para limpeza de recursos
- [ ] `context` é usado para cancelamento e timeouts
- [ ] Composição é preferida sobre "herança"
- [ ] `panic` é evitado em código normal
- [ ] `make` é usado com capacidade quando conhecida
- [ ] Sentinel errors são usados para erros esperados
- [ ] Type assertions são verificadas com `ok`
- [ ] Variáveis globais são evitadas
- [ ] Código concorrente usa `sync` apropriadamente
- [ ] Comentários explicam o "porquê", não o "o quê"

---

## Conclusão

Código Go idiomático não é sobre seguir regras cegamente, mas sobre entender os princípios da linguagem:

- **Simplicidade**: código claro e direto
- **Composição**: pequenas peças que se combinam
- **Explicitude**: erros explícitos, dependências explícitas
- **Segurança**: tratamento adequado de concorrência e recursos

Escrever código idiomático torna seu código mais legível, mais fácil de manter e mais alinhado com as expectativas da comunidade Go. É o tipo de código que outros desenvolvedores Go reconhecem e apreciam.

---

## Referências

- [Effective Go - Official Go Documentation](https://go.dev/doc/effective_go)
- [Go Code Review Comments](https://github.com/golang/go/wiki/CodeReviewComments)
- [Go Best Practices - Uber](https://github.com/uber-go/guide/blob/master/style.md)
- [Standard Package Layout - Go Blog](https://go.dev/blog/package-names)
- [Errors are Values - Go Blog](https://go.dev/blog/errors-are-values)
- [Context Package - Go Documentation](https://pkg.go.dev/context)

