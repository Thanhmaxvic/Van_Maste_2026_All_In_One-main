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

const PRIMARY_MODEL = 'gemini-2.5-flash';

export const config = { maxDuration: 120 };

async function callWithRetry(apiKey: string, body: object): Promise<any> {
    for (let attempt = 0; attempt < 3; attempt++) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${PRIMARY_MODEL}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (res.ok) return res.json();
        if (res.status === 503 || res.status === 429) {
            console.warn(`[GradeSubmission] ${PRIMARY_MODEL} returned ${res.status}, retry ${attempt + 1}/3`);
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
            continue;
        }
        const errBody = await res.text().catch(() => '');
        throw { status: res.status, detail: errBody };
    }
    throw { status: 503, detail: 'All retries exhausted' };
}

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

        const data = await callWithRetry(apiKey, {
            contents: [{ role: 'user', parts }],
            generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
        });
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!text) {
            return res.json({ text: JSON.stringify({
                score: 0,
                maxScore: 10,
                feedback: 'AI không trả về kết quả chấm. Vui lòng thử lại hoặc giáo viên chấm thủ công.',
                details: 'Phản hồi AI trống — có thể do quá tải hoặc lỗi nội dung.',
                errors: [],
                improvements: [],
                weaknesses: [],
                strengths: []
            }) });
        }
        return res.json({ text });
    } catch (error: any) {
        const status = error?.status || 500;
        const detail = error?.detail || error?.message || 'Unknown error';
        console.error(`[GradeSubmission] Error (status=${status}):`, detail);
        return res.status(status).json({ error: `Gemini error: ${status}`, detail });
    }
}
