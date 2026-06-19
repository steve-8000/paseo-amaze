#!/usr/bin/env node
import { accessSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

const DEFAULT_PASEO_HOME = join(homedir(), ".paseo");
const DEFAULT_AMAZE_COMMAND = "/Users/steve/rocky/amaze/packages/coding-agent/dist/cli.js";

function usage(exitCode = 0) {
  const out = exitCode === 0 ? console.log : console.error;
  out(`Usage: npm run setup -- [options]

Registers the local amaze CLI as a Paseo agent provider.

Options:
  --config <path>          Paseo config path. Default: ~/.paseo/config.json
  --amaze-command <path>   amaze CLI path. Default: ${DEFAULT_AMAZE_COMMAND}
  --verify-only            Validate the current config without writing.
  -h, --help               Show this help.

The configured command is:
  <amaze-command> --paseo-pi-compat`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {
    configPath: join(DEFAULT_PASEO_HOME, "config.json"),
    amazeCommand: DEFAULT_AMAZE_COMMAND,
    verifyOnly: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") usage(0);
    if (arg === "--verify-only") {
      args.verifyOnly = true;
      continue;
    }
    if (arg === "--config") {
      args.configPath = requiredValue(argv, ++index, arg);
      continue;
    }
    if (arg === "--amaze-command") {
      args.amazeCommand = requiredValue(argv, ++index, arg);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  args.configPath = expandHome(args.configPath);
  args.amazeCommand = expandHome(args.amazeCommand);
  return args;
}

function requiredValue(argv, index, flag) {
  const value = argv[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function expandHome(value) {
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return join(homedir(), value.slice(2));
  return value;
}

function readConfig(configPath) {
  if (!existsSync(configPath)) {
    return { version: 1 };
  }
  return JSON.parse(readFileSync(configPath, "utf8"));
}

function configuredProvider(config) {
  return config?.agents?.providers?.amaze;
}

function providerFor(amazeCommand) {
  return {
    extends: "pi",
    label: "Amaze",
    description: "amaze coding agent",
    command: [resolve(amazeCommand), "--paseo-pi-compat"],
    enabled: true,
  };
}

function patchConfig(config, amazeCommand) {
  return {
    ...config,
    version: config.version ?? 1,
    agents: {
      ...(config.agents ?? {}),
      providers: {
        ...(config.agents?.providers ?? {}),
        amaze: providerFor(amazeCommand),
      },
    },
  };
}

function assertCommandExists(amazeCommand) {
  accessSync(amazeCommand, constants.R_OK);
}

function assertProvider(config, amazeCommand) {
  const provider = configuredProvider(config);
  const expected = providerFor(amazeCommand);
  if (!provider) throw new Error("Paseo config does not define agents.providers.amaze");
  if (provider.enabled !== true) throw new Error("agents.providers.amaze.enabled must be true");
  if (provider.extends !== "pi") throw new Error("agents.providers.amaze.extends must be 'pi'");
  if (JSON.stringify(provider.command) !== JSON.stringify(expected.command)) {
    throw new Error(`agents.providers.amaze.command mismatch. Expected ${JSON.stringify(expected.command)}, got ${JSON.stringify(provider.command)}`);
  }
}

function writeConfig(configPath, config) {
  mkdirSync(dirname(configPath), { recursive: true, mode: 0o700 });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  assertCommandExists(args.amazeCommand);
  const current = readConfig(args.configPath);

  if (args.verifyOnly) {
    assertProvider(current, args.amazeCommand);
    console.log("OK: Paseo is configured to launch amaze.");
    console.log(`Config: ${args.configPath}`);
    console.log(`Command: ${resolve(args.amazeCommand)} --paseo-pi-compat`);
    return;
  }

  const next = patchConfig(current, args.amazeCommand);
  writeConfig(args.configPath, next);
  assertProvider(next, args.amazeCommand);
  console.log("OK: registered amaze as a Paseo agent provider.");
  console.log(`Config: ${args.configPath}`);
  console.log(`Command: ${resolve(args.amazeCommand)} --paseo-pi-compat`);
  console.log("Restart Paseo if the app does not pick up the new provider immediately.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
