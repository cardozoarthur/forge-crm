#!/usr/bin/env node
import http from "node:http";
import { fileURLToPath } from "node:url";
import { buildWorkerResponse } from "../scripts/crm-runtime-lib.mjs";

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        request.destroy(new Error("request body too large"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
    connection: "close"
  });
  response.end(body);
}

export function createCrmWorkerServer() {
  return http.createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health") {
        sendJson(response, 200, {
          status: "ok",
          addon_id: "forge.addon.crm",
          worker_id: "forge-crm-runtime-worker",
          supported_entrypoints: [
            "forge_crm.plan_system",
            "forge_crm.bootstrap_tenant",
            "forge_crm.operating_snapshot",
            "forge_crm.classify_lead",
            "forge_crm.record_relationship_event",
            "forge_crm.operating_copilot",
            "forge_crm.generate_proposal",
            "forge_crm.review_followup_forecast",
            "forge_crm.manage_account",
            "forge_crm.manage_contract_signature",
            "forge_crm.generate_document",
            "forge_crm.validate_document",
            "forge_crm.automate_campaign",
            "forge_crm.plan_project_handoff",
            "forge_crm.triage_ticket_sla",
            "forge_crm.deliver_handoff"
          ]
        });
        return;
      }

      const allowedPostPaths = new Set(["/", "/runtime/execute", "/runtime/planning-strategy"]);
      if (request.method !== "POST" || !allowedPostPaths.has(request.url)) {
        sendJson(response, 404, { error: "not_found" });
        return;
      }

      const raw = await readBody(request);
      const input = raw ? JSON.parse(raw) : {};
      sendJson(response, 200, buildWorkerResponse(input));
    } catch (error) {
      sendJson(response, 500, {
        error: "worker_error",
        message: String(error.message || error)
      });
    }
  });
}

export function startCrmWorkerFromEnv() {
  const port = Number(process.env.PORT || 8787);
  const server = createCrmWorkerServer();
  server.listen(port, "127.0.0.1", () => {
    const actualPort = server.address().port;
    console.log(`forge-crm runtime worker listening on http://127.0.0.1:${actualPort}/runtime/execute`);
  });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startCrmWorkerFromEnv();
}
