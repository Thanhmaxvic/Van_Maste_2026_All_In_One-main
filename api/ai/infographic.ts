import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 60 };

const IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
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

async function callImageWithRetry(apiKey: string, body: object): Promise<any> {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${apiKey}`;
            const res = await fetchWithTimeout(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            }, FETCH_TIMEOUT_MS);
            if (res.ok) return res.json();
            if (res.status === 503 || res.status === 429) {
                console.warn(`[Infographic] ${IMAGE_MODEL} returned ${res.status}, retry ${attempt + 1}/2`);
                await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
                continue;
            }
            return null;
        } catch (err: any) {
            if (err?.name === 'AbortError') {
                console.warn(`[Infographic] ${IMAGE_MODEL} timed out (attempt ${attempt + 1}/2)`);
                if (attempt < 1) continue;
            }
            return null;
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
        if (!apiKey) return res.json({ imageUrl: null });

        const { workTitle } = req.body;
        const prompt = `Create a beautiful, professional educational infographic in Vietnamese about the Vietnamese literary work "${workTitle}". Include: author name, publication year, literary genre, main themes, plot summary, main characters, literary devices. Style: Modern educational poster, warm colors (gold, deep red, cream), Vietnamese cultural aesthetic. Text must be clear, readable Vietnamese.`;

        const data = await callImageWithRetry(apiKey, {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
        });

        if (!data) return res.json({ imageUrl: null });
        const parts = data.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
            if (part.inlineData?.mimeType?.startsWith('image/')) {
                return res.json({ imageUrl: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` });
            }
        }
        return res.json({ imageUrl: null });
    } catch (error: any) {
        console.error('[Infographic] Error:', error.message);
        return res.json({ imageUrl: null });
    }
}
