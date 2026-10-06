package authlog

import (
	"bufio"
	"errors"
	"io"
	"os"
	"os/exec"
	"runtime"
	"time"

	"github.com/luca-staudt/Defentrax/sentinel/pkg/event"
)

// Collector reads SSH/auth-related lines from auth.log or journald.
type Collector struct {
	Path        string
	UseJournald bool
	Host        string
}

// CollectTail reads new lines since last offset (file mode) or recent journal entries.
func (c *Collector) CollectTail(offset int64) ([]event.CanonicalEvent, int64, error) {
	if c.UseJournald {
		return c.collectJournald()
	}
	if runtime.GOOS != "linux" {
		return nil, offset, errors.New("auth log collection unsupported on this OS")
	}
	return c.collectFile(offset)
}

func (c *Collector) collectFile(offset int64) ([]event.CanonicalEvent, int64, error) {
	f, err := os.Open(c.Path)
	if err != nil {
		return nil, offset, err
	}
	defer f.Close()
	if offset > 0 {
		if _, err := f.Seek(offset, io.SeekStart); err != nil {
			return nil, offset, err
		}
	}
	now := time.Now()
	var events []event.CanonicalEvent
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 64*1024), 1024*1024)
	for sc.Scan() {
		if ev, ok := ParseLine(sc.Text(), c.Host, now); ok {
			events = append(events, ev)
		}
	}
	if err := sc.Err(); err != nil {
		return events, offset, err
	}
	pos, err := f.Seek(0, io.SeekCurrent)
	if err != nil {
		return events, offset, err
	}
	return events, pos, nil
}

func (c *Collector) collectJournald() ([]event.CanonicalEvent, int64, error) {
	if runtime.GOOS != "linux" {
		return nil, 0, errors.New("journald collection requires linux")
	}
	cmd := exec.Command("journalctl", "-u", "ssh", "-u", "sshd", "-n", "200", "--no-pager", "-o", "short-iso")
	out, err := cmd.Output()
	if err != nil {
		return nil, 0, err
	}
	now := time.Now()
	var events []event.CanonicalEvent
	for _, line := range splitLines(string(out)) {
		if ev, ok := ParseLine(line, c.Host, now); ok {
			events = append(events, ev)
		}
	}
	return events, 0, nil
}

func splitLines(s string) []string {
	var lines []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			lines = append(lines, s[start:i])
			start = i + 1
		}
	}
	if start < len(s) {
		lines = append(lines, s[start:])
	}
	return lines
}
