#!/usr/bin/env node
import { buildCrmWorkflowPack } from "./crm-workflow-pack-lib.mjs";

const tenant = process.argv[2] || "default";
console.log(JSON.stringify(buildCrmWorkflowPack({ tenant_id: tenant }), null, 2));

