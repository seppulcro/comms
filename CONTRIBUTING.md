# Contributing to Comms

Thanks for your interest in contributing! Here's how to get started.

## Prerequisites

- [Bun](https://bun.sh/) (runtime and package manager)
- [Git](https://git-scm.com/)

## Development Setup

```bash
git clone https://github.com/seppulcro/comms.git
cd comms
bun install
bun run dev
```

This launches the Electron app with hot-reload.

## Project Structure

```
client/          → Preact frontend (UI components, WebRTC, signaling)
electron/        → Electron main process (window, tray, IPC, PTT)
comms-relay/     → Standalone WebSocket signaling relay
scripts/         → Build and dev tooling
docs/            → Landing page assets and screenshots
```

## Building

```bash
bun run build              # Build frontend + electron
bun run dist:linux         # Package Linux (AppImage + deb)
bun run dist:win           # Package Windows (installer + portable)
```

## Testing

```bash
bun test                           # Run all tests
cd comms-relay && bun test         # Relay tests only
```

## Code Style

- TypeScript throughout
- Preact for UI (JSX)
- No linter configured yet — match existing patterns
- Keep dependencies minimal

## Submitting Changes

1. Fork the repo on Codeberg
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes and test locally
4. Commit with descriptive messages (e.g., `feat: add file sharing`, `fix: audio echo cancellation`)
5. Push and open a Pull Request

## Reporting Issues

Open an issue on [GitHub](https://github.com/seppulcro/comms/issues) with:
- What you expected vs. what happened
- Steps to reproduce
- OS and app version

## License

By contributing, you agree that your contributions will be licensed under the [AGPL-3.0 License](LICENSE).
