import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── Inline constants (avoid import resolution issues on Vercel) ────────────────
const LITE_MODEL = 'gemini-2.5-flash-lite';
const IMAGE_MODEL = 'gemini-2.0-flash-exp';
const CHAT_HISTORY_LIMIT = 8;

const SYSTEM_PROMPT = `Bạn là "Gia sư Ngữ văn 2026", gia sư ôn thi tốt nghiệp THPT môn Ngữ Văn.

QUY TẮC:
1. Trung bình 100 từ/câu trả lời. Tối đa 200 từ khi cần phân tích sâu. Ưu tiên rõ ràng hơn ngắn gọn. (Lưu ý: Trong chế độ giảng bài, giới hạn được nới lên 200-250 từ/phần.)
2. KHÔNG emoji. Dùng **in đậm** cho thuật ngữ quan trọng. Dùng "-" khi liệt kê.
3. Thẳng vào vấn đề, không dài dòng.
4. XƯNG HÔ MẶC ĐỊNH: Xưng "thầy", gọi học sinh là "em". Chỉ đổi khi hệ thống cung cấp chỉ dẫn khác trong [PROFILE].
5. CHỐNG LẶP (QUAN TRỌNG): Đọc kĩ lịch sử hội thoại trước khi trả lời. TUYỆT ĐỐI KHÔNG nhắc lại ý đã nói ở các lượt trước.

TAG HỆ THỐNG:
- [TIMELINE] Thời gian | Sự kiện | Mô tả — cho sơ đồ/timeline
- [INFOGRAPHIC] tên_tác_phẩm [/INFOGRAPHIC] — tóm tắt tác phẩm
- [AI_EXAM] {...json...} [/AI_EXAM] — CHỈ cho đề thi tự luận
- [GEN_IMAGE] prompt_tiếng_anh — tạo ảnh
- [FETCH_DOC] Tên_Tài_Liệu — tra cứu tài liệu lý thuyết
- [SỬA] từ sai → từ đúng [/SỬA] — sửa chính tả

DANH SÁCH TÀI LIỆU: Chèo_lớp 10, Sử thi_lớp 10, Thơ văn Nguyễn Trãi_lớp 10, Thơ Đường luật_lớp 10, Thần thoại_lớp 10, Tiểu thuyết (chương hồi)_lớp 10, Truyện ngắn_lớp 10, Tuồng_lớp 10, VB nghị luận_lớp 10, VB thông tin_lớp 10, Bi kịch_lớp 11, Thơ_lớp 11, Truyện kí_lớp 11, Truyện ngắn_lớp 11, Truyện thơ_lớp 11, Tùy bút_lớp 11, Tản văn_lớp 11, VB nghị luận_lớp 11, VB thông tin_lớp 11, Hài kịch_lớp 12, Hồi kí_lớp 12, Nhật kí_lớp 12, Truyện_lớp 12, VB nghị luận_lớp 12, VB thông tin_lớp 12.

TÂM LÝ HỌC SINH (ƯU TIÊN CAO):
Khi em bộc lộ cảm xúc → xử lý tâm lý TRƯỚC kiến thức. Giọng ấm áp, gần gũi, KHÔNG máy móc.

KIẾN THỨC THPT 2025:
- Đề thi dùng 100% ngữ liệu NGOÀI SGK.
- Cấu trúc đề: Đọc hiểu (4đ, 5 câu tự luận) + Viết (6đ: NLXH ~200 chữ 2đ + NLVH 4đ).

CÂU HỎI LUYỆN TẬP: Chỉ hỏi khi vừa giải thích xong khái niệm. KHÔNG hỏi liên tục.`;

