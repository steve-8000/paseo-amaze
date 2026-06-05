#!/usr/bin/env node
import bcrypt from "bcryptjs";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

const DEFAULT_PORT = 6767;
const DEFAULT_LISTEN_HOST = "0.0.0.0";
const DEFAULT_PASEO_BIN = "/Applications/Paseo.app/Contents/Resources/bin/paseo";
const DEFAULT_PASEO_HOME = join(homedir(), ".paseo");
const CONFIG_SCHEMA = "https://paseo.sh/schemas/paseo.config.v1.json";

function usage(exitCode = 0) {
  const out = exitCode === 0 ? console.log : console.error;
  out(`Usage: npm run setup:direct -- --host <domain-or-ip> [options]

Configures an installed Paseo DMG daemon for Direct connection and restarts it.

Options:
  --host <value>          Public/LAN hostname clients will enter. Required.
  --port <number>         Daemon TCP port. Default: ${DEFAULT_PORT}.
  --listen-host <value>   Bind host. Default: ${DEFAULT_LISTEN_HOST}.
  --origin <value>        Extra CORS origin to add. Can be repeated.
  --password <value>      Persist this daemon password in config.json as bcrypt.
  --app-base-url <url>    Optional app.baseUrl value to write.
  --paseo-bin <path>      Paseo CLI path. Default: ${DEFAULT_PASEO_BIN}.
  --paseo-home <path>     Paseo home dir. Default: ${DEFAULT_PASEO_HOME}.
  --no-restart            Only write config; do not restart daemon.
  --verify-only           Do not write config; only verify current endpoint.
  --no-cli-check          Skip WebSocket/CLI verification.
  --help                  Show this help.

Examples:
  npm run setup:direct -- --host ai.example.com
  npm run setup:direct -- --host 192.168.1.10 --password 'change-me'
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
    listenHost: DEFAULT_LISTEN_HOST,
    origins: [],
    password: null,
    appBaseUrl: null,
    paseoBin: process.env.PASEO_BIN || DEFAULT_PASEO_BIN,
    paseoHome: process.env.PASEO_HOME || DEFAULT_PASEO_HOME,
    restart: true,
    verifyOnly: false,
    cliCheck: true,
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
      case "--listen-host":
        args.listenHost = valueFor().trim();
        break;
      case "--origin":
        args.origins.push(valueFor().trim());
        break;
      case "--password":
        args.password = valueFor();
        if (!args.password) throw new Error("--password cannot be empty");
        break;
      case "--app-base-url":
        args.appBaseUrl = valueFor().trim();
        break;
      case "--paseo-bin":
        args.paseoBin = expandPath(valueFor());
        break;
      case "--paseo-home":
        args.paseoHome = expandPath(valueFor());
        break;
      case "--no-restart":
        args.restart = false;
        break;
      case "--verify-only":
        args.verifyOnly = true;
        break;
      case "--no-cli-check":
        args.cliCheck = false;
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
  if (!args.listenHost) throw new Error("--listen-host cannot be empty");
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

function expandPath(path) {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return resolve(path);
}

function readConfig(configPath) {
  if (!existsSync(configPath)) return { version: 1 };
  try {
    return JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to parse ${configPath}: ${error.message}`);
  }
}

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()))];
}

function defaultOrigins(host, port) {
  return [`http://${host}:${port}`, `https://${host}`];
}

function patchConfig(config, args) {
  const daemon = config.daemon && typeof config.daemon === "object" ? config.daemon : {};
  const cors = daemon.cors && typeof daemon.cors === "object" ? daemon.cors : {};
  const nextDaemon = {
    ...daemon,
    listen: `${args.listenHost}:${args.port}`,
    hostnames: unique([...(Array.isArray(daemon.hostnames) ? daemon.hostnames : []), args.host]),
    cors: {
      ...cors,
      allowedOrigins: unique([
        ...(Array.isArray(cors.allowedOrigins) ? cors.allowedOrigins : []),
        ...defaultOrigins(args.host, args.port),
        ...args.origins,
      ]),
    },
  };

  if (args.password) {
    nextDaemon.auth = {
      ...(daemon.auth && typeof daemon.auth === "object" ? daemon.auth : {}),
      password: bcrypt.hashSync(args.password, 12),
    };
  }

  return {
    ...config,
    $schema: config.$schema ?? CONFIG_SCHEMA,
    version: config.version ?? 1,
    daemon: nextDaemon,
    ...(args.appBaseUrl
      ? {
          app: {
            ...(config.app && typeof config.app === "object" ? config.app : {}),
            baseUrl: args.appBaseUrl,
          },
        }
      : {}),
  };
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
    env: options.env ?? process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${command} ${commandArgs.join(" ")} failed${details ? `:\n${details}` : ""}`);
  }
  return result.stdout.trim();
}

async function verifyHealth(host, port) {
  const url = `http://${host}:${port}/api/health?direct=1`;
  const response = await fetch(url);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status} ${response.statusText}\n${body}`);
  }
  return { url, body };
}

function verifyCliConnection(args, configHasPassword) {
  if (!args.cliCheck) return "skipped by --no-cli-check";
  if (!existsSync(args.paseoBin)) return `skipped because Paseo CLI was not found at ${args.paseoBin}`;
  if (configHasPassword && !args.password) {
    return "skipped because config has a password hash and --password was not supplied";
  }

  const env = { ...process.env };
  if (args.password) env.PASEO_PASSWORD = args.password;
  run(args.paseoBin, ["ls", "--host", `${args.host}:${args.port}`, "--json"], { env });
  return "ok";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = join(args.paseoHome, "config.json");
  let configForVerification = readConfig(configPath);

  if (!args.verifyOnly) {
    const next = patchConfig(configForVerification, args);
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    configForVerification = next;
    console.log(`Updated ${configPath}`);
  }

  if (!args.verifyOnly && args.restart) {
    if (!existsSync(args.paseoBin)) {
      throw new Error(`Paseo CLI not found at ${args.paseoBin}. Pass --paseo-bin.`);
    }
    run(args.paseoBin, [
      "daemon",
      "restart",
      "--json",
      "--force",
      "--home",
      args.paseoHome,
      "--listen",
      `${args.listenHost}:${args.port}`,
      "--hostnames",
      args.host,
    ]);
    console.log("Restarted Paseo daemon");
  }

  const health = await verifyHealth(args.host, args.port);
  console.log(`Verified HTTP health: ${health.url}`);

  const configHasPassword = Boolean(configForVerification.daemon?.auth?.password);
  const cliStatus = verifyCliConnection(args, configHasPassword);
  console.log(`Verified CLI/WebSocket: ${cliStatus}`);

  if (!configHasPassword && args.listenHost !== "127.0.0.1" && args.listenHost !== "localhost") {
    console.log("Warning: daemon is reachable beyond localhost without password authentication.");
  }

  console.log("Direct connection settings:");
  console.log(`  Host: ${args.host}`);
  console.log(`  Port: ${args.port}`);
  console.log("  Use SSL: OFF");
  console.log(`  Password: ${args.password ? "the --password value" : configHasPassword ? "existing configured password" : "empty"}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
