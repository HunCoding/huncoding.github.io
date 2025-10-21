---
layout: post
title: "Creating a Custom Terraform Provider from Scratch"
subtitle: "Learn how to build a Terraform provider using Go from the ground up."
date: 2025-09-15 00:00:00 -0000
categories: [Terraform, Go, DevOps]
tags: [terraform, go, provider, sdk, api]
comments: true
image: "/assets/img/posts/provider-terraform-customizado.png"
lang: en
original_post: "/provider-terraform-customizado/"
---

Hey everyone! Today I'll show you how to create a custom Terraform provider from scratch using Go. It's a topic that many developers are afraid to tackle, but it's actually not the seven-headed beast it seems to be.

## Why create a custom Provider?

Before diving into the code, let's understand the scenario. Terraform already has thousands of official and community providers, but what about when you need to manage a resource from your company's internal API? Or when you have a very specific tool that doesn't have a provider?

That's where creating a custom provider comes in. And look, it's not just for extreme cases - sometimes you want to have total control over how your resources are managed, or you need very specific features that existing providers don't offer.

## The architecture of a Terraform Provider

A Terraform provider is essentially a plugin that implements the Terraform Plugin Protocol. It's responsible for:

- **Resource Management**: Create, read, update, delete (CRUD) operations
- **Data Sources**: Query existing resources
- **Schema Definition**: Define the structure of resources and data sources
- **Configuration**: Handle provider configuration

The provider communicates with Terraform through gRPC, and Terraform handles the state management, planning, and execution.

## Setting up the project

First, let's create our project structure:

```bash
mkdir terraform-provider-example
cd terraform-provider-example
go mod init github.com/your-username/terraform-provider-example
```

Now let's install the necessary dependencies:

```bash
go get github.com/hashicorp/terraform-plugin-sdk/v2/helper/schema
go get github.com/hashicorp/terraform-plugin-sdk/v2/helper/validation
go get github.com/hashicorp/terraform-plugin-sdk/v2/plugin
```

## Creating the basic structure

Let's start with the main file `main.go`:

```go
package main

import (
    "context"
    "flag"
    "log"

    "github.com/hashicorp/terraform-plugin-sdk/v2/helper/schema"
    "github.com/hashicorp/terraform-plugin-sdk/v2/plugin"
)

func main() {
    var debugMode bool

    flag.BoolVar(&debugMode, "debug", false, "set to true to run the provider with support for debuggers like delve")
    flag.Parse()

    opts := &plugin.ServeOpts{
        ProviderFunc: provider,
    }

    if debugMode {
        err := plugin.Debug(context.Background(), "registry.terraform.io/your-username/example", opts)
        if err != nil {
            log.Fatal(err.Error())
        }
        return
    }

    plugin.Serve(opts)
}
```

## Defining the Provider

Now let's create the provider function in `provider.go`:

```go
package main

import (
    "github.com/hashicorp/terraform-plugin-sdk/v2/helper/schema"
)

func provider() *schema.Provider {
    return &schema.Provider{
        Schema: map[string]*schema.Schema{
            "api_key": {
                Type:        schema.TypeString,
                Required:    true,
                DefaultFunc: schema.EnvDefaultFunc("EXAMPLE_API_KEY", nil),
                Description: "API key for the Example service",
            },
            "base_url": {
                Type:        schema.TypeString,
                Optional:    true,
                Default:     "https://api.example.com",
                Description: "Base URL for the Example API",
            },
        },
        ResourcesMap: map[string]*schema.Resource{
            "example_user": resourceUser(),
        },
        DataSourcesMap: map[string]*schema.Resource{
            "example_user": dataSourceUser(),
        },
    }
}
```

## Creating a Resource

Let's create our first resource in `resource_user.go`:

