import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callGeminiLite, setCorsHeaders } from '../_shared/helpers';

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { prompt, temperature } = req.body;
        const result = await callGeminiLite(
            { contents: [{ parts: [{ text: prompt }] }] },
            temperature != null ? { temperature } : undefined,
        );
        return res.json({ text: result || '' });
    } catch (error: any) {
        console.error('[Generate] Error:', error.message);
        return res.status(500).json({ error: error.message });
    }
}
