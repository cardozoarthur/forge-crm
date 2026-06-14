#!/usr/bin/env node
import { buildCrmPlan } from "./crm-plan-lib.mjs";

const goal = process.argv.slice(2).join(" ").trim();
process.stdout.write(JSON.stringify(buildCrmPlan(goal || undefined), null, 2));
process.stdout.write("\n");

