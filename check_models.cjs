const https = require('https');
const fs = require('fs');

// Read API key from .env
const envContent = fs.readFileSync('.env', 'utf8');
const match = envContent.match(/GOOGLE_API_KEY=([^\r\n]+)/);
if (!match) {
  console.error("No GOOGLE_API_KEY found in .env");
  process.exit(1);
}
const apiKey = match[1];

const options = {
  hostname: 'generativelanguage.googleapis.com',
  port: 443,
  path: `/v1beta/models?key=${apiKey}`,
  method: 'GET'
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.models) {
        console.log("Available Models:");
        parsed.models.forEach(m => {
           console.log(`- ${m.name} (version: ${m.version}, displayName: ${m.displayName})`);
        });
      } else {
        console.log("Error or no models:", parsed);
      }
    } catch (e) {
      console.error("Error parsing JSON", e);
    }
  });
});

req.on('error', (e) => {
  console.error("Request error:", e);
});

req.end();
