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

function send(ws, id, method, params) {
  ws.send(JSON.stringify(params === undefined ? { id, method } : { id, method, params }));
}

async function evaluate(tab, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    let id = 0;
    const pending = new Map();

    const call = (method, params) => {
      id += 1;
      pending.set(id, { method });
      send(ws, id, method, params);
      return id;
    };

    ws.on("open", () => {
      call("Runtime.enable");
      call("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
    });

    ws.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (!message.id || !pending.has(message.id)) return;

      const request = pending.get(message.id);
      pending.delete(message.id);

      if (request.method !== "Runtime.evaluate") return;
      ws.close();

      if (message.error) {
        reject(new Error(JSON.stringify(message.error)));
        return;
      }
      resolve(message.result?.result?.value ?? message.result?.result ?? message.result);
    });

    ws.on("error", reject);
  });
}

async function main() {
  const tabs = await getTabs();

  if (args.includes("--list")) {
    console.log(JSON.stringify(tabs.map((tab) => ({
      id: tab.id,
      type: tab.type,
      title: tab.title,
      url: tab.url,
    })), null, 2));
    return;
  }

  const match = argValue("--match", "");
  const expression = argValue("--expr", "({title:document.title,url:location.href,text:document.body?.innerText ?? ''})");
  const tab = tabs.find((item) => item.type === "page" && (!match || item.url.includes(match) || item.title.includes(match)));

  if (!tab) {
    throw new Error(`No matching page tab found for: ${match}`);
  }

  const value = await evaluate(tab, expression);
  console.log(JSON.stringify(value, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
