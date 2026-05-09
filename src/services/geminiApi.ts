import { SYSTEM_PROMPT, CHAT_HISTORY_LIMIT, KNOWLEDGE_DOCS } from '../constants';
import type { Message, UserProfile, AIExamData, ExamGrade } from '../types';

export const GEMINI_MODELS = [
    'gemini-3.1-flash-preview',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash'
];

function getApiKey(): string { return 'backend'; }

/**
 * Helper: Fetch with exponential backoff for 503/429/529 errors.
 */
async function fetchWithRetry(url: string, options?: RequestInit, retries = 3, baseDelayMs = 2000): Promise<Response> {
    let lastRes: Response | null = null;
    for (let i = 0; i <= retries; i++) {
        try {
            const res = await fetch(url, options);
            lastRes = res;
            if (res.ok || (res.status !== 503 && res.status !== 529)) {
                return res;
            }
            if (i === retries) break;
            await new Promise(resolve => setTimeout(resolve, baseDelayMs * Math.pow(2, i)));
        } catch (err: any) {
            if (err.name === 'AbortError') throw err;
            if (i === retries) throw err;
            await new Promise(resolve => setTimeout(resolve, baseDelayMs * Math.pow(2, i)));
        }
    }
    return lastRes!;
}

/**
 * Send a chat message to Gemini 2.5 Flash and get a response.
 */
export async function sendChatMessage(
    messages: Message[],
    userText: string,
    previewImage: string | null,
    userProfile?: UserProfile | null,
    signal?: AbortSignal
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

    const parts: unknown[] = [{ text: SYSTEM_PROMPT + datetimeBlock + profileBlock }];

    messages.slice(-CHAT_HISTORY_LIMIT).forEach((m) => {
        parts.push({ text: `${m.role}: ${m.content}` });
    });

    if (previewImage) {
        const base64Data = previewImage.includes(',') ? previewImage.split(',')[1] : previewImage;
        if (base64Data) parts.push({ inlineData: { mimeType: 'image/png', data: base64Data } });
    }

    parts.push({ text: userText });

    let res: Response | null = null;
    for (const model of GEMINI_MODELS) {
        res = await fetchWithRetry(`/api/gemini?model=${model}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ role: 'user', parts }] }),
            signal,
        });
        if (res.ok) break;
        if (res.status === 429) break;
        console.warn(`[Chat] Model ${model} returned ${res.status}, trying next...`);
    }

    if (!res || !res.ok) {
        let errorDetail = '';
        try { errorDetail = await res?.text() || ''; } catch { /* ignore */ }
        console.error(`[Chat] All models failed. Last status: ${res?.status} — ${errorDetail}`);
        throw new Error(`API error: ${res?.status} ${res?.statusText}`);
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
                const followUpContents = [
                    { role: 'user', parts: parts },
                    { role: 'model', parts: [{ text: `[FETCH_DOC] Đang đọc ${docNames.join(', ')}...` }] },
                    { role: 'user', parts: [{ text: followUpText }] }
                ];
                
                let followUpRes: Response | null = null;
                for (const model of GEMINI_MODELS) {
                    followUpRes = await fetchWithRetry(`/api/gemini?model=${model}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ contents: followUpContents }),
                        signal,
                    });
                    if (followUpRes.ok) break;
                    if (followUpRes.status === 429) break;
                    console.warn(`[RAG] Model ${model} returned ${followUpRes.status}, trying next...`);
                }
                
                if (!followUpRes || !followUpRes.ok) {
                    throw new Error(`API error: ${followUpRes?.status} ${followUpRes?.statusText}`);
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
 * Send a grading request (no system prompt, just pure grading).
 */
export async function sendGradingRequest(prompt: string, signal?: AbortSignal): Promise<string> {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('API_KEY_MISSING');

    const modelsToTry = GEMINI_MODELS;
    for (const model of modelsToTry) {
        try {
            const res = await fetchWithRetry(`/api/gemini?model=${model}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
                signal,
            }, 4, 3000);
            if (!res.ok) {
                if (res.status === 429) break;
                console.warn(`[Grading] Model ${model} returned ${res.status}, trying next...`);
                continue;
            }
            const data = await res.json();
            return data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        } catch (err) {
            console.error(`[Grading] Error with model ${model}:`, err);
        }
    }
    return '{}';
}

/**
 * Generate an image using Gemini 3.1 Flash Image Preview.
 */
export async function generateImage(prompt: string): Promise<string | null> {
    const apiKey = getApiKey();
    if (!apiKey) return null;
    try {
        const res = await fetchWithRetry(`/api/gemini?model=gemini-3.1-flash-image-preview`, {
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
 * Rewrite text to improve writing style.
 */
export async function rewriteText(text: string): Promise<string | null> {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('API_KEY_MISSING');

    const modelsToTry = GEMINI_MODELS;
    for (const model of modelsToTry) {
        try {
            const res = await fetchWithRetry(`/api/gemini?model=${model}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: `Viết lại câu sau cho hay hơn, tự nhiên hơn: "${text}"` }] }] }),
            });
            if (!res.ok) {
                if (res.status === 429) break;
                console.warn(`[Rewrite] Model ${model} returned ${res.status}, trying next...`);
                continue;
            }
            const data = await res.json();
            const result = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (result) return result;
        } catch (err) {
            console.error(`[Rewrite] Error with model ${model}:`, err);
        }
    }
    return null;
}

