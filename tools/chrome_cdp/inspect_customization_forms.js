const WebSocket = require("ws");

const endpoint = process.env.CDP_ENDPOINT || "http://127.0.0.1:9222";

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

function pageFnString(fn, ...args) {
  return `(${fn.toString()})(...${JSON.stringify(args)})`;
}

async function appTab() {
  const tabs = await getTabs();
  const tab = tabs.find((item) => item.type === "page" && item.url.includes("app.grayswan.ai"));
  if (!tab) throw new Error("No app.grayswan.ai page tab found");
  return tab;
}

async function main() {
  let tab = await appTab();
  try {
    await evaluate(tab, "location.assign('https://app.grayswan.ai/arena/challenge/cyber-bypass/chat'); true");
  } catch {
    // Navigation invalidates the execution context; refetch below.
  }
  await new Promise((resolve) => setTimeout(resolve, 4500));
  tab = await appTab();

  const result = await evaluate(tab, pageFnString(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const textOf = (element) => (element.innerText || element.textContent || element.getAttribute("aria-label") || "").trim();
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const controls = () => Array.from(document.querySelectorAll("button,[role=button],a")).filter(visible);
    const click = async (element, wait = 800) => {
      element.scrollIntoView({ block: "center", inline: "center" });
      await sleep(100);
      const rect = element.getBoundingClientRect();
      const clientX = rect.left + rect.width / 2;
      const clientY = rect.top + rect.height / 2;
      element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX, clientY }));
      element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX, clientY }));
      element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX, clientY }));
      element.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX, clientY }));
      await sleep(wait);
    };

    const openCustomizations = async () => {
      if ((document.body.innerText || "").includes("Pick from your library")) return;
      const button = controls().find((element) => textOf(element).startsWith("Chat customizations"));
      if (button) await click(button, 1000);
    };
    await openCustomizations();

    const out = { url: location.href, tabs: {} };
    for (const tabName of ["System prompt", "Script tools", "LLM tools"]) {
      const tabButton = controls().find((element) => textOf(element) === tabName || textOf(element).startsWith(tabName));
      if (tabButton) await click(tabButton, 600);
      const addButton = controls().find((element) => textOf(element) === "Add" && !element.disabled);
      if (addButton) await click(addButton, 900);
      await sleep(500);
      out.tabs[tabName] = {
        fields: Array.from(document.querySelectorAll("input, textarea")).map((element, index) => ({
          index,
          tag: element.tagName,
          placeholder: element.placeholder || "",
          value: element.value || "",
          aria: element.getAttribute("aria-label") || "",
        })),
        buttons: controls().map((element) => ({
          text: textOf(element),
          aria: element.getAttribute("aria-label") || "",
          disabled: Boolean(element.disabled),
        })).slice(-30),
        textTail: (document.body.innerText || "").slice(-3000),
      };
      const cancel = controls().reverse().find((element) => ["Cancel", "Close"].includes(textOf(element)));
      if (cancel) await click(cancel, 700);
    }
    return out;
  }));

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
