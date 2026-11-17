#!/usr/bin/env node
// Coverage of changed lines: of the lines added since <base>, the share an lcov report marks as run.
// Usage: node diff-coverage.mjs <lcov file> --base <ref> [--min <percent>]
// Run from inside the target repo. Exit 0 = pass (or no --min), 1 = below --min, 2 = usage or git error.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i > -1 ? args[i + 1] : undefined;
};
const lcovPath = args[0];
const base = opt("--base");
const min = opt("--min") === undefined ? null : Number(opt("--min"));

if (!lcovPath || lcovPath.startsWith("--") || !base || Number.isNaN(min)) {
  console.error("usage: node diff-coverage.mjs <lcov file> --base <ref> [--min <percent>]");
  process.exit(2);
}
if (!existsSync(lcovPath)) {
  console.error(`diff-coverage: ${lcovPath} does not exist: run the suite with an lcov reporter first`);
  process.exit(2);
}

const git = (...a) => {
  try {
    return execFileSync("git", a, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    console.error(`diff-coverage: git ${a.join(" ")} failed`);
    process.exit(2);
  }
};
const root = git("rev-parse", "--show-toplevel").trim();

// lcov: SF:<path> opens a file record, DA:<line>,<hits> marks an instrumented line. Records for one file merge.
const hits = new Map();
let file = null;
for (const line of readFileSync(lcovPath, "utf8").split(/\r?\n/)) {
  if (line.startsWith("SF:")) {
    const sf = line.slice(3).trim();
    file = relative(root, isAbsolute(sf) ? sf : resolve(process.cwd(), sf));
    if (!hits.has(file)) hits.set(file, new Map());
  } else if (line.startsWith("DA:") && file) {
    const [n, count] = line.slice(3).split(",").map(Number);
    const lines = hits.get(file);
    lines.set(n, (lines.get(n) ?? 0) + count);
  } else if (line === "end_of_record") {
    file = null;
  }
}

// Added lines per file. `+++` is a header only between a `diff` line and its first `@@`;
// inside a hunk an added line whose text starts with `++` also shows as `+++`.
const added = new Map();
let current = null;
let inHeader = false;
for (const line of git("diff", "-U0", "--no-color", "--no-ext-diff", base, "--").split("\n")) {
  if (line.startsWith("diff ")) inHeader = true;
  else if (inHeader && line.startsWith("+++ ")) current = line === "+++ /dev/null" ? null : line.slice(4).replace(/^b\//, "");
  else if (line.startsWith("@@")) {
    inHeader = false;
    const m = line.match(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/);
    if (!m || !current) continue;
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (!added.has(current)) added.set(current, []);
    for (let i = 0; i < count; i++) added.get(current).push(start + i);
  }
}
// Untracked files are wholly new. ls-files lists relative to the cwd, so run it from the root.
for (const f of git("-C", root, "ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean)) {
  const n = readFileSync(join(root, f), "utf8").split("\n").length;
  added.set(f, Array.from({ length: n }, (_, i) => i + 1));
}

let total = 0;
let covered = 0;
const uncovered = [];
const notInReport = [];
for (const [f, lines] of added) {
  const fileHits = hits.get(f);
  if (!fileHits) {
    notInReport.push(f);
    continue;
  }
  const missed = [];
  for (const n of lines) {
    if (!fileHits.has(n)) continue; // comments, types, blank lines: not instrumented, not counted
    total++;
    if (fileHits.get(n) > 0) covered++;
    else missed.push(n);
  }
  if (missed.length) uncovered.push(`${f}: ${missed.join(", ")}`);
}

const pct = total ? (covered / total) * 100 : 100;
console.log(`diff coverage since ${base}: ${pct.toFixed(1)}% (${covered} of ${total} changed lines run by tests)`);
for (const u of uncovered) console.log(`UNCOVERED  ${u}`);
if (notInReport.length) {
  console.log(`WARN  not in the coverage report, so not counted: ${notInReport.join(", ")}`);
  console.log("      a source file here means the runner skips files no test loads: configure it to report all source files");
}
if (min === null) process.exit(0);
console.log(`result: ${pct >= min ? "PASS" : "FAIL"} (min ${min}%)`);
process.exit(pct >= min ? 0 : 1);
