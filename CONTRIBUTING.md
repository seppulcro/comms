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
.planning/       → GSD project planning (roadmap, requirements, research)
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

## Branch Naming

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feat/<description>` | `feat/gps-live-map` |
| Bug fix | `fix/<description>` | `fix/webrtc-reconnect` |
| Docs | `docs/<description>` | `docs/gsd-planning` |
| Chore | `chore/<description>` | `chore/bump-v0.1.0` |

Never put version numbers in `feat/` or `fix/` branch names.

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/) prefixes:

```
feat: add GPS live map
fix: audio echo cancellation on Linux
docs: update roadmap after Phase 1
chore: bump version → 0.1.0
```

## Release Flow

```
feat/* or fix/*  →  PR → squash merge → master
                                          ↓
                          chore/bump-vX.Y.Z  →  PR → merge → master
                                                                ↓
                                                    git tag vX.Y.Z → push → CI
```

CI builds and publishes releases automatically on `v*` tags.

| Platform | Artifact |
|----------|----------|
| Linux | `.AppImage` + `.deb` |
| Windows | Installer (`.exe`) + portable |

### SemVer

| Bump | When |
|------|------|
| `patch` | Bug fixes, chores, deps |
| `minor` | New features, UI changes |
| `major` | Breaking config/API changes |

## Submitting Changes

1. Fork the repo
2. Create a branch following the naming convention above
3. Make your changes and test locally
4. Commit with descriptive messages
5. Push and open a Pull Request (squash merge)

## GSD Planning

This project uses [GSD](https://github.com/get-shit-done) for structured planning.
Planning docs live in `.planning/` and include:

- `PROJECT.md` — Vision, requirements, constraints
- `REQUIREMENTS.md` — Formal requirements with REQ-IDs
- `ROADMAP.md` — Phased execution plan
- `research/` — Domain research (stack, features, architecture, pitfalls)
- `codebase/` — Codebase analysis docs

### GSD → Git workflow

Each GSD phase maps to one branch and one PR:

```
/gsd-discuss-phase N  →  feat/<phase-name> branch
/gsd-plan-phase N     →  commits on that branch
/gsd-execute-phase N  →  commits on that branch
                      →  PR → squash merge → master
```

Tag and release when ready (can batch multiple phases into one version).

## Reporting Issues

Open an issue on [GitHub](https://github.com/seppulcro/comms/issues) with:
- What you expected vs. what happened
- Steps to reproduce
- OS and app version

## License

By contributing, you agree that your contributions will be licensed under the [AGPL-3.0 License](LICENSE).
