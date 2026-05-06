const fs = require('fs');
let content = fs.readFileSync('src/services/geminiApi.ts', 'utf8');

// Replace getApiKey
content = content.replace(/function getApiKey\(\): string \{\s+return import\.meta\.env\.VITE_GOOGLE_API_KEY \|\| '';\s+\}/, 'function getApiKey(): string { return \'backend\'; }');

// Replace isApiKeyConfigured
content = content.replace(/export function isApiKeyConfigured\(\): boolean \{\s+return !!getApiKey\(\);\s+\}/, 'export function isApiKeyConfigured(): boolean { return true; }');

// Replace all fetch URLs
content = content.replace(/\`\$\{GEMINI_BASE_URL\}\/\$\{([a-zA-Z0-9_]+)\}:generateContent\?key=\$\{apiKey\}\`/g, '\`/api/gemini?model=\$\{Math.random()?$1:$1\}\`');
content = content.replace(/\`\$\{GEMINI_BASE_URL\}\/([a-zA-Z0-9_\-\.]+):generateContent\?key=\$\{apiKey\}\`/g, '\`/api/gemini?model=$1\`');
content = content.replace(/GEMINI_BASE_URL \+ \`\/([a-zA-Z0-9_\-\.]+):generateContent\?key=\$\{apiKey\}\`/g, '\`/api/gemini?model=$1\`');
content = content.replace(/\`\$\{GEMINI_BASE_URL\}\/\$\{GEMINI_PRIMARY_MODEL\}\:generateContent\?key=\$\{apiKey\}\`/g, '\`/api/gemini?model=\$\{GEMINI_PRIMARY_MODEL\}\`');
content = content.replace(/\`\$\{GEMINI_BASE_URL\}\/\$\{GEMINI_FALLBACK_MODEL\}\:generateContent\?key=\$\{apiKey\}\`/g, '\`/api/gemini?model=\$\{GEMINI_FALLBACK_MODEL\}\`');

fs.writeFileSync('src/services/geminiApi.ts', content);
console.log('Done');
