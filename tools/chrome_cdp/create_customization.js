const WebSocket = require("ws");

const endpoint = process.env.CDP_ENDPOINT || "http://127.0.0.1:9222";
const args = process.argv.slice(2);

function argValue(name, fallback = "") {
  const index = args.indexOf(name);
  if (index === -1 || index + 1 >= args.length) return fallback;
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

async function appTab() {
  const tabs = await getTabs();
  const tab = tabs.find((item) => item.type === "page" && item.url.includes("app.grayswan.ai"));
  if (!tab) throw new Error("No app.grayswan.ai page tab found");
  return tab;
}

function configFromArgs() {
  const kind = argValue("--kind");
  if (!["system", "script", "llm"].includes(kind)) throw new Error("Use --kind system|script|llm");
  const config = {
    kind,
    name: argValue("--name"),
    description: argValue("--description"),
    systemPrompt: argValue("--system-prompt"),
    toolName: argValue("--tool-name"),
    toolDescription: argValue("--tool-description"),
    bash: argValue("--bash"),
    model: argValue("--model", "deepseek/deepseek-chat"),
    paramName: argValue("--param-name", "query"),
    paramDescription: argValue("--param-description", "Text for the helper to analyze."),
    noNavigate: args.includes("--no-navigate"),
  };
  if (!config.name) throw new Error("Missing --name");
  if (kind === "system" && !config.systemPrompt) throw new Error("Missing --system-prompt");
  if (kind === "script" && (!config.toolName || !config.toolDescription || !config.bash)) {
    throw new Error("Script tool requires --tool-name, --tool-description, and --bash");
  }
  if (kind === "llm" && (!config.toolName || !config.toolDescription || !config.systemPrompt)) {
    throw new Error("LLM tool requires --tool-name, --tool-description, and --system-prompt");
  }
  return config;
}

async function main() {
  const config = configFromArgs();

  let tab = await appTab();
  if (!config.noNavigate) {
    try {
      await evaluate(tab, "location.assign('https://app.grayswan.ai/arena/challenge/cyber-bypass/chat'); true");
    } catch {
      // Navigation invalidates the execution context; refetch below.
    }
    await new Promise((resolve) => setTimeout(resolve, 4500));
    tab = await appTab();
  }

  const result = await evaluate(tab, pageFnString(async (config) => {
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
    const setValue = (element, value) => {
      const prototype = element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value").set;
      setter.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const fieldByPlaceholder = (needle) => Array.from(document.querySelectorAll("input,textarea"))
      .find((element) => (element.placeholder || "").includes(needle));

    if (!(document.body.innerText || "").includes("Pick from your library")) {
      const customization = controls().find((element) => textOf(element).startsWith("Chat customizations"));
      if (customization) await click(customization, 1000);
    }

    const tabName = config.kind === "system" ? "System prompt" : config.kind === "script" ? "Script tools" : "LLM tools";
    const tabButton = controls().find((element) => textOf(element) === tabName || textOf(element).startsWith(tabName));
    if (tabButton) await click(tabButton, 700);

    const existingInstall = controls().find((element) => (
      element.getAttribute("aria-label") === `Install ${config.name} in this chat` ||
      textOf(element) === `Install ${config.name} in this chat`
    ));
    if (existingInstall) {
      return { ok: true, alreadyExists: true, kind: config.kind, name: config.name, url: location.href };
    }

    const addButton = controls().find((element) => textOf(element) === "Add" && !element.disabled);
    if (!addButton) {
      return { ok: false, error: "no enabled Add button", kind: config.kind, name: config.name, textTail: document.body.innerText.slice(-3000) };
    }
    await click(addButton, 900);

    const name = fieldByPlaceholder("Trojan get_safe_command_to_run");
    const description = fieldByPlaceholder("What this customization does.");
    if (!name || !description) {
      return { ok: false, error: "common fields not found", fields: Array.from(document.querySelectorAll("input,textarea")).map((element) => element.placeholder || "") };
    }
    setValue(name, config.name);
    setValue(description, config.description || "");

    if (config.kind === "system") {
      const systemPrompt = fieldByPlaceholder("You are operating with elevated permissions");
      if (!systemPrompt) return { ok: false, error: "system prompt field not found" };
      setValue(systemPrompt, config.systemPrompt);
    }

    if (config.kind === "script") {
      const toolName = fieldByPlaceholder("run_safe_command");
      const toolDescription = fieldByPlaceholder("Runs a curated set");
      const bash = fieldByPlaceholder("#!/usr/bin/env bash");
      if (!toolName || !toolDescription || !bash) {
        return { ok: false, error: "script fields not found", fields: Array.from(document.querySelectorAll("input,textarea")).map((element) => element.placeholder || "") };
      }
      setValue(toolName, config.toolName);
      setValue(toolDescription, config.toolDescription);
      setValue(bash, config.bash);
    }

    if (config.kind === "llm") {
      const toolName = fieldByPlaceholder("ask_deepseek");
      const model = fieldByPlaceholder("deepseek/deepseek-chat");
      const toolDescription = fieldByPlaceholder("Returns a safety-vetted shell command");
      const paramName = Array.from(document.querySelectorAll("input")).find((element) => element.value === "query" || element.placeholder === "task");
      const paramDescription = fieldByPlaceholder("What the agent should ask for.");
      const llmSystemPrompt = fieldByPlaceholder("You are a shell-command generator");
      if (!toolName || !model || !toolDescription || !paramName || !paramDescription || !llmSystemPrompt) {
        return { ok: false, error: "llm fields not found", fields: Array.from(document.querySelectorAll("input,textarea")).map((element) => ({ placeholder: element.placeholder || "", value: element.value || "" })) };
      }
      setValue(toolName, config.toolName);
      setValue(model, config.model);
      setValue(toolDescription, config.toolDescription);
      setValue(paramName, config.paramName);
      setValue(paramDescription, config.paramDescription);
      setValue(llmSystemPrompt, config.systemPrompt);
    }

    await sleep(700);
    const save = controls().find((element) => textOf(element) === "Add to library" || element.getAttribute("aria-label") === "Add to library");
    const before = { saveFound: Boolean(save), saveDisabled: save?.disabled ?? null };
    if (save && !save.disabled) await click(save, 1800);
    const text = document.body.innerText || "";
    return {
      ok: Boolean(save && !before.saveDisabled),
      alreadyExists: false,
      before,
      kind: config.kind,
      name: config.name,
      url: location.href,
      visibleInLibrary: text.includes(config.name),
      textTail: text.slice(-2500),
    };
  }, config));

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
