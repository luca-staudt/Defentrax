# Kubernetes deployment (Phase 16)

Manifeste für kleine Self-Host-Installationen: **API**, **Frontend**, **PostgreSQL**, **Redis**, Migration-Job, Ingress, PVCs und eine NetworkPolicy-Grundlage.

**Status:** Phase 16 — raw manifests. Packaged install: [Helm chart (Phase 17)](../helm/sentinel/).

## Voraussetzungen

- Kubernetes 1.27+ (kind, minikube oder Managed Cluster)
- `kubectl`
- Optional: Ingress-Controller (z. B. ingress-nginx)
- Images gebaut und für den Cluster erreichbar (`sentinel-api`, `sentinel-frontend`, `sentinel-migrate`)

## Secrets — Warnung

Die Datei [`secret.yaml`](secret.yaml) ist ein **Template**. Sie enthält nur Platzhalter (`REPLACE_ME`), **keine echten Secrets**.

- Niemals echte Passwörter, Session-Keys oder Connection-Strings in Git committen.
- Vor einem echten `kubectl apply` alle `REPLACE_ME`-Werte ersetzen (oder Secret aus einem Manager erzeugen).
- Produktion: [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets), [External Secrets Operator](https://external-secrets.io/), oder Cloud-KMS / Secrets Manager — nicht Klartext-Secrets in Manifesten.
- `SENTINEL_BOOTSTRAP_ADMIN_*` nur einmalig setzen; danach leeren/entfernen.
- `SENTINEL_SEED_DEV` gehört **nicht** in Kubernetes-Production.

Beispiel-Generierung:

```bash
openssl rand -base64 24   # → POSTGRES_PASSWORD
openssl rand -base64 32   # → SESSION_SECRET / TOTP_ENCRYPTION_KEY / SECRETS_ENCRYPTION_KEY
```

`DATABASE_URL` muss dasselbe Passwort wie `POSTGRES_PASSWORD` und denselben User/DB-Namen wie die ConfigMap nutzen (in-cluster DNS: `postgres:5432`).

## Images bauen (kind / minikube)

```bash
# aus dem Repo-Root
export SENTINEL_IMAGE_TAG=0.2.0
docker compose build sentinel-api sentinel-frontend migrate

# kind
kind load docker-image sentinel-api:${SENTINEL_IMAGE_TAG}
kind load docker-image sentinel-frontend:${SENTINEL_IMAGE_TAG}
kind load docker-image sentinel-migrate:${SENTINEL_IMAGE_TAG}

# minikube
minikube image load sentinel-api:${SENTINEL_IMAGE_TAG}
minikube image load sentinel-frontend:${SENTINEL_IMAGE_TAG}
minikube image load sentinel-migrate:${SENTINEL_IMAGE_TAG}
```

Registry-Tags in `kustomization.yaml` (`images:`) oder per `kustomize edit set image` anpassen.

## Apply (empfohlene Reihenfolge)

```bash
cd sentinel/deployments/kubernetes

# 1) Template prüfen / Secrets setzen (lokal, nicht committen)
#    cp secret.yaml /tmp/sentinel-secret.yaml && $EDITOR /tmp/sentinel-secret.yaml

# 2) Client-seitige Validierung
make k8s-dry-run
# Äquivalent offline (ohne API-Server): kubectl kustomize . | kubeconform -strict -summary
# Mit Cluster: kubectl apply -k . --dry-run=client

# 3) Namespace + Config + Datenstores
kubectl apply -f namespace.yaml
kubectl apply -f configmap.yaml
kubectl apply -f secret.yaml   # nur mit ersetzten Platzhaltern
kubectl apply -f postgres.yaml -f redis.yaml

kubectl rollout status deployment/postgres -n sentinel
kubectl rollout status deployment/redis -n sentinel

# 4) Migration (Job). Bei erneutem Lauf: alten Job löschen.
kubectl delete job sentinel-migrate -n sentinel --ignore-not-found
kubectl apply -f migrate-job.yaml
kubectl wait --for=condition=complete job/sentinel-migrate -n sentinel --timeout=120s

# 5) Workloads + Ingress + Policies
kubectl apply -f api.yaml -f frontend.yaml -f ingress.yaml -f networkpolicy.yaml
kubectl rollout status deployment/api -n sentinel
kubectl rollout status deployment/frontend -n sentinel
```

Oder alles auf einmal (nach Secret-Edit und Image-Load):

```bash
kubectl apply -k .
# Job ggf. separat abwarten, bevor API Traffic erwartet wird:
kubectl wait --for=condition=complete job/sentinel-migrate -n sentinel --timeout=120s
```

## Health probes

| Workload | Liveness | Readiness |
|----------|----------|-----------|
| `api` | `GET /healthz` | `GET /readyz` |
| `frontend` | `GET /login` | `GET /login` |
| `postgres` | `pg_isready` | `pg_isready` |
| `redis` | `redis-cli ping` | `redis-cli ping` |

## Ingress / Hosts

Standard-Host in [`ingress.yaml`](ingress.yaml) und [`configmap.yaml`](configmap.yaml): `sentinel.example.com`. Anpassen:

- `Ingress.spec.rules[].host`
- `CORS_ALLOWED_ORIGINS`
- `NEXT_PUBLIC_WS_URL` (Browser muss die API/WS erreichen; Frontend-Image ggf. neu bauen, wenn der Wert als Build-Arg gebacken wurde)
- TLS: `spec.tls` + Certificate (cert-manager o. ä.)

Port-Forward ohne Ingress:

```bash
kubectl -n sentinel port-forward svc/frontend 3000:3000
kubectl -n sentinel port-forward svc/api 8080:8080
curl -s localhost:8080/healthz
curl -s localhost:8080/readyz
```

## External database

Für managed PostgreSQL (empfohlen ab größer als Lab):

1. `postgres.yaml` **nicht** anwenden (aus `kustomization.yaml` entfernen oder überspringen).
2. In Secret `DATABASE_URL` auf die externe DSN setzen (`sslmode` passend).
3. `POSTGRES_PASSWORD` kann entfallen, wenn nur noch `DATABASE_URL` genutzt wird — Migration-Job und API brauchen weiterhin `DATABASE_URL`.
4. NetworkPolicies: Egress der API/Migrate-Pods zur DB-IP/CIDR erlauben (CNI-abhängig).

Redis kann analog extern betrieben werden (`REDIS_URL` in der ConfigMap/Secret).

## PVCs

| PVC | Default-Größe | Mount |
|-----|---------------|--------|
| `postgres-data` | 10Gi | `/var/lib/postgresql/data` |
| `redis-data` | 2Gi | `/data` |

`storageClassName` bei Bedarf in den PVC-Specs setzen.

## NetworkPolicies

[`networkpolicy.yaml`](networkpolicy.yaml) setzt default-deny Ingress und erlaubt gezielt Postgres/Redis/API/Frontend sowie DNS-Egress. Controller-Namespaces und Egress zu externen DBs müssen je Cluster nachgezogen werden.

## Makefile

```bash
make k8s-dry-run
```

## Dateien

| Datei | Inhalt |
|-------|--------|
| `namespace.yaml` | Namespace `sentinel` |
| `configmap.yaml` | Nicht-geheime Konfiguration |
| `secret.yaml` | Secret-**Template** (Platzhalter) |
| `postgres.yaml` | Deployment, Service, PVC |
| `redis.yaml` | Deployment, Service, PVC |
| `migrate-job.yaml` | Job `sentinel-migrate` |
| `api.yaml` | Deployment + Service, Probes `/healthz` `/readyz` |
| `frontend.yaml` | Deployment + Service |
| `ingress.yaml` | Ingress (nginx-class Beispiel) |
| `networkpolicy.yaml` | Baseline-Policies |
| `kustomization.yaml` | `kubectl apply -k` Bundle |
