// @fit/mcp — the Fit admin's Model Context Protocol surface.
//
// One place that builds the Fit MCP server (tools over the tenant-scoped
// @fit/api). Both consumers share it: the admin app connects to it in-process
// (in-memory transport) for the built-in copilot, and the standalone
// `@fit/mcp-server` app serves it over HTTP so external MCP clients (Claude
// Desktop, other LLMs) can reach the same tools with the operator's token.
//
// TOOL_DOMAINS / CORE_TOOLS describe the same tools grouped by subject, so an
// agent can load only the domains a question needs; TOOL_TITLES gives each tool
// its English and Georgian title for the chat. All three are static data.

export { createFitMcpServer } from './src/mcp-server';
export { createFitApiClient, qs, FitApiError, type FitApiClient } from './src/fit-api';
export { TOOL_DOMAINS, CORE_TOOLS, TOOL_TITLES, type ToolDomain } from './src/catalog';
