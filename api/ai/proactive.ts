import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callGeminiLite, setCorsHeaders } from '../_shared/helpers';

export const config = { maxDuration: 30 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { messages = [], proactivePrompt, pronoun = 'thầy' } = req.body;
        const Pronoun = pronoun.charAt(0).toUpperCase() + pronoun.slice(1);
        const historyText = messages
            .slice(-6)
            .map((m: any) => `${m.role === 'user' ? 'Học sinh' : Pronoun}: ${m.content}`)
            .join('\n');
        const fullPrompt = `${proactivePrompt}\n\nLịch sử chat:\n${historyText}`;
        const result = await callGeminiLite(
            { contents: [{ parts: [{ text: fullPrompt }] }] }
        );
        return res.json({ text: result?.trim() || null });
    } catch (error: any) {
        console.error('[Proactive] Error:', error.message);
        return res.json({ text: null });
    }
}
