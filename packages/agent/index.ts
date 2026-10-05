// @fit/agent — the admin console's AI-agent runtime.
//
// The provider-agnostic tool-use loop (Claude/Gemini drivers over the Fit MCP
// tools) that powers the admin copilot. It lives in its own package so it can be
// type-checked and linted under bundler module resolution (the provider SDK type
// graphs, e.g. @google/genai, blow up the API's classic-resolution tsc). The API
// loads it through a `require` boundary in its chat controller.

export { runAgent, type RunAgentOptions } from './src/run-agent';
export { buildSystemPrompt, type AgentContext } from './src/system-prompt';
export {
  resolveModel,
  availableModels,
  createDriver,
  type AgentModel,
  type AgentProvider,
} from './src/models';
export type {
  AgentApproval,
  AgentErrorCode,
  AgentStreamEvent,
  AgentToolCall,
  AgentToolKind,
  AgentToolStatus,
} from './src/driver';
