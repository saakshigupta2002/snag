#!/usr/bin/env node
// House style for any written output: no em dashes, no comma before "and".
// Usage: node check-prose.mjs [dir-or-file ...]   (default: current directory)
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const SKIP = new Set(["node_modules", "dist", "build", ".git", ".placebo", "fixtures", "coverage", ".next", "out"]);
const EXT = new Set([".md", ".mdx", ".ts", ".tsx", ".js", ".mjs", ".py", ".yml", ".yaml", ".html", ".json", ".txt"]);
const roots = (process.argv.slice(2).length ? process.argv.slice(2) : ["."]).map((p) => resolve(p));
const files = [];
const walk = (p) => {
  if (!existsSync(p)) return;
  if (statSync(p).isFile()) return void files.push(p);
  for (const name of readdirSync(p)) {
    if (SKIP.has(name) || name.endsWith("-lock.json") || name === "pnpm-lock.yaml") continue;
    const q = join(p, name);
    if (statSync(q).isDirectory()) walk(q);
    else if (EXT.has(extname(name))) files.push(q);
  }
};
roots.forEach(walk);

const rules = [
  { name: "em dash", re: /—/ },
  { name: 'comma before "and"', re: /, and\b/ },
];
let problems = 0;
for (const file of files) {
  if (file.endsWith("check-prose.mjs")) continue;
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      for (const r of rules) {
        if (r.re.test(line)) {
          problems++;
          console.log(`${relative(process.cwd(), file)}:${i + 1}: ${r.name}: ${line.trim().slice(0, 120)}`);
        }
      }
    });
}
if (problems) {
  console.log(`\n${problems} style problem(s).`);
  process.exit(1);
}
console.log(`Prose check passed (${files.length} files).`);
