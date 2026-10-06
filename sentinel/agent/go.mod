module github.com/luca-staudt/Defentrax/sentinel/agent

go 1.22

replace github.com/luca-staudt/Defentrax/sentinel/pkg/event => ../pkg/event

replace github.com/luca-staudt/Defentrax/sentinel/pkg/version => ../pkg/version

require (
	github.com/google/uuid v1.6.0
	github.com/luca-staudt/Defentrax/sentinel/pkg/event v0.0.0
	github.com/luca-staudt/Defentrax/sentinel/pkg/version v0.0.0
)
