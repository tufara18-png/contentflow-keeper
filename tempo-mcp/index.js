import readline from 'node:readline';

const BASE_URL = (process.env.TEMPO_BASE_URL || 'https://api.tempo.io/4').replace(/\/$/, '');
const TOKEN = process.env.TEMPO_API_TOKEN || '';

function jsonResult(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

async function tempo(path, options = {}) {
  if (!TOKEN) throw new Error('TEMPO_API_TOKEN is not configured');
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (response.status === 204) return null;
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(`Tempo API ${response.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  return body;
}

async function paginate(path) {
  const all = [];
  let next = path;
  let pages = 0;
  while (next && pages < 100) {
    const data = await tempo(next);
    if (Array.isArray(data?.results)) all.push(...data.results);
    else if (Array.isArray(data)) all.push(...data);
    else return data;
    next = data?.metadata?.next || null;
    pages++;
  }
  return { results: all, count: all.length, pages };
}

const tools = [
  { name: 'tempo_list_worklogs', description: 'List Tempo worklogs directly from Tempo API. No Jira API required.', inputSchema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, issueId: { type: 'integer' }, projectId: { type: 'integer' }, limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 } } } },
  { name: 'tempo_search_worklogs', description: 'Search Tempo worklogs by author account IDs, issue IDs, project IDs and date range.', inputSchema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, authorIds: { type: 'array', items: { type: 'string' } }, issueIds: { type: 'array', items: { type: 'integer' } }, projectIds: { type: 'array', items: { type: 'integer' } }, updatedFrom: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 } } } },
  { name: 'tempo_get_worklog', description: 'Retrieve one Tempo worklog by Tempo worklog ID.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  { name: 'tempo_discover_author_account_id', description: 'Infer authorAccountId values from visible recent Tempo worklogs.', inputSchema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } } } },
  { name: 'tempo_create_worklog', description: 'Create a Tempo worklog directly. Requires numeric issueId and authorAccountId.', inputSchema: { type: 'object', properties: { issueId: { type: 'integer', minimum: 1 }, authorAccountId: { type: 'string' }, timeSpentSeconds: { type: 'integer', minimum: 1 }, startDate: { type: 'string' }, startTime: { type: 'string' }, description: { type: 'string' }, billableSeconds: { type: 'integer', minimum: 0 }, attributes: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' } }, required: ['key','value'] } } }, required: ['issueId','authorAccountId','timeSpentSeconds','startDate'] } },
  { name: 'tempo_update_worklog', description: 'Update an existing Tempo worklog directly.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, authorAccountId: { type: 'string' }, timeSpentSeconds: { type: 'integer', minimum: 1 }, startDate: { type: 'string' }, startTime: { type: 'string' }, description: { type: 'string' }, billableSeconds: { type: 'integer', minimum: 0 }, remainingEstimateSeconds: { type: 'integer', minimum: 0 }, attributes: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' } }, required: ['key','value'] } } }, required: ['id','authorAccountId','timeSpentSeconds','startDate'] } },
  { name: 'tempo_delete_worklog', description: 'Delete a Tempo worklog by Tempo worklog ID.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } }
];

async function callTool(name, args = {}) {
  if (name === 'tempo_list_worklogs') {
    const params = new URLSearchParams();
    for (const key of ['from','to','issueId','projectId','limit']) if (args[key] !== undefined) params.set(key, String(args[key]));
    if (!params.has('limit')) params.set('limit', '100');
    return jsonResult(await paginate(`/worklogs?${params.toString()}`));
  }
  if (name === 'tempo_search_worklogs') {
    const limit = args.limit || 100;
    const body = { ...args }; delete body.limit;
    return jsonResult(await tempo(`/worklogs/search?limit=${encodeURIComponent(limit)}`, { method: 'POST', body: JSON.stringify(body) }));
  }
  if (name === 'tempo_get_worklog') return jsonResult(await tempo(`/worklogs/${encodeURIComponent(args.id)}`));
  if (name === 'tempo_discover_author_account_id') {
    const params = new URLSearchParams({ limit: '50', orderBy: 'UPDATED' });
    if (args.from) params.set('from', args.from);
    if (args.to) params.set('to', args.to);
    const data = await tempo(`/worklogs?${params.toString()}`);
    const ids = [...new Set((data?.results || []).map(w => w?.author?.accountId).filter(Boolean))];
    return jsonResult({ authorAccountIds: ids, sampleCount: data?.results?.length || 0 });
  }
  if (name === 'tempo_create_worklog') {
    return jsonResult(await tempo('/worklogs', { method: 'POST', body: JSON.stringify(args) }));
  }
  if (name === 'tempo_update_worklog') {
    const { id, ...payload } = args;
    return jsonResult(await tempo(`/worklogs/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }));
  }
  if (name === 'tempo_delete_worklog') {
    await tempo(`/worklogs/${encodeURIComponent(args.id)}`, { method: 'DELETE' });
    return jsonResult({ deleted: true, id: args.id });
  }
  throw new Error(`Unknown tool: ${name}`);
}

function send(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', async (line) => {
  if (!line.trim()) return;
  let req;
  try { req = JSON.parse(line); } catch { return; }
  if (!req.id && req.method?.startsWith('notifications/')) return;
  try {
    if (req.method === 'initialize') send({ jsonrpc: '2.0', id: req.id, result: { protocolVersion: req.params?.protocolVersion || '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'tempo-only-mcp', version: '1.0.0' } } });
    else if (req.method === 'ping') send({ jsonrpc: '2.0', id: req.id, result: {} });
    else if (req.method === 'tools/list') send({ jsonrpc: '2.0', id: req.id, result: { tools } });
    else if (req.method === 'tools/call') send({ jsonrpc: '2.0', id: req.id, result: await callTool(req.params?.name, req.params?.arguments || {}) });
    else send({ jsonrpc: '2.0', id: req.id, error: { code: -32601, message: `Method not found: ${req.method}` } });
  } catch (error) {
    send({ jsonrpc: '2.0', id: req.id, result: { content: [{ type: 'text', text: error?.message || String(error) }], isError: true } });
  }
});

console.error('tempo-only-mcp ready');
