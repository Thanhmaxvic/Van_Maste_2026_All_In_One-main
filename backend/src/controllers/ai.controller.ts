/**
 * AI Controller — Handles all Gemini API calls.
 * Moved from frontend's geminiApi.ts to keep API keys server-side.
 */
import type { Request, Response } from 'express';
import {
    PRIMARY_MODEL,
    LITE_MODEL,
    IMAGE_MODEL,
    SYSTEM_PROMPT,
    CHAT_HISTORY_LIMIT,
    GRADING_RUBRIC_PROMPT,
    AI_DETECTION_PROMPT,
    CHAT_AUTO_RESPONDER_PROMPT,
} from '../shared/constants.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getApiKey(): string {
    return process.env.GOOGLE_API_KEY || '';
}

async function callGemini(
    body: object,
    opts?: { signal?: AbortSignal; temperature?: number }
): Promise<string> {
    const config = opts?.temperature != null ? { generationConfig: { temperature: opts.temperature }, ...body } : body;
    const apiKey = getApiKey();
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${PRIMARY_MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
        signal: opts?.signal,
    });
    if (!res.ok) {
        throw new Error(`[Primary] API error: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callGeminiLite(
    body: object,
    opts?: { signal?: AbortSignal; temperature?: number }
): Promise<string> {
    const config = opts?.temperature != null ? { generationConfig: { temperature: opts.temperature }, ...body } : body;
    const apiKey = getApiKey();
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${LITE_MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
        signal: opts?.signal,
    });
    if (!res.ok) {
        throw new Error(`[Lite] API error: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/ai/chat
 * Body: { messages, userText, previewImage, userProfile, lessonContext }
 */
export async function chatHandler(req: Request, res: Response): Promise<void> {
    try {
        const apiKey = getApiKey();
        if (!apiKey) {
            res.status(500).json({ error: 'API_KEY_MISSING' });
            return;
        }

        const { messages = [], userText, previewImage, userProfile, lessonContext } = req.body;

        // Build datetime context
        const now = new Date();
        const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
        const dayOfWeek = dayNames[now.getDay()];
        const dateStr = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
        const examDate = new Date('2026-06-11');
        const daysLeft = Math.max(0, Math.ceil((examDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
        const datetimeBlock = `\n[THỜI GIAN HIỆN TẠI]\n- Ngày: ${dayOfWeek}, ${dateStr}\n- Giờ: ${timeStr}\n- Còn ${daysLeft} ngày đến kỳ thi tốt nghiệp THPT (11/06/2026)\n[/THỜI GIAN]\nDựa vào thời gian trên để phản hồi phù hợp. Ví dụ: buổi tối thì nhắc em nghỉ ngơi, sáng sớm thì khen em chăm chỉ, gần thi thì động viên tập trung.`;

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
        currentParts.push({ text: userText });

        const lastEntry = contents[contents.length - 1];
        if (lastEntry && lastEntry.role === 'user') {
            (lastEntry.parts as unknown[]).push(...currentParts);
        } else {
            contents.push({ role: 'user', parts: currentParts });
        }

        // Call Gemini Lite for chat
        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${LITE_MODEL}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ systemInstruction, contents }),
        });

        if (!geminiRes.ok) {
            let errorDetail = '';
            try { errorDetail = await geminiRes.text() || ''; } catch { /* ignore */ }
            console.error(`[Chat] Request failed. Status: ${geminiRes.status} — ${errorDetail}`);
            res.status(geminiRes.status).json({ error: `API error: ${geminiRes.status}` });
            return;
        }

        const data = await geminiRes.json();
        let aiContent = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Hệ thống đang bận, thử lại sau nhé!';

        // Handle image generation tag
        let generatedImageUrl: string | null = null;
        if (aiContent.includes('[GEN_IMAGE]')) {
            const imagePrompt = aiContent.split('[GEN_IMAGE]')[1].split('\n')[0].trim();
            generatedImageUrl = await generateImageInternal(imagePrompt);
        }

        const cleanedContent = aiContent.replace(/\[GEN_IMAGE\].*/s, '').replace(/\[FETCH_DOC\].*/s, '');
        res.json({ text: cleanedContent, generatedImageUrl });
    } catch (error: any) {
        console.error('[Chat] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
}

// ─── Grading ──────────────────────────────────────────────────────────────────

/**
 * POST /api/ai/grade
 * Body: { prompt }
 */
export async function gradeHandler(req: Request, res: Response): Promise<void> {
    try {
        const apiKey = getApiKey();
        if (!apiKey) {
            res.status(500).json({ error: 'API_KEY_MISSING' });
            return;
        }

        const { prompt } = req.body;
        const result = await callGemini(
            { contents: [{ role: 'user', parts: [{ text: prompt }] }] },
        );

        res.json({ text: result || '{}' });
    } catch (error: any) {
        console.error('[Grade] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
}

/**
 * POST /api/ai/grade-submission
 * Body: { prompt, fileBase64, fileMimeType }
 */
export async function gradeSubmissionHandler(req: Request, res: Response): Promise<void> {
    try {
        const apiKey = getApiKey();
        if (!apiKey) {
            res.status(500).json({ error: 'API_KEY_MISSING' });
            return;
        }

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
                generationConfig: {
                    temperature: 0.2,
                    responseMimeType: 'application/json',
                },
            }),
        });

        if (!geminiRes.ok) {
            throw new Error(`API error: ${geminiRes.status} ${geminiRes.statusText}`);
        }

        const data = await geminiRes.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        res.json({ text: rawText });
    } catch (error: any) {
        console.error('[GradeSubmission] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
}

// ─── Quiz / Exam Generation ──────────────────────────────────────────────────

/**
 * POST /api/ai/generate
 * Body: { prompt, model?, temperature? }
 * Generic Gemini call — used for quiz, exam, diagnostic, rewrite, etc.
 */
export async function generateHandler(req: Request, res: Response): Promise<void> {
    try {
        const apiKey = getApiKey();
        if (!apiKey) {
            res.status(500).json({ error: 'API_KEY_MISSING' });
            return;
        }

        const { prompt, model, temperature } = req.body;
        const useModel = model === 'primary' ? PRIMARY_MODEL : LITE_MODEL;

        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                ...(temperature != null ? { generationConfig: { temperature } } : {}),
            }),
        });

        if (!geminiRes.ok) {
            throw new Error(`API error: ${geminiRes.status} ${geminiRes.statusText}`);
        }

        const data = await geminiRes.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        res.json({ text });
    } catch (error: any) {
        console.error('[Generate] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
}

// ─── Image Generation ─────────────────────────────────────────────────────────

async function generateImageInternal(prompt: string): Promise<string | null> {
    const apiKey = getApiKey();
    if (!apiKey) return null;

    try {
        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
            }),
        });
        if (!geminiRes.ok) return null;

        const data = await geminiRes.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
            if (part.inlineData?.mimeType?.startsWith('image/')) {
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }
    } catch (err) {
        console.error('[ImageGen] Error:', err);
    }
    return null;
}

