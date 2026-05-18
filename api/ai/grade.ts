import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 120 };

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
        const model = 'gemini-2.5-flash';

        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
            }
        );

        if (!geminiRes.ok) {
            const errBody = await geminiRes.text().catch(() => '');
            return res.status(geminiRes.status).json({ error: `Gemini error: ${geminiRes.status}`, detail: errBody });
        }

        const data = await geminiRes.json();
        return res.json({ text: data.candidates?.[0]?.content?.parts?.[0]?.text || '{}' });
    } catch (error: any) {
        console.error('[Grade] Error:', error.message);
        return res.status(500).json({ error: error.message });
    }
}
