{{/*
Expand the name of the chart.
*/}}
{{- define "sentinel.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "sentinel.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "sentinel.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "sentinel.labels" -}}
helm.sh/chart: {{ include "sentinel.chart" . }}
{{ include "sentinel.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: sentinel
{{- with .Values.commonLabels }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{- define "sentinel.selectorLabels" -}}
app.kubernetes.io/name: {{ include "sentinel.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "sentinel.namespace" -}}
{{- default .Release.Namespace .Values.namespaceOverride -}}
{{- end -}}

{{- define "sentinel.secretName" -}}
{{- if .Values.secrets.existingSecret -}}
{{- .Values.secrets.existingSecret -}}
{{- else -}}
{{- printf "%s-secrets" (include "sentinel.fullname" .) -}}
{{- end -}}
{{- end -}}

{{- define "sentinel.configMapName" -}}
{{- printf "%s-config" (include "sentinel.fullname" .) -}}
{{- end -}}

{{- define "sentinel.api.fullname" -}}
{{- printf "%s-api" (include "sentinel.fullname" .) -}}
{{- end -}}

{{- define "sentinel.frontend.fullname" -}}
{{- printf "%s-frontend" (include "sentinel.fullname" .) -}}
{{- end -}}

{{- define "sentinel.postgres.fullname" -}}
{{- printf "%s-postgres" (include "sentinel.fullname" .) -}}
{{- end -}}

{{- define "sentinel.redis.fullname" -}}
{{- printf "%s-redis" (include "sentinel.fullname" .) -}}
{{- end -}}

{{- define "sentinel.migrate.fullname" -}}
{{- printf "%s-migrate" (include "sentinel.fullname" .) -}}
{{- end -}}

{{- define "sentinel.api.image" -}}
{{- $tag := .Values.api.image.tag | default .Values.image.tag -}}
{{- printf "%s:%s" .Values.api.image.repository $tag -}}
{{- end -}}

{{- define "sentinel.frontend.image" -}}
{{- $tag := .Values.frontend.image.tag | default .Values.image.tag -}}
{{- printf "%s:%s" .Values.frontend.image.repository $tag -}}
{{- end -}}

{{- define "sentinel.migrate.image" -}}
{{- $tag := .Values.migrate.image.tag | default .Values.image.tag -}}
{{- printf "%s:%s" .Values.migrate.image.repository $tag -}}
{{- end -}}

{{- define "sentinel.redisUrl" -}}
{{- if .Values.config.redisUrl -}}
{{- .Values.config.redisUrl -}}
{{- else if .Values.redis.enabled -}}
{{- printf "redis://%s:%v/0" (include "sentinel.redis.fullname" .) .Values.redis.service.port -}}
{{- else -}}
{{- fail "config.redisUrl is required when redis.enabled=false" -}}
{{- end -}}
{{- end -}}

{{- define "sentinel.apiProxyTarget" -}}
{{- if .Values.config.apiProxyTarget -}}
{{- .Values.config.apiProxyTarget -}}
{{- else -}}
{{- printf "http://%s:%v" (include "sentinel.api.fullname" .) .Values.api.service.port -}}
{{- end -}}
{{- end -}}

{{- define "sentinel.databaseUrl" -}}
{{- if .Values.secrets.databaseUrl -}}
{{- .Values.secrets.databaseUrl -}}
{{- else if and .Values.postgres.enabled .Values.secrets.postgresPassword -}}
{{- printf "postgres://%s:%s@%s:%v/%s?sslmode=disable" .Values.config.postgresUser .Values.secrets.postgresPassword (include "sentinel.postgres.fullname" .) .Values.postgres.service.port .Values.config.postgresDb -}}
{{- else -}}
{{- "" -}}
{{- end -}}
{{- end -}}

{{/*
Validate that secrets are supplied when the chart creates them.
*/}}
{{- define "sentinel.validateSecrets" -}}
{{- if and .Values.secrets.create (not .Values.secrets.existingSecret) -}}
{{- if not .Values.secrets.postgresPassword -}}
{{- fail "secrets.postgresPassword is required (or set secrets.existingSecret). No default production passwords." -}}
{{- end -}}
{{- if not .Values.secrets.sessionSecret -}}
{{- fail "secrets.sessionSecret is required (or set secrets.existingSecret). No default production passwords." -}}
{{- end -}}
{{- if not .Values.secrets.totpEncryptionKey -}}
{{- fail "secrets.totpEncryptionKey is required (or set secrets.existingSecret)." -}}
{{- end -}}
{{- if not .Values.secrets.secretsEncryptionKey -}}
{{- fail "secrets.secretsEncryptionKey is required (or set secrets.existingSecret)." -}}
{{- end -}}
{{- $dbUrl := include "sentinel.databaseUrl" . -}}
{{- if and (not $dbUrl) (not .Values.postgres.enabled) -}}
{{- fail "secrets.databaseUrl is required when postgres.enabled=false." -}}
{{- end -}}
{{- end -}}
{{- if and (not .Values.secrets.create) (not .Values.secrets.existingSecret) -}}
{{- fail "Set secrets.existingSecret or secrets.create=true with secret values." -}}
{{- end -}}
{{- end -}}