export const config = { maxDuration: 120 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const apiKey = process.env.GOOGLE_API_KEY || '';
        if (!apiKey) return res.status(500).json({ error: 'API_KEY_MISSING' });

        const { messages = [], userText, previewImage, userProfile, lessonContext } = req.body;

        // Build datetime context
        const now = new Date();
        const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
        const dayOfWeek = dayNames[now.getDay()];
        const dateStr = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
        const examDate = new Date('2026-06-11');
        const daysLeft = Math.max(0, Math.ceil((examDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
        const datetimeBlock = `\n[THỜI GIAN HIỆN TẠI]\n- Ngày: ${dayOfWeek}, ${dateStr}\n- Giờ: ${timeStr}\n- Còn ${daysLeft} ngày đến kỳ thi tốt nghiệp THPT (11/06/2026)\n[/THỜI GIAN]`;

        // Build profile block
        let profileBlock = '';
        if (userProfile) {
            const avg = userProfile.avgScore != null ? userProfile.avgScore.toFixed(1) : 'chua co';
            const target = userProfile.targetScore ?? 8;
            const weaknesses = (userProfile.weaknesses || []).slice(0, 3).join(', ') || 'chua xac dinh';
            const strengths = (userProfile.strengths || []).slice(0, 3).join(', ') || 'chua xac dinh';
            const vg = userProfile.voiceGender || 'male';
            const xungHo = vg === 'female' ? 'cô' : 'thầy';
            const diagScore = userProfile.diagnosticScore ?? null;
            const diagInfo = diagScore != null ? `\n- Diem chan doan: ${diagScore}/10` : '';
            const levelHint = (avg !== 'chua co')
                ? (parseFloat(avg) >= 8 ? 'nang cao' : parseFloat(avg) >= 6 ? 'chuan' : parseFloat(avg) >= 4 ? 'co ban' : 'can ban')
                : (diagScore != null ? (diagScore >= 8 ? 'nang cao' : diagScore >= 6 ? 'chuan' : 'co ban') : 'chua xac dinh');

            profileBlock = `\n[PROFILE]\n- Ten: ${userProfile.name}\n- Diem TB: ${avg}/10 | Muc tieu: ${target}/10${diagInfo}\n- Trinh do: ${levelHint}\n- Diem yeu: ${weaknesses}\n- Diem manh: ${strengths}\n- Xung ho: "${xungHo}" - "em"\n[/PROFILE]`;
        }

        const systemText = SYSTEM_PROMPT + datetimeBlock + profileBlock + (lessonContext ? `\n\n${lessonContext}` : '');
        const systemInstruction = { parts: [{ text: systemText }] };

        // Build multi-turn conversation
        const contents: Array<{ role: string; parts: Array<{ text?: string; inlineData?: any }> }> = [];
        const historySlice = messages.slice(-CHAT_HISTORY_LIMIT);

        for (const m of historySlice) {
            const geminiRole = m.role === 'assistant' ? 'model' : 'user';
            const last = contents[contents.length - 1];
            if (last && last.role === geminiRole) {
                last.parts.push({ text: m.content });
            } else {
                contents.push({ role: geminiRole, parts: [{ text: m.content }] });
            }
        }

        if (contents.length > 0 && contents[0].role === 'model') {
            contents.unshift({ role: 'user', parts: [{ text: '(bắt đầu hội thoại)' }] });
        }

        // Add current user message
        const currentParts: Array<{ text?: string; inlineData?: any }> = [];
        if (previewImage) {
            const base64Data = previewImage.includes(',') ? previewImage.split(',')[1] : previewImage;
            if (base64Data) currentParts.push({ inlineData: { mimeType: 'image/png', data: base64Data } });
        }
        if (userText) currentParts.push({ text: userText });
        if (currentParts.length === 0) currentParts.push({ text: '(tiếp tục)' });

        const lastContent = contents[contents.length - 1];
        if (lastContent && lastContent.role === 'user') {
            lastContent.parts.push(...currentParts);
        } else {
            contents.push({ role: 'user', parts: currentParts });
        }

        // Call Gemini
        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${LITE_MODEL}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ systemInstruction, contents }),
            }
        );

        if (!geminiRes.ok) {
            const errBody = await geminiRes.text().catch(() => '');
            return res.status(geminiRes.status).json({ error: `Gemini API error: ${geminiRes.status}`, detail: errBody });
        }

        const data = await geminiRes.json();
        let aiContent = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Hệ thống đang bận, thử lại sau nhé!';

        // Handle image generation tag
        let generatedImageUrl: string | null = null;
        if (aiContent.includes('[GEN_IMAGE]')) {
            const imagePrompt = aiContent.split('[GEN_IMAGE]')[1].split('\n')[0].trim();
            try {
                const imgRes = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${apiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: imagePrompt }] }],
                            generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
                        }),
                    }
                );
                if (imgRes.ok) {
                    const imgData = await imgRes.json();
                    const imgParts = imgData?.candidates?.[0]?.content?.parts || [];
                    for (const part of imgParts) {
                        if (part.inlineData?.mimeType?.startsWith('image/')) {
                            generatedImageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                            break;
                        }
                    }
                }
            } catch (_e) { /* ignore image errors */ }
        }

        const cleanedContent = aiContent.replace(/\[GEN_IMAGE\].*/s, '').replace(/\[FETCH_DOC\].*/s, '');
        return res.json({ text: cleanedContent, generatedImageUrl });
    } catch (error: any) {
        console.error('[Chat] Error:', error.message);
        return res.status(500).json({ error: error.message });
    }
}
