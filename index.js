require('dotenv').config();
const express = require('express');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
const db = require('./db');
const tools = require('./tools');
const { buildReviewCard, buildConfirmedCard, buildCancelledCard } = require('./review-blocks');
const { WebClient } = require('@slack/web-api');

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

const app = express();
app.use(express.json());

app.get('/', (req, res) => res.json({
  status: 'ok',
  service: 'NetSuite MCP Server',
  tools: tools.map(t => t.name),
}));

function buildMcpServer() {
  const server = new McpServer({ name: 'netsuite-timelog', version: '1.0.0' });

  for (const tool of tools) {
    const schemaShape = {};
    for (const [key, def] of Object.entries(tool.inputSchema.properties || {})) {
      const required = (tool.inputSchema.required || []).includes(key);
      let zType;
      if (def.type === 'boolean') zType = z.union([z.boolean(), z.string().transform(v => v === 'true')]);
      else if (def.type === 'number') zType = z.union([z.number(), z.string().transform(v => parseFloat(v) || 0)]);
      else if (def.type === 'object') zType = z.record(z.string(), z.number());
      else zType = z.string();
      if (def.description) zType = zType.describe(def.description);
      schemaShape[key] = required ? zType : zType.optional();
    }

    server.tool(tool.name, tool.description, schemaShape, async (args) => {
      try {
        const result = await tool.handler(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }], isError: true };
      }
    });
  }

  return server;
}

// ── REST endpoints for Bolt app callbacks ─────────────────────────────────────

// Confirm → move pending to committed, update Slack message
app.post('/pending/:id/confirm', async (req, res) => {
  try {
    const pending = await db.getPendingEntry(req.params.id);
    if (!pending) return res.status(404).json({ error: 'Not found' });
    const committed = await db.movePendingToCommitted(req.params.id);
    await slack.chat.update({
      channel: pending.slack_channel,
      ts: pending.slack_ts,
      text: 'Time entry saved to NetSuite',
      blocks: buildConfirmedCard(committed),
    }).catch(() => null);
    res.json({ success: true, entry: committed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel → delete pending, update Slack message
app.delete('/pending/:id', async (req, res) => {
  try {
    const pending = await db.getPendingEntry(req.params.id);
    if (!pending) return res.status(404).json({ error: 'Not found' });
    await db.deletePendingEntry(req.params.id);
    await slack.chat.update({
      channel: pending.slack_channel,
      ts: pending.slack_ts,
      text: 'Time entry cancelled',
      blocks: buildCancelledCard(),
    }).catch(() => null);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Patch field → update pending, return new blocks
app.patch('/pending/:id', async (req, res) => {
  try {
    const updated = await db.updatePendingEntry(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    const blocks = buildReviewCard(updated);
    await slack.chat.update({
      channel: updated.slack_channel,
      ts: updated.slack_ts,
      text: 'NetSuite time entry review',
      blocks,
    }).catch(() => null);
    res.json({ success: true, pending: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// All MCP traffic — stateless mode (new server+transport per request)
app.all('/mcp', async (req, res) => {
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless — no session negotiation needed
    });

    const server = buildMcpServer();
    res.on('close', () => transport.close().catch(() => null));
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('MCP error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

const PORT = process.env.PORT || 3000;

(async () => {
  await db.migrate();
  console.log('Database schema ready');
  app.listen(PORT, () => console.log(`NetSuite MCP Server running on port ${PORT}`));
})();
