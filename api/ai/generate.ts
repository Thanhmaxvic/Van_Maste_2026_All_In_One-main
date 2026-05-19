import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 60 };

const LITE_MODEL = 'gemini-2.5-flash-lite';
const FALLBACK_MODEL = 'gemini-2.5-flash';

async function callWithRetry(apiKey: string, body: object): Promise<{ data: any } | null> {
    const models = [LITE_MODEL, FALLBACK_MODEL];
    for (const model of models) {
        for (let attempt = 0; attempt < 2; attempt++) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (res.ok) return { data: await res.json() };
            if (res.status === 503 || res.status === 429) {
                console.warn(`[Generate] ${model} returned ${res.status}, retry ${attempt + 1}/2`);
                await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
                continue;
            }
            // Non-retryable error
            const errBody = await res.text().catch(() => '');
            throw { status: res.status, detail: errBody };
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

        const { prompt, temperature } = req.body;

        const body: any = { contents: [{ parts: [{ text: prompt }] }] };
        if (temperature != null) body.generationConfig = { temperature };

        const result = await callWithRetry(apiKey, body);
        const data = result!.data;
        return res.json({ text: data.candidates?.[0]?.content?.parts?.[0]?.text || '' });
    } catch (error: any) {
        const status = error?.status || 500;
        const detail = error?.detail || error?.message || 'Unknown error';
        console.error(`[Generate] Error (status=${status}):`, detail);
        return res.status(status).json({ error: `Gemini error: ${status}`, detail });
    }
}
