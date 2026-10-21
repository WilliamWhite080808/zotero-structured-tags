import assert from "node:assert/strict";
import fs from "node:fs";

const manifestURL = new URL("../manifest.json", import.meta.url);
const manifest = JSON.parse(fs.readFileSync(manifestURL, "utf8"));
const zotero = manifest.applications?.zotero;

assert.equal(manifest.manifest_version, 2, "Zotero bootstrapped plugins require manifest_version 2");
assert.ok(manifest.name, "manifest.name is required");
assert.ok(manifest.version, "manifest.version is required");
assert.ok(zotero?.id, "applications.zotero.id is required by Zotero");
assert.ok(zotero?.update_url, "applications.zotero.update_url is required by Zotero 10");
assert.doesNotThrow(() => new URL(zotero.update_url), "update_url must be a valid URL");
assert.ok(zotero?.strict_max_version, "applications.zotero.strict_max_version is required by Zotero 10");
assert.ok(!String(zotero.strict_min_version || "").includes("*"), "strict_min_version cannot contain '*'");
assert.ok(fs.existsSync(new URL("../bootstrap.js", import.meta.url)), "bootstrap.js is required");

console.log("Zotero manifest validation passed");
