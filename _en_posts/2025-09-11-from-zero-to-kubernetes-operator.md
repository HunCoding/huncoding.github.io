---
layout: post
title: "From Zero to a Kubernetes Operator that Watches ConfigMaps"
subtitle: "Learning to build an operator for hot reloading configurations in k8s clusters."
author: otavio_celestino
date: 2025-09-11 10:00:00 -0300
categories: [Kubernetes, Go, DevOps]
tags: [kubernetes, operator, golang, devops]
comments: true
image: "/assets/img/posts/kubernetes-operator-preview.png"
lang: en
original_post: "/do-zero-a-um-operator-kubernetes/"
---

Hey everyone!

Today I'm going to show you how to create a **Kubernetes Operator** from scratch that monitors ConfigMap changes and sends events to a webhook. It's a super useful feature for **hot reloading** configurations in applications running inside K8s clusters.

If you want to see the complete process in action, check out the [YouTube video](https://youtu.be/ibYkWAGisb0) I recorded about this!

{% include embed/youtube.html id="ibYkWAGisb0" %}

## Why is this useful?

Imagine you have an application running in Kubernetes and need to change a configuration. Instead of restarting the entire application, you can:

1. Change the ConfigMap
2. The operator detects the change
3. Sends an event to your application
4. Your application does hot reload of the configuration

If you don't have everything installed, I'll show you how to do it:

```bash
# Install Kubebuilder
curl -L -o kubebuilder "https://go.kubebuilder.io/dl/latest/$(go env GOOS)/$(go env GOARCH)"
chmod +x kubebuilder
sudo mv kubebuilder /usr/local/bin/

# Install controller-gen
go install sigs.k8s.io/controller-tools/cmd/controller-gen@latest

# Install kustomize
go install sigs.k8s.io/kustomize/kustomize/v5@latest
```

## Complete Step by Step

### Step 1: Creating the Base Project

First, let's create the project structure using Kubebuilder:

```bash
# Create the project
kubebuilder init --domain exemplo.com --repo github.com/HunnTeRUS/meu-operator

# Create the API and Controller
kubebuilder create api --group apps --version v1alpha1 --kind ConfigMapWatcher --resource --controller
```

Kubebuilder will generate the entire base project structure. It's like a scaffold that gives you the starting point.

### Step 2: Defining the API (Custom Resource Definition)

Now let's edit the `api/v1alpha1/configmapwatcher_types.go` file to define our API:

```go
package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// ConfigMapWatcherSpec defines the desired state of ConfigMapWatcher
type ConfigMapWatcherSpec struct {
	// ConfigMapName is the name of the ConfigMap to be watched
	ConfigMapName string `json:"configMapName"`

	// ConfigMapNamespace is the namespace where the ConfigMap is located
	ConfigMapNamespace string `json:"configMapNamespace"`

	// EventEndpoint is the URL where events will be sent when the ConfigMap changes
	EventEndpoint string `json:"eventEndpoint"`

	// EventSecretName is the name of the secret containing credentials for the endpoint
	// +optional
	EventSecretName string `json:"eventSecretName,omitempty"`

	// EventSecretNamespace is the namespace where the secret is located
	// +optional
	EventSecretNamespace string `json:"eventSecretNamespace,omitempty"`
}

// ConfigMapWatcherStatus defines the observed state of ConfigMapWatcher
type ConfigMapWatcherStatus struct {
	// LastConfigMapVersion is the last observed version of the ConfigMap
	LastConfigMapVersion string `json:"lastConfigMapVersion,omitempty"`

	// LastEventSent is the timestamp of the last event sent
	LastEventSent metav1.Time `json:"lastEventSent,omitempty"`

	// Conditions represent the most recent observations of the current state
	Conditions []metav1.Condition `json:"conditions,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status

// ConfigMapWatcher is the Schema for the configmapwatchers API
type ConfigMapWatcher struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   ConfigMapWatcherSpec   `json:"spec,omitempty"`
	Status ConfigMapWatcherStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true

// ConfigMapWatcherList contains a list of ConfigMapWatcher
type ConfigMapWatcherList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []ConfigMapWatcher `json:"items"`
}

