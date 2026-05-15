import { SYSTEM_PROMPT, CHAT_HISTORY_LIMIT, KNOWLEDGE_DOCS, AI_DETECTION_PROMPT, GRADING_RUBRIC_PROMPT } from '../constants';
import type { Message, UserProfile, AIExamData, ExamGrade } from '../types';

// ================================================================
// ██ CẤU HÌNH MODEL — PHÂN TẦNG 2 LUỒNG TIẾT KIỆM ██
// ================================================================

// ── LUỒNG NẶNG: Giảng bài, chấm điểm — cần AI thông minh ──
export const PRIMARY_MODEL = 'gemini-2.5-flash';

// ── LUỒNG NHẸ: Chat, quiz, rewrite, tạo đề — ưu tiên rẻ ──
export const LITE_MODEL = 'gemini-2.5-flash-lite';

function getApiKey(): string {
    return import.meta.env.VITE_GOOGLE_API_KEY || '';
}

/**
 * Gọi Gemini PRIMARY (gemini-2.5-flash).
 * Dùng cho: giảng bài (lesson), chấm điểm (grading), chấm bài nộp.
 */
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

/**
 * Gọi Gemini LITE (gemini-2.5-flash-lite).
 * Dùng cho: chat, quiz, rewrite, tạo đề, proactive, auto-response.
 * Chi phí thấp hơn PRIMARY ~6 lần.
 */
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

/**
 * Send a chat message to Gemini and get a response.
 */
