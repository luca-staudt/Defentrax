module github.com/luca-staudt/Sentinel/sentinel/agent

go 1.22

replace github.com/luca-staudt/Sentinel/sentinel/pkg/event => ../pkg/event

require (
	github.com/google/uuid v1.6.0
	github.com/luca-staudt/Sentinel/sentinel/pkg/event v0.0.0
)
