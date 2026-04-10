/**
 * popup.js
 *
 * Handles the extension popup — lets the user select which Claude model
 * they're using so cost estimates match the actual pricing tier.
 */

const PRICING = {
  "opus-4":    { input: 15.0, output: 75.0 },
  "sonnet-4":  { input: 3.0,  output: 15.0 },
  "haiku-3.5": { input: 0.8,  output: 4.0 },
};

const modelSelect = document.getElementById("model-select");
const priceInput  = document.getElementById("price-input");
const priceOutput = document.getElementById("price-output");

function updatePricingDisplay(model) {
  const p = PRICING[model];
  if (!p) return;
  priceInput.textContent  = `$${p.input.toFixed(2)} / MTok`;
  priceOutput.textContent = `$${p.output.toFixed(2)} / MTok`;
}

chrome.storage.local.get(["selectedModel"], (result) => {
  if (result.selectedModel) {
    modelSelect.value = result.selectedModel;
    updatePricingDisplay(result.selectedModel);
  }
});

modelSelect.addEventListener("change", () => {
  const model = modelSelect.value;
  chrome.storage.local.set({ selectedModel: model });
  updatePricingDisplay(model);
});
