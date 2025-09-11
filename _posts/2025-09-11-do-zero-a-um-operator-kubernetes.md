---
layout: post
title: Do zero a um Operador Kubernetes que observa ConfigMaps
subtitle: Aprendendo a construir um operador para fazer hot reload de configurações em clusters k8s.
author: otavio_celestino
date: 2025-09-11 10:00:00 -0300
categories: [Kubernetes, Go, Devops]
tags: [kubernetes, operator, golang, devops]
---
E aí, pessoal!

Hoje vou te mostrar como criar um **Operador Kubernetes** do zero que monitora mudanças em ConfigMaps e envia eventos para um webhook. É uma funcionalidade super útil para fazer **hot reload** de configurações em aplicações que rodam dentro de clusters K8s.

Se você quer ver o processo completo em ação, dá uma olhada no [vídeo no YouTube](https://youtu.be/ibYkWAGisb0) que gravei sobre isso!

## Por que isso é útil?

Imagine que você tem uma aplicação rodando no Kubernetes e precisa alterar uma configuração. Ao invés de fazer restart da aplicação inteira, você pode:

1. Alterar o ConfigMap
2. O operador detecta a mudança
3. Envia um evento para sua aplicação
4. Sua aplicação faz hot reload da configuração

Se não tiver tudo instalado, vou te mostrar como fazer:

```bash
# Instalar Kubebuilder
curl -L -o kubebuilder "https://go.kubebuilder.io/dl/latest/$(go env GOOS)/$(go env GOARCH)"
chmod +x kubebuilder
sudo mv kubebuilder /usr/local/bin/

# Instalar controller-gen
go install sigs.k8s.io/controller-tools/cmd/controller-gen@latest

# Instalar kustomize
go install sigs.k8s.io/kustomize/kustomize/v5@latest
```

## Passo a Passo Completo

### Etapa 1: Criando o Projeto Base

Primeiro, vamos criar a estrutura do projeto usando o Kubebuilder:

```bash
# Criar o projeto
kubebuilder init --domain exemplo.com --repo github.com/HunnTeRUS/meu-operator

# Criar a API e Controller
kubebuilder create api --group apps --version v1alpha1 --kind ConfigMapWatcher --resource --controller
```

O Kubebuilder vai gerar toda a estrutura base do projeto. É como um scaffold que te dá o ponto de partida.

### Etapa 2: Definindo a API (Custom Resource Definition)

Agora vamos editar o arquivo `api/v1alpha1/configmapwatcher_types.go` para definir nossa API:

```go
package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// ConfigMapWatcherSpec define o estado desejado do ConfigMapWatcher
type ConfigMapWatcherSpec struct {
	// ConfigMapName é o nome do ConfigMap a ser observado
	ConfigMapName string `json:"configMapName"`

	// ConfigMapNamespace é o namespace onde o ConfigMap está localizado
	ConfigMapNamespace string `json:"configMapNamespace"`

	// EventEndpoint é a URL onde os eventos serão enviados quando o ConfigMap mudar
	EventEndpoint string `json:"eventEndpoint"`

	// EventSecretName é o nome do secret contendo credenciais para o endpoint
	// +optional
	EventSecretName string `json:"eventSecretName,omitempty"`

	// EventSecretNamespace é o namespace onde o secret está localizado
	// +optional
	EventSecretNamespace string `json:"eventSecretNamespace,omitempty"`
}

// ConfigMapWatcherStatus define o estado observado do ConfigMapWatcher
type ConfigMapWatcherStatus struct {
	// LastConfigMapVersion é a última versão observada do ConfigMap
	LastConfigMapVersion string `json:"lastConfigMapVersion,omitempty"`

	// LastEventSent é o timestamp do último evento enviado
	LastEventSent metav1.Time `json:"lastEventSent,omitempty"`

	// Conditions representam as observações mais recentes do estado atual
	Conditions []metav1.Condition `json:"conditions,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status

// ConfigMapWatcher é o Schema para a API configmapwatchers
type ConfigMapWatcher struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   ConfigMapWatcherSpec   `json:"spec,omitempty"`
	Status ConfigMapWatcherStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true

// ConfigMapWatcherList contém uma lista de ConfigMapWatcher
type ConfigMapWatcherList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []ConfigMapWatcher `json:"items"`
}

