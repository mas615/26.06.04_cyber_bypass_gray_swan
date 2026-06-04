const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const endpoint = process.env.CDP_ENDPOINT || "http://127.0.0.1:9222";
const args = process.argv.slice(2);

function argValue(name, fallback = null) {
  const index = args.indexOf(name);
  if (index === -1 || index + 1 >= args.length) return fallback;
  return args[index + 1];
}

async function getTabs() {
  const response = await fetch(`${endpoint}/json/list`);
  if (!response.ok) {
    throw new Error(`CDP tab list failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function nowIso() {
  return new Date().toISOString();
}

function saveJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

async function capture(tab, options) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    let id = 0;
    const pending = new Map();
    const byRequestId = new Map();
    const events = [];
    const eventSourceMessages = [];

    function call(method, params = undefined) {
      id += 1;
      pending.set(id, { method });
      ws.send(JSON.stringify(params === undefined ? { id, method } : { id, method, params }));
      return id;
    }

    function record(requestId, patch) {
      if (!byRequestId.has(requestId)) {
        byRequestId.set(requestId, { requestId });
      }
      Object.assign(byRequestId.get(requestId), patch);
    }

    function shouldKeepUrl(url) {
      if (!options.urlIncludes) return true;
      return typeof url === "string" && url.includes(options.urlIncludes);
    }

    ws.on("open", () => {
      call("Network.enable", {
        maxTotalBufferSize: 100000000,
        maxResourceBufferSize: 50000000,
        maxPostDataSize: 50000000,
      });
      call("Runtime.enable");
      call("Page.enable");
      setTimeout(() => {
        ws.close();
      }, options.durationMs);
    });

    ws.on("message", (raw) => {
      const message = JSON.parse(raw.toString());

      if (message.id && pending.has(message.id)) {
        const request = pending.get(message.id);
        pending.delete(message.id);

        if (request.requestId && request.kind === "body") {
          const item = byRequestId.get(request.requestId);
          if (item) {
            item.responseBody = message.result ?? message.error ?? null;
          }
        }
        return;
      }

      if (!message.method) return;

      if (message.method === "Network.requestWillBeSent") {
        const params = message.params;
        if (!shouldKeepUrl(params.request?.url)) return;

        events.push({ method: message.method, params });
        record(params.requestId, {
          startedAt: nowIso(),
          url: params.request?.url,
          method: params.request?.method,
          type: params.type,
          request: params.request,
          initiator: params.initiator,
        });
      }

      if (message.method === "Network.requestWillBeSentExtraInfo") {
        const params = message.params;
        const item = byRequestId.get(params.requestId);
        if (!item) return;

        events.push({ method: message.method, params });
        item.requestExtraInfo = params;
      }

      if (message.method === "Network.responseReceived") {
        const params = message.params;
        if (!shouldKeepUrl(params.response?.url)) return;

        events.push({ method: message.method, params });
        record(params.requestId, {
          response: params.response,
          status: params.response?.status,
          mimeType: params.response?.mimeType,
        });
      }

      if (message.method === "Network.responseReceivedExtraInfo") {
        const params = message.params;
        const item = byRequestId.get(params.requestId);
        if (!item) return;

        events.push({ method: message.method, params });
        item.responseExtraInfo = params;
      }

      if (message.method === "Network.eventSourceMessageReceived") {
        const params = message.params;
        const item = byRequestId.get(params.requestId);
        if (!item) return;

        events.push({ method: message.method, params });
        eventSourceMessages.push(params);
        if (!item.eventSourceMessages) item.eventSourceMessages = [];
        item.eventSourceMessages.push(params);
      }

      if (message.method === "Network.loadingFinished") {
        const params = message.params;
        const item = byRequestId.get(params.requestId);
        if (!item) return;

        events.push({ method: message.method, params });
        item.finishedAt = nowIso();
        item.encodedDataLength = params.encodedDataLength;

        id += 1;
        pending.set(id, { method: "Network.getResponseBody", requestId: params.requestId, kind: "body" });
        ws.send(JSON.stringify({
          id,
          method: "Network.getResponseBody",
          params: { requestId: params.requestId },
        }));
      }

      if (message.method === "Network.loadingFailed") {
        const params = message.params;
        const item = byRequestId.get(params.requestId);
        if (!item) return;

        events.push({ method: message.method, params });
        item.failedAt = nowIso();
        item.failure = params;
      }
    });

    ws.on("close", () => {
      setTimeout(() => {
        resolve({
          tab: {
            id: tab.id,
            title: tab.title,
            url: tab.url,
          },
          capturedAt: nowIso(),
          durationMs: options.durationMs,
          urlIncludes: options.urlIncludes,
          requests: Array.from(byRequestId.values()),
          eventSourceMessages,
          rawEvents: events,
        });
      }, 500);
    });

    ws.on("error", reject);
  });
}

async function main() {
  const match = argValue("--match", "app.grayswan.ai");
  const urlIncludes = argValue("--url-includes", "app.grayswan.ai");
  const durationMs = Number(argValue("--duration-ms", "30000"));
  const outputPath = argValue("--out");
  const tabs = await getTabs();
  const tab = tabs.find((item) => item.type === "page" && (!match || item.url.includes(match) || item.title.includes(match)));

  if (!tab) {
    throw new Error(`No matching page tab found for: ${match}`);
  }

  const result = await capture(tab, { durationMs, urlIncludes });
  if (outputPath) {
    saveJson(outputPath, result);
  }
  console.log(JSON.stringify({
    output: outputPath || null,
    requestCount: result.requests.length,
    eventSourceMessageCount: result.eventSourceMessages.length,
    tab: result.tab,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
