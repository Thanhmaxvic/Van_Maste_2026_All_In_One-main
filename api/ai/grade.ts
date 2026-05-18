import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callGemini, setCorsHeaders } from '../_shared/helpers';

export const config = { maxDuration: 120 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { prompt } = req.body;
        const result = await callGemini(
            { contents: [{ role: 'user', parts: [{ text: prompt }] }] },
        );
        return res.json({ text: result || '{}' });
    } catch (error: any) {
        console.error('[Grade] Error:', error.message);
        return res.status(500).json({ error: error.message });
    }
}
