import { parse, encode, validate } from 'oryx-parser';

// Prism language definition for ORYX
Prism.languages.oryx = {
  'comment':           { pattern: /(^|[^\\:])#.*/, lookbehind: true, greedy: true },
  'directive':         { pattern: /@alias|@block/, alias: 'keyword' },
  'collection-header': { pattern: /\w+\[\d*\]\{.*?\}:/, alias: 'selector' },
  'key':               { pattern: /[\w-]+(?=\s*:)/, alias: 'property' },
  'boolean':           /\b(?:true|false|null)\b/,
  'number':            /\b-?\d+(\.\d+)?\b/,
  'string':            { pattern: /"(?:\\.|[^"\\])*"/, greedy: true },
};

// UI refs
const naturalInput   = document.getElementById('naturalInput');
const oryxOutput     = document.getElementById('oryxOutput');
const jsonOutput     = document.getElementById('jsonOutput');
const convertButton  = document.getElementById('convertButton');
const buttonText     = document.getElementById('buttonText');
const btnIcon        = document.getElementById('btnIcon');
const spinner        = document.getElementById('spinner');
const downloadOryx   = document.getElementById('downloadOryx');
const downloadJson   = document.getElementById('downloadJson');
const emptyState     = document.getElementById('emptyState');
const resultsArea    = document.getElementById('resultsArea');
const engineStatus   = document.getElementById('engineStatus');
const savingsPct     = document.getElementById('savingsPct');
const savingsBar     = document.getElementById('savingsBar');
const oryxTokenBadge = document.getElementById('oryxTokenBadge');
const jsonTokenBadge = document.getElementById('jsonTokenBadge');
const oryxTokenCount = document.getElementById('oryxTokenCount');
const jsonTokenCount = document.getElementById('jsonTokenCount');
const inputLabel     = document.getElementById('inputLabel');
const oryxPanel      = document.getElementById('oryxPanel');
const oryxHeader     = document.getElementById('oryxHeader');
const jsonHeader     = document.getElementById('jsonHeader');

// Mode: 'json-to-oryx' | 'oryx-to-json'
window.currentMode = 'json-to-oryx';

const PLACEHOLDERS = {
  'json-to-oryx': `{
  "users": [
    { "id": 1, "name": "Alice", "role": "admin" },
    { "id": 2, "name": "Bob",   "role": "user"  }
  ],
  "config": {
    "host": "localhost",
    "port": 3000,
    "active": true
  }
}`,
  'oryx-to-json': `users[2]{id,name,role}:
  1, Alice, admin
  2, Bob,   user

config:
  host: localhost
  port: 3000
  active: true`,
};

window.setTab = function(mode) {
  window.currentMode = mode;
  const tabA = document.getElementById('tabJsonToOryx');
  const tabB = document.getElementById('tabOryxToJson');

  if (mode === 'json-to-oryx') {
    tabA.className = tabA.className.replace('tab-inactive', 'tab-active');
    tabB.className = tabB.className.replace('tab-active', 'tab-inactive');
    inputLabel.textContent = 'input.json';
    naturalInput.placeholder = PLACEHOLDERS['json-to-oryx'];
    buttonText.textContent = 'Convert JSON → ORYX';
    btnIcon.textContent = 'auto_awesome';
    oryxHeader.textContent = 'ORYX Output';
    jsonHeader.textContent = 'JSON Equivalent';
  } else {
    tabB.className = tabB.className.replace('tab-inactive', 'tab-active');
    tabA.className = tabA.className.replace('tab-active', 'tab-inactive');
    inputLabel.textContent = 'input.oryx';
    naturalInput.placeholder = PLACEHOLDERS['oryx-to-json'];
    buttonText.textContent = 'Parse ORYX → JSON';
    btnIcon.textContent = 'data_object';
    oryxHeader.textContent = 'ORYX Input';
    jsonHeader.textContent = 'JSON Output';
  }
  // Reset output on tab switch
  emptyState.classList.remove('hidden');
  resultsArea.classList.add('hidden');
  resultsArea.classList.remove('flex');
  naturalInput.value = '';
};

