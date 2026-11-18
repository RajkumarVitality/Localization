import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  frameworkOverview,
  frameworkRoot,
  listFrameworkFiles,
  listScenarios,
  planMobileRun,
  readFrameworkFile
} from './framework.js';

const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
};

function result(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

export function createFrameworkServer(root = frameworkRoot): McpServer {
  const server = new McpServer({ name: 'mobile-framework', version: '1.0.0' });
  server.registerTool('framework_overview', {
    description: 'Explain this mobile framework, entry points, conventions, and execution safety.',
    inputSchema: {},
    annotations
  }, async () => result(frameworkOverview()));
  server.registerTool('list_scenarios', {
    description: 'List registered mobile scenarios, real spec paths, provisioning policy, and suite membership.',
    inputSchema: {},
    annotations
  }, async () => result({ scenarios: listScenarios() }));
  server.registerTool('list_framework_files', {
    description: 'List approved source and tenant selector files. Excludes secrets, fixtures, and runtime artifacts.',
    inputSchema: {},
    annotations
  }, async () => result({ files: await listFrameworkFiles(root) }));
  server.registerTool('read_framework_file', {
    description: 'Read a bounded, numbered range of an approved framework source file. Never reads credential files.',
    inputSchema: {
      file: z.string().min(1).max(240),
      startLine: z.number().int().min(1).default(1),
      lineCount: z.number().int().min(1).max(200).default(100)
    },
    annotations
  }, async ({ file, startLine, lineCount }) => result(
    await readFrameworkFile(file, startLine, lineCount, root)
  ));
  server.registerTool('plan_mobile_run', {
    description: 'Produce an unexecuted command and side-effect warnings for a scenario or suite. Does not launch anything.',
    inputSchema: {
      target: z.enum(['scenario', 'suite']),
      name: z.string().min(1).max(100),
      platform: z.enum(['Android', 'iOS'])
    },
    annotations
  }, async ({ target, name, platform }) => result(planMobileRun(target, name, platform)));
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createFrameworkServer();
  server.connect(new StdioServerTransport()).catch(error => {
    console.error('[FrameworkMCP] Unable to start stdio server.', error);
    process.exitCode = 1;
  });
}
