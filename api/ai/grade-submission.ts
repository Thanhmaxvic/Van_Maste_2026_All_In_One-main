import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getApiKey, PRIMARY_MODEL, GRADING_RUBRIC_PROMPT, AI_DETECTION_PROMPT, setCorsHeaders } from '../_shared/helpers';

export const config = { maxDuration: 120 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const apiKey = getApiKey();
        if (!apiKey) return res.status(500).json({ error: 'API_KEY_MISSING' });

        const { prompt, fileBase64, fileMimeType, fileText } = req.body;
        const enhancedPrompt = prompt + `\n\n${GRADING_RUBRIC_PROMPT}\n\n${AI_DETECTION_PROMPT}`;
        const parts: any[] = [{ text: enhancedPrompt }];

        if (fileBase64 && fileMimeType) {
            parts.push({ inlineData: { mimeType: fileMimeType, data: fileBase64 } });
        } else if (fileText) {
            parts.push({ text: `\n--- NỘI DUNG VĂN BẢN ĐÍNH KÈM ---\n${fileText}\n-----------------------------------\n` });
        }

        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${PRIMARY_MODEL}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts }],
                generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
            }),
        });

        if (!geminiRes.ok) throw new Error(`API error: ${geminiRes.status}`);
        const data = await geminiRes.json();
        return res.json({ text: data.candidates?.[0]?.content?.parts?.[0]?.text || '' });
    } catch (error: any) {
        console.error('[GradeSubmission] Error:', error.message);
        return res.status(500).json({ error: error.message });
    }
}
