require('dotenv').config();
const express = require('express');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
const db = require('./db');
const tools = require('./tools');

const app = express();
app.use(express.json());

// Health check
app.get('/', (req, res) => res.json({ status: 'ok', service: 'NetSuite MCP Server' }));

// MCP endpoint — one transport per request (stateless)
app.post('/mcp', async (req, res) => {
  const server = new McpServer({
    name: 'netsuite-timelog',
    version: '1.0.0',
  });

  for (const tool of tools) {
    // Build zod schema from inputSchema properties
    const schemaProps = {};
    for (const [key, def] of Object.entries(tool.inputSchema.properties || {})) {
      let z_type;
      if (def.type === 'string') z_type = z.string().describe(def.description || '');
      else if (def.type === 'boolean') z_type = z.boolean().describe(def.description || '');
      else if (def.type === 'number') z_type = z.number().describe(def.description || '');
      else if (def.type === 'object') z_type = z.record(z.number()).describe(def.description || '');
      else z_type = z.any();

      const required = (tool.inputSchema.required || []).includes(key);
      schemaProps[key] = required ? z_type : z_type.optional();
    }

    server.tool(tool.name, tool.description, schemaProps, async (args) => {
      const result = await tool.handler(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    });
  }

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// SSE GET for MCP (some clients use GET for SSE stream)
app.get('/mcp', async (req, res) => {
  res.status(405).json({ error: 'Use POST for MCP requests' });
});

const PORT = process.env.PORT || 3000;

(async () => {
  await db.migrate();
  console.log('Database schema ready');
  app.listen(PORT, () => console.log(`NetSuite MCP Server running on port ${PORT}`));
})();
