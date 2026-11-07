package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

// Exit codes: identical to the Python CLI.
const (
	exitOK       = 0
	exitError    = 1
	exitUsage    = 2
	exitNotFound = 3
	exitUpstream = 4
)

func useColor() bool {
	if os.Getenv("NO_COLOR") != "" || os.Getenv("TERM") == "dumb" || flagNoColor {
		return false
	}
	fi, _ := os.Stdout.Stat()
	return fi != nil && (fi.Mode()&os.ModeCharDevice) != 0
}

func c(code, s string) string {
	if !useColor() {
		return s
	}
	return "\033[" + code + "m" + s + "\033[0m"
}

func dim(s string) string   { return c("2", s) }
func boldc(s string) string { return c("1", s) }
func red(s string) string   { return c("31", s) }
func green(s string) string { return c("32", s) }

func errorln(msg string) { fmt.Fprintln(os.Stderr, red("error")+": "+msg) }
func hintln(msg string)  { fmt.Fprintln(os.Stderr, dim(msg)) }

// scrub strips terminal control characters from untrusted recorded content
// before it reaches a TTY, so a malicious page can't inject ANSI escapes.
func scrub(s string) string {
	return strings.Map(func(r rune) rune {
		if (r < 0x20 && r != '\t') || (r >= 0x7f && r <= 0x9f) {
			return -1
		}
		return r
	}, s)
}

// selectFields keeps only the requested keys from a map (or each map in a slice).
func selectFields(obj any, fields []string) any {
	if len(fields) == 0 {
		return obj
	}
	switch v := obj.(type) {
	case []any:
		out := make([]any, len(v))
		for i, o := range v {
			out[i] = selectFields(o, fields)
		}
		return out
	case map[string]any:
		out := map[string]any{}
		for _, f := range fields {
			out[f] = v[f]
		}
		return out
	}
	return obj
}

// jsonText encodes without HTML escaping, so an agent reads "->" and not "-\u003e".
func jsonText(v any, indent string) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", indent)
	_ = enc.Encode(v)
	return strings.TrimRight(buf.String(), "\n")
}

func emitJSON(obj any, fields []string) {
	fmt.Println(jsonText(selectFields(obj, fields), "  "))
}

func kv(rows [][2]string) {
	width := 0
	for _, r := range rows {
		if len(r[0]) > width {
			width = len(r[0])
		}
	}
	for _, r := range rows {
		fmt.Printf("%s  %s\n", dim(pad(r[0], width)), scrub(r[1]))
	}
}

func table(headers []string, rows [][]string) {
	if len(rows) == 0 {
		return
	}
	widths := make([]int, len(headers))
	for i, h := range headers {
		widths[i] = len(h)
	}
	for _, row := range rows {
		for i, cell := range row {
			if i < len(widths) && len(cell) > widths[i] {
				widths[i] = len(cell)
			}
		}
	}
	hp := make([]string, len(headers))
	for i, h := range headers {
		hp[i] = dim(pad(h, widths[i]))
	}
	fmt.Println(strings.Join(hp, "  "))
	for _, row := range rows {
		cp := make([]string, len(row))
		for i, cell := range row {
			cp[i] = pad(scrub(cell), widths[i])
		}
		fmt.Println(strings.Join(cp, "  "))
	}
}

func pad(s string, w int) string {
	for len(s) < w {
		s += " "
	}
	return s
}

func str(v any) string {
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return t
	case float64:
		if t == float64(int64(t)) {
			return fmt.Sprintf("%d", int64(t))
		}
		return fmt.Sprintf("%g", t)
	case bool:
		return fmt.Sprintf("%t", t)
	default:
		return fmt.Sprintf("%v", t)
	}
}