```go
package main

import (
    "context"
    "fmt"
    "log"

    "github.com/hashicorp/terraform-plugin-sdk/v2/diag"
    "github.com/hashicorp/terraform-plugin-sdk/v2/helper/schema"
    "github.com/hashicorp/terraform-plugin-sdk/v2/helper/validation"
)

func resourceUser() *schema.Resource {
    return &schema.Resource{
        CreateContext: resourceUserCreate,
        ReadContext:   resourceUserRead,
        UpdateContext: resourceUserUpdate,
        DeleteContext: resourceUserDelete,

        Schema: map[string]*schema.Schema{
            "name": {
                Type:         schema.TypeString,
                Required:     true,
                ValidateFunc: validation.StringLenBetween(1, 100),
                Description:  "The name of the user",
            },
            "email": {
                Type:         schema.TypeString,
                Required:     true,
                ValidateFunc: validation.StringIsEmail,
                Description:  "The email address of the user",
            },
            "age": {
                Type:         schema.TypeInt,
                Optional:     true,
                ValidateFunc: validation.IntBetween(0, 150),
                Description:  "The age of the user",
            },
            "active": {
                Type:        schema.TypeBool,
                Optional:    true,
                Default:     true,
                Description: "Whether the user is active",
            },
        },
    }
}

func resourceUserCreate(ctx context.Context, d *schema.ResourceData, m interface{}) diag.Diagnostics {
    var diags diag.Diagnostics

    // Get the provider configuration
    config := m.(*Config)

    // Get the resource data
    name := d.Get("name").(string)
    email := d.Get("email").(string)
    age := d.Get("age").(int)
    active := d.Get("active").(bool)

    // Create the user via API
    user, err := config.Client.CreateUser(&User{
        Name:   name,
        Email:  email,
        Age:    age,
        Active: active,
    })
    if err != nil {
        return diag.FromErr(err)
    }

    // Set the ID
    d.SetId(user.ID)

    // Read the resource to populate all fields
    return resourceUserRead(ctx, d, m)
}

func resourceUserRead(ctx context.Context, d *schema.ResourceData, m interface{}) diag.Diagnostics {
    var diags diag.Diagnostics

    config := m.(*Config)

    // Get the user ID
    userID := d.Id()

    // Fetch the user from the API
    user, err := config.Client.GetUser(userID)
    if err != nil {
        if isNotFoundError(err) {
            d.SetId("")
            return diags
        }
        return diag.FromErr(err)
    }

    // Set the resource data
    d.Set("name", user.Name)
    d.Set("email", user.Email)
    d.Set("age", user.Age)
    d.Set("active", user.Active)

    return diags
}

func resourceUserUpdate(ctx context.Context, d *schema.ResourceData, m interface{}) diag.Diagnostics {
    var diags diag.Diagnostics

    config := m.(*Config)
    userID := d.Id()

    // Check which fields have changed
    if d.HasChange("name") || d.HasChange("email") || d.HasChange("age") || d.HasChange("active") {
        name := d.Get("name").(string)
        email := d.Get("email").(string)
        age := d.Get("age").(int)
        active := d.Get("active").(bool)

        // Update the user
        _, err := config.Client.UpdateUser(userID, &User{
            Name:   name,
            Email:  email,
            Age:    age,
            Active: active,
        })
        if err != nil {
            return diag.FromErr(err)
        }
    }

    return resourceUserRead(ctx, d, m)
}

func resourceUserDelete(ctx context.Context, d *schema.ResourceData, m interface{}) diag.Diagnostics {
    var diags diag.Diagnostics

    config := m.(*Config)
    userID := d.Id()

    // Delete the user
    err := config.Client.DeleteUser(userID)
    if err != nil {
        return diag.FromErr(err)
    }

    d.SetId("")
    return diags
}
```

## Creating a Data Source

Now let's create a data source in `data_source_user.go`:

```go
package main

import (
    "context"

    "github.com/hashicorp/terraform-plugin-sdk/v2/diag"
    "github.com/hashicorp/terraform-plugin-sdk/v2/helper/schema"
)

func dataSourceUser() *schema.Resource {
    return &schema.Resource{
        ReadContext: dataSourceUserRead,

        Schema: map[string]*schema.Schema{
            "id": {
                Type:        schema.TypeString,
                Required:    true,
                Description: "The ID of the user to retrieve",
            },
            "name": {
                Type:        schema.TypeString,
                Computed:    true,
                Description: "The name of the user",
            },
            "email": {
                Type:        schema.TypeString,
                Computed:    true,
                Description: "The email address of the user",
            },
            "age": {
                Type:        schema.TypeInt,
                Computed:    true,
                Description: "The age of the user",
            },
            "active": {
                Type:        schema.TypeBool,
                Computed:    true,
                Description: "Whether the user is active",
            },
        },
    }
}

func dataSourceUserRead(ctx context.Context, d *schema.ResourceData, m interface{}) diag.Diagnostics {
    var diags diag.Diagnostics

    config := m.(*Config)
    userID := d.Get("id").(string)

    // Fetch the user from the API
    user, err := config.Client.GetUser(userID)
    if err != nil {
        return diag.FromErr(err)
    }

    // Set the resource data
    d.SetId(user.ID)
    d.Set("name", user.Name)
    d.Set("email", user.Email)
    d.Set("age", user.Age)
    d.Set("active", user.Active)

    return diags
}
```

## API Client Implementation

Let's create the API client in `client.go`:

```go
package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "io"
    "net/http"
    "time"
)

type Config struct {
    Client *APIClient
}

type APIClient struct {
    BaseURL    string
    APIKey     string
    HTTPClient *http.Client
}

type User struct {
    ID     string `json:"id,omitempty"`
    Name   string `json:"name"`
    Email  string `json:"email"`
    Age    int    `json:"age"`
    Active bool   `json:"active"`
}

func NewAPIClient(baseURL, apiKey string) *APIClient {
    return &APIClient{
        BaseURL: baseURL,
        APIKey:  apiKey,
        HTTPClient: &http.Client{
            Timeout: 30 * time.Second,
        },
    }
}

func (c *APIClient) CreateUser(user *User) (*User, error) {
    jsonData, err := json.Marshal(user)
    if err != nil {
        return nil, err
    }

    req, err := http.NewRequest("POST", c.BaseURL+"/users", bytes.NewBuffer(jsonData))
    if err != nil {
        return nil, err
    }

    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("Authorization", "Bearer "+c.APIKey)

    resp, err := c.HTTPClient.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusCreated {
        return nil, fmt.Errorf("failed to create user: status %d", resp.StatusCode)
    }

    var createdUser User
    if err := json.NewDecoder(resp.Body).Decode(&createdUser); err != nil {
        return nil, err
    }

    return &createdUser, nil
}

func (c *APIClient) GetUser(userID string) (*User, error) {
    req, err := http.NewRequest("GET", c.BaseURL+"/users/"+userID, nil)
    if err != nil {
        return nil, err
    }

    req.Header.Set("Authorization", "Bearer "+c.APIKey)

    resp, err := c.HTTPClient.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    if resp.StatusCode == http.StatusNotFound {
        return nil, fmt.Errorf("user not found")
    }

    if resp.StatusCode != http.StatusOK {
        return nil, fmt.Errorf("failed to get user: status %d", resp.StatusCode)
    }

    var user User
    if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
        return nil, err
    }

    return &user, nil
}

func (c *APIClient) UpdateUser(userID string, user *User) (*User, error) {
    jsonData, err := json.Marshal(user)
    if err != nil {
        return nil, err
    }

    req, err := http.NewRequest("PUT", c.BaseURL+"/users/"+userID, bytes.NewBuffer(jsonData))
    if err != nil {
        return nil, err
    }

    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("Authorization", "Bearer "+c.APIKey)

    resp, err := c.HTTPClient.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusOK {
        return nil, fmt.Errorf("failed to update user: status %d", resp.StatusCode)
    }

    var updatedUser User
    if err := json.NewDecoder(resp.Body).Decode(&updatedUser); err != nil {
        return nil, err
    }

    return &updatedUser, nil
}

func (c *APIClient) DeleteUser(userID string) error {
    req, err := http.NewRequest("DELETE", c.BaseURL+"/users/"+userID, nil)
    if err != nil {
        return err
    }

    req.Header.Set("Authorization", "Bearer "+c.APIKey)

    resp, err := c.HTTPClient.Do(req)
    if err != nil {
        return err
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusNoContent {
        return fmt.Errorf("failed to delete user: status %d", resp.StatusCode)
    }

    return nil
}

func isNotFoundError(err error) bool {
    return err != nil && err.Error() == "user not found"
}
```