func init() {
	SchemeBuilder.Register(&ConfigMapWatcher{}, &ConfigMapWatcherList{})
}
```

**O que mudou aqui?**

- **ConfigMapWatcherSpec**: Define o que o usuário quer (qual ConfigMap observar, para onde enviar eventos)
- **ConfigMapWatcherStatus**: Define o estado atual (última versão observada, último evento enviado)
- **Tags JSON**: Essenciais para serialização/deserialização
- **Marcadores kubebuilder**: Geram automaticamente o CRD

## Etapa 3: Implementando a Lógica do Controller

Agora vamos implementar a lógica no `internal/controller/configmapwatcher_controller.go`. Vou quebrar isso em partes para ficar mais claro:

### Parte 1: Estrutura Base e Imports

```go
package controller

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/handler"
	"sigs.k8s.io/controller-runtime/pkg/log"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	appsv1alpha1 "github.com/HunnTeRUS/meu-operator/api/v1alpha1"
)
```

**O que importamos aqui?**
- `bytes`, `encoding/json`, `net/http`: Para enviar dados HTTP
- `context`: Para gerenciar contexto das operações
- `time`: Para timestamps e delays
- `corev1`: Para trabalhar com ConfigMaps nativos do K8s
- `errors`: Para tratar erros específicos do K8s
- `ctrl`, `client`: Para o framework do controller-runtime

### Parte 2: Estrutura do Reconciler

```go
// ConfigMapWatcherReconciler reconcilia objetos ConfigMapWatcher
type ConfigMapWatcherReconciler struct {
	client.Client  // Cliente para interagir com a API do K8s
	Scheme *runtime.Scheme  // Scheme para serialização/deserialização
}
```

**O que é isso?**
- `Client`: É como um "cliente HTTP" para o Kubernetes. Permite fazer operações CRUD
- `Scheme`: Define como converter objetos Go para/do formato YAML/JSON do K8s

### Parte 3: Permissões RBAC

```go
// +kubebuilder:rbac:groups=apps.exemplo.com,resources=configmapwatchers,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=apps.exemplo.com,resources=configmapwatchers/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=apps.exemplo.com,resources=configmapwatchers/finalizers,verbs=update
// +kubebuilder:rbac:groups=core,resources=configmaps,verbs=get;list;watch
// +kubebuilder:rbac:groups=core,resources=secrets,verbs=get;list;watch
```

**O que são essas permissões?**
- **apps.exemplo.com**: Nossa API customizada (ConfigMapWatcher)
- **core**: APIs nativas do Kubernetes (ConfigMaps, Secrets)
- **verbs**: Operações permitidas (get, list, watch, create, update, etc.)

### Parte 4: Função Reconcile - Buscando o ConfigMapWatcher

```go
// Reconcile lida com o loop de reconciliação para recursos ConfigMapWatcher
func (r *ConfigMapWatcherReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := log.FromContext(ctx)

	// Buscar a instância ConfigMapWatcher
	configMapWatcher := &appsv1alpha1.ConfigMapWatcher{}
	err := r.Get(ctx, req.NamespacedName, configMapWatcher)
	if err != nil {
		if errors.IsNotFound(err) {
			log.Info("Recurso ConfigMapWatcher não encontrado. Ignorando pois o objeto deve ser deletado")
			return ctrl.Result{}, nil
		}
		log.Error(err, "Falha ao obter ConfigMapWatcher")
		return ctrl.Result{}, err
	}
```

**O que acontece aqui?**
1. **req.NamespacedName**: Contém o nome e namespace do objeto que mudou
2. **r.Get()**: Busca o ConfigMapWatcher no cluster
3. **errors.IsNotFound()**: Se não encontrou, significa que foi deletado (comportamento normal)

### Parte 5: Buscando o ConfigMap Alvo

```go
	// Buscar o ConfigMap alvo
	configMap := &corev1.ConfigMap{}
	err = r.Get(ctx, types.NamespacedName{
		Name:      configMapWatcher.Spec.ConfigMapName,
		Namespace: configMapWatcher.Spec.ConfigMapNamespace,
	}, configMap)
	if err != nil {
		if errors.IsNotFound(err) {
			log.Info("ConfigMap alvo não encontrado", "ConfigMap", configMapWatcher.Spec.ConfigMapName)
			return ctrl.Result{RequeueAfter: time.Minute}, nil
		}
		log.Error(err, "Falha ao obter ConfigMap alvo")
		return ctrl.Result{}, err
	}
```

**O que fazemos aqui?**
1. **types.NamespacedName**: Cria um identificador com nome + namespace
2. **configMapWatcher.Spec**: Acessa a especificação (o que o usuário definiu)
3. **RequeueAfter**: Se o ConfigMap não existe, tenta novamente em 1 minuto

### Parte 6: Verificando se Houve Mudanças

```go
	// Verificar se o ConfigMap mudou
	currentVersion := configMap.ResourceVersion
	if currentVersion == configMapWatcher.Status.LastConfigMapVersion {
		return ctrl.Result{RequeueAfter: time.Minute}, nil
	}
```

**Como detectamos mudanças?**
- **ResourceVersion**: Cada objeto no K8s tem uma versão única que muda a cada modificação
- **Status.LastConfigMapVersion**: Armazenamos a última versão que processamos
- **Comparação**: Se são iguais, não houve mudança

### Parte 7: Preparando os Dados do Evento

```go
	// Preparar dados do evento
	eventData := map[string]interface{}{
		"configMapName":      configMap.Name,
		"configMapNamespace": configMap.Namespace,
		"resourceVersion":    configMap.ResourceVersion,
		"data":               configMap.Data,
		"binaryData":         configMap.BinaryData,
		"timestamp":          time.Now().UTC().Format(time.RFC3339),
	}
```

**O que enviamos no evento?**
- **Metadados**: Nome, namespace, versão
- **Dados**: Conteúdo atual do ConfigMap
- **Timestamp**: Quando o evento foi gerado

### Parte 8: Enviando o Evento

```go
	// Enviar evento
	jsonData, err := json.Marshal(eventData)
	if err != nil {
		log.Error(err, "Falha ao fazer marshal dos dados do evento")
		return ctrl.Result{}, err
	}

	resp, err := http.Post(configMapWatcher.Spec.EventEndpoint, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		log.Error(err, "Falha ao enviar evento")
		return ctrl.Result{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		err = fmt.Errorf("falha ao enviar evento: status code %d", resp.StatusCode)
		log.Error(err, "Envio de evento falhou")
		return ctrl.Result{}, err
	}
```

**Processo de envio:**
1. **json.Marshal()**: Converte o mapa Go para JSON
2. **http.Post()**: Envia POST para o webhook
3. **defer resp.Body.Close()**: Garante que a conexão seja fechada
4. **Verificação de status**: Confirma que o webhook recebeu (status 200)

### Parte 9: Atualizando o Status

```go
	// Atualizar status
	configMapWatcher.Status.LastConfigMapVersion = currentVersion
	configMapWatcher.Status.LastEventSent = metav1.Now()
	if err := r.Status().Update(ctx, configMapWatcher); err != nil {
		log.Error(err, "Falha ao atualizar status do ConfigMapWatcher")
		return ctrl.Result{}, err
	}

	return ctrl.Result{RequeueAfter: time.Minute}, nil
}
```

**Por que atualizamos o status?**
- **LastConfigMapVersion**: Para não processar a mesma versão novamente
- **LastEventSent**: Para saber quando foi o último evento enviado
- **r.Status().Update()**: Atualiza apenas o status (não a spec)

### Parte 10: Configurando o Watch

```go
// SetupWithManager configura o controller com o Manager
func (r *ConfigMapWatcherReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&appsv1alpha1.ConfigMapWatcher{}).  // Observa mudanças em ConfigMapWatcher
		Watches(
			&corev1.ConfigMap{},  // Também observa mudanças em ConfigMaps
			handler.EnqueueRequestsFromMapFunc(r.findObjectsForConfigMap),
		).
		Complete(r)
}
```

**O que isso faz?**
- **For()**: Diz para observar mudanças em ConfigMapWatcher
- **Watches()**: Também observa mudanças em ConfigMaps nativos
- **EnqueueRequestsFromMapFunc()**: Quando um ConfigMap muda, chama nossa função para encontrar quais ConfigMapWatchers estão observando ele

### Parte 11: Encontrando ConfigMapWatchers Relacionados

```go
// findObjectsForConfigMap encontra objetos ConfigMapWatcher que estão observando o ConfigMap dado
func (r *ConfigMapWatcherReconciler) findObjectsForConfigMap(ctx context.Context, obj client.Object) []reconcile.Request {
	configMap := obj.(*corev1.ConfigMap)
	var requests []reconcile.Request

	// Buscar todos os ConfigMapWatchers
	var watchers appsv1alpha1.ConfigMapWatcherList
	if err := r.List(ctx, &watchers); err != nil {
		return requests
	}

	// Verificar quais estão observando este ConfigMap
	for _, watcher := range watchers.Items {
		if watcher.Spec.ConfigMapName == configMap.Name && 
		   watcher.Spec.ConfigMapNamespace == configMap.Namespace {
			requests = append(requests, reconcile.Request{
				NamespacedName: types.NamespacedName{
					Name:      watcher.Name,
					Namespace: watcher.Namespace,
				},
			})
		}
	}

	return requests
}
```

**Lógica aqui:**
1. **Recebe**: Um ConfigMap que mudou
2. **Lista**: Todos os ConfigMapWatchers do cluster
3. **Filtra**: Apenas os que estão observando este ConfigMap específico
4. **Retorna**: Lista de requests para processar

## Como Tudo Funciona Juntos?

1. **ConfigMap muda** → Controller detecta
2. **findObjectsForConfigMap()** → Encontra ConfigMapWatchers relacionados
3. **Reconcile()** → É chamado para cada ConfigMapWatcher
4. **Verifica mudança** → Compara versões
5. **Envia evento** → Se mudou, notifica o webhook
6. **Atualiza status** → Marca como processado

Agora ficou mais claro como cada parte funciona? Cada função tem uma responsabilidade específica e trabalha em conjunto para criar o comportamento desejado!
