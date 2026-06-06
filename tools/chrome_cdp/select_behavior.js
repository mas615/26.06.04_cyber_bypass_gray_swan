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
  const rawWaveLabel = argValue("--wave");
  const waveLabel = rawWaveLabel && !rawWaveLabel.startsWith("Wave ") ? `Wave ${rawWaveLabel}` : rawWaveLabel;
  const dateHint = argValue("--date-hint", waveLabel === "Wave 2" ? "Jun 4" : "May 30");
  const behaviorName = argValue("--behavior");
  if (!waveLabel || !behaviorName) throw new Error("Usage: --wave \"Wave 1\" --behavior \"CrushFTP\"");

  const tabs = await getTabs();
  const tab = tabs.find((item) => item.type === "page" && item.url.includes("app.grayswan.ai"));
  if (!tab) throw new Error("No app.grayswan.ai page tab found");

  const result = await evaluate(tab, pageFnString(async (waveLabel, dateHint, behaviorName) => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const textOf = (element) => (element.innerText || element.textContent || element.getAttribute("aria-label") || "").trim();
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const controls = () => Array.from(document.querySelectorAll("button,[role=button],[role=option],a")).filter(visible);
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
    const find = (predicate) => controls().find((element) => predicate(element, textOf(element)));

    if (!find((_, text) => text.includes(waveLabel) && text.includes(dateHint))) {
      const settings = find((element, text) =>
        element.getAttribute("aria-label") === "Open challenge settings panel" ||
        text.includes("Wave 1") ||
        text.includes("Wave 2")
      );
      if (settings) await click(settings, 900);
    }

    const wave = find((_, text) => text.includes(waveLabel) && text.includes(dateHint));
    if (wave) await click(wave, 1600);

    const behavior = find((_, text) => {
      const firstLine = text.split("\n")[0].trim();
      return firstLine === behaviorName || text === behaviorName || text.startsWith(`${behaviorName}\n`);
    });
    if (behavior) await click(behavior, 900);

    const save = find((element, text) =>
      text === "Save" || element.getAttribute("aria-label") === "Save changes and apply settings"
    );
    if (save) await click(save, 1500);

    const cancelSettings = find((element, text) =>
      text === "Cancel" ||
      text === "Close" ||
      element.getAttribute("aria-label") === "Close challenge settings panel" ||
      element.getAttribute("aria-label") === "Close"
    );
    if (cancelSettings) await click(cancelSettings, 700);

    const close = find((element, text) =>
      text === "Hide behavior details" ||
      text === "Close behavior criteria" ||
      element.getAttribute("aria-label") === "Hide behavior details" ||
      element.getAttribute("aria-label") === "Close behavior criteria"
    );
    if (close) await click(close, 600);

    const open = find((element, text) =>
      text === "Task Details" ||
      text === "Behavior Criteria" ||
      text === "Show behavior details" ||
      element.getAttribute("aria-label") === "Show behavior details" ||
      element.getAttribute("aria-label") === "Open behavior criteria"
    );
    if (open) await click(open, 900);

    const body = document.body.innerText;
    const detailStart = body.lastIndexOf(`Submit to Judges\n${behaviorName}`);
    return {
      clicked: { wave: Boolean(wave), behavior: Boolean(behavior), save: Boolean(save), close: Boolean(close), open: Boolean(open) },
      url: location.href,
      selectedWave: (body.match(/(Wave \d+)\n[^\n]+\nEarth Capybara Legendary/) || [])[1] || "",
      selectedTop: (body.match(/Wave \d+\n([^\n]+)\nEarth Capybara Legendary/) || [])[1] || "",
      detailVerified: detailStart >= 0,
      detail: detailStart >= 0 ? body.slice(detailStart, detailStart + 1200) : "",
    };
  }, waveLabel, dateHint, behaviorName));

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
