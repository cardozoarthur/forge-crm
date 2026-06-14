#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { buildCrmWebAppSnapshot } from "./crm-web-app-lib.mjs";

const args = process.argv.slice(2);
const writeIndex = args.indexOf("--write");
const outputPath = writeIndex >= 0 ? args[writeIndex + 1] : "";
let tenant = "default";
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--write") {
    index += 1;
    continue;
  }
  if (!args[index].startsWith("--")) {
    tenant = args[index];
    break;
  }
}
const snapshot = buildCrmWebAppSnapshot({ tenant_id: tenant });
const body = `${JSON.stringify(snapshot, null, 2)}\n`;

if (outputPath) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, body);
} else {
  process.stdout.write(body);
}