/**
 * POST /api/ai/image
 * Body: { prompt }
 */
export async function imageHandler(req: Request, res: Response): Promise<void> {
    try {
        const { prompt } = req.body;
        const imageUrl = await generateImageInternal(prompt);
        res.json({ imageUrl });
    } catch (error: any) {
        console.error('[Image] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
}

/**
 * POST /api/ai/infographic
 * Body: { workTitle }
 */
export async function infographicHandler(req: Request, res: Response): Promise<void> {
    try {
        const apiKey = getApiKey();
        if (!apiKey) {
            res.json({ imageUrl: null });
            return;
        }

        const { workTitle } = req.body;
        const prompt = `Create a beautiful, professional educational infographic in Vietnamese about the Vietnamese literary work "${workTitle}". 
Include: author name, publication year, literary genre, main themes (3-4), plot summary (brief), main characters, literary devices used, significance in Vietnamese literature curriculum.
Style: Modern educational poster, clean layout, rich warm colors (gold, deep red, cream), Vietnamese cultural aesthetic.
Text must be clear, readable Vietnamese. High contrast. Suitable for high school students studying for university entrance exam.
Format: vertical infographic, 1024x1536px equivalent proportions.`;

        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
            }),
        });

        if (!geminiRes.ok) {
            res.json({ imageUrl: null });
            return;
        }

        const data = await geminiRes.json();
        const parts = data.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
            if (part.inlineData?.mimeType?.startsWith('image/')) {
                res.json({ imageUrl: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` });
                return;
            }
        }
        res.json({ imageUrl: null });
    } catch (error: any) {
        console.error('[Infographic] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
}

// ─── Auto Response ────────────────────────────────────────────────────────────

/**
 * POST /api/ai/auto-response
 * Body: { userMessage, chatHistory }
 */
export async function autoResponseHandler(req: Request, res: Response): Promise<void> {
    try {
        const apiKey = getApiKey();
        if (!apiKey) {
            res.json({ text: null });
            return;
        }

        const { userMessage, chatHistory = [] } = req.body;
        const historyText = chatHistory
            .slice(-6)
            .map((m: any) => `${m.role === 'student' ? 'Học sinh' : 'Trợ lý'}: ${m.content}`)
            .join('\n');
        const fullPrompt = `${CHAT_AUTO_RESPONDER_PROMPT}\n\nLịch sử chat gần đây:\n${historyText}\n\nHọc sinh vừa gửi: "${userMessage}"\n\nTrả lời ngắn gọn:`;

        const result = await callGeminiLite(
            { contents: [{ parts: [{ text: fullPrompt }] }] }
        );
        res.json({ text: result?.trim() || null });
    } catch (error: any) {
        console.error('[AutoResponse] Error:', error.message);
        res.json({ text: null });
    }
}

// ─── Proactive Message ────────────────────────────────────────────────────────

/**
 * POST /api/ai/proactive
 * Body: { messages, proactivePrompt, pronoun }
 */
export async function proactiveHandler(req: Request, res: Response): Promise<void> {
    try {
        const apiKey = getApiKey();
        if (!apiKey) {
            res.json({ text: null });
            return;
        }

        const { messages = [], proactivePrompt, pronoun = 'thầy' } = req.body;
        const Pronoun = pronoun.charAt(0).toUpperCase() + pronoun.slice(1);
        const historyText = messages
            .slice(-6)
            .map((m: any) => `${m.role === 'user' ? 'Học sinh' : Pronoun}: ${m.content}`)
            .join('\n');
        const fullPrompt = `${proactivePrompt}\n\nLịch sử chat:\n${historyText}`;
        const result = await callGeminiLite(
            { contents: [{ parts: [{ text: fullPrompt }] }] }
        );
        res.json({ text: result?.trim() || null });
    } catch (error: any) {
        console.error('[Proactive] Error:', error.message);
        res.json({ text: null });
    }
}
