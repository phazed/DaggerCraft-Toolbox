import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("release CSP permits the tools' runtime styles", async () => {
  const rawConfig = await readFile(
    new URL("../src-tauri/tauri.conf.json", import.meta.url),
    "utf8"
  );
  const config = JSON.parse(rawConfig);
  const security = config.app?.security;

  assert.match(security?.csp ?? "", /style-src[^;]*'unsafe-inline'/);
  assert.deepEqual(security?.dangerousDisableAssetCspModification, ["style-src"]);
  assert.doesNotMatch(security?.dangerousDisableAssetCspModification.join(" ") ?? "", /script-src/);
});
