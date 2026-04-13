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

// Gemini API (for Natural Language → ORYX mode)
const apiKey = "";
const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

const ORYX_SPEC_NATURAL = `
Eres un codificador de datos ORYX v0.3. Tu única tarea es convertir la descripción en lenguaje natural a formato ORYX COMPACTO.

Reglas:
1. Usa sintaxis tabular para listas: coleccion[N]{clave1,clave2}:\n  val1, val2
2. Indentación de dos espacios.
3. Usa @alias para claves largas: @alias { firstName: fn }
4. Sin comillas a menos que el string contenga comas.
5. Devuelve SOLO el texto ORYX, sin explicaciones.
`;

// UI refs
const naturalInput  = document.getElementById('naturalInput');
const oryxOutput    = document.getElementById('oryxOutput');
const jsonOutput    = document.getElementById('jsonOutput');
const convertButton = document.getElementById('convertButton');
const reverseButton = document.getElementById('reverseButton');
const buttonText    = document.getElementById('buttonText');
const btnIcon       = document.getElementById('btnIcon');
const spinner       = document.getElementById('spinner');
const downloadOryx  = document.getElementById('downloadOryx');
const downloadJson  = document.getElementById('downloadJson');
const emptyState    = document.getElementById('emptyState');
const resultsArea   = document.getElementById('resultsArea');
const engineStatus  = document.getElementById('engineStatus');
const savingsPct    = document.getElementById('savingsPct');
const savingsBar    = document.getElementById('savingsBar');
const oryxTokenBadge = document.getElementById('oryxTokenBadge');
const jsonTokenBadge = document.getElementById('jsonTokenBadge');
const oryxTokenCount = document.getElementById('oryxTokenCount');
const jsonTokenCount = document.getElementById('jsonTokenCount');
const inputLabel    = document.getElementById('inputLabel');
const oryxPanel     = document.getElementById('oryxPanel');

// Current mode: 'json' | 'natural'
window.currentMode = 'json';

// Tab switcher
window.setTab = function(mode) {
  window.currentMode = mode;
  const tabNatural = document.getElementById('tabNatural');
  const tabJson    = document.getElementById('tabJson');

  if (mode === 'natural') {
    tabNatural.className = tabNatural.className.replace('tab-inactive', 'tab-active');
    tabJson.className    = tabJson.className.replace('tab-active', 'tab-inactive');
    inputLabel.textContent = 'natural language';
    naturalInput.placeholder = 'Describe your data in plain language...\ne.g. "A list of 3 products with id, name, price and stock"';
    buttonText.textContent = 'Generate ORYX';
    btnIcon.textContent = 'smart_toy';
    reverseButton.classList.remove('hidden');
  } else {
    tabJson.className    = tabJson.className.replace('tab-inactive', 'tab-active');
    tabNatural.className = tabNatural.className.replace('tab-active', 'tab-inactive');
    inputLabel.textContent = 'input.json';
    naturalInput.placeholder = 'Paste JSON here to convert to ORYX...';
    buttonText.textContent = 'Convert JSON → ORYX';
    btnIcon.textContent = 'auto_awesome';
    reverseButton.classList.add('hidden');
  }
};

function countTokens(text) {
  if (!text) return 0;
  return text.match(/[^\s,;:{}\[\]"']+|[,;:{}\[\]"']/g)?.length || 0;
}

function oryxToJson(oryxText) {
  const v = validate(oryxText);
  if (!v.valid) return `// Parse error: ${v.error}`;
  const parsed = parse(oryxText);
  if (parsed === null) return '// Could not parse ORYX.';
  return JSON.stringify(parsed, null, 2);
}

function jsonToOryx(jsonText) {
  try {
    const obj = JSON.parse(jsonText);
    return { result: encode(obj, { aliases: true }) };
  } catch (e) {
    return { error: e.message };
  }
}

async function callGemini(userPrompt) {
  const payload = {
    contents: [{ parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: ORYX_SPEC_NATURAL }] },
  };
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Error: empty response.';
    } catch (err) {
      if (i < 2) await new Promise(r => setTimeout(r, Math.pow(2, i + 1) * 1000));
    }
  }
  return 'Error: could not reach Gemini API.';
}

function showLoading(label) {
  convertButton.disabled = true;
  if (reverseButton) reverseButton.disabled = true;
  spinner.classList.remove('hidden');
  btnIcon.classList.add('hidden');
  buttonText.textContent = label;
  engineStatus.textContent = 'Processing…';
  downloadOryx.disabled = true;
  downloadJson.disabled = true;
}

function stopLoading() {
  convertButton.disabled = false;
  if (reverseButton) reverseButton.disabled = false;
  spinner.classList.add('hidden');
  btnIcon.classList.remove('hidden');
  engineStatus.textContent = 'Engine ready';
}

function showResults(oryxText, jsonText) {
  // Show results area
  emptyState.classList.add('hidden');
  resultsArea.classList.remove('hidden');
  resultsArea.classList.add('flex');

  // ORYX output
  oryxOutput.textContent = oryxText;
  Prism.highlightElement(oryxOutput);

  // JSON output
  jsonOutput.textContent = jsonText;
  Prism.highlightElement(jsonOutput);

  const isError = jsonText.startsWith('//') || oryxText.startsWith('Error');

  if (isError) {
    oryxPanel.classList.add('error-border');
    savingsPct.textContent = 'Parse error';
    savingsBar.style.width = '0%';
    oryxTokenBadge.textContent = '—';
    jsonTokenBadge.textContent = '—';
    oryxTokenCount.textContent = '';
    jsonTokenCount.textContent = '';
    downloadOryx.disabled = true;
    downloadJson.disabled = true;
  } else {
    oryxPanel.classList.remove('error-border');
    const ot = countTokens(oryxText);
    const jt = countTokens(jsonText);
    const pct = jt > 0 ? Math.round(((jt - ot) / jt) * 100) : 0;

    savingsPct.textContent = `${pct}% saved`;
    savingsBar.style.width = `${Math.max(0, pct)}%`;
    oryxTokenBadge.textContent = `${ot} TOKENS`;
    jsonTokenBadge.textContent = `${jt} TOKENS`;
    oryxTokenCount.textContent = `ORYX: ${ot} tokens`;
    jsonTokenCount.textContent = `JSON: ${jt} tokens`;

    downloadOryx.disabled = false;
    downloadJson.disabled = false;

    // wire download buttons
    downloadOryx.onclick = () => downloadFile('data.oryx', oryxText);
    downloadJson.onclick = () => downloadFile('data.json', jsonText);
  }
}

window.handleConversion = async function(mode) {
  const input = naturalInput.value.trim();
  if (!input) return;

  if (mode === 'json') {
    showLoading('Converting…');
    const { result, error } = jsonToOryx(input);
    if (error) {
      showResults('', `// Invalid JSON: ${error}`);
    } else {
      const jsonBack = oryxToJson(result);
      showResults(result, jsonBack);
    }
    stopLoading();
    buttonText.textContent = 'Convert JSON → ORYX';
  } else {
    if (!apiKey) {
      showResults('', '// Add your Gemini API key in src/main.js to use Natural Language mode.');
      stopLoading();
      buttonText.textContent = 'Generate ORYX';
      return;
    }
    showLoading('Generating with AI…');
    const oryxText = await callGemini(`Convert to ORYX v0.3: ${input}`);
    const jsonText = oryxText.startsWith('Error')
      ? `// ${oryxText}`
      : oryxToJson(oryxText);
    showResults(oryxText, jsonText);
    stopLoading();
    buttonText.textContent = 'Generate ORYX';
  }
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
