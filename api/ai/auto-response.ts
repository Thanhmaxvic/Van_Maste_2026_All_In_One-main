import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callGeminiLite, CHAT_AUTO_RESPONDER_PROMPT, setCorsHeaders } from '../_shared/helpers';

export const config = { maxDuration: 30 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { userMessage, chatHistory = [] } = req.body;
        const historyText = chatHistory
            .slice(-6)
            .map((m: any) => `${m.role === 'student' ? 'Học sinh' : 'Trợ lý'}: ${m.content}`)
            .join('\n');
        const fullPrompt = `${CHAT_AUTO_RESPONDER_PROMPT}\n\nLịch sử chat gần đây:\n${historyText}\n\nHọc sinh vừa gửi: "${userMessage}"\n\nTrả lời ngắn gọn:`;

        const result = await callGeminiLite(
            { contents: [{ parts: [{ text: fullPrompt }] }] }
        );
        return res.json({ text: result?.trim() || null });
    } catch (error: any) {
        console.error('[AutoResponse] Error:', error.message);
        return res.json({ text: null });
    }
}
