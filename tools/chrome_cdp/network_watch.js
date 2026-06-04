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

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function appendJsonl(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
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

function parseJson(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function maybeRepairMojibake(value) {
  if (typeof value !== "string") return value;
  if (!/[ÃÂíìëê]/.test(value)) return value;
  return Buffer.from(value, "latin1").toString("utf8");
}

function repairJsonStrings(value) {
  if (typeof value === "string") return maybeRepairMojibake(value);
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(repairJsonStrings);
  for (const key of Object.keys(value)) {
    value[key] = repairJsonStrings(value[key]);
  }
  return value;
}

async function findTab(match) {
  const tabs = await getTabs();
  return tabs.find((tab) => tab.type === "page" && (!match || tab.url.includes(match) || tab.title.includes(match)));
}

async function start() {
  const match = argValue("--match", "app.grayswan.ai");
  const urlIncludes = argValue("--url-includes", "app.grayswan.ai");
  const outDir = argValue("--out-dir");

  if (!outDir) {
    throw new Error("--out-dir is required");
  }

  ensureDir(outDir);

  const files = {
    status: path.join(outDir, "status.json"),
    events: path.join(outDir, "events.jsonl"),
    sse: path.join(outDir, "sse_events.jsonl"),
    requests: path.join(outDir, "requests.json"),
    requestPayload: path.join(outDir, "request.json"),
    responsePayload: path.join(outDir, "response.json"),
    apiTraceData: path.join(outDir, "api_trace_data.json"),
    apiTraceRaw: path.join(outDir, "api_trace_data_raw.txt"),
  };

  const tab = await findTab(match);
  if (!tab) {
    throw new Error(`No matching page tab found for: ${match}`);
  }

  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0;
  let eventCount = 0;
  let sseCount = 0;
  let requestCount = 0;
  const pendingBodies = new Map();
  const requests = new Map();

  function status(extra = {}) {
    writeJson(files.status, {
      state: ws.readyState === WebSocket.OPEN ? "running" : "starting",
      pid: process.pid,
      startedAt,
      updatedAt: nowIso(),
      tab: {
        id: tab.id,
        title: tab.title,
        url: tab.url,
      },
      match,
      urlIncludes,
      eventCount,
      sseCount,
      requestCount: requests.size,
      files,
      ...extra,
    });
  }

  function call(method, params = undefined, meta = undefined) {
    id += 1;
    if (meta) pendingBodies.set(id, meta);
    ws.send(JSON.stringify(params === undefined ? { id, method } : { id, method, params }));
    return id;
  }

  function keepUrl(url) {
    if (!urlIncludes) return true;
    return typeof url === "string" && url.includes(urlIncludes);
  }

  function updateRequest(requestId, patch) {
    if (!requests.has(requestId)) {
      requestCount += 1;
      requests.set(requestId, { requestId });
    }
    Object.assign(requests.get(requestId), patch);
    writeJson(files.requests, Array.from(requests.values()));
  }

  function handlePayloadData(dataText) {
    const data = parseJson(dataText);
    if (!data?.payload) return;

    if (typeof data.payload.request === "string" && data.payload.request.length > 0) {
      const parsedRequest = parseJson(data.payload.request);
      if (parsedRequest) writeJson(files.requestPayload, repairJsonStrings(parsedRequest));
    }

    if (typeof data.payload.response === "string" && data.payload.response.length > 0) {
      const parsedResponse = parseJson(data.payload.response);
      if (parsedResponse) writeJson(files.responsePayload, repairJsonStrings(parsedResponse));
    }
  }

  function handleResponseBody(body) {
    if (typeof body !== "string" || !body.includes("event: api_trace")) return;
    const apiTraceItems = [];
    const apiTraceRaw = [];

    for (const block of body.split(/\r?\n\r?\n/)) {
      if (!block.startsWith("event: api_trace")) continue;
      const dataLine = block.split(/\r?\n/).find((line) => line.startsWith("data: "));
      if (!dataLine) continue;

      const dataText = dataLine.slice(6);
      apiTraceRaw.push(dataText);
      apiTraceItems.push(parseJson(dataText) ?? dataText);
      handlePayloadData(dataText);
    }

    writeJson(files.apiTraceData, apiTraceItems);
    fs.writeFileSync(files.apiTraceRaw, apiTraceRaw.join("\r\n\r\n"), "utf8");
  }

  const startedAt = nowIso();
  status();

  ws.on("open", () => {
    call("Network.enable", {
      maxTotalBufferSize: 100000000,
      maxResourceBufferSize: 50000000,
      maxPostDataSize: 50000000,
    });
    call("Runtime.enable");
    call("Page.enable");
    status({ state: "running" });
  });

  ws.on("message", (raw) => {
    const message = JSON.parse(raw.toString());

    if (message.id && pendingBodies.has(message.id)) {
      const meta = pendingBodies.get(message.id);
      pendingBodies.delete(message.id);
      const item = requests.get(meta.requestId);
      if (item) {
        item.responseBody = message.result ?? message.error ?? null;
        if (message.result?.body) {
          handleResponseBody(message.result.body);
        }
        updateRequest(meta.requestId, item);
      }
      return;
    }

    if (!message.method) return;

    if (message.method === "Network.requestWillBeSent") {
      const params = message.params;
      if (!keepUrl(params.request?.url)) return;
      eventCount += 1;
      appendJsonl(files.events, { capturedAt: nowIso(), ...message });
      updateRequest(params.requestId, {
        startedAt: nowIso(),
        url: params.request?.url,
        method: params.request?.method,
        type: params.type,
        request: params.request,
        initiator: params.initiator,
      });
      return;
    }

    if (message.method === "Network.requestWillBeSentExtraInfo") {
      const params = message.params;
      const item = requests.get(params.requestId);
      if (!item) return;
      eventCount += 1;
      appendJsonl(files.events, { capturedAt: nowIso(), ...message });
      updateRequest(params.requestId, { requestExtraInfo: params });
      return;
    }

    if (message.method === "Network.responseReceived") {
      const params = message.params;
      if (!keepUrl(params.response?.url)) return;
      eventCount += 1;
      appendJsonl(files.events, { capturedAt: nowIso(), ...message });
      updateRequest(params.requestId, {
        response: params.response,
        status: params.response?.status,
        mimeType: params.response?.mimeType,
      });
      return;
    }

    if (message.method === "Network.responseReceivedExtraInfo") {
      const params = message.params;
      const item = requests.get(params.requestId);
      if (!item) return;
      eventCount += 1;
      appendJsonl(files.events, { capturedAt: nowIso(), ...message });
      updateRequest(params.requestId, { responseExtraInfo: params });
      return;
    }

    if (message.method === "Network.eventSourceMessageReceived") {
      const params = message.params;
      const item = requests.get(params.requestId);
      if (!item) return;
      eventCount += 1;
      sseCount += 1;
      const entry = { capturedAt: nowIso(), ...params };
      appendJsonl(files.events, { capturedAt: nowIso(), ...message });
      appendJsonl(files.sse, entry);

      if (!item.eventSourceMessages) item.eventSourceMessages = [];
      item.eventSourceMessages.push(params);
      updateRequest(params.requestId, item);

      if (params.eventName === "api_trace") {
        handlePayloadData(params.data);
      }
      status({ state: "running" });
      return;
    }

    if (message.method === "Network.loadingFinished") {
      const params = message.params;
      const item = requests.get(params.requestId);
      if (!item) return;
      eventCount += 1;
      appendJsonl(files.events, { capturedAt: nowIso(), ...message });
      updateRequest(params.requestId, {
        finishedAt: nowIso(),
        encodedDataLength: params.encodedDataLength,
      });
      call("Network.getResponseBody", { requestId: params.requestId }, {
        kind: "body",
        requestId: params.requestId,
      });
      status({ state: "running" });
      return;
    }

    if (message.method === "Network.loadingFailed") {
      const params = message.params;
      const item = requests.get(params.requestId);
      if (!item) return;
      eventCount += 1;
      appendJsonl(files.events, { capturedAt: nowIso(), ...message });
      updateRequest(params.requestId, {
        failedAt: nowIso(),
        failure: params,
      });
      status({ state: "running" });
    }
  });

  ws.on("close", () => {
    status({ state: "stopped", stoppedAt: nowIso() });
    process.exit(0);
  });

  ws.on("error", (error) => {
    status({ state: "error", error: error.message });
    process.exit(1);
  });

  setInterval(() => status({ state: "running" }), 5000);
}

start().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
