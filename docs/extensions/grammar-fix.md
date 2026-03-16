# Grammar Fix

Fix grammar, spelling, and clarity of text directly in the Pi editor — without leaving the terminal.

## How It Works

The extension sends the editor text to an LLM with a focused grammar-correction system prompt. The model returns only the corrected text, preserving technical terms, code snippets, file paths, and markdown formatting. The result replaces the editor content so you can review it before sending.

## Commands & Shortcuts

| Trigger | What it does |
|---------|-------------|
| `Ctrl+Shift+F` | Correct grammar in the current editor text in-place. Review the result, then press Enter to send. |
| `/fix <text>` | Correct the given text and send it straight to the main agent. |
| `/grammar-model` | Show the current grammar model and open an interactive picker. |
| `/grammar-model <provider/id>` | Set the grammar model directly (e.g. `anthropic/claude-haiku-4-5`). |
| `/grammar-model reset` | Clear the saved model — fall back to the current session model. |

## Model Resolution

The model used for correction is resolved in this order:

1. **`--grammar-model` flag** — per-launch override (e.g. `pi --grammar-model anthropic/claude-haiku-4-5`).
2. **`~/.pi/agent/grammar-fix.json`** — persistent choice saved by `/grammar-model`.
3. **Current session model** — whatever model the session is using.

A lightweight model like Claude Haiku is recommended to keep corrections fast and cheap.

## Configuration

The `/grammar-model` command writes a small JSON file:

```
~/.pi/agent/grammar-fix.json
```

```json
{
  "model": "anthropic/claude-haiku-4-5"
}
```

Delete the file or run `/grammar-model reset` to go back to the session model.

## Installation

Copy the extension to the global Pi extensions directory:

```bash
cp extensions/grammar-fix.ts ~/.pi/agent/extensions/
```

Or load it for a quick test:

```bash
pi -e ./extensions/grammar-fix.ts
```

## Example

```
# You type in the editor:
i thinked this code have a bug becuz the variabel is not defned

# Press Ctrl+Shift+F → editor text becomes:
I think this code has a bug because the variable is not defined.

# Review, then press Enter to send to the agent.
```
