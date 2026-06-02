import type { VercelRequest, VercelResponse } from '@vercel/node';

const GRADING_RUBRIC = `HƯỚNG DẪN CHUNG:
- Đáp án theo yêu cầu đánh giá năng lực → đánh giá theo hướng mở, khuyến khích sáng tạo, tránh áp đặt.
- Bài làm có ý tưởng riêng → xem xét tính thuyết phục để chấm hợp lí.
- Câu trả lời sai hoặc không trả lời → 0 điểm.
- LƯU Ý: CHỈ ÁP DỤNG nguyên tắc tương ứng với phần CÓ TRONG ĐỀ. Đề chỉ Đọc hiểu → bỏ qua ③④. Đề chỉ Viết → bỏ qua ②. maxScore = tổng điểm thực tế của đề.

NGUYÊN TẮC CHẤM BẮT BUỘC:
⓪ ĐƠN VỊ ĐIỂM NHỎ NHẤT LÀ 0.25đ (QUY TẮC CỨNG): Đơn vị điểm nhỏ nhất cho bất kỳ ý nhỏ, ý thành phần (b1/b2/b3), tiêu chí (a/b/c/d), điểm tổng từng câu hay điểm tổng toàn bài BẮT BUỘC phải là 0.25đ hoặc bội số của 0.25đ (tức là chỉ được dùng các mức: 0.0đ, 0.25đ, 0.5đ, 0.75đ, 1.0đ, 1.25đ, 1.5đ, v.v.). TUYỆT ĐỐI KHÔNG tự ý chia nhỏ điểm thành các mức lẻ như 0.1đ, 0.15đ, 0.2đ, 0.3đ, 0.35đ, 0.4đ, v.v. Mỗi ý nhỏ/tiêu chí nhỏ chỉ có thể được chấm điểm trọn vẹn của ý đó (ví dụ 0.25đ hoặc 0.5đ) hoặc 0.0đ nếu học sinh không làm được/thiếu ý.
① CHỈ cho điểm khi ĐÃ VIẾT ĐỦ Ý. Thiếu ý → trừ điểm. Suy đoán "ý ngầm" là SAI.
② ĐỌC HIỂU: Đối chiếu TỪNG Ý trong đáp án. Đúng+đủ → tối đa. Thiếu ý → 50–75%. Chung chung → 25–50%. Sai → 0đ.
③ CÂU VIẾT ĐOẠN — NLXH (2.0đ): (a) YC chung 0.5đ: vấn đề nghị luận 0.25đ + hình thức đoạn văn+dung lượng 100-300 chữ 0.25đ (không đáp ứng 1/2 → 0đ phần a). (b) YC cụ thể 1.25đ: chấm theo đáp án. (c) Sáng tạo 0.25đ: ý đột phá hoặc diễn đạt tinh tế. (d) Trừ lỗi: 4-6 lỗi −0.5đ, 7-8 lỗi −0.75đ, >8 lỗi không quá 1.0đ cả câu. SÀN: có làm bài nhưng trừ>nội dung → 0.25đ.
④ CÂU VIẾT BÀI — NLVH (4.0đ): (a) YC chung 1.0đ: vấn đề 0.25đ + dung lượng 400-800 chữ 0.25đ + bằng chứng thuyết phục 0.25đ + bằng chứng đời sống/đọc hiểu 0.25đ. (b) YC cụ thể 2.5đ: chấm theo đáp án. (c) Sáng tạo 0.5đ: ý mới 0.25đ + diễn đạt 0.25đ. (d) Trừ lỗi: 6-8 lỗi −0.5đ, 9-12 lỗi −1.0đ, >12 lỗi không quá 2.0đ cả câu. SÀN: có làm bài nhưng trừ>nội dung → 0.25đ.
⑤ TỰ KIỂM TRA: Kiểm tra NLXH: a+b+c−d. Kiểm tra NLVH: a+b+c−d. Áp dụng sàn 0.25đ nếu cần. Nếu giám khảo thật đọc bài này, họ có cho điểm này không?`;

const AI_DETECTION = `⑨ PHÁT HIỆN AI: Chỉ quét NLXH/NLVH. Cơ chế: cần ≥1 dấu hiệu cấu trúc (A1/A2) + ≥2 dấu hiệu phụ (B1/B2/B3). Phạt 50% điểm câu vi phạm.`;

const PRIMARY_MODEL = 'gemini-2.5-flash';

export const config = { maxDuration: 60 };

const FETCH_TIMEOUT_MS = 50_000; // 50s per API call (within 60s Vercel limit)

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function callWithRetry(apiKey: string, body: object): Promise<any> {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${PRIMARY_MODEL}:generateContent?key=${apiKey}`;
            const res = await fetchWithTimeout(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            }, FETCH_TIMEOUT_MS);
            if (res.ok) return res.json();

            const errBody = await res.text().catch(() => '');

            // Retry on transient errors: 503, 429, or 500 with "aborted" (Gemini server-side abort)
            const isRetryable = res.status === 503 || res.status === 429 ||
                (res.status === 500 && errBody.toLowerCase().includes('aborted'));

            if (isRetryable && attempt < 1) {
                console.warn(`[GradeSubmission] ${PRIMARY_MODEL} returned ${res.status} (retryable), retry ${attempt + 1}/2`);
                await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                continue;
            }

            throw { status: res.status, detail: errBody };
        } catch (err: any) {
            if (err?.name === 'AbortError') {
                console.warn(`[GradeSubmission] ${PRIMARY_MODEL} timed out (attempt ${attempt + 1}/2)`);
                if (attempt < 1) continue;
            }
            throw err;
        }
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

        // On timeout/overload/aborted, return a graceful fallback grade instead of HTTP error
        const detailStr = typeof detail === 'string' ? detail.toLowerCase() : '';
        if (status === 504 || status === 503 || error?.name === 'AbortError' ||
            (status === 500 && detailStr.includes('aborted'))) {
            return res.json({ text: JSON.stringify({
                score: 0,
                maxScore: 10,
                feedback: 'AI chưa hoàn thành chấm điểm — có thể do lỗi kết nối hoặc quá tải. Giáo viên vui lòng chấm thủ công.',
                details: 'Bài làm của học sinh đã được lưu đầy đủ. AI không thể tạo điểm nhập do lỗi kỹ thuật.',
                errors: [],
                improvements: [],
                weaknesses: [],
                strengths: []
            }) });
        }
        return res.status(status).json({ error: `Gemini error: ${status}`, detail });
    }
}
