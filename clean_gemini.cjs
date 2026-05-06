const fs = require('fs');
let content = fs.readFileSync('src/services/geminiApi.ts', 'utf8');
content = content.replace(/\$\{Math\.random\(\)\?([a-zA-Z0-9_]+):([a-zA-Z0-9_]+)\}/g, '\$\{$1\}');
fs.writeFileSync('src/services/geminiApi.ts', content);
console.log('Cleaned');
