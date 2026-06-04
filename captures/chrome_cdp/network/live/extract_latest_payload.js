const fs = require('fs');
const path = require('path');
const live = process.argv[2];
const requestsPath = path.join(live, 'requests.json');
const requestOut = path.join(live, 'request.json');
const responseOut = path.join(live, 'response.json');
const rawEventsOut = path.join(live, 'api_trace_raw_events.txt');
const text = fs.readFileSync(requestsPath, 'utf8');
let requests;
try {
  requests = JSON.parse(text);
} catch (error) {
  console.log(JSON.stringify({ ok: false, error: 'requests.json parse failed', detail: error.message }, null, 2));
  process.exit(0);
}
const streams = requests.filter((item) => item.url && item.url.includes('/api/browser-agent-stream/') && item.responseBody && item.responseBody.body);
const stream = streams[streams.length - 1];
if (!stream) {
  console.log(JSON.stringify({ ok: false, error: 'browser-agent-stream response body not found', requestCount: requests.length }, null, 2));
  process.exit(0);
}
const body = stream.responseBody.body;
const blocks = [];
let latestRequest = null;
let latestResponse = null;
const chunks = body.split(/\r?\n\r?\n/);
for (const chunk of chunks) {
  if (!chunk.startsWith('event: api_trace')) continue;
  blocks.push(chunk);
  const dataLine = chunk.split(/\r?\n/).find((line) => line.startsWith('data: '));
  if (!dataLine) continue;
  try {
    const data = JSON.parse(dataLine.slice(6));
    if (data.payload && typeof data.payload.request === 'string' && data.payload.request && typeof data.payload.response === 'string' && data.payload.response) {
      latestRequest = JSON.parse(data.payload.request);
      latestResponse = JSON.parse(data.payload.response);
    }
  } catch {}
}
fs.writeFileSync(rawEventsOut, blocks.join('\r\n\r\n'), 'utf8');
if (latestRequest) fs.writeFileSync(requestOut, JSON.stringify(latestRequest, null, 2), 'utf8');
if (latestResponse) fs.writeFileSync(responseOut, JSON.stringify(latestResponse, null, 2), 'utf8');
console.log(JSON.stringify({
  ok: true,
  streamUrl: stream.url,
  status: stream.status,
  apiTraceBlocks: blocks.length,
  wroteRequest: Boolean(latestRequest),
  wroteResponse: Boolean(latestResponse),
  requestModel: latestRequest && latestRequest.model,
  responseModel: latestResponse && latestResponse.model,
  responseStopReason: latestResponse && latestResponse.stop_reason,
  responseText: latestResponse && latestResponse.content && latestResponse.content.map((c) => c.text).filter(Boolean).join('\n').slice(0, 500)
}, null, 2));
