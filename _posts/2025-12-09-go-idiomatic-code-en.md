---
layout: post
title: "How to Write Idiomatic Go Code: Principles and Practices"
subtitle: "Practical guide with real examples: from non-idiomatic code to code that follows Go principles."
author: otavio_celestino
date: 2025-12-09 08:00:00 -0300
categories: [Go, Best Practices, Code Quality]
tags: [go, idiomatic, best-practices, code-quality, golang, clean-code]
comments: true
image: "/assets/img/posts/2025-12-09-go-idiomatic-code.png"
lang: en
original_post: "/go-idiomatic-code/"
---


Hey everyone!

Writing Go code that works is one thing. Writing **idiomatic** Go code, that follows the language's principles and conventions, is completely different.

Idiomatic code is more readable, easier to maintain, more efficient, and easier to review. It's the kind of code that other Go developers immediately recognize as "good Go code."

In this post, we'll see practical examples of how to transform non-idiomatic code into code that follows Go principles.

---

## What is idiomatic code?

Idiomatic Go code follows:

- **Simplicity**: clear and direct code, without unnecessary complexity
- **Composition**: small functions that combine to solve larger problems
- **Small interfaces**: interfaces with few methods, focused on one responsibility
- **Explicit error handling**: errors are values, not exceptions
- **Community conventions**: names, structure, and patterns accepted by the Go community

---

## 1. Error handling: explicit and clear

### ❌ Not idiomatic

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

**Problems**:
- Errors are only logged, without context
- No way to distinguish error types
- Calling code doesn't know what happened

### ✅ Idiomatic

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

**Improvements**:
- Errors are propagated with context using `%w` (error wrapping)
- Function returns error, allowing proper handling in caller
- Clear context about where the error occurred

---

## 2. Clear and consistent names

### ❌ Not idiomatic

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

**Problems**:
- Abbreviated names (`proc`, `d`, `r`) are not clear
- Doesn't follow Go conventions (names should be descriptive)

### ✅ Idiomatic

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

**Improvements**:
- Descriptive and clear names
- Uses `range` instead of manual indexing
- Function name describes what it does


---

## 4. Use `defer` for cleanup

### ❌ Not idiomatic

```go
func processFile(filename string) error {
    file, err := os.Open(filename)
    if err != nil {
        return err
    }
    
    data, err := ioutil.ReadAll(file)
    if err != nil {
        file.Close() // Can be forgotten in other paths
        return err
    }
    
    // process data...
    
    file.Close()
    return nil
}
```

**Problems**:
- Easy to forget `Close()` in some error path
- Duplicated code

### ✅ Idiomatic

```go
func processFile(filename string) error {
    file, err := os.Open(filename)
    if err != nil {
        return err
    }
    defer file.Close() // Always executed, even on error
    
    data, err := ioutil.ReadAll(file)
    if err != nil {
        return err
    }
    
    // process data...
    return nil
}
```

**Improvements**:
- `defer` ensures cleanup even on error or panic
- Cleaner and safer code

---

## 5. Avoid unnecessary variables

### ❌ Not idiomatic

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

**Problems**:
- Unnecessary intermediate variable

### ✅ Idiomatic

```go
func getUserName(id int) string {
    user, err := getUser(id)
    if err != nil {
        return ""
    }
    return user.Name
}
```

**Or, if validation is needed:**

```go
func getUserName(id int) (string, error) {
    user, err := getUser(id)
    if err != nil {
        return "", err
    }
    return user.Name, nil
}
```

**Improvements**:
- More direct code
- Returns error when appropriate

---

## 6. Use `context` for cancellation and timeouts

### ❌ Not idiomatic

```go
func fetchUserData(id int) (*User, error) {
    // No timeout, can hang indefinitely
    resp, err := http.Get(fmt.Sprintf("https://api.example.com/users/%d", id))
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    
    // process response...
    return user, nil
}
```

**Problems**:
- No timeout control
- Cannot be cancelled
- Can hang the goroutine

### ✅ Idiomatic

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
    
    // Check if context was cancelled
    if err := ctx.Err(); err != nil {
        return nil, err
    }
    
    // process response...
    return user, nil
}

// Usage with timeout
func main() {
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()
    
    user, err := fetchUserData(ctx, 123)
    if err != nil {
        log.Fatal(err)
    }
}
```

**Improvements**:
- Timeout and cancellation control
- Prevents stuck goroutines
- Go standard for async operations

---

## 7. Prefer composition over inheritance

### ❌ Not idiomatic (trying to mimic OOP)

```go
type Animal struct {
    Name string
}

func (a *Animal) Speak() string {
    return "Some sound"
}

type Dog struct {
    Animal // "Inheritance"
}

func (d *Dog) Speak() string {
    return "Woof"
}
```

**Problems**:
- Go doesn't have inheritance, only composition
- Embedding can be confusing if misused

### ✅ Idiomatic

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

// Usage
func makeSound(s Speaker) {
    fmt.Println(s.Speak())
}
```

**Improvements**:
- Uses interfaces for polymorphism
- Clear and explicit composition
- More flexible and testable

---

## 8. Avoid `panic` in normal code

### ❌ Not idiomatic

```go
func divide(a, b int) int {
    if b == 0 {
        panic("division by zero")
    }
    return a / b
}
```

**Problems**:
- `panic` should only be used for programming errors
- Calling code cannot handle the error

