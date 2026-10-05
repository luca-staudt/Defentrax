module github.com/luca-staudt/Sentinel/sentinel/detection

go 1.24

replace github.com/luca-staudt/Sentinel/sentinel/pkg/event => ../pkg/event

require (
	github.com/google/uuid v1.6.0
	github.com/luca-staudt/Sentinel/sentinel/pkg/event v0.0.0
	github.com/redis/go-redis/v9 v9.22.0
	gopkg.in/yaml.v3 v3.0.1
)

require (
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	go.uber.org/atomic v1.11.0 // indirect
	golang.org/x/sys v0.30.0 // indirect
)
