import type { VercelRequest, VercelResponse } from '@vercel/node';

const GRADING_RUBRIC = `HƯỚNG DẪN CHUNG:
- Đáp án theo yêu cầu đánh giá năng lực → đánh giá theo hướng mở, khuyến khích sáng tạo, tránh áp đặt.
- Bài làm có ý tưởng riêng → xem xét tính thuyết phục để chấm hợp lí.
- Câu trả lời sai hoặc không trả lời → 0 điểm.

NGUYÊN TẮC CHẤM BẮT BUỘC:
NGUYÊN TẮC VÀNG: Bài làm THPT trung bình thực tế đạt 4.0–6.0/10. Bài khá đạt 6.5–7.5. Bài giỏi đạt 7.5–8.5. Chỉ bài xuất sắc toàn diện mới đạt 8.5+.
① CHỈ cho điểm khi ĐÃ VIẾT ĐỦ Ý. Thiếu ý → trừ điểm. Suy đoán "ý ngầm" là SAI.
② ĐỌC HIỂU: Đối chiếu TỪNG Ý trong đáp án. Đúng+đủ → tối đa. Thiếu ý → 50–75%. Chung chung → 25–50%. Sai → 0đ.
③ CÂU VIẾT ĐOẠN — NLXH (2.0đ): (a) YC chung 0.5đ: vấn đề nghị luận 0.25đ + hình thức đoạn văn+dung lượng 100-300 chữ 0.25đ (không đáp ứng 1/2 → 0đ phần a). (b) YC cụ thể 1.25đ: chấm theo đáp án. (c) Sáng tạo 0.25đ: ý đột phá hoặc diễn đạt tinh tế. (d) Trừ lỗi: 4-6 lỗi −0.5đ, 7-8 lỗi −0.75đ, >8 lỗi không quá 1.0đ cả câu. SÀN: có làm bài nhưng trừ>nội dung → 0.25đ.
④ CÂU VIẾT BÀI — NLVH (4.0đ): (a) YC chung 1.0đ: vấn đề 0.25đ + dung lượng 400-800 chữ 0.25đ + bằng chứng thuyết phục 0.25đ + bằng chứng đời sống/đọc hiểu 0.25đ. (b) YC cụ thể 2.5đ: chấm theo đáp án. (c) Sáng tạo 0.5đ: ý mới 0.25đ + diễn đạt 0.25đ. (d) Trừ lỗi: 6-8 lỗi −0.5đ, 9-12 lỗi −1.0đ, >12 lỗi không quá 2.0đ cả câu. SÀN: có làm bài nhưng trừ>nội dung → 0.25đ.
⑤ GIỚI HẠN: ≥3 lỗi → ≤5.0. ≥2 lỗi → ≤7.0. ≥1 lỗi → ≤8.0. Tối đa 9.5. Điểm 8.5+ phải xuất sắc MỌI tiêu chí.
⑥ TỰ KIỂM TRA: Nếu score>7.0 mà có lỗi → hạ điểm. Nếu score>8.0 bài phải KHÔNG thiếu sót. Kiểm tra NLXH: a+b+c−d. Kiểm tra NLVH: a+b+c−d. Áp dụng sàn 0.25đ nếu cần.`;

const AI_DETECTION = `⑨ PHÁT HIỆN AI: Chỉ quét NLXH/NLVH. Cơ chế: cần ≥1 dấu hiệu cấu trúc (A1/A2) + ≥2 dấu hiệu phụ (B1/B2/B3). Phạt 50% điểm câu vi phạm.`;

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
