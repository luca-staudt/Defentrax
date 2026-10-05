package sdk

// Kind identifies the primary extension point a plugin implements.
type Kind string

const (
	KindEventParser           Kind = "event_parser"
	KindNotificationProvider  Kind = "notification_provider"
	KindDetectionRuleProvider Kind = "detection_rule_provider"
	KindDataSource            Kind = "data_source"
)

// ValidKind reports whether k is a known v1 kind.
func ValidKind(k Kind) bool {
	switch k {
	case KindEventParser, KindNotificationProvider, KindDetectionRuleProvider, KindDataSource:
		return true
	default:
		return false
	}
}

// APIVersion is the plugin host API version this SDK implements.
const APIVersion = 1