function countTokens(text) {
  if (!text) return 0;
  return text.match(/[^\s,;:{}\[\]"']+|[,;:{}\[\]"']/g)?.length || 0;
}

function jsonToOryx(jsonText) {
  try {
    const obj = JSON.parse(jsonText);
    return { result: encode(obj, { aliases: true }) };
  } catch (e) {
    return { error: `Invalid JSON: ${e.message}` };
  }
}

function oryxToJson(oryxText) {
  const v = validate(oryxText);
  if (!v.valid) return { error: v.error };
  const parsed = parse(oryxText);
  if (parsed === null) return { error: 'Could not parse ORYX.' };
  return { result: JSON.stringify(parsed, null, 2) };
}

function showLoading() {
  convertButton.disabled = true;
  spinner.classList.remove('hidden');
  btnIcon.classList.add('hidden');
  engineStatus.textContent = 'Processing…';
}

function stopLoading() {
  convertButton.disabled = false;
  spinner.classList.add('hidden');
  btnIcon.classList.remove('hidden');
  engineStatus.textContent = 'Engine ready';
}

function showResults(leftText, rightText, isError) {
  emptyState.classList.add('hidden');
  resultsArea.classList.remove('hidden');
  resultsArea.classList.add('flex');

  oryxOutput.textContent = leftText;
  Prism.highlightElement(oryxOutput);

  jsonOutput.textContent = rightText;
  Prism.highlightElement(jsonOutput);

  if (isError) {
    oryxPanel.classList.add('error-border');
    savingsPct.textContent = 'Error';
    savingsBar.style.width = '0%';
    oryxTokenBadge.textContent = '—';
    jsonTokenBadge.textContent = '—';
    oryxTokenCount.textContent = '';
    jsonTokenCount.textContent = '';
    downloadOryx.disabled = true;
    downloadJson.disabled = true;
  } else {
    oryxPanel.classList.remove('error-border');
    const lt = countTokens(leftText);
    const rt = countTokens(rightText);
    // savings relative to JSON (the bigger one)
    const jsonTokens = window.currentMode === 'json-to-oryx' ? rt : lt;
    const oryxTokens = window.currentMode === 'json-to-oryx' ? lt : rt;
    const pct = jsonTokens > 0 ? Math.round(((jsonTokens - oryxTokens) / jsonTokens) * 100) : 0;

    savingsPct.textContent = `${pct}% saved`;
    savingsBar.style.width = `${Math.max(0, pct)}%`;
    oryxTokenBadge.textContent = `${oryxTokens} TOKENS`;
    jsonTokenBadge.textContent = `${jsonTokens} TOKENS`;
    oryxTokenCount.textContent = `ORYX: ${oryxTokens} tokens`;
    jsonTokenCount.textContent = `JSON: ${jsonTokens} tokens`;

    downloadOryx.disabled = false;
    downloadJson.disabled = false;
    downloadOryx.onclick = () => downloadFile('data.oryx', leftText);
    downloadJson.onclick = () => downloadFile('data.json', rightText);
  }
}

window.handleConversion = function() {
  const input = naturalInput.value.trim();
  if (!input) return;

  showLoading();

  if (window.currentMode === 'json-to-oryx') {
    const { result, error } = jsonToOryx(input);
    if (error) {
      showResults(`// ${error}`, '', true);
    } else {
      const { result: jsonBack } = oryxToJson(result);
      showResults(result, jsonBack ?? '', false);
    }
  } else {
    const { result, error } = oryxToJson(input);
    if (error) {
      showResults(input, `// Parse error: ${error}`, true);
    } else {
      showResults(input, result, false);
    }
  }

  stopLoading();
};

window.copyToClipboard = function(id) {
  const text = document.getElementById(id)?.textContent;
  if (text) navigator.clipboard?.writeText(text);
};

function downloadFile(filename, content) {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([content], { type: 'text/plain' })),
    download: filename,
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
window.downloadFile = downloadFile;
