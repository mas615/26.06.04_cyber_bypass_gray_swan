const WebSocket = require("ws");

const endpoint = process.env.CDP_ENDPOINT || "http://127.0.0.1:9222";
const args = process.argv.slice(2);

function argValue(name, fallback = "") {
  const index = args.indexOf(name);
  if (index < 0 || index + 1 >= args.length) return fallback;
  return args[index + 1];
}

async function getTabs() {
  const response = await fetch(`${endpoint}/json/list`);
  if (!response.ok) throw new Error(`CDP tab list failed: ${response.status}`);
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
    };

    ws.on("open", () => {
      call("Runtime.enable");
      call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    });

    ws.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (!message.id || !pending.has(message.id)) return;
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (request.method !== "Runtime.evaluate") return;
      ws.close();
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result?.result?.value ?? message.result?.result ?? message.result);
    });

    ws.on("error", reject);
  });
}

function pageFnString(fn, ...fnArgs) {
  return `(${fn.toString()})(...${JSON.stringify(fnArgs)})`;
}

async function main() {
  const prompt = argValue("--prompt");
  const waitMs = Number(argValue("--wait-ms", "3500"));
  const newChat = args.includes("--new-chat");
  if (!prompt) throw new Error("Missing --prompt");

  const tabs = await getTabs();
  const tab = tabs.find((item) => item.type === "page" && item.url.includes("app.grayswan.ai"));
  if (!tab) throw new Error("No app.grayswan.ai page tab found");

  const result = await evaluate(tab, pageFnString(async (prompt, waitMs, newChat) => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const textOf = (element) => (element.innerText || element.textContent || element.getAttribute("aria-label") || "").trim();
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const buttons = () => Array.from(document.querySelectorAll("button,[role=button],a")).filter(visible);
    const click = async (element, wait = 900) => {
      element.scrollIntoView({ block: "center", inline: "center" });
      element.click();
      await sleep(wait);
    };

    if (newChat) {
      const newChatButton = buttons().find((element) => textOf(element) === "New Chat" || element.getAttribute("aria-label") === "New Chat");
      if (newChatButton) await click(newChatButton, 1800);
    }

    const textarea = document.querySelector("textarea");
    if (!textarea) return { ok: false, error: "no textarea", url: location.href };

    textarea.focus();
    textarea.value = prompt;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(500);

    const submit = Array.from(document.querySelectorAll("button")).find(
      (button) => textOf(button) === "Submit Chat" || button.getAttribute("aria-label") === "Submit Chat"
    );
    if (submit) {
      submit.click();
      await sleep(waitMs);
    }

    return {
      ok: Boolean(submit),
      url: location.href,
      prompt,
      textTail: document.body.innerText.slice(-3000),
    };
  }, prompt, waitMs, newChat));

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