export async function sendChatMessage(
    messages: Message[],
    userText: string,
    previewImage: string | null,
    userProfile?: UserProfile | null,
    signal?: AbortSignal,
    lessonContext?: string
): Promise<{ text: string; generatedImageUrl: string | null }> {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('API_KEY_MISSING');

    // Build [DATETIME] context so AI knows current date/time
    const now = new Date();
    const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const dayOfWeek = dayNames[now.getDay()];
    const dateStr = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
    const examDate = new Date('2026-06-11');
    const daysLeft = Math.max(0, Math.ceil((examDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    const datetimeBlock = `\n[THỜI GIAN HIỆN TẠI]\n- Ngày: ${dayOfWeek}, ${dateStr}\n- Giờ: ${timeStr}\n- Còn ${daysLeft} ngày đến kỳ thi tốt nghiệp THPT (11/06/2026)\n[/THỜI GIAN]\nDựa vào thời gian trên để phản hồi phù hợp. Ví dụ: buổi tối thì nhắc em nghỉ ngơi, sáng sớm thì khen em chăm chỉ, gần thi thì động viên tập trung.`;

    // Build [PROFILE] context block for profile-aware AI responses
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

    // Use Gemini's dedicated systemInstruction field — allows context caching & reduces token cost
    // If lesson context is provided, append it to systemInstruction (not user message)
    const systemText = SYSTEM_PROMPT + datetimeBlock + profileBlock + (lessonContext ? `\n\n${lessonContext}` : '');
    const systemInstruction = { parts: [{ text: systemText }] };

    // ── Build proper multi-turn conversation (role: user/model) ──
    // Gemini cần phân biệt rõ đâu là AI đã nói (model) và HS nói (user)
    // để tránh lặp lại nội dung đã giảng.
    const contents: { role: string; parts: unknown[] }[] = [];
    const historySlice = messages.slice(-CHAT_HISTORY_LIMIT);

    // Gemini yêu cầu lượt đầu tiên phải là 'user'.
    // Merge các lượt liên tiếp cùng role để tuân thủ API constraint.
    for (const m of historySlice) {
        const geminiRole = m.role === 'assistant' ? 'model' : 'user';
        const lastEntry = contents[contents.length - 1];
        if (lastEntry && lastEntry.role === geminiRole) {
            // Merge liên tiếp cùng role
            (lastEntry.parts as { text: string }[]).push({ text: m.content });
        } else {
            contents.push({ role: geminiRole, parts: [{ text: m.content }] });
        }
    }

    // Ensure first turn is 'user' (Gemini API requirement)
    if (contents.length > 0 && contents[0].role === 'model') {
        contents.unshift({ role: 'user', parts: [{ text: '(bắt đầu hội thoại)' }] });
    }

    // Add current user message (with optional image)
    const currentParts: unknown[] = [];
    if (previewImage) {
        const base64Data = previewImage.includes(',') ? previewImage.split(',')[1] : previewImage;
        if (base64Data) currentParts.push({ inlineData: { mimeType: 'image/png', data: base64Data } });
    }
    currentParts.push({ text: userText });

    // Merge with last entry if also 'user', otherwise push new entry
    const lastEntry = contents[contents.length - 1];
    if (lastEntry && lastEntry.role === 'user') {
        (lastEntry.parts as unknown[]).push(...currentParts);
    } else {
        contents.push({ role: 'user', parts: currentParts });
    }

    const geminiKey = getApiKey();
    // ── Chat dùng LITE_MODEL (rẻ, đủ thông minh cho hội thoại) ──
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${LITE_MODEL}:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemInstruction, contents }),
        signal,
    });

    if (!res.ok) {
        let errorDetail = '';
        try { errorDetail = await res.text() || ''; } catch { /* ignore */ }
        console.error(`[Chat] Request failed. Status: ${res.status} — ${errorDetail}`);
        throw new Error(`API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    let aiContent = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Hệ thống đang bận, thử lại sau nhé!';

    // Handle Document Fetching (RAG)
    if (aiContent.includes('[FETCH_DOC]')) {
        const docNameRaw = aiContent.split('[FETCH_DOC]')[1].split('\n')[0].trim();
        // Remove trailing punctuation just in case
        const docNames = docNameRaw.replace(/[.,;!"']+$/, '').split('|').map((n: string) => n.trim()).filter(Boolean);
        
        let combinedDocsText = '';
        const mammoth = await import('mammoth');
        
        for (const docName of docNames) {
            const docUrl = KNOWLEDGE_DOCS[docName];
            if (docUrl && docUrl.endsWith('.docx')) {
                try {
                    const docRes = await fetch(encodeURI(docUrl), { signal });
                    if (docRes.ok) {
                        const arrayBuffer = await docRes.arrayBuffer();
                        const result = await mammoth.extractRawText({ arrayBuffer });
                        combinedDocsText += `\n--- Tài liệu: ${docName} ---\n${result.value.substring(0, 10000)}\n`;
                    }
                } catch (err) {
                    console.error(`Lỗi khi fetch docx RAG (${docName}):`, err);
                }
            }
        }
        
        if (combinedDocsText.trim()) {
            try {
                // Construct follow-up prompt
                const followUpText = `Nội dung tài liệu đã được tải:\n${combinedDocsText}\n\nHãy trả lời câu hỏi của học sinh dựa trên tài liệu này.`;
                
                // Call Gemini again with the doc context attached silently
                // Re-use multi-turn contents and append RAG follow-up
                const followUpContents = [
                    ...contents,
                    { role: 'model', parts: [{ text: `[FETCH_DOC] Đang đọc ${docNames.join(', ')}...` }] },
                    { role: 'user', parts: [{ text: followUpText }] }
                ];
                
                const ragKey = getApiKey();
                // RAG follow-up cũng dùng LITE_MODEL
                const followUpRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${LITE_MODEL}:generateContent?key=${ragKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ systemInstruction, contents: followUpContents }),
                    signal,
                });
                
                if (!followUpRes.ok) {
                    throw new Error(`API error: ${followUpRes.status} ${followUpRes.statusText}`);
                } else {
                    const followUpData = await followUpRes.json();
                    aiContent = followUpData.candidates?.[0]?.content?.parts?.[0]?.text || aiContent;
                }
            } catch (err) {
                console.error('Lỗi khi gọi lại Gemini:', err);
                aiContent = aiContent.replace(/\[FETCH_DOC\].*/s, '*(Lỗi: Không thể phân tích tài liệu)*\n');
            }
        } else {
            aiContent = aiContent.replace(/\[FETCH_DOC\].*/s, '*(Lỗi: Không tìm thấy tài liệu phù hợp)*\n');
        }
    }

    let generatedImageUrl: string | null = null;
    if (aiContent.includes('[GEN_IMAGE]')) {
        const imagePrompt = aiContent.split('[GEN_IMAGE]')[1].split('\n')[0].trim();
        generatedImageUrl = await generateImage(imagePrompt);
    }

    const cleanedContent = aiContent.replace(/\[GEN_IMAGE\].*/s, '').replace(/\[FETCH_DOC\].*/s, '');
    return { text: cleanedContent, generatedImageUrl };
}

/**
 * Chấm bài — dùng PRIMARY_MODEL (gemini-2.5-flash) vì cần phân tích sâu.
 */
export async function sendGradingRequest(prompt: string, signal?: AbortSignal): Promise<string> {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('API_KEY_MISSING');
    const result = await callGemini(
        { contents: [{ role: 'user', parts: [{ text: prompt }] }] },
        { signal }
    );
    return result || '{}';
}

/**
 * Generate an image using Gemini 3.1 Flash Image Preview.
 */
export async function generateImage(prompt: string): Promise<string | null> {
    const apiKey = getApiKey();
    if (!apiKey) return null;
    try {
        const imgKey = getApiKey();
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${imgKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
            }),
        });
        if (!res.ok) {
            throw new Error(`API error: ${res.status} ${res.statusText}`);
        }
        const data = await res.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
            if (part.inlineData?.mimeType?.startsWith('image/')) {
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }
    } catch (error) {
        console.error('Image generation error:', error);
    }
    return null;
}

/**
 * Generate an educational infographic about a Vietnamese literary work
 * using Gemini 3.1 Flash Image Preview.
 * Returns a base64 data URL string or null on failure.
 */
export async function generateInfographic(workTitle: string, signal?: AbortSignal): Promise<string | null> {
    const apiKey = getApiKey();
    if (!apiKey) return null;

    const prompt = `Create a beautiful, professional educational infographic in Vietnamese about the Vietnamese literary work "${workTitle}". 
Include: author name, publication year, literary genre, main themes (3-4), plot summary (brief), main characters, literary devices used, significance in Vietnamese literature curriculum.
Style: Modern educational poster, clean layout, rich warm colors (gold, deep red, cream), Vietnamese cultural aesthetic.
Text must be clear, readable Vietnamese. High contrast. Suitable for high school students studying for university entrance exam.
Format: vertical infographic, 1024x1536px equivalent proportions.`;

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
            }),
            signal,
        });
        if (!res.ok) {
            throw new Error(`API error: ${res.status} ${res.statusText}`);
        }
        const data = await res.json();
        const parts = data.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
            if (part.inlineData?.mimeType?.startsWith('image/')) {
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }
        return null;
    } catch (err) {
        console.error('generateInfographic error:', err);
        return null;
    }
}

/**
 * Viết lại văn bản — dùng LITE_MODEL (tác vụ nhẹ).
 */
export async function rewriteText(text: string): Promise<string | null> {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('API_KEY_MISSING');
    const result = await callGeminiLite(
        { contents: [{ parts: [{ text: `Viết lại câu sau cho hay hơn, tự nhiên hơn: "${text}"` }] }] }
    );
    return result?.trim() || null;
}

/**
 * Tạo bài kiểm tra chẩn đoán — dùng LITE_MODEL (tác vụ nhẹ).
 */
export async function generateDiagnosticQuiz(prompt: string): Promise<string> {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('API_KEY_MISSING');
    const result = await callGeminiLite(
        { contents: [{ parts: [{ text: prompt }] }] }
    );
    return result || 'Lỗi tạo bài kiểm tra chẩn đoán';
}

/**
 * Tạo lời khuyên khắc phục điểm yếu — dùng LITE_MODEL (tác vụ nhẹ).
 */
export async function generateWeaknessAdvice(weaknesses: string[], pronoun = 'thầy'): Promise<string | null> {
    const apiKey = getApiKey();
    if (!apiKey || weaknesses.length === 0) return null;
    const list = weaknesses.slice(0, 3).join('; ');
    const prompt = `Học sinh Ngữ văn đang có các điểm yếu sau: ${list}.
Trong tối đa 2 câu ngắn gọn, hãy gợi ý CỤ THỂ cách em có thể khắc phục các điểm yếu này khi ôn thi tốt nghiệp THPT môn Văn.
Yêu cầu:
- Xưng hô "${pronoun}" - "em"
- Không mở đầu rào trước đón sau, đi thẳng vào hành động cần làm
- Không dùng gạch đầu dòng
- Tổng độ dài tối đa khoảng 60–80 từ.`;
    const result = await callGeminiLite(
        { contents: [{ parts: [{ text: prompt }] }] }
    );
    return result?.trim() || null;
}

export function isApiKeyConfigured(): boolean {
    return Boolean(getApiKey());
}

export interface MCQQuestion {
    q: string;
    a: string;
    b: string;
    c: string;
    d: string;
    correct: 'a' | 'b' | 'c' | 'd';
}

export interface DiagnosticQuizData {
    passage: string;
    source: string;
    questions: MCQQuestion[];
}

/**
 * Tạo quiz trắc nghiệm 10 câu — dùng LITE_MODEL (tác vụ nhẹ).
 * Returns parsed JSON data.
 */
export async function generateDiagnosticMCQ(prompt: string, signal?: AbortSignal): Promise<DiagnosticQuizData | null> {
    const apiKey = getApiKey();
    if (!apiKey) return null;

    try {
        const quizKey = getApiKey();
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${LITE_MODEL}:generateContent?key=${quizKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.7 },
                }),
                signal,
            }
        );
        if (!res.ok) {
            throw new Error(`API error: ${res.status} ${res.statusText}`);
        }
        const data = await res.json();
        let raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!raw) {
            throw new Error('API returned empty text');
        }
        // Strip markdown code fences if present (handles ```json, ```JSON, ``` etc.)
        raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
        // Fix trailing commas before } or ] (common AI output issue)
        raw = raw.replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(raw) as DiagnosticQuizData;
    } catch (err) {
        console.error(`[Quiz] Error:`, err);
        return null;
    }
}

