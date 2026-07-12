const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("tests/ root has no stray *.test.js files outside domain subfolders", () => {
  const testsRoot = path.join(__dirname, "..");
  const strayFiles = fs
    .readdirSync(testsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.js"))
    .map((entry) => entry.name);

  assert.strictEqual(
    strayFiles.length,
    0,
    `Found test file(s) directly in tests/ root (must live in a domain ` +
      `subfolder, e.g. tests/<domain>/): ${strayFiles.join(", ")}`
  );
});
