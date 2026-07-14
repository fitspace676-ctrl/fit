// @fit/mcp — the Fit admin's Model Context Protocol surface.
//
// One place that builds the Fit MCP server (91 tools over the tenant-scoped
// @fit/api). Both consumers share it: the admin app connects to it in-process
// (in-memory transport) for the built-in copilot, and the standalone
// `@fit/mcp-server` app serves it over HTTP so external MCP clients (Claude
// Desktop, other LLMs) can reach the same tools with the operator's token.

export { createFitMcpServer } from './src/mcp-server';
export { createFitApiClient, qs, FitApiError, type FitApiClient } from './src/fit-api';
