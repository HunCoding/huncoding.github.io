# Fluxo do Sistema de Tradução

## Diagrama de Fluxo

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Post Markdown │    │  Jekyll Plugin   │    │   HTML Output   │
│                 │    │                  │    │                 │
│ title: "Título" │───▶│ Processa         │───▶│ <script>        │
│ translations:   │    │ traduções        │    │ window.pageData │
│   title_en:     │    │                  │    │ </script>       │
│   content_en:   │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         │
                                                         ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   User Clicks   │    │   JavaScript     │    │   Browser       │
│ Language Button │───▶│ Language Toggle  │───▶│ localStorage    │
│                 │    │                  │    │                 │
│ 🌍 PT-BR        │    │ - Detecta idioma │    │ - Salva         │
│                 │    │ - Aplica tradução│    │   preferência   │
│                 │    │ - Atualiza UI    │    │ - Persiste      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Fluxo Detalhado

### 1. Build Time (Jekyll)
```
Post Markdown
    ↓
Plugin Ruby (translation-processor.rb)
    ↓
Extrai traduções do front matter
    ↓
Gera dados JSON
    ↓
Injeta no HTML via include
```

### 2. Runtime (Browser)
```
Usuário carrega página
    ↓
JavaScript detecta idioma preferido
    ↓
Aplica traduções se necessário
    ↓
Usuário clica no botão de idioma
    ↓
JavaScript alterna idioma
    ↓
Atualiza conteúdo e UI
    ↓
Salva preferência no localStorage
```

## Componentes do Sistema

### Frontend
- **language-toggle.js**: Lógica principal de alternância
- **language-toggle.css**: Estilos e animações
- **topbar.html**: Botão de idioma na interface

### Backend
- **translation-processor.rb**: Plugin Jekyll para processamento
- **translation-data.html**: Include para injeção de dados
- **_config.yml**: Configuração do plugin

### Dados
- **Front Matter**: Traduções armazenadas no YAML
- **JSON**: Dados processados para o JavaScript
- **localStorage**: Preferência do usuário

## Estados do Sistema

### Estado Inicial
- Idioma detectado via URL, localStorage ou padrão
- Conteúdo carregado no idioma detectado
- Botão mostra idioma atual

### Estado de Alternância
- Usuário clica no botão
- Animação de transição
- Conteúdo traduzido
- UI atualizada
- Preferência salva

### Estado Persistente
- Preferência salva no localStorage
- URL atualizada com parâmetro
- Funciona entre sessões

## Tratamento de Erros

### Tradução Não Encontrada
- Fallback para idioma original
- Log de erro no console
- Continua funcionamento normal

### JavaScript Desabilitado
- Botão não aparece
- Conteúdo permanece no idioma original
- Sistema degrada graciosamente

### Plugin Jekyll Falha
- Traduções não processadas
- JavaScript não encontra dados
- Fallback para conteúdo original
