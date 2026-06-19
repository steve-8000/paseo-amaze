# paseo-amaze

Minimal setup helper for connecting the local **amaze** CLI to the Paseo app.

This repository does not implement a second adapter runtime. Its job is only to
make Paseo launch amaze with the Pi-compatible entrypoint:

```text
<amaze cli> --paseo-pi-compat
```

## What it configures

`npm run setup` patches `~/.paseo/config.json` so Paseo has an enabled
`agents.providers.amaze` provider:

```json
{
  "agents": {
    "providers": {
      "amaze": {
        "extends": "pi",
        "label": "Amaze",
        "description": "amaze coding agent",
        "command": [
          "/Users/steve/rocky/amaze/packages/coding-agent/dist/cli.js",
          "--paseo-pi-compat"
        ],
        "enabled": true
      }
    }
  }
}
```

Existing Paseo daemon, relay, CORS, project, and workspace settings are left
unchanged.

## Install

```bash
git clone https://github.com/steve-8000/paseo-amaze
cd paseo-amaze
npm install
```

## Setup

Default Steve local path:

```bash
npm run setup
```

Custom amaze CLI path:

```bash
npm run setup -- --amaze-command /path/to/amaze/packages/coding-agent/dist/cli.js
```

Custom Paseo config path:

```bash
npm run setup -- --config ~/.paseo/config.json
```

## Verify

```bash
npm run verify
```

Expected output:

```text
OK: Paseo is configured to launch amaze.
Config: /Users/steve/.paseo/config.json
Command: /Users/steve/rocky/amaze/packages/coding-agent/dist/cli.js --paseo-pi-compat
```

## Current assumptions

- Paseo is installed and uses `~/.paseo/config.json`.
- amaze is built at `/Users/steve/rocky/amaze/packages/coding-agent/dist/cli.js`.
- The amaze CLI supports `--paseo-pi-compat`.

If the provider does not appear in Paseo immediately, restart Paseo after
running setup.