/**
 * Generate a diagnostic quiz.
 */
export async function generateDiagnosticQuiz(prompt: string): Promise<string> {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('API_KEY_MISSING');

    const modelsToTry = GEMINI_MODELS;
    for (const model of modelsToTry) {
        try {
            const res = await fetchWithRetry(
                `/api/gemini?model=${model}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
                },
                4, 3000
            );
            if (!res.ok) {
                if (res.status === 429) break;
                console.warn(`[DiagnosticQuiz] Model ${model} returned ${res.status}, trying next...`);
                continue;
            }
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) return text;
        } catch (err) {
            console.error(`[DiagnosticQuiz] Error with model ${model}:`, err);
        }
    }
    return 'Lỗi tạo bài kiểm tra chẩn đoán';
}

/**
 * Generate short, concrete advice to fix current weaknesses.
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

    let res: Response | null = null;
    for (const model of GEMINI_MODELS) {
        res = await fetchWithRetry(`/api/gemini?model=${model}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        });
        if (res.ok) break;
        if (res.status === 429) break;
    }
    if (!res || !res.ok) {
        throw new Error(`API error: ${res?.status} ${res?.statusText}`);
    }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
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
 * Generate a 10-question diagnostic MCQ quiz with a passage.
 * Returns parsed JSON data.
 */
export async function generateDiagnosticMCQ(prompt: string, signal?: AbortSignal): Promise<DiagnosticQuizData | null> {
    const apiKey = getApiKey();
    if (!apiKey) return null;

    // Try primary model first, then fallback
    const modelsToTry = GEMINI_MODELS;

    for (const model of modelsToTry) {
        try {
            console.log(`[Quiz] Trying model: ${model}`);
            const res = await fetchWithRetry(
                `/api/gemini?model=${model}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { temperature: 0.7 },
                    }),
                    signal,
                },
                4,   // more retries for quiz generation
                3000 // longer base delay (3s, 6s, 12s, 24s)
            );
            if (!res.ok) {
                if (res.status === 429) break;
                console.warn(`[Quiz] Model ${model} returned ${res.status}, trying next...`);
                continue; // try fallback model
            }
            const data = await res.json();
            let raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (!raw) {
                console.warn(`[Quiz] Model ${model} returned empty text, trying next...`);
                continue;
            }
            // Strip markdown code fences if present (handles ```json, ```JSON, ``` etc.)
            raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
            // Fix trailing commas before } or ] (common AI output issue)
            raw = raw.replace(/,\s*([}\]])/g, '$1');
            return JSON.parse(raw) as DiagnosticQuizData;
        } catch (err) {
            console.error(`[Quiz] Error with model ${model}:`, err);
            // Continue to next model
        }
    }

    console.error('[Quiz] All models failed to generate quiz.');
    return null;
}

/**
 * Generate a proactive follow-up question based on chat history.
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
        let res: Response | null = null;
        for (const model of GEMINI_MODELS) {
            res = await fetchWithRetry(`/api/gemini?model=${model}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] }),
            });
            if (res.ok) break;
            if (res.status === 429) break;
        }
        if (!res || !res.ok) {
            throw new Error(`API error: ${res?.status} ${res?.statusText}`);
        }
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    } catch {
        return null;
    }
}

/**
 * Generate an educational infographic about a Vietnamese literary work
 * using Gemini 3.1 Flash Image Preview.
 * Returns a base64 data URL string or null on failure.
 */
