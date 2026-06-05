# paseo-amaze

Reusable setup scripts for making an installed Paseo DMG daemon reachable from the Paseo mobile app through **Direct connection**.

This repo captures the setup that was applied manually on `ai.clab.one:6767` so another agent can repeat it on any host.

## What gets patched

`setup:direct` updates the local Paseo config at `~/.paseo/config.json`:

```json
{
  "$schema": "https://paseo.sh/schemas/paseo.config.v1.json",
  "version": 1,
  "daemon": {
    "listen": "0.0.0.0:6767",
    "hostnames": ["YOUR_HOST"],
    "cors": {
      "allowedOrigins": ["http://YOUR_HOST:6767", "https://YOUR_HOST"]
    }
  }
}
```

Then it restarts the DMG-installed daemon with the same listen target and hostname, and verifies the Direct endpoint.

## Prerequisites

- Paseo DMG is installed on the Mac.
- Paseo CLI exists at `/Applications/Paseo.app/Contents/Resources/bin/paseo`.
- Node.js 20 or newer is available.
- The host or domain you will enter on the phone resolves to this Mac.
- Firewall/router allows inbound TCP on the chosen port, default `6767`.

## Install these setup scripts

```bash
git clone https://github.com/steve-8000/paseo-amaze.git
cd paseo-amaze
npm install
```

## Configure Direct connection

Without daemon password, matching the previous `ai.clab.one:6767` setup:

```bash
npm run setup:direct -- --host ai.clab.one --port 6767
```

Recommended for anything reachable outside your LAN: set a password and enter the same password in the mobile app.

```bash
npm run setup:direct -- --host ai.clab.one --port 6767 --password 'change-this-password'
```

If the Paseo CLI lives somewhere else:

```bash
npm run setup:direct -- --host ai.clab.one --paseo-bin /path/to/paseo
```

If you only want to patch config and restart later:

```bash
npm run setup:direct -- --host ai.clab.one --no-restart
```

Verify an existing setup:

```bash
npm run verify:direct -- --host ai.clab.one --port 6767
```

## Mobile app Direct connection values

Use these in the app:

- Host: `ai.clab.one` or the host passed to `--host`
- Port: `6767` or the port passed to `--port`
- Use SSL: `OFF`
- Password: empty if no password was configured, otherwise the `--password` value

Use SSL should stay `OFF` unless you are terminating TLS directly for the daemon or through a TLS proxy that forwards WebSocket traffic.

## Restore workspaces after connecting

If the app connects but shows `Workspace not found`, or adding a workspace fails with a project/worktree error, the workspace/project registry is probably archived. Re-open the source checkout through the daemon:

```bash
npm run workspace:open -- --host ai.clab.one --cwd /Users/steve/roy/paseo
```

Open multiple known checkouts at once:

```bash
npm run workspace:open -- \
  --host ai.clab.one \
  --cwd /Users/steve/roy/paseo \
  --cwd /Users/steve/roy/amaze/amaze
```

With password authentication:

```bash
npm run workspace:open -- --host ai.clab.one --password 'change-this-password' --cwd /path/to/repo
```

`workspace:open` sends `open_project_request` over the Direct WebSocket. Paseo then unarchives matching workspace/project records and the app can create new workspaces/worktrees again.

## Agent checklist

When an agent sets up a new Mac:

1. Clone this repo and run `npm install`.
2. Pick the phone-facing host and port.
3. Run `npm run setup:direct -- --host HOST --port PORT`.
4. If external networks can reach the port, prefer adding `--password PASSWORD`.
5. Confirm `Verified HTTP health` and `Verified CLI/WebSocket` are printed.
6. In the mobile app, add Direct connection with Host, Port, Use SSL OFF, and Password.
7. If the app says `Workspace not found`, run `npm run workspace:open -- --host HOST --cwd /absolute/repo/path`.
8. If workspace creation still fails, run `workspace:open` for the source repository shown in the app and retry from a newly opened app screen.

## Troubleshooting

### Phone cannot connect

Check from the Mac:

```bash
npm run verify:direct -- --host HOST --port 6767
```

Then check from the phone browser:

```text
http://HOST:6767/api/health?direct=1
```

If the Mac succeeds and the phone fails, fix Wi-Fi routing, macOS firewall, router port forwarding, DNS, or NAT hairpinning.

### Direct endpoint works but app cannot add workspaces

Run:

```bash
npm run workspace:open -- --host HOST --cwd /absolute/source/repo
```

This repairs archived registry state for that checkout.

### Existing config has a password and verification skips CLI/WebSocket

The script can verify HTTP health without knowing the plaintext password, but it cannot verify the authenticated WebSocket unless you pass the plaintext password:

```bash
npm run verify:direct -- --host HOST --password 'existing-password'
```

### Security note

Binding `daemon.listen` to `0.0.0.0` exposes the daemon beyond localhost. Do not leave it reachable from untrusted networks without password authentication or firewall/VPN restrictions.
