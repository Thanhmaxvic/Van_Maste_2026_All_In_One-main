import { SYSTEM_PROMPT, CHAT_HISTORY_LIMIT, KNOWLEDGE_DOCS } from '../constants';
import type { Message, UserProfile, AIExamData, ExamGrade } from '../types';

// ================================================================
// ██ CẤU HÌNH API — PHÂN TÁCH 2 LUỒNG RÕ RÀNG ██
// ================================================================

// ── LUỒNG 1: DEEPSEEK — Tạo văn bản (Text/Chat) ──
// Máy chủ AI tự host, chuẩn OpenAI Compatible
const DEEPSEEK_ENDPOINT = 'http://36.50.135.174:20128/v1/chat/completions';
const DEEPSEEK_API_KEY = 'sk-1b3e1db5a7217c40-rdqzqx-8cdc26e7';
const DEEPSEEK_MODEL = 'my-deepseek';

// ── LUỒNG 2: GEMINI — Tạo hình ảnh (Image Generation) ──
// Giữ nguyên Google API Key, CHỈ dùng cho generateImage & generateInfographic
function getGeminiApiKey(): string {
    return import.meta.env.VITE_GOOGLE_API_KEY || '';
}

// ================================================================
// ██ HÀM GỌI DEEPSEEK (Thay thế toàn bộ Gemini Text cũ) ██
// ================================================================

interface DeepSeekMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

/**
 * Gọi API DeepSeek (OpenAI Compatible) để tạo văn bản.
 * Parse kết quả theo chuẩn: response.choices[0].message.content
 * Có try-catch bảo vệ, log lỗi rõ ràng, không crash server.
 */