/**
 * Tạo câu hỏi chủ động — dùng LITE_MODEL (tác vụ nhẹ).
 */
export async function sendProactiveMessage(
    messages: { role: string; content: string }[],
    proactivePrompt: string,
    pronoun = 'thầy',
): Promise<string | null> {
    const apiKey = getApiKey();
    if (!apiKey) return null;
    const Pronoun = pronoun.charAt(0).toUpperCase() + pronoun.slice(1);
    try {
        const historyText = messages
            .slice(-6)
            .map(m => `${m.role === 'user' ? 'Học sinh' : Pronoun}: ${m.content}`)
            .join('\n');
        const fullPrompt = `${proactivePrompt}\n\nLịch sử chat:\n${historyText}`;
        const result = await callGeminiLite(
            { contents: [{ parts: [{ text: fullPrompt }] }] }
        );
        return result?.trim() || null;
    } catch {
        return null;
    }
}



/**
 * Tạo đề thi AI — dùng LITE_MODEL (tác vụ nhẹ).
 * Returns parsed AIExamData or null on failure.
 */
export async function generateAIExam(prompt: string, signal?: AbortSignal): Promise<AIExamData | null> {
    const apiKey = getApiKey();
    if (!apiKey) return null;
    try {
        let raw = await callGeminiLite(
            { contents: [{ parts: [{ text: prompt }] }] },
            { signal }
        );
        if (!raw) return null;
        raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
        raw = raw.replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(raw) as AIExamData;
    } catch (err) {
        console.error('[AIExam] Failed:', err);
        return null;
    }
}

