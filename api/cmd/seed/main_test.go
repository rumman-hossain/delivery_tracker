package main

import (
	"strings"
	"testing"
)

func TestReadPassword(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{name: "strips a trailing newline", input: "hunter2\n", want: "hunter2"},
		{name: "strips a trailing CRLF", input: "hunter2\r\n", want: "hunter2"},
		{name: "accepts input with no line ending", input: "hunter2", want: "hunter2"},
		{name: "preserves internal spaces", input: "correct horse battery\n", want: "correct horse battery"},
		{name: "preserves surrounding spaces", input: "  spaced  \n", want: "  spaced  "},
		{name: "rejects a blank line", input: "\n", wantErr: true},
		{name: "rejects empty input", input: "", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := readPassword(strings.NewReader(tt.input))

			if tt.wantErr {
				if err == nil {
					t.Fatalf("readPassword(%q) = %q, want an error", tt.input, got)
				}
				return
			}

			if err != nil {
				t.Fatalf("readPassword(%q): %v", tt.input, err)
			}
			if got != tt.want {
				t.Errorf("readPassword(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}
