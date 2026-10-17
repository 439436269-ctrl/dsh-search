/**
 * Tool-spec tests: query assembly, argument clamping, output shape.
 *
 * The tool specs are pure — each takes a client-shaped object, so these run
 * without the host and without network access.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { buildQuery, normalizeSite } from "../lib/query.js";
import { createToolSpecs } from "../lib/tools.js";

const CONFIG = { defaultCount: 5, maxContentChars: 8000, fetchMaxChars: 20000 };

/**
 * Build a client stub recording every call.
 *
 * @param {{results?: Array<Record<string, any>>, page?: {title: string, content: string}, failUrls?: string[]}} [options] - canned data.
 * @returns {Record<string, any>} stub client.
 */
function stubClient(options = {}) {
	const calls = { search: [], fetchPage: [] };
	return {
		calls,
		async search(args) {
			calls.search.push(args);
			return options.results ?? [];
		},
		async fetchPage(url) {
			calls.fetchPage.push(url);
			if ((options.failUrls ?? []).includes(url)) throw Object.assign(new Error(`fetch failed for ${url}`), { hint: "blocked" });
			return options.page ?? { title: "T", content: "body" };
		},
	};
}

const RAW = [
	{ title: "A", url: "https://a.example/1", snippet: "sa", summary: "ma", content: "ca", site_name: "A", date: "2026-01-02T00:00:00+00:00", authority: 3, rerank_score: 2.1 },
	{ title: "B", url: "https://b.example/2", snippet: "sb", summary: "mb", content: "", site_name: null, date: null, authority: -1, rerank_score: 0.4 },
];

test("normalizeSite expands hosts and passes operators through", () => {
	assert.equal(normalizeSite("github.com"), "site:github.com");
	assert.equal(normalizeSite("github.com huggingface.co"), "site:github.com OR site:huggingface.co");
	assert.equal(normalizeSite("github.com,huggingface.co"), "site:github.com OR site:huggingface.co");
	assert.equal(normalizeSite("site:github.com"), "site:github.com");
	assert.equal(normalizeSite("-csdn.net"), "-csdn.net");
	assert.equal(normalizeSite(""), "");
});

test("buildQuery appends operators and enforces the length ceiling", () => {
	assert.equal(buildQuery({ query: " q ", site: "github.com", lang: "zh,en", after: "2025", before: "2026-06" }), "q site:github.com lang:zh,en after:2025 before:2026-06");
	assert.throws(() => buildQuery({ query: "  " }), /不能为空/);
	assert.throws(() => buildQuery({ query: "x".repeat(129) }), /超长/);
});

test("deepseek_search normalizes results and clamps count", async () => {
	const client = stubClient({ results: RAW });
	const [search] = createToolSpecs({ client, config: CONFIG });

	const value = await search.execute({ query: "hello", count: 999, needContent: true });

	assert.equal(client.calls.search[0].count, 50, "count clamps to the API ceiling");
	assert.equal(value.total, 2);
	assert.equal(value.billed, true);
	assert.equal(value.results[0].good, true);
	assert.equal(value.results[0].siteName, "A");
	assert.equal(value.results[1].good, false);
	assert.equal(value.results[1].siteName, "", "null site becomes an empty string");
	assert.equal(value.results[1].date, "");
	assert.equal(value.results[1].content, "", "content stays empty without needContent");
});

test("deepseek_search clips content to the configured budget", async () => {
	const client = stubClient({ results: [{ ...RAW[0], content: "z".repeat(500) }] });
	const [search] = createToolSpecs({ client, config: { ...CONFIG, maxContentChars: 100 } });
	const value = await search.execute({ query: "q", needContent: true });
	assert.equal(value.results[0].content.length > 100, true);
	assert.match(value.results[0].content, /已截断/);
});

