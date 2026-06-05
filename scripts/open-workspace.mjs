#!/usr/bin/env node
import WebSocket from "ws";
import { randomUUID } from "node:crypto";

const DEFAULT_PORT = 6767;

function usage(exitCode = 0) {
  const out = exitCode === 0 ? console.log : console.error;
  out(`Usage: npm run workspace:open -- --host <domain-or-ip> --cwd <path> [--cwd <path> ...] [options]

Opens one or more directories through the Paseo Direct WebSocket. This also
unarchives matching workspace/project registry records, which fixes the common
"Workspace not found" or "Project not found for worktree" state.

Options:
  --host <value>       Direct connection hostname. Required.
  --port <number>      Direct connection port. Default: ${DEFAULT_PORT}.
  --cwd <path>         Directory to open/unarchive. Can be repeated.
  --password <value>   Direct connection password, if configured.
  --ssl                Use wss:// instead of ws://.
  --origin <value>     WebSocket Origin header. Default: paseo://app.
  --list-only          Only list currently visible workspaces.
  --help               Show this help.
`);
  process.exit(exitCode);
}

function readValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${optionName}`);
  }
  return value;
}

function parseArgs(argv) {
  const args = {
    host: null,
    port: DEFAULT_PORT,
    cwds: [],
    password: null,
    ssl: false,
    origin: "paseo://app",
    listOnly: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const [name, inlineValue] = arg.includes("=") ? arg.split(/=(.*)/s, 2) : [arg, undefined];
    const valueFor = () => inlineValue ?? readValue(argv, i++, name);
    switch (name) {
      case "--host":
        args.host = normalizeHost(valueFor());
        break;
      case "--port": {
        const value = Number(valueFor());
        if (!Number.isInteger(value) || value < 1 || value > 65535) {
          throw new Error("--port must be an integer from 1 to 65535");
        }
        args.port = value;
        break;
      }
      case "--cwd":
        args.cwds.push(valueFor());
        break;
      case "--password":
        args.password = valueFor();
        break;
      case "--ssl":
        args.ssl = true;
        break;
      case "--origin":
        args.origin = valueFor();
        break;
      case "--list-only":
        args.listOnly = true;
        break;
      case "--help":
      case "-h":
        usage(0);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!args.host) throw new Error("--host is required");
  if (!args.listOnly && args.cwds.length === 0) throw new Error("At least one --cwd is required");
  return args;
}

function normalizeHost(raw) {
  const value = raw.trim();
  if (!value) throw new Error("--host cannot be empty");
  if (value.includes("://") || value.includes("/") || value.includes("?")) {
    throw new Error("--host must be a bare hostname or IP address, without scheme, path, or query");
  }
  if (value.includes(":")) {
    throw new Error("--host must not include a port. Pass --port separately.");
  }
  return value;
}

function bearerProtocols(password) {
  if (!password) return [];
  return /^[A-Za-z0-9._~-]+$/.test(password) ? [`paseo.bearer.${password}`] : [];
}

function connect(args) {
  const url = `${args.ssl ? "wss" : "ws"}://${args.host}:${args.port}/ws`;
  const headers = { Origin: args.origin };
  if (args.password) headers.Authorization = `Bearer ${args.password}`;
  const ws = new WebSocket(url, bearerProtocols(args.password), { headers });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out connecting to ${url}`)), 15_000);
    ws.once("open", () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function send(ws, message) {
  ws.send(JSON.stringify(message));
}

function waitForSessionResponse(ws, responseType, requestId, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${responseType}`));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      ws.off("message", onMessage);
      ws.off("close", onClose);
      ws.off("error", onError);
    }

    function onClose(code, reason) {
      cleanup();
      reject(new Error(`WebSocket closed while waiting for ${responseType}: ${code} ${reason}`));
    }

    function onError(error) {
      cleanup();
      reject(error);
    }

    function onMessage(raw) {
      let envelope;
      try {
        envelope = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (envelope.type !== "session") return;
      const message = envelope.message;
      if (message?.type !== responseType) return;
      const payload = message.payload;
      if (payload?.requestId !== requestId) return;
      cleanup();
      resolve(payload);
    }

    ws.on("message", onMessage);
    ws.once("close", onClose);
    ws.once("error", onError);
  });
}

async function request(ws, message, responseType, timeoutMs) {
  const requestId = `req-${randomUUID()}`;
  send(ws, { type: "session", message: { ...message, requestId } });
  return waitForSessionResponse(ws, responseType, requestId, timeoutMs);
}

async function hello(ws) {
  send(ws, {
    type: "hello",
    clientId: `paseo-amaze-${randomUUID()}`,
    clientType: "cli",
    protocolVersion: 1,
    capabilities: {},
  });
}

function summarizeWorkspace(workspace) {
  return {
    id: workspace.id,
    projectId: workspace.projectId,
    projectDisplayName: workspace.projectDisplayName,
    workspaceDirectory: workspace.workspaceDirectory,
    status: workspace.status,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const ws = await connect(args);
  try {
    await hello(ws);

    for (const cwd of args.cwds) {
      const payload = await request(ws, { type: "open_project_request", cwd }, "open_project_response");
      if (payload.error || !payload.workspace) {
        throw new Error(`Failed to open ${cwd}: ${payload.error ?? "missing workspace"}`);
      }
      console.log(`Opened ${cwd}`);
      console.log(JSON.stringify(summarizeWorkspace(payload.workspace), null, 2));
    }

    const workspaces = await request(
      ws,
      { type: "fetch_workspaces_request", page: { limit: 200 } },
      "fetch_workspaces_response",
    );
    console.log("Visible workspaces:");
    for (const entry of workspaces.entries ?? []) {
      console.log(`- ${entry.id} (${entry.projectDisplayName ?? entry.projectId})`);
    }
  } finally {
    ws.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
