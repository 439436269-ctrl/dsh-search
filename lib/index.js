/**
 * dsh-search — DeepSeek first-party Search / Fetch tools for
 * DeepSeek Harness.
 *
 * This entry point only wires things together: it validates config, owns the
 * client lifecycle, contributes the guide section, and registers the tools
 * described in `./tools/`. Configuration lives in `./config.js`, key resolution
 * in `./keys.js`, the HTTP protocol in `./client.js`, the guide text in
 * `./prompt.js`.
 *
 * @module dsh-search
 */

import { defineTool } from "@deepseek-ai/dsh-tools";

import { SearchClient } from "./client.js";
import { Config, resolveConfig, validateConfig } from "./config.js";
import { guideText } from "./prompt.js";
import { createToolSpecs } from "./tools.js";

export const name = "deepseek-search";

export const inject = ["tools", "systemPrompt"];

export { Config, SearchClient };

export function apply(ctx, config) {
	const settings = resolveConfig(config);
	validateConfig(settings);

	/** @type {SearchClient|undefined} */
	let client;
	ctx.effect(() => {
		client = new SearchClient({
			baseUrl: settings.baseUrl,
			apiKey: settings.apiKey,
			timeoutMs: settings.timeoutMs,
			maxRetries: settings.maxRetries,
		});
		return () => {
			client = undefined;
		};
	});

	/**
	 * The live client, or a loud failure — reached only while the fiber is active.
	 *
	 * @returns {SearchClient} live client.
	 */
	const getClient = () => {
		if (!client) throw new Error("deepseek-search: client is not available");
		return client;
	};

	if (settings.promptEnabled) {
		ctx.systemPrompt.section({
			name: "deepseek-search:guide",
			order: settings.promptOrder,
			text: () => guideText(settings),
		});
	}

	for (const spec of createToolSpecs({ client: getClient(), config: settings })) {
		ctx.tools.register(
			defineTool({
				name: spec.name,
				description: spec.description,
				parameters: spec.parameters,
				output: {
					schema: spec.outputSchema,
					render: spec.render,
					...(spec.presentationMeta ? { presentationMeta: spec.presentationMeta } : {}),
				},
				...(spec.call ? { presentCall: spec.call } : {}),
				execute: spec.execute,
			}),
		);
	}
}
