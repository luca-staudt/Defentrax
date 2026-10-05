package apperrors

import (
	"encoding/json"
	"net/http"
)

// Response is the standard API error envelope (see project-context).
type Response struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"request_id"`
}

// WriteJSON writes an error response with the standard shape.
func WriteJSON(w http.ResponseWriter, status int, code, message, requestID string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(Response{
		Code:      code,
		Message:   message,
		RequestID: requestID,
	})
}