export async function generateInfographic(workTitle: string): Promise<string | null> {
    const apiKey = getApiKey();
    if (!apiKey) return null;

    const prompt = `Create a beautiful, professional educational infographic in Vietnamese about the Vietnamese literary work "${workTitle}". 
Include: author name, publication year, literary genre, main themes (3-4), plot summary (brief), main characters, literary devices used, significance in Vietnamese literature curriculum.
Style: Modern educational poster, clean layout, rich warm colors (gold, deep red, cream), Vietnamese cultural aesthetic.
Text must be clear, readable Vietnamese. High contrast. Suitable for high school students studying for university entrance exam.
Format: vertical infographic, 1024x1536px equivalent proportions.`;

    try {
        const res = await fetchWithRetry(`/api/gemini?model=gemini-3.1-flash-image-preview`, {
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
 * Generate an AI exam based on type (reading/writing/full).
 * Returns parsed AIExamData or null on failure.
 */
export async function generateAIExam(prompt: string, signal?: AbortSignal): Promise<AIExamData | null> {
    const apiKey = getApiKey();
    if (!apiKey) return null;

    const modelsToTry = GEMINI_MODELS;
    for (const model of modelsToTry) {
        try {
            console.log(`[AIExam] Trying model: ${model}`);
            const res = await fetchWithRetry(
                `/api/gemini?model=${model}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
                    signal,
                },
                4, 3000
            );
            if (!res.ok) {
                if (res.status === 429) break;
                console.warn(`[AIExam] Model ${model} returned ${res.status}, trying next...`);
                continue;
            }
            const data = await res.json();
            let raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (!raw) continue;
            raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
            raw = raw.replace(/,\s*([}\]])/g, '$1');
            return JSON.parse(raw) as AIExamData;
        } catch (err) {
            console.error(`[AIExam] Error with model ${model}:`, err);
        }
    }
    console.error('[AIExam] All models failed.');
    return null;
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
 * Generate an AI auto-response for the student-teacher chat.
 * This function is called automatically when a student sends a message.
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

        const modelsToTry = GEMINI_MODELS;
        for (const model of modelsToTry) {
            try {
                const res = await fetchWithRetry(`/api/gemini?model=${model}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] }),
                });
                if (!res.ok) {
                    if (res.status === 429) break;
                    console.warn(`[AutoResponse] Model ${model} returned ${res.status}, trying next...`);
                    continue;
                }
                const data = await res.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                if (text) return text;
            } catch (err) {
                console.error(`[AutoResponse] Error with model ${model}:`, err);
            }
        }
        return null;
    } catch (err) {
        console.error('Chat auto-response error:', err);
        return null;
    }
}

/**
 * Grade student submission using Gemini with File support
 * Supports images, PDF, and DOCX (via mammoth).
 */
export async function gradeStudentSubmission(prompt: string, file: File | null): Promise<ExamGrade> {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('API_KEY_MISSING');

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

    const modelsToTry = GEMINI_MODELS;
    let lastError: Error | null = null;

    for (const model of modelsToTry) {
        try {
            const res = await fetchWithRetry(`/api/gemini?model=${model}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts }],
                    generationConfig: {
                        temperature: 0.2,
                    }
                }),
            }, 4, 3000);

            if (!res.ok) {
                if (res.status === 429) break;
                console.warn(`[GradeSubmission] Model ${model} returned ${res.status}, trying next...`);
                continue;
            }

            const data = await res.json();
            const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

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
            } catch (e) {
                console.error(`[GradeSubmission] Failed to parse JSON from model ${model}:`, e);
            }
        } catch (err) {
            console.error(`[GradeSubmission] Error with model ${model}:`, err);
            lastError = err as Error;
        }
    }

    if (lastError) throw lastError;

    return {
        score: 0,
        maxScore: 10,
        feedback: 'Không thể đọc được kết quả hoặc có lỗi.',
        details: 'Không có chi tiết.',
        errors: [],
        improvements: [],
        weaknesses: [],
        strengths: []
    } as ExamGrade;
}
