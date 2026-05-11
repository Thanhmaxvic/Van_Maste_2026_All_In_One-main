import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Vercel Serverless Proxy cho DeepSeek API.
 * Giải quyết lỗi Mixed Content (HTTPS → HTTP) khi deploy trên Vercel.
 * Frontend gọi /api/deepseek → proxy chuyển tiếp đến http://36.50.135.174:20128
 */

export const config = {
  maxDuration: 120, // Cho phép tối đa 120s (cần Vercel Pro cho > 10s)
};

// ── Cấu hình cứng DeepSeek endpoint ──
const DEEPSEEK_TARGET = 'http://36.50.135.174:20128/v1/chat/completions';
const DEEPSEEK_API_KEY = 'sk-1b3e1db5a7217c40-rdqzqx-8cdc26e7';

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
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

    const response = await fetch(DEEPSEEK_TARGET, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body,
    });

    const data = await response.text();

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(response.status).send(data);
  } catch (error: any) {
    console.error('[DeepSeek Proxy] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
