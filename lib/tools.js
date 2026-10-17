/**
 * Tool registry: one tool per file, in the order the model should see them.
 *
 * @module dsh-search/tools
 */

import { clampInt, guarded, requireText } from "./tools/shared.js";
import { createSearchTool } from "./tools/search.js";
import { createFetchTool } from "./tools/fetch.js";
import { createResearchTool } from "./tools/research.js";

/**
 * Build every tool spec for one plugin instance.
 *
 * @param {{client: import("./client.js").SearchClient, config: Record<string, any>}} deps - plugin deps.
 * @returns {Array<Record<string, any>>} tool specs in presentation order.
 */
export function createToolSpecs({ client, config }) {
	const ctx = { client, config, clampInt, guarded, requireText };
	return [createSearchTool(ctx), createFetchTool(ctx), createResearchTool(ctx)];
}
