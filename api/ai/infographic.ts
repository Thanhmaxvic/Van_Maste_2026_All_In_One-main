import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 60 };

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
        const model = 'gemini-3.1-flash-image-preview';
        const prompt = `Create a beautiful, professional educational infographic in Vietnamese about the Vietnamese literary work "${workTitle}". Include: author name, publication year, literary genre, main themes, plot summary, main characters, literary devices. Style: Modern educational poster, warm colors (gold, deep red, cream), Vietnamese cultural aesthetic. Text must be clear, readable Vietnamese.`;

        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
                }),
            }
        );

        if (!geminiRes.ok) return res.json({ imageUrl: null });
        const data = await geminiRes.json();
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
