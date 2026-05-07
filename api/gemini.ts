import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
  maxDuration: 60,   // Node.js Serverless: up to 60s on Hobby tier (vs 10s on Edge)
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.VITE_GOOGLE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing API Key' });
    }

    const model = (req.query.model as string) || 'gemini-3-flash-preview';

    // Body is already parsed by Vercel for JSON content-type
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

    const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    const data = await response.text();

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(response.status).send(data);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