func init() {
	SchemeBuilder.Register(&ConfigMapWatcher{}, &ConfigMapWatcherList{})
}
```

**What changed here?**

- **ConfigMapWatcherSpec**: Defines what the user wants (which ConfigMap to watch, where to send events)
- **ConfigMapWatcherStatus**: Defines the current state (last observed version, last event sent)
- **JSON tags**: Essential for serialization/deserialization
- **kubebuilder markers**: Automatically generate the CRD

## Step 3: Implementing the Controller Logic

Now let's implement the logic in `internal/controller/configmapwatcher_controller.go`. I'll break this down into parts to make it clearer:

### Part 1: Base Structure and Imports

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

**What do we import here?**
- `bytes`, `encoding/json`, `net/http`: For sending HTTP data
- `context`: For managing operation context
- `time`: For timestamps and delays
- `corev1`: For working with native K8s ConfigMaps
- `errors`: For handling K8s-specific errors
- `ctrl`, `client`: For the controller-runtime framework

### Part 2: Reconciler Structure

```go
// ConfigMapWatcherReconciler reconciles ConfigMapWatcher objects
type ConfigMapWatcherReconciler struct {
	client.Client  // Client for interacting with the K8s API
	Scheme *runtime.Scheme  // Scheme for serialization/deserialization
}
```

**What is this?**
- `Client`: It's like an "HTTP client" for Kubernetes. Allows CRUD operations
- `Scheme`: Defines how to convert Go objects to/from K8s YAML/JSON format

### Part 3: RBAC Permissions

```go
// +kubebuilder:rbac:groups=apps.exemplo.com,resources=configmapwatchers,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=apps.exemplo.com,resources=configmapwatchers/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=apps.exemplo.com,resources=configmapwatchers/finalizers,verbs=update
// +kubebuilder:rbac:groups=core,resources=configmaps,verbs=get;list;watch
// +kubebuilder:rbac:groups=core,resources=secrets,verbs=get;list;watch
```

**What are these permissions?**
- **apps.exemplo.com**: Our custom API (ConfigMapWatcher)
- **core**: Native Kubernetes APIs (ConfigMaps, Secrets)
- **verbs**: Allowed operations (get, list, watch, create, update, etc.)

### Part 4: Reconcile Function - Fetching the ConfigMapWatcher

```go
// Reconcile handles the reconciliation loop for ConfigMapWatcher resources
func (r *ConfigMapWatcherReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := log.FromContext(ctx)

	// Fetch the ConfigMapWatcher instance
	configMapWatcher := &appsv1alpha1.ConfigMapWatcher{}
	err := r.Get(ctx, req.NamespacedName, configMapWatcher)
	if err != nil {
		if errors.IsNotFound(err) {
			log.Info("ConfigMapWatcher resource not found. Ignoring since the object must be deleted")
			return ctrl.Result{}, nil
		}
		log.Error(err, "Failed to get ConfigMapWatcher")
		return ctrl.Result{}, err
	}
```

**What happens here?**
1. **req.NamespacedName**: Contains the name and namespace of the object that changed
2. **r.Get()**: Fetches the ConfigMapWatcher from the cluster
3. **errors.IsNotFound()**: If not found, it means it was deleted (normal behavior)

### Part 5: Fetching the Target ConfigMap

```go
	// Fetch the target ConfigMap
	configMap := &corev1.ConfigMap{}
	err = r.Get(ctx, types.NamespacedName{
		Name:      configMapWatcher.Spec.ConfigMapName,
		Namespace: configMapWatcher.Spec.ConfigMapNamespace,
	}, configMap)
	if err != nil {
		if errors.IsNotFound(err) {
			log.Info("Target ConfigMap not found", "ConfigMap", configMapWatcher.Spec.ConfigMapName)
			return ctrl.Result{RequeueAfter: time.Minute}, nil
		}
		log.Error(err, "Failed to get target ConfigMap")
		return ctrl.Result{}, err
	}
```

**What do we do here?**
1. **types.NamespacedName**: Creates an identifier with name + namespace
2. **configMapWatcher.Spec**: Accesses the specification (what the user defined)
3. **RequeueAfter**: If the ConfigMap doesn't exist, try again in 1 minute

### Part 6: Checking for Changes

```go
	// Check if the ConfigMap changed
	currentVersion := configMap.ResourceVersion
	if currentVersion == configMapWatcher.Status.LastConfigMapVersion {
		return ctrl.Result{RequeueAfter: time.Minute}, nil
	}
```

**How do we detect changes?**
- **ResourceVersion**: Each object in K8s has a unique version that changes with every modification
- **Status.LastConfigMapVersion**: We store the last version we processed
- **Comparison**: If they're equal, there was no change

### Part 7: Preparing Event Data

```go
	// Prepare event data
	eventData := map[string]interface{}{
		"configMapName":      configMap.Name,
		"configMapNamespace": configMap.Namespace,
		"resourceVersion":    configMap.ResourceVersion,
		"data":               configMap.Data,
		"binaryData":         configMap.BinaryData,
		"timestamp":          time.Now().UTC().Format(time.RFC3339),
	}
```

**What do we send in the event?**
- **Metadata**: Name, namespace, version
- **Data**: Current ConfigMap content
- **Timestamp**: When the event was generated

### Part 8: Sending the Event

```go
	// Send event
	jsonData, err := json.Marshal(eventData)
	if err != nil {
		log.Error(err, "Failed to marshal event data")
		return ctrl.Result{}, err
	}

	resp, err := http.Post(configMapWatcher.Spec.EventEndpoint, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		log.Error(err, "Failed to send event")
		return ctrl.Result{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		err = fmt.Errorf("failed to send event: status code %d", resp.StatusCode)
		log.Error(err, "Event sending failed")
		return ctrl.Result{}, err
	}
```

**Sending process:**
1. **json.Marshal()**: Converts the Go map to JSON
2. **http.Post()**: Sends POST to the webhook
3. **defer resp.Body.Close()**: Ensures the connection is closed
4. **Status check**: Confirms the webhook received (status 200)

### Part 9: Updating Status

```go
	// Update status
	configMapWatcher.Status.LastConfigMapVersion = currentVersion
	configMapWatcher.Status.LastEventSent = metav1.Now()
	if err := r.Status().Update(ctx, configMapWatcher); err != nil {
		log.Error(err, "Failed to update ConfigMapWatcher status")
		return ctrl.Result{}, err
	}

	return ctrl.Result{RequeueAfter: time.Minute}, nil
}
```

**Why do we update the status?**
- **LastConfigMapVersion**: To not process the same version again
- **LastEventSent**: To know when the last event was sent
- **r.Status().Update()**: Updates only the status (not the spec)

### Part 10: Configuring the Watch

```go
// SetupWithManager configures the controller with the Manager
func (r *ConfigMapWatcherReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&appsv1alpha1.ConfigMapWatcher{}).  // Watch for changes in ConfigMapWatcher
		Watches(
			&corev1.ConfigMap{},  // Also watch for changes in ConfigMaps
			handler.EnqueueRequestsFromMapFunc(r.findObjectsForConfigMap),
		).
		Complete(r)
}
```

**What does this do?**
- **For()**: Tells to watch for changes in ConfigMapWatcher
- **Watches()**: Also watches for changes in native ConfigMaps
- **EnqueueRequestsFromMapFunc()**: When a ConfigMap changes, calls our function to find which ConfigMapWatchers are watching it

### Part 11: Finding Related ConfigMapWatchers

```go
// findObjectsForConfigMap finds ConfigMapWatcher objects that are watching the given ConfigMap
func (r *ConfigMapWatcherReconciler) findObjectsForConfigMap(ctx context.Context, obj client.Object) []reconcile.Request {
	configMap := obj.(*corev1.ConfigMap)
	var requests []reconcile.Request

	// Fetch all ConfigMapWatchers
	var watchers appsv1alpha1.ConfigMapWatcherList
	if err := r.List(ctx, &watchers); err != nil {
		return requests
	}

	// Check which ones are watching this ConfigMap
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

**Logic here:**
1. **Receives**: A ConfigMap that changed
2. **Lists**: All ConfigMapWatchers in the cluster
3. **Filters**: Only those watching this specific ConfigMap
4. **Returns**: List of requests to process

## How Everything Works Together?

1. **ConfigMap changes** → Controller detects
2. **findObjectsForConfigMap()** → Finds related ConfigMapWatchers
3. **Reconcile()** → Called for each ConfigMapWatcher
4. **Check change** → Compare versions
5. **Send event** → If changed, notify webhook
6. **Update status** → Mark as processed

Now it's clearer how each part works? Each function has a specific responsibility and works together to create the desired behavior!
