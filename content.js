/**
 * content.js
 *
 * Content script injected into claude.ai pages. Responsibilities:
 *  1. Detect the chat input area and count tokens as the user types
 *  2. Observe the conversation for new assistant responses and count their tokens
 *  3. Render a floating widget showing live costs and session totals
 *
 * Response detection strategy (selector-agnostic):
 *  - Snapshot the full conversation text when the user sends a message
 *  - Watch for DOM mutations (streaming)
 *  - Once mutations stop for 2s, snapshot again
 *  - The difference = the new response text
 */

(() => {
  "use strict";

  const PRICING = {
    "opus-4":       { input: 15.0,  output: 75.0,  label: "Opus 4" },
    "sonnet-4":     { input: 3.0,   output: 15.0,  label: "Sonnet 4" },
    "haiku-3.5":    { input: 0.8,   output: 4.0,   label: "Haiku 3.5" },
  };
  const DEFAULT_MODEL = "sonnet-4";

  let state = {
    model: DEFAULT_MODEL,
    inputTokens: 0,
    outputTokens: 0,
    totalInputCost: 0,
    totalOutputCost: 0,
    turns: 0,
    currentInputTokens: 0,
    lastOutputTokens: 0,
    lastOutputCost: 0,
  };

  chrome.storage.local.get(["selectedModel"], (result) => {
    if (result.selectedModel && PRICING[result.selectedModel]) {
      state.model = result.selectedModel;
      updateWidget();
    }
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.selectedModel) {
      state.model = changes.selectedModel.newValue;
      updateWidget();
    }
  });

  function calcCost(tokens, ratePerMillion) {
    return tokens * ratePerMillion / 1_000_000;
  }

  function formatCost(amount) {
    if (amount === 0) return "$0.00";
    if (amount < 0.0001) return `$${amount.toFixed(6)}`;
    if (amount < 0.01)   return `$${amount.toFixed(5)}`;
    if (amount < 1)      return `$${amount.toFixed(4)}`;
    return `$${amount.toFixed(3)}`;
  }

  function formatNumber(n) {
    return n.toLocaleString();
  }

  function createWidget() {
    const widget = document.createElement("div");
    widget.id = "ctt-widget";
    widget.innerHTML = `
      <div id="ctt-header">
        <span id="ctt-title">Token Tracker</span>
        <span id="ctt-model-badge"></span>
        <button id="ctt-toggle" title="Minimize">−</button>
      </div>
      <div id="ctt-body">
        <div id="ctt-live-section">
          <div class="ctt-label">Current Input</div>
          <div class="ctt-row">
            <span id="ctt-live-tokens">0</span>
            <span class="ctt-unit">tokens</span>
            <span id="ctt-live-cost" class="ctt-cost">$0.00</span>
          </div>
        </div>
        <div id="ctt-response-section" class="ctt-hidden">
          <div class="ctt-label">Last Response</div>
          <div class="ctt-row">
            <span id="ctt-resp-tokens">0</span>
            <span class="ctt-unit">tokens</span>
            <span id="ctt-resp-cost" class="ctt-cost">$0.00</span>
          </div>
        </div>
        <div id="ctt-divider"></div>
        <div id="ctt-session-section">
          <div class="ctt-label">Session Total</div>
          <div class="ctt-row">
            <span class="ctt-session-label">In:</span>
            <span id="ctt-total-in">0</span>
            <span class="ctt-unit">tokens</span>
          </div>
          <div class="ctt-row">
            <span class="ctt-session-label">Out:</span>
            <span id="ctt-total-out">0</span>
            <span class="ctt-unit">tokens</span>
          </div>
          <div class="ctt-row ctt-total-row">
            <span class="ctt-session-label">Cost:</span>
            <span id="ctt-total-cost" class="ctt-cost-total">$0.00</span>
          </div>
          <div class="ctt-row ctt-turns-row">
            <span id="ctt-turns">0 turns</span>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(widget);

    const toggle = widget.querySelector("#ctt-toggle");
    const body = widget.querySelector("#ctt-body");
    toggle.addEventListener("click", () => {
      body.classList.toggle("ctt-hidden");
      toggle.textContent = body.classList.contains("ctt-hidden") ? "+" : "−";
    });

    makeDraggable(widget, widget.querySelector("#ctt-header"));
    return widget;
  }

  function makeDraggable(element, handle) {
    let offsetX, offsetY, isDragging = false;

    handle.addEventListener("mousedown", (e) => {
      if (e.target.id === "ctt-toggle") return;
      isDragging = true;
      offsetX = e.clientX - element.getBoundingClientRect().left;
      offsetY = e.clientY - element.getBoundingClientRect().top;
      handle.style.cursor = "grabbing";
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      element.style.left = (e.clientX - offsetX) + "px";
      element.style.top = (e.clientY - offsetY) + "px";
      element.style.right = "auto";
      element.style.bottom = "auto";
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
      handle.style.cursor = "grab";
    });
  }

  function updateWidget() {
    const pricing = PRICING[state.model];
    if (!pricing) return;

    const el = (id) => document.getElementById(id);

    const badge = el("ctt-model-badge");
    if (badge) badge.textContent = pricing.label;

    const currentCost = calcCost(state.currentInputTokens, pricing.input);
    el("ctt-live-tokens").textContent = formatNumber(state.currentInputTokens);
    el("ctt-live-cost").textContent = formatCost(currentCost);

    const respSection = el("ctt-response-section");
    if (state.turns > 0) {
      respSection.classList.remove("ctt-hidden");
      el("ctt-resp-tokens").textContent = formatNumber(state.lastOutputTokens);
      el("ctt-resp-cost").textContent = formatCost(state.lastOutputCost);
    }

    const totalCost = state.totalInputCost + state.totalOutputCost;
    el("ctt-total-in").textContent = formatNumber(state.inputTokens);
    el("ctt-total-out").textContent = formatNumber(state.outputTokens);
    el("ctt-total-cost").textContent = formatCost(totalCost);
    el("ctt-turns").textContent = `${state.turns} turn${state.turns !== 1 ? "s" : ""}`;
  }

  const INPUT_SELECTORS = [
    "div.ProseMirror[contenteditable='true']",
    "fieldset div[contenteditable='true']",
    "form div[contenteditable='true']",
    "form textarea",
    "div[contenteditable='true']",
    "textarea",
  ];

  let currentInput = null;
  let inputDebounceTimer = null;

  function findInputElement() {
    for (const selector of INPUT_SELECTORS) {
      const el = document.querySelector(selector);
      if (el && !el.closest("#ctt-widget")) return el;
    }
    return null;
  }

  function getInputText(el) {
    if (el.tagName === "TEXTAREA") return el.value;
    return el.innerText || el.textContent || "";
  }

  function onInputChange() {
    clearTimeout(inputDebounceTimer);
    inputDebounceTimer = setTimeout(() => {
      if (!currentInput) return;
      const text = getInputText(currentInput);
      state.currentInputTokens = ClaudeTokenizer.countTokens(text);
      updateWidget();
    }, 150);
  }

  function attachInputListener() {
    const el = findInputElement();
    if (el === currentInput) return;
    if (currentInput) currentInput.removeEventListener("input", onInputChange);
    currentInput = el;
    if (el) el.addEventListener("input", onInputChange);
  }

  function getConversationText() {
    const candidates = [
      document.querySelector("main [role='presentation']"),
      document.querySelector("main [role='log']"),
      document.querySelector("main [role='main']"),
      document.querySelector("[class*='conversation']"),
      document.querySelector("[class*='chat-messages']"),
      document.querySelector("[class*='messages']"),
      document.querySelector("main"),
    ];

    for (const el of candidates) {
      if (el) {
        const text = el.innerText || "";
        if (text.length > 20) return text;
      }
    }

    let bestEl = null;
    let bestLen = 0;
    const blocks = document.querySelectorAll("main div, main section, main article");
    for (const el of blocks) {
      if (el.closest("#ctt-widget")) continue;
      const len = (el.innerText || "").length;
      if (len > bestLen) { bestLen = len; bestEl = el; }
    }

    return bestEl ? (bestEl.innerText || "") : "";
  }

  let lastInputTokenSnapshot = 0;
  let conversationSnapshotBeforeSend = "";
  let waitingForResponse = false;
  let streamingTimer = null;
  let lastMutationTime = 0;

  function onMessageSent() {
    if (lastInputTokenSnapshot > 0) {
      const pricing = PRICING[state.model];
      const cost = calcCost(lastInputTokenSnapshot, pricing.input);
      state.inputTokens += lastInputTokenSnapshot;
      state.totalInputCost += cost;
      state.turns += 1;
      state.currentInputTokens = 0;
      lastInputTokenSnapshot = 0;
      conversationSnapshotBeforeSend = getConversationText();
      waitingForResponse = true;
      console.log("[Token Tracker] Message sent. Waiting for response...");
      updateWidget();
    }
  }

  setInterval(() => {
    if (!currentInput) return;
    const text = getInputText(currentInput).trim();
    if (state.currentInputTokens > 2) lastInputTokenSnapshot = state.currentInputTokens;
    if (text.length === 0 && lastInputTokenSnapshot > 0) onMessageSent();
  }, 300);

  function processResponse() {
    if (!waitingForResponse) return;

    const currentConversation = getConversationText();
    let responseText = "";

    if (conversationSnapshotBeforeSend && currentConversation.length > conversationSnapshotBeforeSend.length) {
      responseText = currentConversation.slice(conversationSnapshotBeforeSend.length).trim();
    } else {
      responseText = currentConversation;
    }

    if (responseText.length > 5) {
      const tokens = ClaudeTokenizer.countTokens(responseText);
      const pricing = PRICING[state.model];
      const cost = calcCost(tokens, pricing.output);
      state.lastOutputTokens = tokens;
      state.lastOutputCost = cost;
      state.outputTokens += tokens;
      state.totalOutputCost += cost;
      console.log(`[Token Tracker] Response: ~${tokens} tokens, cost: ${formatCost(cost)}`);
      updateWidget();
    }

    waitingForResponse = false;
    conversationSnapshotBeforeSend = "";
  }

  function setupResponseObserver() {
    const observer = new MutationObserver((mutations) => {
      const isOurWidget = mutations.every((m) => m.target.closest && m.target.closest("#ctt-widget"));
      if (isOurWidget) return;
      lastMutationTime = Date.now();
      if (waitingForResponse) {
        clearTimeout(streamingTimer);
        streamingTimer = setTimeout(() => {
          console.log("[Token Tracker] Streaming ended. Processing response...");
          processResponse();
        }, 2000);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  setInterval(() => {
    if (!waitingForResponse) return;
    const timeSinceLastMutation = Date.now() - lastMutationTime;
    if (timeSinceLastMutation > 3000 && lastMutationTime > 0) {
      const currentText = getConversationText();
      if (currentText.length > conversationSnapshotBeforeSend.length + 50) {
        console.log("[Token Tracker] Fallback: detected response via polling.");
        processResponse();
      }
    }
  }, 2000);

  function init() {
    console.log("[Token Tracker] Initializing on claude.ai...");
    createWidget();
    updateWidget();
    attachInputListener();
    setupResponseObserver();
    conversationSnapshotBeforeSend = getConversationText();
    setInterval(attachInputListener, 2000);
    console.log("[Token Tracker] Ready.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
