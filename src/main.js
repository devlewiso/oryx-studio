import { parse, encode, validate } from 'oryx-parser';

// Prism language definition for ORYX syntax highlighting
Prism.languages.oryx = {
  'comment':           { pattern: /(^|[^\\:])#.*/, lookbehind: true, greedy: true },
  'directive':         { pattern: /@alias|@block/, alias: 'comment' },
  'collection-header': { pattern: /(\w+)\[\d+\]\{.*?\}:/, alias: 'selector' },
  'key':               { pattern: /[\w\s-]+(?=\s*:)/, alias: 'property' },
  'boolean':           /\b(?:true|false)\b/,
  'number':            /\b\d+(\.\d+)?\b/,
  'string':            { pattern: /"(?:\\.|[^"\\])*"/, greedy: true },
};

const apiKey = "";
const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

// UI elements
const naturalInput   = document.getElementById('naturalInput');
const oryxOutput     = document.getElementById('oryxOutput');
const jsonOutput     = document.getElementById('jsonOutput');
const convertButton  = document.getElementById('convertButton');
const reverseButton  = document.getElementById('reverseButton');
const buttonText     = document.getElementById('buttonText');
const spinner        = document.getElementById('spinner');
const tokenSavings   = document.getElementById('tokenSavings');
const downloadOryx   = document.getElementById('downloadOryx');
const downloadJson   = document.getElementById('downloadJson');

function countTokens(text) {
  if (!text) return 0;
  return text.match(/[^\s,;:{}\[\]"']+|[,;:{}\[\]"']/g)?.length || 0;
}

const ORYX_SPEC_NATURAL = `
  Eres un codificador de datos ORYX v0.1. Tu única tarea es convertir la descripción de datos en lenguaje natural a la representación de datos ORYX COMPACTA, utilizando la sintaxis exacta.

  Reglas clave de la sintaxis ORYX v0.1 para la respuesta:
  1. Prioriza la sintaxis tabular (ej: 'coleccion[N]{clave1,clave2}:\n  1, valorA, valorB') para listas de objetos.
  2. Utiliza indentación de dos espacios.
  3. Aplica el bloque @alias para reducir claves largas (ej: 'productos[N]{i,n,p}'). Si usas alias, defínelo primero: '@alias { id:i, nombre:n }'.
  4. No uses comillas a menos que un string contenga comas o caracteres ambiguos.
  5. Genera SOLAMENTE el texto en formato ORYX, sin ninguna explicación, introducción o texto adicional.

  Ejemplo de salida tabular:
  @alias { id:i, nombre:n }
  usuarios[2]{i,n,activo}:
    1, Luis, true
    2, Ana, false
`;

function oryxToJson(oryxText) {
  const result = validate(oryxText);
  if (!result.valid) {
    return `{"error": "ORYX inválido: ${result.error}"}`;
  }
  const parsed = parse(oryxText);
  if (parsed === null) {
    return `{"error": "No se pudo parsear el ORYX."}`;
  }
  return JSON.stringify(parsed, null, 2);
}

function jsonToOryx(jsonText) {
  let obj;
  try {
    obj = JSON.parse(jsonText);
  } catch {
    return { error: 'JSON inválido. Verifica la sintaxis.' };
  }
  try {
    return { result: encode(obj, { aliases: true }) };
  } catch (e) {
    return { error: `Error al codificar: ${e.message}` };
  }
}

async function callGemini(systemPrompt, userPrompt) {
  const payload = {
    contents: [{ parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      return result.candidates?.[0]?.content?.parts?.[0]?.text || 'Error: Respuesta vacía.';
    } catch (err) {
      console.error(`Intento ${attempt + 1} fallido:`, err);
      if (attempt < 2) await new Promise(r => setTimeout(r, Math.pow(2, attempt + 1) * 1000));
    }
  }
  return 'Error al generar el formato ORYX.';
}

function showLoading(label) {
  convertButton.disabled = true;
  reverseButton.disabled = true;
  spinner.classList.remove('hidden');
  buttonText.textContent = label;
  oryxOutput.textContent = '';
  jsonOutput.textContent = '';
  tokenSavings.classList.add('hidden');
  oryxOutput.classList.remove('error-border');
  downloadOryx.disabled = true;
  downloadJson.disabled = true;
}

function stopLoading(naturalLabel) {
  convertButton.disabled = false;
  reverseButton.disabled = false;
  spinner.classList.add('hidden');
  buttonText.textContent = naturalLabel;
}

function displayResults(oryxText, jsonText) {
  oryxOutput.textContent = oryxText;
  Prism.highlightElement(oryxOutput);
  jsonOutput.textContent = jsonText;
  Prism.highlightElement(jsonOutput);

  if (jsonText.includes('"error"')) {
    tokenSavings.textContent = 'Parse error — revisa la sintaxis ORYX';
    tokenSavings.classList.remove('hidden', 'bg-green-900', 'text-green-300');
    tokenSavings.classList.add('bg-red-900', 'text-red-300');
    oryxOutput.classList.add('error-border');
  } else {
    const oryxTokens = countTokens(oryxText);
    const jsonTokens = countTokens(jsonText);
    const savings = jsonTokens > 0 ? Math.round(((jsonTokens - oryxTokens) / jsonTokens) * 100) : 0;
    tokenSavings.textContent = `Ahorro: ${savings}%`;
    tokenSavings.classList.remove('hidden', 'bg-red-900', 'text-red-300');
    tokenSavings.classList.add('bg-green-900', 'text-green-300');
    downloadOryx.disabled = false;
    downloadJson.disabled = false;
  }
}

async function handleConversion(mode) {
  const input = naturalInput.value.trim();
  if (!input) {
    jsonOutput.textContent = 'Por favor, ingresa datos para comenzar la conversión.';
    return;
  }

  if (mode === 'json') {
    // JSON → ORYX: 100% local con oryx-parser, sin API call
    showLoading('Convirtiendo JSON → ORYX...');
    const { result, error } = jsonToOryx(input);
    if (error) {
      oryxOutput.textContent = '';
      jsonOutput.textContent = error;
      stopLoading('🔄 Convertir ORYX (Desde JSON Pegado)');
      return;
    }
    const jsonBack = oryxToJson(result);
    displayResults(result, jsonBack);
    stopLoading('🔄 Convertir ORYX (Desde JSON Pegado)');
  } else {
    // Natural language → ORYX: usa Gemini
    showLoading('Generando ORYX desde Lenguaje Natural...');
    const oryxText = await callGemini(
      ORYX_SPEC_NATURAL,
      `Convierte esta descripción a ORYX v0.1: ${input}`
    );
    const jsonText = oryxText.startsWith('Error')
      ? 'No se pudo validar el JSON debido al error de generación ORYX.'
      : oryxToJson(oryxText);
    displayResults(oryxText, jsonText);
    stopLoading('🤖 Generar ORYX (Desde Lenguaje Natural)');
  }
}

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Exponer funciones al HTML (onclick attrs)
window.handleConversion = handleConversion;
window.downloadFile = downloadFile;
