import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createFitMcpServer } from '@fit/mcp';
import type { GenerateContentParameters, Tool } from '@google/genai';
import { createToolbox, defaultToolCatalog } from '../toolbox';
import { createGeminiDriver } from './gemini';

const { generateContentStream } = vi.hoisted(() => ({ generateContentStream: vi.fn() }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContentStream };
  },
  ThinkingLevel: { MINIMAL: 'MINIMAL' },
}));

afterEach(() => vi.clearAllMocks());

function reply() {
  generateContentStream.mockImplementation(async function* () {
    yield await Promise.resolve({
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: { name: 'list_members', args: { limit: 3 } },
                thoughtSignature: 'opaque-signature',
              },
            ],
          },
        },
      ],
    });
  });
}

function lastRequest(): GenerateContentParameters {
  return generateContentStream.mock.lastCall?.[0] as GenerateContentParameters;
}

describe('Gemini request compatibility', () => {
  it('keeps thinking at the minimal level and preserves call signatures for replay', async () => {
    reply();
    const driver = createGeminiDriver('gemini-flash-lite-latest');
    const tools = [
      {
        name: 'list_members',
        description: 'List members',
        parameters: { type: 'object', properties: { limit: { type: 'integer' } } },
      },
    ];
    const result = await driver.runTurn({
      system: 'test',
      tools,
      history: [{ role: 'user', text: 'list the first 3 members' }],
      onDelta: vi.fn(),
    });

    // The latest alias rejects thinkingBudget: 0 even without any tools; the
    // minimal level is the cheapest setting it accepts.
    expect(lastRequest().model).toBe('gemini-flash-lite-latest');
    expect(lastRequest().config?.thinkingConfig).toEqual({ thinkingLevel: 'MINIMAL' });
    expect(result.toolCalls).toEqual([
      expect.objectContaining({
        name: 'list_members',
        input: { limit: 3 },
        signature: 'opaque-signature',
      }),
    ]);

    const call = result.toolCalls[0];
    if (!call) throw new Error('Expected a function call');
    await driver.runTurn({
      system: 'test',
      tools,
      history: [
        { role: 'user', text: 'list the first 3 members' },
        { role: 'assistant', text: result.text, toolCalls: result.toolCalls },
        {
          role: 'tool',
          results: [{ id: call.id, name: 'list_members', output: '[]', isError: false }],
        },
      ],
      onDelta: vi.fn(),
    });
    expect(lastRequest().contents).toEqual([
      { role: 'user', parts: [{ text: 'list the first 3 members' }] },
      {
        role: 'model',
        parts: [
          {
            functionCall: { name: 'list_members', args: { limit: 3 } },
            thoughtSignature: 'opaque-signature',
          },
        ],
      },
      {
        role: 'user',
        parts: [{ functionResponse: { name: 'list_members', response: { result: [] } } }],
      },
    ]);
  });

  it('builds requests from the real MCP catalog for core, marketing and all tools', async () => {
    reply();
    const server = createFitMcpServer('x');
    const client = new Client({ name: 'gemini-test', version: '1' });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const { tools: listed } = await client.listTools();
      const all = listed.map((tool) => ({
        name: tool.name,
        description: tool.description ?? '',
        parameters: tool.inputSchema,
      }));
      expect(all).toHaveLength(212);
      const toolbox = createToolbox(all, defaultToolCatalog(), () => undefined);
      const core = toolbox.visible();
      toolbox.open({ domains: ['marketing'] });
      const marketing = toolbox.visible();
      expect(core).toHaveLength(16);
      expect(marketing).toHaveLength(76);
      const before = JSON.stringify(all);
      const driver = createGeminiDriver('gemini-flash-lite-latest');
      for (const tools of [core, marketing, all]) {
        await driver.runTurn({
          system: 'test',
          tools,
          history: [{ role: 'user', text: 'hi' }],
          onDelta: vi.fn(),
        });
        const request = lastRequest();
        expect(request.config?.thinkingConfig).toEqual({ thinkingLevel: 'MINIMAL' });
        const declarations = (request.config?.tools?.[0] as Tool | undefined)?.functionDeclarations;
        expect(declarations?.map((tool) => tool.name)).toEqual(tools.map((tool) => tool.name));
        // parametersJsonSchema accepts the DTO unions and constraints. Do not
        // weaken them to work around an unrelated generation-config error.
        expect(declarations?.find((tool) => tool.name === 'list_members')).toMatchObject({
          parametersJsonSchema: {
            properties: { limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
          },
        });
      }
      expect(JSON.stringify(all)).toBe(before);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
