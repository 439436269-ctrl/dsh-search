#!/usr/bin/env node
/**
 * Live self-test: exercises the real DeepSeek Search / Fetch endpoints through
 * the same client the tools use.
 *
 * It spends money (≈0.005 CNY per successful request), so it stays opt-in and
 * keeps the call count tiny: one search, then one fetch of the first result.
 *
 *   node scripts/live-selftest.js
 */

import { SearchClient } from "../lib/client.js";
import { buildQuery } from "../lib/query.js";

const STEPS = [];
function record(label, ok, detail = "") {
	STEPS.push(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
	return ok;
}

const client = new SearchClient({ baseUrl: "https://api.deepseek.com" });
const { source } = client.keyInfo();
console.log(`key source: ${source}`);

let firstUrl = "";
let failures = 0;

try {
	const query = buildQuery({ query: "DeepSeek Search API", site: "api-docs.deepseek.com" });
	const results = await client.search({ query, count: 3 });
	const ok = results.length > 0 && results.every((item) => typeof item.url === "string");
	failures += record("search returns results", ok, `hits=${results.length} top=${results[0]?.title ?? "-"}`) ? 0 : 1;
	firstUrl = results[0]?.url ?? "";
} catch (error) {
	failures += record("search returns results", false, error.message);
}

if (firstUrl) {
	try {
		const page = await client.fetchPage(firstUrl);
		const ok = page.content.length > 200;
		failures += record("fetch returns Markdown body", ok, `title=${page.title} chars=${page.content.length}`) ? 0 : 1;
	} catch (error) {
		failures += record("fetch returns Markdown body", false, error.message);
	}
}

console.log(STEPS.join("\n"));
console.log(`\n${failures === 0 ? "all good" : `${failures} failed`}`);
process.exit(failures === 0 ? 0 : 1);
