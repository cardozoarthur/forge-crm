#!/usr/bin/env node
import http from "node:http";
import { buildCrmPlan } from "../scripts/crm-plan-lib.mjs";

const port = Number(process.env.PORT || 8787);

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

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "ok", addon_id: "forge.addon.crm" }));
      return;
    }

    if (request.method !== "POST" || request.url !== "/") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not_found" }));
      return;
    }

    const raw = await readBody(request);
    const input = raw ? JSON.parse(raw) : {};
    const goal = input.goal || input?.input?.goal || input?.dispatch?.input?.goal;
    const result = buildCrmPlan(goal);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(result));
  } catch (error) {
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "worker_error", message: String(error.message || error) }));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`forge-crm planner worker listening on http://127.0.0.1:${port}`);
});

