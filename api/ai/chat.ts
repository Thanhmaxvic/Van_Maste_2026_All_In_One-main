import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
    getApiKey, LITE_MODEL, SYSTEM_PROMPT, CHAT_HISTORY_LIMIT,
    IMAGE_MODEL, setCorsHeaders,
} from '../_shared/helpers';

export const config = { maxDuration: 120 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const apiKey = getApiKey();
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
        const datetimeBlock = `\n[THỜI GIAN HIỆN TẠI]\n- Ngày: ${dayOfWeek}, ${dateStr}\n- Giờ: ${timeStr}\n- Còn ${daysLeft} ngày đến kỳ thi tốt nghiệp THPT (11/06/2026)\n[/THỜI GIAN]\nDựa vào thời gian trên để phản hồi phù hợp.`;

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
            const diagInfo = diagScore != null ? `\n- Diem chan doan dau vao: ${diagScore}/10` : '';
            const levelHint = (avg !== 'chua co')
                ? (parseFloat(avg) >= 8 ? 'nang cao' : parseFloat(avg) >= 6 ? 'chuan' : parseFloat(avg) >= 4 ? 'co ban' : 'can ban')
                : (diagScore != null ? (diagScore >= 8 ? 'nang cao' : diagScore >= 6 ? 'chuan' : 'co ban') : 'chua xac dinh');

            profileBlock = `\n[PROFILE HOC SINH]\n- Ten: ${userProfile.name}\n- Diem TB: ${avg}/10 | Muc tieu: ${target}/10${diagInfo}\n- Trinh do: ${levelHint}\n- Diem yeu: ${weaknesses}\n- Diem manh: ${strengths}\n- Bai da nop: ${userProfile.submissionCount ?? 0}\n- Xung ho: "${xungHo}" - "em"\n[/PROFILE]\n\nCA NHAN HOA:\n- Dua vao profile tren, tu dong dieu chinh cach giang day phu hop trinh do.\n- Khi tao cau hoi trac nghiem/quiz: UU TIEN 60% cau hoi lien quan den DIEM YEU (${weaknesses}), 40% cau hoi ve ky nang khac.\n- Neu trinh do "${levelHint}": ${levelHint === 'nang cao' ? 'hoi cau kho, so sanh sau, phan tich nhieu tang' : levelHint === 'chuan' ? 'hoi cau vua phai, ket hop ly thuyet va thuc hanh' : 'hoi cau co ban, giai thich ky, cho vi du cu the'}.\n- LUON xung ho la "${xungHo}" khi noi voi hoc sinh.`;
        }

        const systemText = SYSTEM_PROMPT + datetimeBlock + profileBlock + (lessonContext ? `\n\n${lessonContext}` : '');
        const systemInstruction = { parts: [{ text: systemText }] };

        // Build multi-turn conversation
        const contents: { role: string; parts: unknown[] }[] = [];
        const historySlice = messages.slice(-CHAT_HISTORY_LIMIT);

        for (const m of historySlice) {
            const geminiRole = m.role === 'assistant' ? 'model' : 'user';
            const lastEntry = contents[contents.length - 1];
            if (lastEntry && lastEntry.role === geminiRole) {
                (lastEntry.parts as { text: string }[]).push({ text: m.content });
            } else {
                contents.push({ role: geminiRole, parts: [{ text: m.content }] });
            }
        }

        if (contents.length > 0 && contents[0].role === 'model') {
            contents.unshift({ role: 'user', parts: [{ text: '(bắt đầu hội thoại)' }] });
        }

        // Add current user message
        const currentParts: unknown[] = [];
        if (previewImage) {
            const base64Data = previewImage.includes(',') ? previewImage.split(',')[1] : previewImage;
            if (base64Data) currentParts.push({ inlineData: { mimeType: 'image/png', data: base64Data } });
        }
        if (userText) currentParts.push({ text: userText });
        if (currentParts.length === 0) currentParts.push({ text: '(tiếp tục)' });

        const lastEntry = contents[contents.length - 1];
        if (lastEntry && lastEntry.role === 'user') {
            (lastEntry.parts as unknown[]).push(...currentParts);
        } else {
            contents.push({ role: 'user', parts: currentParts });
        }

        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${LITE_MODEL}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ systemInstruction, contents }),
        });

        if (!geminiRes.ok) {
            return res.status(geminiRes.status).json({ error: `Gemini API error: ${geminiRes.status}` });
        }

        const data = await geminiRes.json();
        let aiContent = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Hệ thống đang bận, thử lại sau nhé!';

        // Handle image generation
        let generatedImageUrl: string | null = null;
        if (aiContent.includes('[GEN_IMAGE]')) {
            const imagePrompt = aiContent.split('[GEN_IMAGE]')[1].split('\n')[0].trim();
            try {
                const imgRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: imagePrompt }] }],
                        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
                    }),
                });
                if (imgRes.ok) {
                    const imgData = await imgRes.json();
                    const parts = imgData?.candidates?.[0]?.content?.parts || [];
                    for (const part of parts) {
                        if (part.inlineData?.mimeType?.startsWith('image/')) {
                            generatedImageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                            break;
                        }
                    }
                }
            } catch { /* ignore image errors */ }
        }

        const cleanedContent = aiContent.replace(/\[GEN_IMAGE\].*/s, '').replace(/\[FETCH_DOC\].*/s, '');
        return res.json({ text: cleanedContent, generatedImageUrl });
    } catch (error: any) {
        console.error('[Chat] Error:', error.message);
        return res.status(500).json({ error: error.message });
    }
}
