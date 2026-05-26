import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 30 };

const LITE_MODEL = 'gemini-2.5-flash-lite';
const FALLBACK_MODEL = 'gemini-2.5-flash';
const FETCH_TIMEOUT_MS = 15_000; // 15s per API call

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
    const models = [LITE_MODEL, FALLBACK_MODEL];
    for (const model of models) {
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                const res = await fetchWithTimeout(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                }, FETCH_TIMEOUT_MS);
                if (res.ok) return res.json();
                if (res.status === 503 || res.status === 429) {
                    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                    continue;
                }
                return null; // non-retryable
            } catch (err: any) {
                if (err?.name === 'AbortError') {
                    if (attempt < 1) continue;
                    break;
                }
                return null;
            }
        }
    }
    return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const apiKey = process.env.GOOGLE_API_KEY || '';
        if (!apiKey) return res.json({ text: null });

        const { messages = [], proactivePrompt, pronoun = 'thầy' } = req.body;
        const Pronoun = pronoun.charAt(0).toUpperCase() + pronoun.slice(1);
        const historyText = messages
            .slice(-6)
            .map((m: any) => `${m.role === 'user' ? 'Học sinh' : Pronoun}: ${m.content}`)
            .join('\n');
        const fullPrompt = `${proactivePrompt}\n\nLịch sử chat:\n${historyText}`;

        const data = await callWithRetry(apiKey, { contents: [{ parts: [{ text: fullPrompt }] }] });
        if (!data) return res.json({ text: null });
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
        return res.json({ text: text?.trim() || null });
    } catch (error: any) {
        console.error('[Proactive] Error:', error.message);
        return res.json({ text: null });
    }
}
