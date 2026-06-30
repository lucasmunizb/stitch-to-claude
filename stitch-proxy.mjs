#!/usr/bin/env node
// stitch-proxy.mjs — proxy MCP (stdio) entre o Claude Code e o Stitch.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  ListToolsResultSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const UPSTREAM_URL = process.env.STITCH_URL ?? "https://stitch.googleapis.com/mcp";

function loadApiKey() {
  if (process.env.STITCH_API_KEY) return process.env.STITCH_API_KEY;
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    for (const line of readFileSync(join(here, ".env"), "utf8").split("\n")) {
      const m = line.match(/^\s*STITCH_API_KEY\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return undefined;
}
const API_KEY = loadApiKey();
if (!API_KEY) {
  console.error("[stitch-proxy] STITCH_API_KEY não encontrada (env nem .env).");
  process.exit(1);
}

function collectDefs(schemas) {
  const pool = {};
  for (const s of schemas) {
    if (s && typeof s === "object") {
      for (const key of ["$defs", "definitions"]) {
        if (s[key] && typeof s[key] === "object") Object.assign(pool, s[key]);
      }
    }
  }
  return pool;
}

function sanitizeSchema(root, pool = {}) {
  if (!root || typeof root !== "object") return root;
  const localDefs = { ...pool, ...(root.$defs || {}), ...(root.definitions || {}) };
  const resolveRef = (ref) => {
    const m = ref.match(/^#\/(?:\$defs|definitions)\/(.+)$/);
    if (m) return localDefs[m[1].replace(/~1/g, "/").replace(/~0/g, "~")];
    const path = ref.replace(/^#\//, "").split("/").map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
    let cur = root;
    for (const seg of path) {
      if (cur && typeof cur === "object" && seg in cur) cur = cur[seg];
      else return undefined;
    }
    return cur;
  };
  const walk = (node, seen) => {
    if (Array.isArray(node)) return node.map((n) => walk(n, seen));
    if (node && typeof node === "object") {
      if (typeof node.$ref === "string" && node.$ref.startsWith("#/")) {
        if (seen.has(node.$ref)) return { type: "object" };
        const target = resolveRef(node.$ref);
        if (target === undefined) return { type: "object" };
        const next = new Set(seen).add(node.$ref);
        const resolved = walk(target, next);
        const { $ref, ...siblings } = node;
        const extra = walk(siblings, seen);
        return Object.keys(extra).length ? { ...resolved, ...extra } : resolved;
      }
      const out = {};
      for (const [k, v] of Object.entries(node)) {
        if (k === "$defs" || k === "definitions" || k === "$id" || k === "$schema") continue;
        out[k] = walk(v, seen);
      }
      return out;
    }
    return node;
  };
  const result = walk(root, new Set());
  if (result && typeof result === "object" && !result.type) result.type = "object";
  return result;
}

const upstream = new Client({ name: "stitch-proxy", version: "1.0.0" }, { capabilities: {} });
await upstream.connect(
  new StreamableHTTPClientTransport(new URL(UPSTREAM_URL), {
    requestInit: { headers: { "X-Goog-Api-Key": API_KEY } },
  })
);
console.error("[stitch-proxy] conectado ao upstream:", UPSTREAM_URL);

const server = new Server({ name: "stitch", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const { tools } = await upstream.request({ method: "tools/list", params: {} }, ListToolsResultSchema);
  const pool = collectDefs(tools.flatMap((t) => [t.inputSchema, t.outputSchema].filter(Boolean)));
  return {
    tools: tools.map(({ outputSchema, ...t }) => ({
      ...t,
      inputSchema: sanitizeSchema(t.inputSchema, pool),
    })),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (req) =>
  upstream.callTool({ name: req.params.name, arguments: req.params.arguments ?? {} })
);

await server.connect(new StdioServerTransport());
console.error("[stitch-proxy] rodando (stdio).");
