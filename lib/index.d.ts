/**
 * Public surface of dsh-search.
 */

import type { SearchClient } from "./client.js";

export declare const name: string;
export declare const inject: string[];
export declare const Config: unknown;
export { SearchClient };
export declare function apply(ctx: any, config: Record<string, any>): void;
