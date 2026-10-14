#!/usr/bin/env node
// Validate report-kit versions in an HTML report without a browser.
// Usage: rk-check report.html [more.html ...]   (exit 1 when problems are found)
const fs = require("fs");
const path = require("path");
const { validate } = require(path.join(__dirname, "..", "report-kit.js"));

const files = process.argv.slice(2);
if (!files.length) {
  console.error("usage: rk-check <report.html> [more.html ...]");
  process.exit(2);
}
const re = /<script\b(?=[^>]*type="application\/json")(?=[^>]*(?:class="rk-v"|id="report"))[^>]*>([\s\S]*?)<\/script>/g;
let failed = false;
for (const file of files) {
  const raws = [];
  for (const m of fs.readFileSync(file, "utf8").matchAll(re)) {
    try { raws.push(JSON.parse(m[1])); } catch (e) { raws.push({ __error: e.message }); }
  }
  const problems = raws.length ? validate(raws) : ["no report versions found"];
  if (problems.length) {
    failed = true;
    problems.forEach((p) => console.error(`✗ ${file}: ${p}`));
  } else {
    console.log(`✓ ${file}: ${raws.length} version(s), ok`);
  }
}
process.exit(failed ? 1 : 0);