### ✅ Idiomatic

```go
func divide(a, b int) (int, error) {
    if b == 0 {
        return 0, fmt.Errorf("division by zero: %d / %d", a, b)
    }
    return a / b, nil
}
```

**Improvements**:
- Error returned as value
- Caller can decide how to handle
- Safer and more predictable

---

## 9. Use `make` and `len` appropriately

### ❌ Not idiomatic

```go
func processItems(items []Item) {
    result := []Item{} // Empty slice, but can cause reallocations
    
    for i := 0; i < len(items); i++ {
        if items[i].IsValid() {
            result = append(result, items[i])
        }
    }
}
```

**Problems**:
- Empty slice can cause multiple reallocations
- Manual loop with index

### ✅ Idiomatic

```go
func processItems(items []Item) []Item {
    // Pre-allocate with estimated capacity
    result := make([]Item, 0, len(items))
    
    for _, item := range items {
        if item.IsValid() {
            result = append(result, item)
        }
    }
    return result
}
```

**Improvements**:
- `make` with capacity prevents reallocations
- `range` is more idiomatic and safer
- Better performance

---

## 10. Error handling: sentinel errors

### ❌ Not idiomatic

```go
func getUser(id int) (*User, error) {
    if id < 0 {
        return nil, fmt.Errorf("invalid id")
    }
    // ...
}

// In caller
user, err := getUser(-1)
if err != nil {
    if strings.Contains(err.Error(), "invalid") {
        // Fragile handling
    }
}
```

**Problems**:
- String comparison is fragile
- No way to check error type safely

### ✅ Idiomatic

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

// In caller
user, err := getUser(-1)
if err != nil {
    if errors.Is(err, ErrInvalidID) {
        // Specific handling
    }
}
```

**Improvements**:
- Sentinel errors allow safe comparison
- `errors.Is` works with error wrapping
- More robust and testable

---

## 11. Use type assertions safely

### ❌ Not idiomatic

```go
func processValue(v interface{}) {
    str := v.(string) // Panic if not string!
    fmt.Println(str)
}
```

**Problems**:
- Type assertion can cause panic
- Doesn't check type first

### ✅ Idiomatic

```go
func processValue(v interface{}) {
    str, ok := v.(string)
    if !ok {
        return // or return error
    }
    fmt.Println(str)
}

// Or with type switch
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

**Improvements**:
- Safe check with `ok`
- Type switch for multiple types
- No panic risk

---

## 13. Avoid global variables

### ❌ Not idiomatic

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
    // Uses global db
    row := db.QueryRow("SELECT ...", id)
    // ...
}
```

**Problems**:
- Hard to test (can't inject mock)
- Global state is hard to manage
- Implicit dependencies

### ✅ Idiomatic

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

// Usage
func main() {
    db, _ := sql.Open("postgres", "...")
    repo := NewUserRepository(db)
    user, _ := repo.GetUser(123)
}
```

**Improvements**:
- Explicit dependencies via constructor
- Easy to test (can inject mock)
- No global state

---

## 14. Use `sync` package appropriately

### ❌ Not idiomatic

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

**Problems**:
- Race conditions in concurrent code
- Not thread-safe

### ✅ Idiomatic

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

// Or, for simple counters
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

**Improvements**:
- Thread-safe with mutex or atomic
- `defer` ensures unlock even on panic
- RWMutex to optimize concurrent reads

---

## 15. Documentation: useful comments

### ❌ Not idiomatic

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

**Problems**:
- Obvious comments that don't add value
- Don't follow Go convention (should start with function name)

### ✅ Idiomatic

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

**Improvements**:
- Comments explain the "why", not the "what"
- Follow Go convention (start with function name)
- Document behavior and special cases

---

## Idiomatic code checklist

When reviewing your Go code, check:

- [ ] Errors are returned and propagated with context (`%w`)
- [ ] Names are descriptive and clear
- [ ] `defer` is used for resource cleanup
- [ ] `context` is used for cancellation and timeouts
- [ ] Composition is preferred over "inheritance"
- [ ] `panic` is avoided in normal code
- [ ] `make` is used with capacity when known
- [ ] Sentinel errors are used for expected errors
- [ ] Type assertions are checked with `ok`
- [ ] Global variables are avoided
- [ ] Concurrent code uses `sync` appropriately
- [ ] Comments explain the "why", not the "what"

---

## Conclusion

Idiomatic Go code isn't about blindly following rules, but understanding the language's principles:

- **Simplicity**: clear and direct code
- **Composition**: small pieces that combine
- **Explicitness**: explicit errors, explicit dependencies
- **Safety**: proper handling of concurrency and resources

Writing idiomatic code makes your code more readable, easier to maintain, and more aligned with the Go community's expectations. It's the kind of code that other Go developers recognize and appreciate.

---

## References

- [Effective Go - Official Go Documentation](https://go.dev/doc/effective_go)
- [Go Code Review Comments](https://github.com/golang/go/wiki/CodeReviewComments)
- [Go Best Practices - Uber](https://github.com/uber-go/guide/blob/master/style.md)
- [Standard Package Layout - Go Blog](https://go.dev/blog/package-names)
- [Errors are Values - Go Blog](https://go.dev/blog/errors-are-values)
- [Context Package - Go Documentation](https://pkg.go.dev/context)

