import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public CI validates Forge CRM against a real Forge Core binary", async () => {
  const ci = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

  assert.match(ci, /uses:\s*actions\/checkout@v6/);
  assert.match(ci, /uses:\s*actions\/setup-node@v6/);
  assert.doesNotMatch(ci, /actions\/(?:checkout|setup-node)@v4/);
  assert.match(ci, /repository:\s*cardozoarthur\/forge-core/);
  assert.match(ci, /path:\s*forge-core/);
  assert.match(ci, /cargo build --release --manifest-path forge-core\/Cargo\.toml/);
  assert.match(ci, /forge-core\/target\/release\/forge addons validate --addon-dir addons --output json/);
  assert.match(ci, /forge-core\/target\/release\/forge addons catalog --addon-dir addons --output json/);
  assert.match(
    ci,
    /forge-core\/target\/release\/forge addons package --manifest addons\/forge-crm\.json --repository https:\/\/github\.com\/cardozoarthur\/forge-crm --channel stable --package-path \/tmp\/forge-crm\.package\.json --output json/
  );
  assert.match(ci, /FORGE_BIN:\s*\$\{\{ github\.workspace \}\}\/forge-core\/target\/release\/forge/);
  assert.match(ci, /npm run smoke:forge/);
});
