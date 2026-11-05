package main

import (
	"bufio"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
)

func urlEscape(s string) string { return url.PathEscape(s) }

func prompt(reader *bufio.Reader, label, def string) string {
	if def != "" {
		fmt.Printf("%s [%s]: ", label, def)
	} else {
		fmt.Printf("%s: ", label)
	}
	line, _ := reader.ReadString('\n')
	line = strings.TrimSpace(line)
	if line == "" {
		return def
	}
	return line
}

func authLogin() int {
	fi, _ := os.Stdin.Stat()
	if fi == nil || (fi.Mode()&os.ModeCharDevice) == 0 {
		errorln("interactive login needs a terminal.")
		hintln("Set SNAG_ENDPOINT and SNAG_TOKEN instead.")
		return exitUsage
	}
	reader := bufio.NewReader(os.Stdin)
	existing := loadConfigFile()
	fmt.Println("Connect snag to your Snag deployment.")
	fmt.Println()
	cfg := Config{SafeMode: true}
	cfg.Endpoint = strings.TrimRight(prompt(reader, "Ingest / API URL",
		strDefault(existing.Endpoint, "http://localhost:8787")), "/")
	fmt.Print("Management token (SNAG_API_TOKEN, blank if none): ")
	tok, _ := reader.ReadString('\n')
	cfg.Token = strings.TrimSpace(tok)
	cfg.AppURL = prompt(reader, "Your app's URL (for `snag explore`)",
		strDefault(existing.AppURL, "http://localhost:3000"))

	cl, _ := newClient(cfg)
	if _, err := cl.get("/api/health", nil); err != nil {
		errorln("could not reach " + cfg.Endpoint + " (" + err.Error() + ")")
		return exitUpstream
	}
	if got, err := cl.get("/api/projects", nil); err == nil {
		if list := asList(got); len(list) > 0 {
			fmt.Println("\nProjects:")
			for i, o := range list {
				m := asMap(o)
				fmt.Printf("  %d. %s  %s\n", i+1, str(m["name"]), dim(str(m["id"])))
			}
			pick := prompt(reader, "Default project number (blank to skip)", "")
			if n, err := strconv.Atoi(pick); err == nil && n >= 1 && n <= len(list) {
				cfg.Project = str(asMap(list[n-1])["id"])
			}
		}
	}
	path, err := cfg.save()
	if err != nil {
		errorln(err.Error())
		return exitError
	}
	fmt.Println("\n" + green("OK") + " saved to " + path)
	return exitOK
}

func authStatus() (int, error) {
	cfg := resolveConfig()
	if cfg.Endpoint == "" {
		return 0, &apiError{msg: "not configured: run `snag auth login`", status: 2}
	}
	reachable := green("reachable")
	if cl, _ := newClient(cfg); cl != nil {
		if _, err := cl.get("/api/health", nil); err != nil {
			reachable = red("unreachable (" + err.Error() + ")")
		}
	}
	token := dim("none (open server)")
	if cfg.Token != "" {
		token = "set"
	}
	kv([][2]string{{"endpoint", cfg.Endpoint}, {"token", token},
		{"project", strDefault(cfg.Project, dim("none"))},
		{"app url", strDefault(cfg.AppURL, dim("unset"))}, {"status", reachable}})
	return exitOK, nil
}
