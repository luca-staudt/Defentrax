module github.com/luca-staudt/Defentrax/sentinel/api

go 1.27

replace github.com/luca-staudt/Defentrax/sentinel/pkg/event => ../pkg/event

replace github.com/luca-staudt/Defentrax/sentinel/pkg/version => ../pkg/version

replace github.com/luca-staudt/Defentrax/sentinel/detection => ../detection

replace github.com/luca-staudt/Defentrax/sentinel/plugins => ../plugins

require (
	github.com/google/uuid v1.6.0
	github.com/gorilla/websocket v1.5.3
	github.com/jackc/pgx/v5 v5.9.2
	github.com/luca-staudt/Defentrax/sentinel/detection v0.0.0
	github.com/luca-staudt/Defentrax/sentinel/pkg/event v0.0.0
	github.com/luca-staudt/Defentrax/sentinel/pkg/version v0.0.0
	github.com/luca-staudt/Defentrax/sentinel/plugins v0.0.0
	github.com/pquerna/otp v1.4.0
	github.com/redis/go-redis/v9 v9.7.3
	golang.org/x/crypto v0.47.0
)

require (
	github.com/boombuler/barcode v1.0.1-0.20190219062509-6c824513bacc // indirect
	github.com/cespare/xxhash/v2 v2.2.0 // indirect
	github.com/dgryski/go-rendezvous v0.0.0-20200823014737-9f7001d12a5f // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	github.com/kr/text v0.2.0 // indirect
	github.com/rogpeppe/go-internal v1.16.0 // indirect
	golang.org/x/sync v0.22.0 // indirect
	golang.org/x/sys v0.40.0 // indirect
	golang.org/x/text v0.41.0 // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
)