const CHAT_AUTO_RESPONDER_PROMPT = `Bạn là trợ lý AI hỗ trợ tự động của hệ thống "Ngữ Văn Master" – một nền tảng ôn thi tốt nghiệp THPT môn Ngữ Văn.

QUY TẮC BẮT BUỘC:
1. Bạn CHỈ được phép trả lời các câu hỏi liên quan đến: chương trình ôn tập Ngữ Văn THPT, đề ôn thi tốt nghiệp THPT, phương pháp làm bài Nghị luận văn học (NLVH), Nghị luận xã hội (NLXH), Đọc hiểu, và các tác phẩm văn học trong chương trình THPT.
2. Nếu người dùng hỏi về các kì thi khác (IELTS, SAT, đại học riêng, v.v.), các bộ môn khác (Toán, Lý, Hóa, Anh, Sử, Địa, v.v.), hoặc các nội dung không liên quan đến ôn thi tốt nghiệp THPT môn Văn, hãy từ chối lịch sự: "Xin lỗi em, Ngữ Văn Master chỉ hỗ trợ ôn tập để thi tốt nghiệp THPT môn Ngữ Văn. Em có thể hỏi về chương trình ôn tập hoặc đề ôn tập nhé!"
3. Nếu người dùng yêu cầu nói chuyện trực tiếp với giáo viên, muốn hỏi vấn đề cá nhân, hoặc đề cập đến vấn đề mà AI không thể giải quyết, hãy trả lời: "Em chờ một chút nhé, giáo viên sẽ trả lời em ngay khi có thể! 😊"
4. Xưng hô: "Trợ lý" hoặc không xưng – gọi người dùng là "em". Giữ giọng thân thiện, gần gũi, hữu ích.
5. Trả lời ngắn gọn, tập trung (tối đa 3-4 câu cho mỗi phản hồi). Không cần dài dòng.
6. Nếu người dùng chào hoặc gửi tin nhắn xã giao, hãy chào lại và hỏi em cần hỗ trợ gì về ôn thi Văn THPT.`;

