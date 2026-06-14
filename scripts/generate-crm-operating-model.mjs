#!/usr/bin/env node
import { buildCrmOperatingModel } from "./crm-workflow-pack-lib.mjs";

const tenant = process.argv[2] || "default";
console.log(JSON.stringify(buildCrmOperatingModel({ tenant_id: tenant }), null, 2));
