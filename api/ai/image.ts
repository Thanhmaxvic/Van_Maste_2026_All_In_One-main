import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getApiKey, IMAGE_MODEL, setCorsHeaders } from '../_shared/helpers';

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const apiKey = getApiKey();
        if (!apiKey) return res.json({ imageUrl: null });

        const { prompt } = req.body;
        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
            }),
        });

        if (!geminiRes.ok) return res.json({ imageUrl: null });
        const data = await geminiRes.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
            if (part.inlineData?.mimeType?.startsWith('image/')) {
                return res.json({ imageUrl: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` });
            }
        }
        return res.json({ imageUrl: null });
    } catch (error: any) {
        console.error('[Image] Error:', error.message);
        return res.json({ imageUrl: null });
    }
}
