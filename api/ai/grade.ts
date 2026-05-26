import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 60 };

const PRIMARY_MODEL = 'gemini-2.5-flash';
const FETCH_TIMEOUT_MS = 30_000; // 30s per API call

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function callWithRetry(apiKey: string, body: object): Promise<any> {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${PRIMARY_MODEL}:generateContent?key=${apiKey}`;
            const res = await fetchWithTimeout(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            }, FETCH_TIMEOUT_MS);
            if (res.ok) return res.json();
            if (res.status === 503 || res.status === 429) {
                console.warn(`[Grade] ${PRIMARY_MODEL} returned ${res.status}, retry ${attempt + 1}/2`);
                await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                continue;
            }
            const errBody = await res.text().catch(() => '');
            throw { status: res.status, detail: errBody };
        } catch (err: any) {
            if (err?.name === 'AbortError') {
                console.warn(`[Grade] ${PRIMARY_MODEL} timed out (attempt ${attempt + 1}/2)`);
                if (attempt < 1) continue;
            }
            throw err;
        }
    }
    throw { status: 503, detail: 'All retries exhausted' };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const apiKey = process.env.GOOGLE_API_KEY || '';
        if (!apiKey) return res.status(500).json({ error: 'Missing API Key' });

        const { prompt } = req.body;

        const data = await callWithRetry(apiKey, {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!text) {
            // AI returned empty response — return a structured fallback grade
            return res.json({ text: JSON.stringify({
                score: 0,
                maxScore: 10,
                feedback: 'AI không trả về kết quả chấm. Vui lòng thử lại hoặc giáo viên chấm thủ công.',
                details: 'Phản hồi AI trống — có thể do quá tải hoặc lỗi nội dung.',
                errors: [],
                improvements: [],
                weaknesses: [],
                strengths: []
            }) });
        }
        return res.json({ text });
    } catch (error: any) {
        const status = error?.status || 500;
        const detail = error?.detail || error?.message || 'Unknown error';
        console.error(`[Grade] Error (status=${status}):`, detail);
        return res.status(status).json({ error: `Gemini error: ${status}`, detail });
    }
}
