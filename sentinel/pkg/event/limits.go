package event

// Wire and validation limits for agent → API ingestion.
const (
	MaxBatchSize      = 100
	MaxIngestIDLen    = 128
	MaxSourceLen      = 64
	MaxCategoryLen    = 64
	MaxHostLen        = 256
	MaxMessageLen     = 8192
	MaxFingerprintLen = 128
	MaxRawBytes       = 32 * 1024
	MaxFieldsCount    = 64
	MaxFieldKeyLen    = 64
	MaxFieldStrLen    = 512
	MaxFutureSkew     = 5 // minutes; occurred_at must not be more than this far in the future
)
