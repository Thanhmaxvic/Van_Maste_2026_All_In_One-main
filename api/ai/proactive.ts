import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 30 };

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

        const model = 'gemini-2.5-flash-lite';
        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] }),
            }
        );

        if (!geminiRes.ok) return res.json({ text: null });
        const data = await geminiRes.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
        return res.json({ text: text?.trim() || null });
    } catch (error: any) {
        console.error('[Proactive] Error:', error.message);
        return res.json({ text: null });
    }
}
