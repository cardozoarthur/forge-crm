#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import {
  buildCrmStrategicObjectiveAudit,
  crmStrategicObjectiveAuditToMarkdown
} from "./crm-strategic-objective-audit-lib.mjs";

function parseArgs(args) {
  const parsed = {
    tenant_id: "default",
    format: "json",
    write: null
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--format") {
      parsed.format = args[index + 1] || "json";
      index += 1;
    } else if (arg === "--write") {
      parsed.write = args[index + 1] || null;
      index += 1;
    } else if (!arg.startsWith("--")) {
      parsed.tenant_id = arg;
    }
  }

  return parsed;
}

const options = parseArgs(process.argv.slice(2));
const audit = buildCrmStrategicObjectiveAudit({ tenant_id: options.tenant_id });
const output = options.format === "markdown" ? crmStrategicObjectiveAuditToMarkdown(audit) : `${JSON.stringify(audit, null, 2)}\n`;

if (options.write) {
  await writeFile(options.write, output);
} else {
  process.stdout.write(output);
}