async function callDeepSeek(
    messages: DeepSeekMessage[],
    opts?: { signal?: AbortSignal; temperature?: number; jsonMode?: boolean }
): Promise<string> {
    try {
        const payload: any = {
            model: DEEPSEEK_MODEL,
            messages,
            stream: false,
            max_tokens: 4096, // Đảm bảo phản hồi đầy đủ, không bị cắt giữa chừng
        };
        if (opts?.temperature != null) payload.temperature = opts.temperature;
        if (opts?.jsonMode) payload.response_format = { type: 'json_object' };

        const res = await fetch(DEEPSEEK_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
            },
            body: JSON.stringify(payload),
            signal: opts?.signal,
        });

        if (!res.ok) {
            const errBody = await res.text().catch(() => '');
            console.error(`[DeepSeek] API error ${res.status}: ${errBody}`);
            throw new Error(`DeepSeek API error: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        // ✅ Parse chuẩn OpenAI: response.choices[0].message.content
        return data.choices?.[0]?.message?.content || '';
    } catch (error: any) {
        if (error.name === 'AbortError') throw error; // Cho phép cancel
        console.error('[DeepSeek] Request failed:', error.message);
        throw error;
    }
}

/** Wrapper — thay thế callGemini cũ (heavy tasks: grading, exam) */
async function callPrimary(
    prompt: string,
    opts?: { signal?: AbortSignal; temperature?: number; jsonMode?: boolean }
): Promise<string> {
    return callDeepSeek([{ role: 'user', content: prompt }], opts);
}

/** Wrapper — thay thế callGeminiLight cũ (light tasks: chat, quiz, advice) */
async function callLight(
    prompt: string,
    opts?: { signal?: AbortSignal; temperature?: number; jsonMode?: boolean }
): Promise<string> {
    return callDeepSeek([{ role: 'user', content: prompt }], opts);
}

/**
 * Gửi tin nhắn chat và nhận phản hồi.
 * [ĐÃ CHUYỂN] Từ Gemini → DeepSeek (OpenAI Compatible)
 */
export async function sendChatMessage(
    messages: Message[],
    userText: string,
    previewImage: string | null,
    userProfile?: UserProfile | null,
    signal?: AbortSignal
): Promise<{ text: string; generatedImageUrl: string | null }> {

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

    // ── [DEEPSEEK] Chuyển systemInstruction Gemini → system message OpenAI ──
    const systemMsg: DeepSeekMessage = {
        role: 'system',
        content: SYSTEM_PROMPT + datetimeBlock + profileBlock,
    };

    // Build messages array theo chuẩn OpenAI (thay vì contents/parts của Gemini)
    const chatMessages: DeepSeekMessage[] = [systemMsg];
    messages.slice(-CHAT_HISTORY_LIMIT).forEach((m) => {
        chatMessages.push({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content,
        });
    });

    // Nếu có hình ảnh đính kèm, thêm ghi chú vào nội dung (DeepSeek chỉ hỗ trợ text)
    let imageNote = '';
    if (previewImage) {
        imageNote = '\n[Học sinh đã gửi kèm một hình ảnh]';
    }

    // ── PRE-DETECT RAG: scan user text for known doc topics ──
    let ragDocsText = '';
    const userLower = userText.toLowerCase();
    const matchedDocNames: string[] = [];
    for (const docName of Object.keys(KNOWLEDGE_DOCS)) {
        const keywords = docName.toLowerCase().replace(/_/g, ' ').split('lớp')[0].trim();
        if (keywords.length >= 3 && userLower.includes(keywords)) {
            matchedDocNames.push(docName);
        }
    }
    const docsToFetch = matchedDocNames.slice(0, 2);
    if (docsToFetch.length > 0) {
        try {
            const mammoth = await import('mammoth');
            for (const docName of docsToFetch) {
                const docUrl = KNOWLEDGE_DOCS[docName];
                if (docUrl && docUrl.endsWith('.docx')) {
                    try {
                        const docRes = await fetch(encodeURI(docUrl), { signal });
                        if (docRes.ok) {
                            const arrayBuffer = await docRes.arrayBuffer();
                            const result = await mammoth.extractRawText({ arrayBuffer });
                            ragDocsText += `\n--- Tài liệu: ${docName} ---\n${result.value.substring(0, 5000)}\n`;
                        }
                    } catch (err) {
                        console.error(`Lỗi khi fetch docx RAG (${docName}):`, err);
                    }
                }
            }
        } catch { /* mammoth import error */ }
    }

    // Build user message cuối cùng với RAG context
    let finalUserText = userText + imageNote;
    if (ragDocsText.trim()) {
        finalUserText = `${finalUserText}\n\n[TÀI LIỆU THAM KHẢO — dùng để trả lời, KHÔNG cần gọi [FETCH_DOC]]:\n${ragDocsText}`;
    }
    chatMessages.push({ role: 'user', content: finalUserText });

    // ── [DEEPSEEK] Gọi DeepSeek thay vì Gemini ──
    let aiContent = await callDeepSeek(chatMessages, { signal });
    if (!aiContent) aiContent = 'Hệ thống đang bận, thử lại sau nhé!';

    // Handle [FETCH_DOC] fallback — only if AI still requests a doc we didn't pre-fetch
    if (aiContent.includes('[FETCH_DOC]')) {
        const docNameRaw = aiContent.split('[FETCH_DOC]')[1].split('\n')[0].trim();
        const docNames = docNameRaw.replace(/[.,;!"']+$/, '').split('|').map((n: string) => n.trim()).filter(Boolean);
        // Filter out already-fetched docs
        const unfetched = docNames.filter((n: string) => !docsToFetch.includes(n));
        
        let combinedDocsText = '';
        if (unfetched.length > 0) {
            try {
                const mammoth = await import('mammoth');
                for (const docName of unfetched.slice(0, 2)) {
                    const docUrl = KNOWLEDGE_DOCS[docName];
                    if (docUrl && docUrl.endsWith('.docx')) {
                        try {
                            const docRes = await fetch(encodeURI(docUrl), { signal });
                            if (docRes.ok) {
                                const arrayBuffer = await docRes.arrayBuffer();
                                const result = await mammoth.extractRawText({ arrayBuffer });
                                combinedDocsText += `\n--- Tài liệu: ${docName} ---\n${result.value.substring(0, 5000)}\n`;
                            }
                        } catch (err) {
                            console.error(`Lỗi khi fetch docx RAG (${docName}):`, err);
                        }
                    }
                }
            } catch { /* mammoth import error */ }
        }
        
        if (combinedDocsText.trim()) {
            try {
                // [DEEPSEEK] Follow-up RAG call — chuyển từ Gemini sang DeepSeek
                const followUpMessages: DeepSeekMessage[] = [
                    ...chatMessages,
                    { role: 'assistant', content: `[FETCH_DOC] Đang đọc ${docNames.join(', ')}...` },
                    { role: 'user', content: `Nội dung tài liệu đã được tải:\n${combinedDocsText}\n\nHãy trả lời câu hỏi của học sinh dựa trên tài liệu này.` },
                ];
                const followUpResult = await callDeepSeek(followUpMessages, { signal });
                if (followUpResult) aiContent = followUpResult;
            } catch (err) {
                console.error('Lỗi khi gọi lại DeepSeek:', err);
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
 * Gửi yêu cầu chấm điểm.
 * [ĐÃ CHUYỂN] Từ Gemini → DeepSeek
 */
export async function sendGradingRequest(prompt: string, signal?: AbortSignal): Promise<string> {
    const result = await callPrimary(prompt, { signal, jsonMode: true });
    return result || '{}';
}

// ================================================================
// ██ TẠO HÌNH ẢNH — GIỮ NGUYÊN GEMINI (KHÔNG THAY ĐỔI) ██
// ================================================================

/**
 * Tạo hình ảnh bằng Gemini 3.1 Flash Image Preview.
 * ⚠️ LUỒNG GEMINI — TUYỆT ĐỐI KHÔNG CHỈNH SỬA
 */
export async function generateImage(prompt: string): Promise<string | null> {
    const apiKey = getGeminiApiKey();
    if (!apiKey) return null;
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${apiKey}`, {
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

// ================================================================
// ██ CÁC CHỨC NĂNG VĂN BẢN KHÁC — SỬ DỤNG DEEPSEEK ██
// ================================================================

/** Viết lại văn bản. [ĐÃ CHUYỂN] Gemini → DeepSeek */
export async function rewriteText(text: string): Promise<string | null> {
    const result = await callLight(`Viết lại câu sau cho hay hơn, tự nhiên hơn: "${text}"`);
    return result?.trim() || null;
}

/** Tạo bài kiểm tra chẩn đoán. [ĐÃ CHUYỂN] Gemini → DeepSeek */
export async function generateDiagnosticQuiz(prompt: string): Promise<string> {
    const result = await callLight(prompt);
    return result || 'Lỗi tạo bài kiểm tra chẩn đoán';
}

/** Tạo lời khuyên khắc phục điểm yếu. [ĐÃ CHUYỂN] Gemini → DeepSeek */
export async function generateWeaknessAdvice(weaknesses: string[], pronoun = 'thầy'): Promise<string | null> {
    if (weaknesses.length === 0) return null;
    const list = weaknesses.slice(0, 3).join('; ');
    const prompt = `Học sinh Ngữ văn đang có các điểm yếu sau: ${list}.
Trong tối đa 2 câu ngắn gọn, hãy gợi ý CỤ THỂ cách em có thể khắc phục các điểm yếu này khi ôn thi tốt nghiệp THPT môn Văn.
Yêu cầu:
- Xưng hô "${pronoun}" - "em"
- Không mở đầu rào trước đón sau, đi thẳng vào hành động cần làm
- Không dùng gạch đầu dòng
- Tổng độ dài tối đa khoảng 60–80 từ.`;
    const result = await callLight(prompt);
    return result?.trim() || null;
}

/** Vẫn kiểm tra Google API Key vì cần cho tạo ảnh Gemini */
export function isApiKeyConfigured(): boolean {
    return Boolean(getGeminiApiKey());
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
 * Tạo bài trắc nghiệm MCQ chẩn đoán.
 * [ĐÃ CHUYỂN] Từ Gemini → DeepSeek
 */
export async function generateDiagnosticMCQ(prompt: string, signal?: AbortSignal): Promise<DiagnosticQuizData | null> {
    try {
        let raw = await callDeepSeek(
            [{ role: 'user', content: prompt }],
            { signal, temperature: 0.7, jsonMode: true }
        );
        if (!raw) throw new Error('API returned empty text');
        // Strip markdown code fences if present
        raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
        // Fix trailing commas before } or ]
        raw = raw.replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(raw) as DiagnosticQuizData;
    } catch (err) {
        console.error('[Quiz] Error:', err);
        return null;
    }
}

/** Tạo câu hỏi chủ động. [ĐÃ CHUYỂN] Gemini → DeepSeek */
export async function sendProactiveMessage(
    messages: { role: string; content: string }[],
    proactivePrompt: string,
    pronoun = 'thầy',
): Promise<string | null> {
    const Pronoun = pronoun.charAt(0).toUpperCase() + pronoun.slice(1);
    try {
        const historyText = messages
            .slice(-6)
            .map(m => `${m.role === 'user' ? 'Học sinh' : Pronoun}: ${m.content}`)
            .join('\n');
        const fullPrompt = `${proactivePrompt}\n\nLịch sử chat:\n${historyText}`;
        const result = await callLight(fullPrompt);
        return result?.trim() || null;
    } catch {
        return null;
    }
}

/**
 * Generate an educational infographic about a Vietnamese literary work
 * using Gemini 3.1 Flash Image Preview.
 * Returns a base64 data URL string or null on failure.
 */
export async function generateInfographic(workTitle: string, signal?: AbortSignal): Promise<string | null> {
    const apiKey = getGeminiApiKey();
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
 * Tạo đề thi AI. [ĐÃ CHUYỂN] Gemini → DeepSeek
 */
export async function generateAIExam(prompt: string, signal?: AbortSignal): Promise<AIExamData | null> {
    try {
        let raw = await callPrimary(prompt, { signal });
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
 * Tạo phản hồi tự động cho chat học sinh-giáo viên.
 * [ĐÃ CHUYỂN] Gemini → DeepSeek
 */
export async function generateChatAutoResponse(
    userMessage: string,
    chatHistory: { role: string; content: string }[] = [],
): Promise<string | null> {
    try {
        const historyText = chatHistory
            .slice(-6)
            .map(m => `${m.role === 'student' ? 'Học sinh' : 'Trợ lý'}: ${m.content}`)
            .join('\n');
        const fullPrompt = `${CHAT_AUTO_RESPONDER_PROMPT}\n\nLịch sử chat gần đây:\n${historyText}\n\nHọc sinh vừa gửi: "${userMessage}"\n\nTrả lời ngắn gọn:`;
        const result = await callLight(fullPrompt);
        return result?.trim() || null;
    } catch (err) {
        console.error('Chat auto-response error:', err);
        return null;
    }
}

/**
 * Chấm bài học sinh bằng DeepSeek.
 * [ĐÃ CHUYỂN] Gemini → DeepSeek
 * Hỗ trợ: DOCX (trích xuất text), TXT. Ảnh/PDF chỉ ghi chú (DeepSeek không hỗ trợ multimodal).
 */
export async function gradeStudentSubmission(prompt: string, file: File | null): Promise<ExamGrade> {
    const enhancedPrompt = prompt + `\n\n⑧ PHÁT HIỆN SỬ DỤNG AI ĐỂ VIẾT BÀI (AI-GENERATED CONTENT):
   Chỉ áp dụng quét AI cho CÂU NGHỊ LUẬN XÃ HỘI (NLXH) và CÂU NGHỊ LUẬN VĂN HỌC (NLVH). KHÔNG quét và KHÔNG trừ điểm đối với phần Đọc hiểu.
   
   CẢNH BÁO QUAN TRỌNG: Học sinh thường học thuộc "văn mẫu", do đó việc xuất hiện vài từ ngữ rập khuôn là RẤT BÌNH THƯỜNG. Để tránh "nhầm lẫn" học sinh với AI, bạn PHẢI phân tích cực kỳ cẩn thận, tổng thể và CHỈ kết luận là AI sử dụng Cơ chế Kết hợp dưới đây.

   =>> BƯỚC 1: NHẬN DIỆN CÁC NHÓM DẤU HIỆU:
   [DANH SÁCH DẤU HIỆU TRỌNG YẾU - LỖI CẤU TRÚC]
   (A1) Bullet points vô lý: Dùng gạch đầu dòng, danh sách liệt kê phân mảnh thay vì viết thành đoạn văn nghị luận hoàn chỉnh.
   (A2) Phân tích suông diện rộng: Đoạn văn cực kỳ dài, hoa mỹ nhưng tóm tắt nội dung 100%, KHÔNG HỀ có bất kỳ một câu nào phân tích chi tiết vào từ ngữ, hình ảnh nghệ thuật, hay biện pháp tu từ của đoạn trích.
   
   [DANH SÁCH DẤU HIỆU PHỤ - LỖI TỪ VỰNG & VĂN PHONG]
   (B1) Từ vựng sáo rỗng dày đặc: "Quả thật,", "Thật vậy,", "Bức tranh toàn cảnh," "Có thể nói rằng," "Như một lời khẳng định đanh thép", "Ám ảnh tâm trí người đọc".
   (B2) Chuyển ý công nghiệp (Dịch từ phương Tây): "Cuối cùng nhưng không kém phần quan trọng", "Thứ nhất,", "Thứ hai,", "Nhìn chung lại,".
   (B3) Vô cảm tuyệt đối: Hoàn hảo về ngữ pháp, lạm dụng câu hỏi tu từ ("Phải chăng...", "Liệu rằng...") nhưng văn phong lạnh lẽo giống như đọc tài liệu bách khoa toàn thư, không có ngôn ngữ tự nhiên của học sinh.

   =>> BƯỚC 2: CƠ CHẾ KẾT BỘ TEST (CHỈ KẾT LUẬN LÀ AI KHI THỎA MÃN):
   Chỉ được phép kết luận đoạn văn do AI viết nếu nó thỏa mãn MỘT TRONG HAI điều kiện tổng thể sau:
   - Điều kiện 1: Có RÕ RÀNG Ít nhất 1 Cờ [GIAN LẬN] ở đầu bài + Bộc lộ thêm Ít nhất 2 Dấu hiệu Phụ (B1/B2/B3).
   - Điều kiện 2: KHÔNG có cờ gian lận, nhưng bài viết vi phạm Ít nhất 1 Dấu hiệu Trọng yếu (A1 hoặc A2) CỘNG VỚI Ít nhất 2 Dấu hiệu Phụ (B1/B2/B3) đồng thời.

   =>> BƯỚC 3: CƠ CHẾ XỬ PHẠT TẠI CHỖ (ÁP DỤNG KHI BƯỚC 2 DƯƠNG TÍNH):
   - Tách bạch điểm: CHỈ TRỪ ĐIỂM CỦA RIÊNG CÂU BỊ PHÁT HIỆN. Không trừ lây lan phần tự viết hoặc Đọc hiểu.
   - Mức phạt: Trừ ĐÚNG 50% số điểm đáng lý nhận được ở câu vi phạm. (Ví dụ câu đó đáng lý được 4.0 điểm -> phạt 50% -> chỉ cho 2.0 điểm).
   - Ghi rõ Feedback BẮT BUỘC: "Câu [Nghị luận...] mang đậm văn phong máy móc của AI/ChatGPT theo đánh giá tổng thể cấu trúc và từ vựng. Bài thi đã bị trừ 50% số điểm tại phần này. Hãy tự viết bằng cốt lõi hiểu biết của mình."
   (TUYỆT ĐỐI không ghi thẻ "lạm dụng ai" vào mảng weaknesses, không để lại vết sẹo dữ liệu dài hạn).

   LƯU Ý CUỐI: Nếu có cờ "[GIAN LẬN]" ở đầu bài nhưng văn phong bài viết HOÀN TOÀN CỦA CON NGƯỜI (không thoả mãn điều kiện văn phong AI): Châm chước giữ nguyên điểm, nhưng vẫn để lại một lời nhắc nhở nhẹ ở feedback: "Hệ thống ghi nhận em đã chuyển tab trong lúc thi, em rút kinh nghiệm nhé."`;

    // ── [DEEPSEEK] Trích xuất nội dung file thành text (thay vì gửi binary cho Gemini) ──
    let fileContentText = '';
    if (file) {
        if (file.name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const mammoth = await import('mammoth');
                const result = await mammoth.extractRawText({ arrayBuffer });
                fileContentText = `\n--- NỘI DUNG VĂN BẢN ĐÍNH KÈM ---\n${result.value}\n-----------------------------------\n`;
            } catch (e) {
                console.error('Lỗi khi đọc file docx:', e);
                fileContentText = `\n(Lưu ý: Không thể đọc được nội dung từ file docx đính kèm.)\n`;
            }
        } else if (file.type.startsWith('image/') || file.type === 'application/pdf') {
            // DeepSeek chỉ hỗ trợ text — ghi chú cho AI biết có file đính kèm
            fileContentText = `\n(Học sinh đã nộp file ${file.type.startsWith('image/') ? 'ảnh' : 'PDF'}: ${file.name}. Hãy chấm dựa trên nội dung bài viết trong prompt.)\n`;
        } else {
            try {
                const text = await file.text();
                fileContentText = `\n--- NỘI DUNG VĂN BẢN ĐÍNH KÈM ---\n${text}\n-----------------------------------\n`;
            } catch (e) {
                console.error('Lỗi đọc file txt:', e);
            }
        }
    }

    const fullPrompt = enhancedPrompt + fileContentText;

    // ── [DEEPSEEK] Gọi DeepSeek thay vì Gemini ──
    const rawText = await callDeepSeek(
        [{ role: 'user', content: fullPrompt }],
        { temperature: 0.2, jsonMode: true }
    );

    try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            let cleanJson = jsonMatch[0].replace(/,\s*([}\]])/g, '$1');
            const parsed = JSON.parse(cleanJson) as ExamGrade;
            parsed.errors = parsed.errors || [];
            parsed.improvements = parsed.improvements || [];
            parsed.weaknesses = parsed.weaknesses || [];
            parsed.strengths = parsed.strengths || [];
            if (parsed.score > parsed.maxScore) parsed.score = parsed.maxScore;
            const capScore = parsed.maxScore * 0.95;
            if (parsed.score > capScore) parsed.score = capScore;
            return parsed;
        }
        throw new Error('Failed to parse grading JSON from AI response.');
    } catch (e) {
        console.error(`[GradeSubmission] Parse error:`, e);
        throw e;
    }
}
