/* Syntax gate: run `node --check` over every local JS file. */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const files = [
  "js/common.js", "js/router.js", "js/store.js", "js/data.js",
  ...fs.readdirSync(path.join(ROOT, "js/pages")).filter(f => f.endsWith(".js")).map(f => "js/pages/" + f)
];
let failed = 0;
for (const f of files) {
  try { execFileSync(process.execPath, ["--check", path.join(ROOT, f)], { stdio: "ignore" }); }
  catch (e) { failed++; console.error("SYNTAX FAIL: " + f); }
}
if (failed) { console.error(failed + " file(s) failed node --check"); process.exit(1); }
console.log("node --check OK (" + files.length + " files)");
