import type { VercelRequest, VercelResponse } from '@vercel/node';

const GRADING_RUBRIC = `NGUYÊN TẮC CHẤM BẮT BUỘC:
① CHỈ cho điểm khi ĐÃ VIẾT ĐỦ Ý. Thiếu ý → trừ điểm.
② YÊU CẦU ĐỘ DÀI: < 75% → trừ 0.25–0.5đ.
③ ĐỌC HIỂU: Đúng + đủ ý → tối đa. Thiếu ý → nửa điểm. Sai → 0đ.
④ NLXH: Kiểm tra bố cục/luận điểm/dẫn chứng/số chữ.
⑤ NLVH: Phân tích đúng/dẫn chứng trực tiếp/đủ luận điểm.
⑥ GIỚI HẠN: ≥2 lỗi → ≤7.0. ≥1 lỗi → ≤8.0. Tối đa 9.5.
⑦ Câu NLVH tối đa 90% thang điểm.`;

const AI_DETECTION = `⑧ PHÁT HIỆN AI: Chỉ quét NLXH/NLVH. Cơ chế: cần ≥1 dấu hiệu cấu trúc (A1/A2) + ≥2 dấu hiệu phụ (B1/B2/B3). Phạt 50% điểm câu vi phạm.`;

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

        const { prompt, fileBase64, fileMimeType, fileText } = req.body;
        const enhancedPrompt = prompt + `\n\n${GRADING_RUBRIC}\n\n${AI_DETECTION}`;
        const parts: any[] = [{ text: enhancedPrompt }];

        if (fileBase64 && fileMimeType) {
            parts.push({ inlineData: { mimeType: fileMimeType, data: fileBase64 } });
        } else if (fileText) {
            parts.push({ text: `\n--- NỘI DUNG VĂN BẢN ĐÍNH KÈM ---\n${fileText}\n---` });
        }

        const model = 'gemini-2.5-flash';
        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts }],
                    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
                }),
            }
        );

        if (!geminiRes.ok) {
            const errBody = await geminiRes.text().catch(() => '');
            return res.status(geminiRes.status).json({ error: `Gemini error: ${geminiRes.status}`, detail: errBody });
        }

        const data = await geminiRes.json();
        return res.json({ text: data.candidates?.[0]?.content?.parts?.[0]?.text || '' });
    } catch (error: any) {
        console.error('[GradeSubmission] Error:', error.message);
        return res.status(500).json({ error: error.message });
    }
}