test("deepseek_search reports an empty result set as unbilled", async () => {
	const client = stubClient({ results: [] });
	const [search] = createToolSpecs({ client, config: CONFIG });
	const value = await search.execute({ query: "q" });
	assert.equal(value.billed, false);
	assert.equal(value.total, 0);
	assert.match(search.render({}, value)[0].text, /不计费/);
});

test("deepseek_search rejects a blank query before calling out", async () => {
	const client = stubClient({ results: RAW });
	const [search] = createToolSpecs({ client, config: CONFIG });
	await assert.rejects(() => search.execute({ query: "   " }), /不能为空/);
	assert.equal(client.calls.search.length, 0);
});

test("deepseek_fetch clips the body and flags truncation", async () => {
	const client = stubClient({ page: { title: "Doc", content: "y".repeat(4000) } });
	const [, fetchTool] = createToolSpecs({ client, config: { ...CONFIG, fetchMaxChars: 1000 } });

	const value = await fetchTool.execute({ url: "https://e.com/doc" });

	assert.equal(value.chars, 4000);
	assert.equal(value.truncated, true);
	assert.equal(value.billed, true);
	assert.equal(value.content.length < 1100, true);
});

test("deepseek_fetch honours an explicit maxChars and validates the scheme", async () => {
	const client = stubClient({ page: { title: "Doc", content: "abc" } });
	const [, fetchTool] = createToolSpecs({ client, config: CONFIG });

	const value = await fetchTool.execute({ url: "https://e.com/doc", maxChars: 5 });
	assert.equal(value.content, "abc", "shorter than the cap is untouched");
	await assert.rejects(() => fetchTool.execute({ url: "ftp://e.com/x" }), /http/);
});

test("deepseek_research fetches the top N pages and charges 1+N", async () => {
	const client = stubClient({ results: RAW, page: { title: "P", content: "q".repeat(500) } });
	const [, , research] = createToolSpecs({ client, config: CONFIG });

	const value = await research.execute({ query: "q", top: 2, excerptChars: 120 });

	assert.deepEqual(client.calls.fetchPage, ["https://a.example/1", "https://b.example/2"]);
	assert.equal(value.fetched, 2);
	assert.equal(value.billedRequests, 3);
	assert.equal(value.results[0].excerpt.length, 200, "excerptChars floors at 200");
});

test("deepseek_research with top 0 skips fetching entirely", async () => {
	const client = stubClient({ results: RAW });
	const [, , research] = createToolSpecs({ client, config: CONFIG });

	const value = await research.execute({ query: "q", top: 0 });

	assert.equal(client.calls.fetchPage.length, 0);
	assert.equal(value.fetched, 0);
	assert.equal(value.billedRequests, 1);
	assert.equal(value.results.every((entry) => entry.excerpt === ""), true);
});

test("deepseek_research keeps going when one page fails to fetch", async () => {
	const client = stubClient({ results: RAW, failUrls: ["https://a.example/1"] });
	const [, , research] = createToolSpecs({ client, config: CONFIG });

	const value = await research.execute({ query: "q", top: 2 });

	assert.match(value.results[0].fetchError, /fetch failed/);
	assert.equal(value.results[0].excerpt, "");
	assert.equal(value.results[1].excerpt.length > 0, true);
	assert.equal(value.fetched, 1);
});

test("every tool declares a name, parameters, output schema and render", () => {
	for (const spec of createToolSpecs({ client: stubClient(), config: CONFIG })) {
		assert.match(spec.name, /^deepseek_/);
		assert.equal(typeof spec.description, "string");
		assert.equal(spec.outputSchema.type, "object");
		assert.equal(typeof spec.execute, "function");
		assert.equal(typeof spec.render, "function");
		assert.equal(typeof spec.call, "function");
		for (const [field, schema] of Object.entries(spec.parameters)) {
			assert.equal(typeof schema.type, "string", `${spec.name}.${field} needs a type`);
			assert.equal(typeof schema.description, "string", `${spec.name}.${field} needs a description`);
		}
	}
});