## Provider Configuration

Now let's update the provider to use our configuration in `provider.go`:

```go
package main

import (
    "github.com/hashicorp/terraform-plugin-sdk/v2/helper/schema"
)

func provider() *schema.Provider {
    return &schema.Provider{
        Schema: map[string]*schema.Schema{
            "api_key": {
                Type:        schema.TypeString,
                Required:    true,
                DefaultFunc: schema.EnvDefaultFunc("EXAMPLE_API_KEY", nil),
                Description: "API key for the Example service",
            },
            "base_url": {
                Type:        schema.TypeString,
                Optional:    true,
                Default:     "https://api.example.com",
                Description: "Base URL for the Example API",
            },
        },
        ResourcesMap: map[string]*schema.Resource{
            "example_user": resourceUser(),
        },
        DataSourcesMap: map[string]*schema.Resource{
            "example_user": dataSourceUser(),
        },
        ConfigureContextFunc: providerConfigure,
    }
}

func providerConfigure(ctx context.Context, d *schema.ResourceData) (interface{}, diag.Diagnostics) {
    var diags diag.Diagnostics

    apiKey := d.Get("api_key").(string)
    baseURL := d.Get("base_url").(string)

    client := NewAPIClient(baseURL, apiKey)

    return &Config{
        Client: client,
    }, diags
}
```

## Testing the Provider

Let's create a simple test to verify our provider works. Create a file `test.tf`:

```hcl
terraform {
  required_providers {
    example = {
      source = "registry.terraform.io/your-username/example"
    }
  }
}

provider "example" {
  api_key = "your-api-key-here"
  base_url = "https://api.example.com"
}

resource "example_user" "test_user" {
  name  = "John Doe"
  email = "john@example.com"
  age   = 30
  active = true
}

data "example_user" "test_user_data" {
  id = example_user.test_user.id
}

output "user_name" {
  value = data.example_user.test_user_data.name
}
```

## Building and Installing

To build the provider:

```bash
go build -o terraform-provider-example
```

To install it locally for testing:

```bash
mkdir -p ~/.terraform.d/plugins/registry.terraform.io/your-username/example/1.0.0/linux_amd64
cp terraform-provider-example ~/.terraform.d/plugins/registry.terraform.io/your-username/example/1.0.0/linux_amd64/
```

## Advanced Features

### Custom Validation

You can add custom validation functions:

```go
func validateUserAge(v interface{}, k string) (ws []string, errors []error) {
    age := v.(int)
    if age < 0 || age > 150 {
        errors = append(errors, fmt.Errorf("age must be between 0 and 150"))
    }
    return
}
```

### Computed Fields

You can have computed fields that are set by the API:

```go
"created_at": {
    Type:        schema.TypeString,
    Computed:    true,
    Description: "When the user was created",
},
```

### Import Support

Add import functionality to your resources:

```go
Importer: &schema.ResourceImporter{
    StateContext: schema.ImportStatePassthroughContext,
},
```

## Best Practices

1. **Error Handling**: Always return meaningful error messages
2. **Validation**: Use validation functions to catch errors early
3. **Documentation**: Document all fields and resources
4. **Testing**: Write comprehensive tests for your provider
5. **Versioning**: Use semantic versioning for your provider
6. **State Management**: Be careful with state changes and migrations

## Conclusion

Creating a custom Terraform provider isn't as complex as it might seem. The key is to understand the basic structure and implement the CRUD operations correctly. With this foundation, you can extend your provider with more advanced features as needed.

The provider we created here is a complete example that you can use as a starting point for your own custom providers. Remember to adapt the API client and resource definitions to match your specific use case.

Happy coding!
