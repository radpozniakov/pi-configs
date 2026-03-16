# Pi Configs

A collection of custom extensions for the [Pi coding agent](https://github.com/badlogic/pi-mono). 

## Extensions

| Extension | Description | Docs |
|-----------|-------------|------|
| [grammar-fix](extensions/grammar-fix.ts) | Fix grammar in the editor with `Ctrl+Shift+F` or the `/fix` command | [grammar-fix.md](docs/extensions/grammar-fix.md) |

## Installation

### Global (all projects)

Copy the extensions you want into your Pi extensions directory:

```bash
cp extensions/grammar-fix.ts ~/.pi/agent/extensions/
```

### Project-local

Copy into your project's `.pi/extensions/` directory:

```bash
mkdir -p .pi/extensions
cp extensions/grammar-fix.ts .pi/extensions/
```

### Quick test

Load an extension for a single session with the `-e` flag:

```bash
pi -e ./extensions/grammar-fix.ts
```

After installing, run `/reload` inside Pi to pick up new or changed extensions without restarting.

## Repository Structure

```
pi-configs/
├── extensions/          # Extension source files (.ts)
│   └── grammar-fix.ts
└── docs/
    └── extensions/      # One doc per extension
        └── grammar-fix.md
```

## Contributing

To add a new extension:

1. Place the `.ts` file in `extensions/`.
2. Create a matching doc in `docs/extensions/<name>.md`.
3. Add a row to the extensions table above.

## License

MIT
