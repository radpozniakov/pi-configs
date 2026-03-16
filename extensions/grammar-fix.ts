/**
 * Grammar Fix Extension
 *
 * Type messy English in the editor, press Ctrl+Shift+F and the text gets
 * grammar-corrected in-place. Review it, then press Enter to send.
 *
 * Model resolution order:
 *   1. --grammar-model flag (per-launch override)
 *   2. ~/.pi/agent/grammar-fix.json (persistent choice)
 *   3. Current session model (fallback)
 *
 * Commands:
 *   Ctrl+Shift+F           — Fix grammar in editor text in-place
 *   /grammar <text>         — Correct text and send directly to main agent
 *   /grammar-model          — Show current model + open picker
 *   /grammar-model <p/id>   — Set grammar model directly (e.g. anthropic/claude-haiku-4-5)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { complete, type Message, type Model } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { DynamicBorder, getAgentDir } from "@mariozechner/pi-coding-agent";
import { Container, type SelectItem, SelectList, Spacer, Text } from "@mariozechner/pi-tui";

// ── Config ───────────────────────────────────────────────────────────

interface GrammarConfig {
	model?: string; // "provider/model-id"
}

const CONFIG_FILENAME = "grammar-fix.json";

function configPath(): string {
	return join(getAgentDir(), CONFIG_FILENAME);
}

function loadConfig(): GrammarConfig {
	const path = configPath();
	if (!existsSync(path)) return {};
	try {
		return JSON.parse(readFileSync(path, "utf-8"));
	} catch {
		return {};
	}
}

function saveConfig(config: GrammarConfig): void {
	const path = configPath();
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

function parseModelString(modelStr: string): { provider: string; id: string } | null {
	const slash = modelStr.indexOf("/");
	if (slash <= 0 || slash >= modelStr.length - 1) return null;
	return { provider: modelStr.slice(0, slash), id: modelStr.slice(slash + 1) };
}

function modelToString(model: Model): string {
	return `${model.provider}/${model.id}`;
}

// ── Grammar prompt ───────────────────────────────────────────────────

const GRAMMAR_PROMPT = `You are an English grammar and clarity corrector.

Rules:
- Fix grammar, spelling, punctuation, and awkward phrasing.
- Improve clarity and make the sentence natural-sounding.
- Keep the original meaning, tone, and intent.
- Preserve all technical terms, code snippets, file paths, and proper nouns exactly as-is.
- Preserve markdown formatting if present.
- Do NOT add new information or change what the user is asking/saying.
- Output ONLY the corrected text. No quotes, no explanations, no preamble.`;

// ── Extension ────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	let config: GrammarConfig = {};

	// ── Register --grammar-model flag ────────────────────────────────
	pi.registerFlag("grammar-model", {
		description: "Model for grammar correction (provider/model-id)",
		type: "string",
	});

	// ── Load config on session start ─────────────────────────────────
	pi.on("session_start", async () => {
		config = loadConfig();
	});

	// ── Resolve which model to use ───────────────────────────────────
	// Priority: flag → config file → current session model
	function resolveGrammarModel(ctx: ExtensionContext): Model | null {
		// 1. CLI flag override
		const flag = pi.getFlag("grammar-model");
		if (typeof flag === "string" && flag) {
			const parsed = parseModelString(flag);
			if (parsed) {
				const model = ctx.modelRegistry.find(parsed.provider, parsed.id);
				if (model) return model;
			}
		}

		// 2. Persistent config
		if (config.model) {
			const parsed = parseModelString(config.model);
			if (parsed) {
				const model = ctx.modelRegistry.find(parsed.provider, parsed.id);
				if (model) return model;
			}
		}

		// 3. Current session model
		return ctx.model ?? null;
	}

	// ── Core grammar correction ──────────────────────────────────────
	async function correctGrammar(
		text: string,
		model: Model,
		ctx: ExtensionContext,
		signal?: AbortSignal,
	): Promise<string | null> {
		const apiKey = await ctx.modelRegistry.getApiKey(model);
		const userMessage: Message = {
			role: "user",
			content: [{ type: "text", text }],
			timestamp: Date.now(),
		};

		const response = await complete(
			model,
			{ systemPrompt: GRAMMAR_PROMPT, messages: [userMessage] },
			{ apiKey, signal },
		);

		if (response.stopReason === "aborted") return null;

		const result = response.content
			.filter((c): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text)
			.join("\n");

		return result || null;
	}

	// ── Ctrl+Shift+F: fix grammar in editor in-place ────────────────
	pi.registerShortcut("ctrl+shift+f", {
		description: "Fix grammar in editor text",
		handler: async (ctx) => {
			const raw = ctx.ui.getEditorText();
			if (!raw || !raw.trim()) {
				ctx.ui.notify("Editor is empty — nothing to fix", "warning");
				return;
			}

			const model = resolveGrammarModel(ctx);
			if (!model) {
				ctx.ui.notify("No model available — use /grammar-model to set one", "error");
				return;
			}

			const modelLabel = model.name ?? model.id;
			ctx.ui.setStatus("grammar", `✏️  Correcting grammar (${modelLabel})...`);

			try {
				const corrected = await correctGrammar(raw, model, ctx);

				if (!corrected) {
					ctx.ui.notify("Grammar correction failed or was cancelled", "error");
					return;
				}

				if (corrected.trim() === raw.trim()) {
					ctx.ui.notify("Text looks good — no changes needed ✓", "info");
					return;
				}

				ctx.ui.setEditorText(corrected);
				ctx.ui.notify("Grammar fixed — review and press Enter to send ✓", "success");
			} catch (err: any) {
				ctx.ui.notify(`Grammar fix error: ${err.message}`, "error");
			} finally {
				ctx.ui.setStatus("grammar", "");
			}
		},
	});

	// ── /grammar command: correct and send directly ─────────────────
	pi.registerCommand("grammar", {
		description: "Grammar-correct text and send it to the main agent",
		handler: async (args, ctx) => {
			const text = args.trim();
			if (!text) {
				ctx.ui.notify("Usage: /grammar <your messy text>", "warning");
				return;
			}

			const model = resolveGrammarModel(ctx);
			if (!model) {
				ctx.ui.notify("No model available — use /grammar-model to set one", "error");
				return;
			}

			const modelLabel = model.name ?? model.id;
			ctx.ui.setStatus("grammar", `✏️  Correcting grammar (${modelLabel})...`);

			try {
				const corrected = await correctGrammar(text, model, ctx);
				if (!corrected) {
					ctx.ui.notify("Grammar correction failed", "error");
					return;
				}

				ctx.ui.notify("Grammar fixed — sending to agent ✓", "success");
				pi.sendUserMessage(corrected);
			} catch (err: any) {
				ctx.ui.notify(`Grammar fix error: ${err.message}`, "error");
			} finally {
				ctx.ui.setStatus("grammar", "");
			}
		},
	});

	// ── /grammar-model command: show current / pick / set directly ───
	pi.registerCommand("grammar-model", {
		description: "Show or change the grammar correction model",
		getArgumentCompletions: (prefix) => {
			// Suggest "provider/id" strings for tab completion
			const all = pi.getAllTools(); // just to trigger context; we'll use modelRegistry below
			// We can't async here, so offer a static hint
			return null;
		},
		handler: async (args, ctx) => {
			// Direct set: /grammar-model anthropic/claude-haiku-4-5
			if (args?.trim()) {
				const modelStr = args.trim();

				// Handle "reset" / "clear" / "default"
				if (["reset", "clear", "default", "none"].includes(modelStr)) {
					config.model = undefined;
					saveConfig(config);
					ctx.ui.notify("Grammar model cleared — will use current session model", "info");
					return;
				}

				const parsed = parseModelString(modelStr);
				if (!parsed) {
					ctx.ui.notify(`Invalid format. Use: provider/model-id (e.g. anthropic/claude-haiku-4-5)`, "error");
					return;
				}

				const model = ctx.modelRegistry.find(parsed.provider, parsed.id);
				if (!model) {
					ctx.ui.notify(`Model not found: ${modelStr}`, "error");
					return;
				}

				config.model = modelStr;
				saveConfig(config);
				ctx.ui.notify(`Grammar model set to ${model.name ?? model.id} ✓`, "success");
				return;
			}

			// No args: show current setting + open picker
			if (!ctx.hasUI) {
				const current = resolveGrammarModel(ctx);
				const source = config.model ? "config" : "session model";
				ctx.ui.notify(
					current ? `Grammar model: ${modelToString(current)} (${source})` : "No grammar model set",
					"info",
				);
				return;
			}

			// Interactive model picker
			const available = await ctx.modelRegistry.getAvailable();
			if (available.length === 0) {
				ctx.ui.notify("No models available — check your API keys", "error");
				return;
			}

			const currentModel = resolveGrammarModel(ctx);
			const currentStr = currentModel ? modelToString(currentModel) : null;

			const items: SelectItem[] = available.map((m) => {
				const str = modelToString(m);
				const isCurrent = str === currentStr;
				return {
					value: str,
					label: isCurrent ? `${m.name ?? m.id} (current)` : (m.name ?? m.id),
					description: `${m.provider} · ${m.contextWindow ? Math.round(m.contextWindow / 1000) + "k ctx" : ""}`,
				};
			});

			// Add reset option
			items.push({
				value: "(reset)",
				label: "(use session model)",
				description: "Clear saved preference — always use whatever model the session is using",
			});

			const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
				const container = new Container();
				container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

				// Header with current info
				container.addChild(new Text(theme.fg("accent", theme.bold(" Grammar Model")), 0, 0));

				const source = pi.getFlag("grammar-model")
					? "flag"
					: config.model
						? "config"
						: "session";
				const currentLabel = currentModel
					? `${theme.fg("muted", " Current: ")}${theme.fg("text", currentModel.name ?? currentModel.id)} ${theme.fg("dim", `(${source})`)}`
					: theme.fg("muted", " No model configured");
				container.addChild(new Text(currentLabel, 0, 0));
				container.addChild(new Spacer(1));

				const selectList = new SelectList(items, Math.min(items.length, 12), {
					selectedPrefix: (text) => theme.fg("accent", text),
					selectedText: (text) => theme.fg("accent", text),
					description: (text) => theme.fg("muted", text),
					scrollInfo: (text) => theme.fg("dim", text),
					noMatch: (text) => theme.fg("warning", text),
				});
				selectList.onSelect = (item) => done(item.value);
				selectList.onCancel = () => done(null);
				container.addChild(selectList);

				container.addChild(
					new Text(theme.fg("dim", " ↑↓ navigate · enter select · esc cancel · type to filter"), 0, 0),
				);
				container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

				return {
					render: (w: number) => container.render(w),
					invalidate: () => container.invalidate(),
					handleInput: (data: string) => {
						selectList.handleInput(data);
						tui.requestRender();
					},
				};
			});

			if (!result) return;

			if (result === "(reset)") {
				config.model = undefined;
				saveConfig(config);
				ctx.ui.notify("Grammar model cleared — will use current session model", "info");
				return;
			}

			config.model = result;
			saveConfig(config);

			const parsed = parseModelString(result);
			const model = parsed ? ctx.modelRegistry.find(parsed.provider, parsed.id) : null;
			ctx.ui.notify(
				`Grammar model set to ${model?.name ?? result} ✓\nSaved to ${configPath()}`,
				"success",
			);
		},
	});
}
