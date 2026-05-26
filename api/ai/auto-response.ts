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

        const { userMessage, chatHistory = [] } = req.body;
        const autoPrompt = `Bạn là trợ lý AI hỗ trợ tự động của "Ngữ Văn Master" – ôn thi tốt nghiệp THPT môn Ngữ Văn.
QUY TẮC: Chỉ trả lời về Ngữ Văn THPT. Từ chối lịch sự nếu hỏi môn khác. Ngắn gọn 3-4 câu.`;

        const historyText = chatHistory
            .slice(-6)
            .map((m: any) => `${m.role === 'student' ? 'Học sinh' : 'Trợ lý'}: ${m.content}`)
            .join('\n');
        const fullPrompt = `${autoPrompt}\n\nLịch sử:\n${historyText}\n\nHọc sinh: "${userMessage}"\n\nTrả lời:`;

        const model = 'gemini-2.5-flash-lite';
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15_000); // 15s timeout
        let geminiRes: Response;
        try {
            geminiRes = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] }),
                    signal: controller.signal,
                }
            );
        } catch (err: any) {
            if (err?.name === 'AbortError') return res.json({ text: null });
            throw err;
        } finally {
            clearTimeout(timer);
        }

        if (!geminiRes.ok) return res.json({ text: null });
        const data = await geminiRes.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
        return res.json({ text: text?.trim() || null });
    } catch (error: any) {
        console.error('[AutoResponse] Error:', error.message);
        return res.json({ text: null });
    }
}
