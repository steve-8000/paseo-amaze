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

## AI-agent install runbook

Use this section when another AI agent must install or repair the connection
without prior local knowledge. The runbook is intentionally command-oriented and
safe to repeat.

### 1. Locate or clone this repo

```bash
if [ -d /Users/steve/paseo-amaze/.git ]; then
  cd /Users/steve/paseo-amaze
else
  git clone https://github.com/steve-8000/paseo-amaze /Users/steve/paseo-amaze
  cd /Users/steve/paseo-amaze
fi
```

### 2. Confirm the amaze CLI exists

Default expected path:

```bash
AMAZE_CLI=/Users/steve/rocky/amaze/packages/coding-agent/dist/cli.js
test -r "$AMAZE_CLI"
```

If that command fails, build amaze first:

```bash
cd /Users/steve/rocky/amaze
npm --prefix packages/coding-agent run build
test -r /Users/steve/rocky/amaze/packages/coding-agent/dist/cli.js
cd /Users/steve/paseo-amaze
```

### 3. Install dependencies

```bash
npm install
```

This package currently has no runtime dependencies; `npm install` mainly
validates the lockfile and Node environment.

### 4. Back up the Paseo config

```bash
PASEO_CONFIG=/Users/steve/.paseo/config.json
test -f "$PASEO_CONFIG"
cp "$PASEO_CONFIG" "$PASEO_CONFIG.bak.$(date +%Y%m%d%H%M%S)"
```

### 5. Register amaze as a Paseo provider

```bash
npm run setup -- \
  --config "$PASEO_CONFIG" \
  --amaze-command "$AMAZE_CLI"
```

The script only patches `agents.providers.amaze`; it preserves existing daemon,
relay, CORS, project, and workspace settings.

### 6. Verify

```bash
npm run verify -- \
  --config "$PASEO_CONFIG" \
  --amaze-command "$AMAZE_CLI"
```

Expected output includes:

```text
OK: Paseo is configured to launch amaze.
Command: /Users/steve/rocky/amaze/packages/coding-agent/dist/cli.js --paseo-pi-compat
```

### 7. Optional live checks

Confirm Paseo's local config contains the provider:

```bash
node -e 'const c=require("/Users/steve/.paseo/config.json"); console.log(c.agents.providers.amaze)'
```

Confirm a Paseo process exists:

```bash
ps aux | grep -i Paseo | grep -v grep
```

If the provider does not show up in the Paseo UI after setup, restart Paseo and
run `npm run verify` again.

### 8. Agent report format

An AI agent should finish with:

```text
Result: PASS or FAIL
Config: /Users/steve/.paseo/config.json
Command: /Users/steve/rocky/amaze/packages/coding-agent/dist/cli.js --paseo-pi-compat
Evidence:
- npm install result
- npm run setup result
- npm run verify result
Risks:
- Any missing amaze build, missing Paseo config, or UI restart requirement
Next action:
- Restart Paseo if needed, otherwise none
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
