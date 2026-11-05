package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
)

var slugRe = regexp.MustCompile(`[^A-Za-z0-9_-]+`)

// safeName keeps a mission's spec filename inside the temp dir.
func safeName(name string, i int) string {
	s := strings.Trim(slugRe.ReplaceAllString(name, "-"), "-")
	if len(s) > 48 {
		s = s[:48]
	}
	if s == "" {
		return fmt.Sprintf("mission-%d", i)
	}
	return s
}

var riskyHosts = []string{
	"api.stripe.com", "checkout.stripe.com", "paypal.com", "api.paypal.com",
	"api.sendgrid.com", "api.mailgun.net", "api.postmarkapp.com", "api.resend.com",
	"api.twilio.com", "hooks.slack.com", "api.sendinblue.com",
}

var destructive = []string{"delete", "remove", "pay", "purchase", "buy", "charge",
	"subscribe", "cancel", "deactivate", "close account", "send"}

const mockJS = `// Auto-mock risky third parties with a fake success: exploration stays safe.
const RISKY_HOSTS = %s;
async function installSafetyNet(page) {
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (RISKY_HOSTS.some((h) => url.includes(h))) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, mocked: true }) });
    }
    return route.continue();
  });
}
module.exports = { installSafetyNet, RISKY_HOSTS };
`

const configJS = `const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({ testDir: '.', fullyParallel: true, workers: %d,
  retries: 0, reporter: [['list']], use: { headless: true, actionTimeout: 4000 } });
`

const specJS = `const { test } = require('@playwright/test');
const { installSafetyNet } = require('./safety-net.js');
const START = %s, DESTRUCTIVE = %s, SAFE_MODE = %s;
test(%s, async ({ page }) => {
  await installSafetyNet(page);
  await page.goto(START, { waitUntil: 'domcontentloaded' });
  for (let step = 0; step < 8; step++) {
    for (const i of (await page.locator('input:visible, textarea:visible').all()).slice(0, 5)) {
      const t = (await i.getAttribute('type')) || 'text';
      try { await i.fill(t === 'email' ? 'test@example.com' : t === 'password' ? 'Test1234!' : 'test'); } catch (e) {}
    }
    let clicked = false;
    for (const b of await page.locator('button:visible, [role=button]:visible, a[href]:visible').all()) {
      const label = ((await b.innerText().catch(() => '')) || '').toLowerCase();
      if (SAFE_MODE && DESTRUCTIVE.some((w) => label.includes(w))) continue;
      try { await b.click({ timeout: 1500 }); clicked = true; break; } catch (e) {}
    }
    await page.waitForTimeout(600);
    if (!clicked) break;
  }
});
`

func writeTemplates(dir string, workers int) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	hosts, _ := json.Marshal(riskyHosts)
	if err := os.WriteFile(filepath.Join(dir, "safety-net.js"),
		[]byte(fmt.Sprintf(mockJS, hosts)), 0o644); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, "playwright.config.js"),
		[]byte(fmt.Sprintf(configJS, workers)), 0o644)
}

func looksProd(u string) bool {
	l := strings.ToLower(u)
	for _, h := range []string{"localhost", "127.0.0.1", "0.0.0.0", ".local", "staging", "preview", "vercel.app", "ngrok"} {
		if strings.Contains(l, h) {
			return false
		}
	}
	return true
}

func exploreDispatch(verb string, p parsed) (int, error) {
	switch verb {
	case "scaffold":
		dir := filepath.Join(strDefault(p.str["--dir"], "."), "snag-explore")
		if err := writeTemplates(dir, 3); err != nil {
			return 0, err
		}
		example := `[{"name":"smoke"},{"name":"signup","goal":"complete the signup flow"}]`
		_ = os.WriteFile(filepath.Join(dir, "missions.json"), []byte(example+"\n"), 0o644)
		fmt.Println(green("OK") + " wrote Playwright safety config to " + dir + "/")
		return exitOK, nil
	case "run":
		return exploreRun(p)
	}
	errorln("usage: snag explore run|scaffold")
	return exitUsage, nil
}

func exploreRun(p parsed) (int, error) {
	url := strDefault(p.str["--url"], resolveConfig().AppURL)
	if url == "" {
		return 0, &apiError{msg: "no URL: pass --url or set your app URL with `snag auth login`", status: 2}
	}
	if looksProd(url) && !p.bools["--force"] {
		errorln(url + " looks like production.")
		hintln("Point --url at a dev/staging server, or pass --force if you're sure.")
		return exitUsage, nil
	}
	workers := atoi(p.str["--workers"], 3)
	missions := loadMissions(p.str["--missions"])
	fmt.Println(dim(fmt.Sprintf("%d mission(s) against %s · %d workers · safe-mode on · payments/email mocked",
		len(missions), url, workers)))
	if p.bools["--dry-run"] {
		for _, m := range missions {
			line := "  - " + str(m["name"])
			if g := str(m["goal"]); g != "" {
				line += ": " + g
			}
			fmt.Println(line)
		}
		fmt.Println(dim("(dry run: nothing executed)"))
		return exitOK, nil
	}
	if _, err := exec.LookPath("npx"); err != nil {
		errorln("Playwright CLI not found (needs Node + `npx playwright`).")
		hintln("Install: npm i -D @playwright/test && npx playwright install chromium")
		return exitError, nil
	}
	work, err := os.MkdirTemp("", "snag-explore-")
	if err != nil {
		return 0, err
	}
	defer os.RemoveAll(work)
	if err := writeTemplates(work, workers); err != nil {
		return 0, err
	}
	dj, _ := json.Marshal(destructive)
	for i, m := range missions {
		file := safeName(str(m["name"]), i)
		start, _ := json.Marshal(strDefault(str(m["url"]), url))
		// The display title keeps the original name; json.Marshal makes it a safe
		// JS string. Only the filename is sanitized.
		nm, _ := json.Marshal(strDefault(str(m["name"]), file))
		spec := fmt.Sprintf(specJS, start, dj, "true", nm)
		_ = os.WriteFile(filepath.Join(work, file+".spec.js"), []byte(spec), 0o644)
	}
	cmd := exec.Command("npx", "playwright", "test", fmt.Sprintf("--workers=%d", workers))
	cmd.Dir = work
	cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
	_ = cmd.Run() // playwright "failures" here mean bugs found: not a CLI error
	fmt.Println("\n" + green("done") + " explored " + url + ". Now: " + boldc("snag issue list"))
	return exitOK, nil
}

func loadMissions(path string) []map[string]any {
	if path != "" {
		if b, err := os.ReadFile(path); err == nil {
			var arr []map[string]any
			if json.Unmarshal(b, &arr) == nil && len(arr) > 0 {
				return arr
			}
		}
	}
	return []map[string]any{{"name": "smoke"}}
}
