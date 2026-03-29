# comms-relay

Lightweight WebRTC signaling relay for [Comms](https://github.com/seppulcro/comms) — like a BitTorrent tracker but for peer-to-peer chat.

## What it does

Routes WebRTC signaling metadata (SDP offers/answers, ICE candidates) between peers so they can establish direct connections. **It never sees your messages, voice, or video** — all actual data flows peer-to-peer after the initial handshake.

## Run

```sh
# Direct
bun run index.ts

# Development (hot reload)
bun --hot index.ts

# Docker
docker compose up
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `4000`  | Server listen port |

## Self-hosting

Run your own relay and point the Comms app at it. Any machine with Bun or Docker can host one:

```sh
git clone <repo> && cd comms-relay
bun install && bun run index.ts
```

Or with Docker:

```sh
docker compose up -d
```

Then set the relay URL in the Comms app to `ws://your-server:4000`.