/**
 * Tự động trả lời chat HS-GV — dùng LITE_MODEL (tác vụ nhẹ).
 */
export async function generateChatAutoResponse(
    userMessage: string,
    chatHistory: { role: string; content: string }[] = [],
): Promise<string | null> {
    const apiKey = getApiKey();
    if (!apiKey) return null;
    try {
        const historyText = chatHistory
            .slice(-6)
            .map(m => `${m.role === 'student' ? 'Học sinh' : 'Trợ lý'}: ${m.content}`)
            .join('\n');
        const fullPrompt = `${CHAT_AUTO_RESPONDER_PROMPT}\n\nLịch sử chat gần đây:\n${historyText}\n\nHọc sinh vừa gửi: "${userMessage}"\n\nTrả lời ngắn gọn:`;
        const result = await callGeminiLite(
            { contents: [{ parts: [{ text: fullPrompt }] }] }
        );
        return result?.trim() || null;
    } catch (err) {
        console.error('Chat auto-response error:', err);
        return null;
    }
}

/**
 * Chấm bài nộp — dùng PRIMARY_MODEL (gemini-2.5-flash) vì cần phân tích sâu.
 * Hỗ trợ: ảnh, PDF, DOCX (mammoth).
 */
export async function gradeStudentSubmission(prompt: string, file: File | null): Promise<ExamGrade> {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('API_KEY_MISSING');

    // Sử dụng prompt rubric + AI detection từ constants (đã extract ra)
    const enhancedPrompt = prompt + `\n\n${GRADING_RUBRIC_PROMPT}\n\n${AI_DETECTION_PROMPT}`;

    const parts: any[] = [{ text: enhancedPrompt }];

    if (file) {
        if (file.type.startsWith('image/') || file.type === 'application/pdf') {
            const base64Data = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const res = reader.result as string;
                    resolve(res.split(',')[1]);
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            parts.push({
                inlineData: {
                    mimeType: file.type || 'application/pdf',
                    data: base64Data
                }
            });
        } else if (file.name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const mammoth = await import('mammoth');
                const result = await mammoth.extractRawText({ arrayBuffer });
                parts.push({ text: `\n--- NỘI DUNG VĂN BẢN ĐÍNH KÈM ---\n${result.value}\n-----------------------------------\n` });
            } catch (e) {
                console.error('Lỗi khi đọc file docx:', e);
                parts.push({ text: `\n(Lưu ý: Không thể đọc được nội dung từ file docx đính kèm.)\n` });
            }
        } else {
            try {
                const text = await file.text();
                parts.push({ text: `\n--- NỘI DUNG VĂN BẢN ĐÍNH KÈM ---\n${text}\n-----------------------------------\n` });
            } catch (e) {
                console.error('Lỗi đọc file txt:', e);
            }
        }
    }

    const gradeKey = getApiKey();
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${PRIMARY_MODEL}:generateContent?key=${gradeKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: {
                temperature: 0.2,
                responseMimeType: 'application/json',
            }
        }),
    });

    if (!res.ok) {
        throw new Error(`API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // ── Helper: sanitize and parse AI JSON robustly ──
    function tryParseGradingJson(text: string): ExamGrade | null {
        // Strip markdown code fences
        let clean = text
            .replace(/^[\s\S]*?```(?:json)?\s*/i, '')
            .replace(/\s*```[\s\S]*$/i, '')
            .trim();

        // Extract outermost JSON object
        const jsonMatch = clean.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;
        clean = jsonMatch[0];

        // Fix trailing commas before } or ]
        clean = clean.replace(/,\s*([}\]])/g, '$1');

        // Fix unescaped newlines inside JSON string values
        clean = clean.replace(/(?<=:\s*")([\s\S]*?)(?=")/g, (match) =>
            match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
        );

        // Attempt 1: direct parse
        try {
            return JSON.parse(clean) as ExamGrade;
        } catch { /* continue */ }

        // Attempt 2: fix unescaped double-quotes inside string values
        // Strategy: replace content between key-value pairs more aggressively
        try {
            const fixedQuotes = clean.replace(
                /:\s*"((?:[^"\\]|\\.)*)"/g,
                (_, content: string) => {
                    // Re-escape any unescaped quotes within the value
                    const escaped = content.replace(/(?<!\\)"/g, '\\"');
                    return `: "${escaped}"`;
                }
            );
            return JSON.parse(fixedQuotes) as ExamGrade;
        } catch { /* continue */ }

        // Attempt 3: try to extract fields individually via regex
        try {
            const getNum = (key: string) => {
                const m = clean.match(new RegExp(`"${key}"\\s*:\\s*([\\d.]+)`));
                return m ? parseFloat(m[1]) : 0;
            };
            const getStr = (key: string) => {
                const m = clean.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
                return m ? m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : '';
            };
            const score = getNum('score');
            const maxScore = getNum('maxScore') || 10;
            const feedback = getStr('feedback');
            const details = getStr('details');

            if (feedback || details || score > 0) {
                return {
                    score,
                    maxScore,
                    feedback,
                    details,
                    errors: [],
                    improvements: [],
                    weaknesses: [],
                    strengths: [],
                };
            }
        } catch { /* continue */ }

        return null;
    }

    const parsed = tryParseGradingJson(rawText);
    if (parsed) {
        parsed.errors = parsed.errors || [];
        parsed.improvements = parsed.improvements || [];
        parsed.weaknesses = parsed.weaknesses || [];
        parsed.strengths = parsed.strengths || [];
        if (parsed.score > (parsed.maxScore || 10)) parsed.score = parsed.maxScore || 10;
        const capScore = (parsed.maxScore || 10) * 0.95;
        if (parsed.score > capScore) parsed.score = capScore;
        return parsed;
    }

    // Fallback: return a graceful error result instead of throwing
    console.error('[GradeSubmission] All JSON parse attempts failed. Raw text length:', rawText.length);
    return {
        score: 0,
        maxScore: 10,
        feedback: 'Hệ thống chấm điểm gặp lỗi kỹ thuật khi phân tích kết quả. Vui lòng thử chấm lại.',
        details: 'AI đã trả về kết quả nhưng định dạng không hợp lệ. Bài làm đã được ghi nhận.',
        errors: [],
        improvements: ['Thử chấm lại bài để nhận kết quả chính xác'],
        weaknesses: [],
        strengths: [],
    };
}
