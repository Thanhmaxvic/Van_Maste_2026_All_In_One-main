import { SYSTEM_PROMPT, CHAT_HISTORY_LIMIT } from '../constants';
import type { Message, UserProfile, AIExamData, ExamGrade } from '../types';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

function getApiKey(): string {
    return import.meta.env.VITE_GOOGLE_API_KEY || '';
}

/**
 * Send a chat message to Gemini 2.5 Flash and get a response.
 */
export async function sendChatMessage(
    messages: Message[],
    userText: string,
    previewImage: string | null,
    userProfile?: UserProfile | null
): Promise<{ text: string; generatedImageUrl: string | null }> {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('API_KEY_MISSING');

    // Build [PROFILE] context block for profile-aware AI responses
    let profileBlock = '';
    if (userProfile) {
        const avg = userProfile.avgScore != null ? userProfile.avgScore.toFixed(1) : 'chua co';
        const target = userProfile.targetScore ?? 8;
        const weaknesses = (userProfile.weaknesses || []).slice(0, 3).join(', ') || 'chua xac dinh';
        const strengths = (userProfile.strengths || []).slice(0, 3).join(', ') || 'chua xac dinh';
        const vg = userProfile.voiceGender || 'male';
        const xungHo = vg === 'female' ? 'cô' : 'thầy';
        profileBlock = `\n[PROFILE HOC SINH]\n- Ten: ${userProfile.name}\n- Diem TB: ${avg}/10 | Muc tieu: ${target}/10\n- Diem yeu: ${weaknesses}\n- Diem manh: ${strengths}\n- Bai da nop: ${userProfile.submissionCount ?? 0}\n- Xung ho: "${xungHo}" - "em"\n[/PROFILE]\n\nDua vao profile tren, tu dong dieu chinh lo trinh goi y. LUON xung ho la "${xungHo}" khi noi voi hoc sinh.`;
    }

    const parts: unknown[] = [{ text: SYSTEM_PROMPT + profileBlock }];

    messages.slice(-CHAT_HISTORY_LIMIT).forEach((m) => {
        parts.push({ text: `${m.role}: ${m.content}` });
    });

    if (previewImage) {
        const base64Data = previewImage.includes(',') ? previewImage.split(',')[1] : previewImage;
        if (base64Data) parts.push({ inlineData: { mimeType: 'image/png', data: base64Data } });
    }

    parts.push({ text: userText });

    const res = await fetch(`${GEMINI_BASE_URL}/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts }] }),
    });

    const data = await res.json();
    const aiContent = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Hệ thống đang bận, thử lại sau nhé!';

    let generatedImageUrl: string | null = null;
    if (aiContent.includes('[GEN_IMAGE]')) {
        const imagePrompt = aiContent.split('[GEN_IMAGE]')[1].split('\n')[0].trim();
        generatedImageUrl = await generateImage(imagePrompt);
    }

    const cleanedContent = aiContent.replace(/\[GEN_IMAGE\].*/s, '');
    return { text: cleanedContent, generatedImageUrl };
}

/**
 * Send a grading request (no system prompt, just pure grading).
 */
export async function sendGradingRequest(prompt: string): Promise<string> {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('API_KEY_MISSING');

    const res = await fetch(`${GEMINI_BASE_URL}/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
    });

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
}

/**
 * Generate an image using Imagen 3.0.
 */
export async function generateImage(prompt: string): Promise<string | null> {
    const apiKey = getApiKey();
    if (!apiKey) return null;
    try {
        const res = await fetch(`${GEMINI_BASE_URL}/nano-banana-pro-preview:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        });
        const data = await res.json();
        if (data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
            return `data:image/png;base64,${data.candidates[0].content.parts[0].inlineData.data}`;
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
    const res = await fetch(`${GEMINI_BASE_URL}/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: `Viết lại câu sau cho hay hơn, tự nhiên hơn: "${text}"` }] }] }),
    });
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
}

/**
 * Generate a diagnostic quiz.
 */
export async function generateDiagnosticQuiz(prompt: string): Promise<string> {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('API_KEY_MISSING');
    const res = await fetch(`${GEMINI_BASE_URL}/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Lỗi tạo bài kiểm tra chẩn đoán';
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

    const res = await fetch(`${GEMINI_BASE_URL}/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
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
export async function generateDiagnosticMCQ(prompt: string): Promise<DiagnosticQuizData | null> {
    const apiKey = getApiKey();
    if (!apiKey) return null;
    try {
        const res = await fetch(`${GEMINI_BASE_URL}/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        });
        const data = await res.json();
        let raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        // Strip markdown code fences if present
        raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
        return JSON.parse(raw) as DiagnosticQuizData;
    } catch (err) {
        console.error('generateDiagnosticMCQ error:', err);
        return null;
    }
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
        const res = await fetch(`${GEMINI_BASE_URL}/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] }),
        });
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    } catch {
        return null;
    }
}

/**
 * Generate an educational infographic about a Vietnamese literary work
 * using Nano Banana Pro (gemini-3-pro-image-preview model).
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
        // nano-banana-pro-preview = Nanobanana Pro (confirmed available)
        const NANO_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
        const res = await fetch(`${NANO_BASE}/nano-banana-pro-preview:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
            }),
        });
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
export async function generateAIExam(prompt: string): Promise<AIExamData | null> {
    const apiKey = getApiKey();
    if (!apiKey) return null;
    try {
        const res = await fetch(`${GEMINI_BASE_URL}/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        });
        const data = await res.json();
        let raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
        return JSON.parse(raw) as AIExamData;
    } catch (err) {
        console.error('generateAIExam error:', err);
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

        const res = await fetch(`${GEMINI_BASE_URL}/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] }),
        });
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
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

    const parts: any[] = [{ text: prompt }];

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

    const res = await fetch(`${GEMINI_BASE_URL}/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: {
                temperature: 0.2,
            }
        }),
    });

    if (!res.ok) {
        throw new Error(`API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]) as ExamGrade;
            parsed.errors = parsed.errors || [];
            parsed.improvements = parsed.improvements || [];
            parsed.weaknesses = parsed.weaknesses || [];
            parsed.strengths = parsed.strengths || [];
            if (parsed.score > parsed.maxScore) parsed.score = parsed.maxScore;
            return parsed;
        }
    } catch (e) {
        console.error('Failed to parse AI grading JSON:', e, 'RawText:', rawText);
    }

    return {
        score: 0,
        maxScore: 10,
        feedback: rawText || 'Không thể đọc được kết quả hoặc có lỗi.',
        details: 'Không có chi tiết.',
        errors: [],
        improvements: [],
        weaknesses: [],
        strengths: []
    } as ExamGrade;
}
