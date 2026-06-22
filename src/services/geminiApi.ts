import { KNOWLEDGE_DOCS } from '../constants';
import type { Message, UserProfile, AIExamData, ExamGrade } from '../types';
import { getSystemConfig } from './firebaseService';

// ================================================================
// ██ CẤU HÌNH — GỌI QUA BACKEND SERVER ██
// ================================================================

// Model names — chỉ dùng để Frontend hiển thị, backend quyết định model thực tế
export const PRIMARY_MODEL = 'gemini-2.5-flash';
export const LITE_MODEL = 'gemini-2.5-flash-lite';

/** Base URL — dev: http://localhost:5000, production (Vercel): rỗng (relative URL) */
function getApiBaseUrl(): string {
    return import.meta.env.VITE_API_BASE_URL || '';
}

/**
 * Kiểm tra API key — giờ chỉ cần kiểm tra backend có sẵn sàng không.
 * Frontend KHÔNG cần API key nữa.
 */
export function isApiKeyConfigured(): boolean {
    return true; // API key giờ ở backend
}

// ── Cache examDate từ Firestore system config ─────────────────────────────────
let _cachedExamDate: string | null = null;
let _examDateFetchedAt = 0;
const EXAM_DATE_CACHE_TTL = 5 * 60 * 1000; // cache 5 phút

async function getCachedExamDate(): Promise<string | undefined> {
    const now = Date.now();
    if (_cachedExamDate && now - _examDateFetchedAt < EXAM_DATE_CACHE_TTL) {
        return _cachedExamDate;
    }
    try {
        const config = await getSystemConfig();
        if (config.examDate) {
            _cachedExamDate = config.examDate as string;
            _examDateFetchedAt = now;
            return _cachedExamDate;
        }
    } catch { /* ignore */ }
    return undefined;
}

// ── Helper: gọi backend ────────────────────────────────────────────────────────

/** Client-side timeout for backend calls (55s — slightly under Vercel's 60s max) */
const BACKEND_TIMEOUT_MS = 55_000;

async function callBackend(
    endpoint: string,
    body: object,
    opts?: { signal?: AbortSignal }
): Promise<any> {
    const baseUrl = getApiBaseUrl();
    const maxAttempts = 2; // 1 initial + 1 retry for 503/429

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // Create a timeout controller, but respect caller's signal too
        const timeoutController = new AbortController();
        const timer = setTimeout(() => timeoutController.abort(), BACKEND_TIMEOUT_MS);

        // If caller provided a signal, abort our controller when it fires
        const callerSignal = opts?.signal;
        const onCallerAbort = () => timeoutController.abort();
        callerSignal?.addEventListener('abort', onCallerAbort);

        try {
            const res = await fetch(`${baseUrl}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: timeoutController.signal,
            });
            clearTimeout(timer);
            callerSignal?.removeEventListener('abort', onCallerAbort);

            if (res.ok) return res.json();

            // Read error body to check for retryable patterns
            let errorBody = '';
            try { errorBody = await res.text(); } catch { /* ignore */ }
            const isAborted = errorBody.toLowerCase().includes('aborted');

            // Retry on transient errors: 503/429/504, or 500 with "aborted" (Gemini server-side abort)
            const isRetryable = res.status === 503 || res.status === 429 || res.status === 504 ||
                (res.status === 500 && isAborted);

            if (isRetryable && attempt < maxAttempts - 1) {
                console.warn(`[Frontend] ${endpoint} returned ${res.status}${isAborted ? ' (aborted)' : ''}, retrying in 3s...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
                continue;
            }

            // Friendly error messages for common issues
            if (res.status === 504 || (res.status === 500 && isAborted)) {
                throw new Error('AI đang xử lý lâu hơn bình thường — vui lòng thử lại sau vài giây.');
            }
            if (res.status === 503) {
                throw new Error('Hệ thống AI đang quá tải. Vui lòng đợi vài giây rồi thử lại.');
            }
            if (res.status === 429) {
                throw new Error('Quá nhiều yêu cầu cùng lúc. Vui lòng đợi vài giây rồi thử lại.');
            }
            if (res.status === 500) {
                throw new Error('AI gặp lỗi kỹ thuật. Vui lòng thử lại sau vài giây.');
            }
            throw new Error(`Lỗi hệ thống (${res.status}). Vui lòng thử lại.`);
        } catch (err: any) {
            clearTimeout(timer);
            callerSignal?.removeEventListener('abort', onCallerAbort);

            // If caller explicitly aborted, rethrow immediately
            if (callerSignal?.aborted) {
                throw new Error('Yêu cầu đã bị hủy.');
            }

            // Client-side timeout
            if (err?.name === 'AbortError') {
                if (attempt < maxAttempts - 1) {
                    console.warn(`[Frontend] ${endpoint} timed out, retrying...`);
                    continue;
                }
                throw new Error('AI đang xử lý lâu hơn bình thường — vui lòng thử lại sau vài giây.');
            }

            // Network error
            if (err?.message?.includes('Failed to fetch') || err?.message?.includes('NetworkError')) {
                throw new Error('Lỗi kết nối mạng. Vui lòng kiểm tra Internet và thử lại.');
            }

            throw err;
        }
    }

    throw new Error('Hệ thống đang bận. Vui lòng thử lại sau.');
}

// ================================================================
// ██ PUBLIC API — Giống signature cũ, nhưng gọi Backend ██
// ================================================================

/**
 * Send a chat message to Gemini via Backend and get a response.
 */
export async function sendChatMessage(
    messages: Message[],
    userText: string,
    previewImage: string | null,
    userProfile?: UserProfile | null,
    signal?: AbortSignal,
    lessonContext?: string
): Promise<{ text: string; generatedImageUrl: string | null }> {
    // Frontend vẫn giữ logic FETCH_DOC (vì cần fetch từ public/) 
    // và gửi nội dung tài liệu lên backend cùng với context

    const examDate = await getCachedExamDate();

    const data = await callBackend('/api/ai/chat', {
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        userText,
        previewImage,
        userProfile: userProfile || null,
        lessonContext: lessonContext || null,
        examDate: examDate || null,
    }, { signal });

    let aiContent = data.text || 'Hệ thống đang bận, thử lại sau nhé!';

    // Handle Document Fetching (RAG) — vẫn giữ ở frontend vì cần fetch docx từ public/
    if (aiContent.includes('[FETCH_DOC]')) {
        const docNameRaw = aiContent.split('[FETCH_DOC]')[1].split('\n')[0].trim();
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
                // Gọi backend lần 2 với context tài liệu
                const followUpData = await callBackend('/api/ai/chat', {
                    messages: [
                        ...messages.map(m => ({ role: m.role, content: m.content })),
                        { role: 'assistant', content: `[FETCH_DOC] Đang đọc ${docNames.join(', ')}...` },
                        { role: 'user', content: `Nội dung tài liệu đã được tải:\n${combinedDocsText}\n\nHãy trả lời câu hỏi của học sinh dựa trên tài liệu này.` },
                    ],
                    userText: '',
                    previewImage: null,
                    userProfile: userProfile || null,
                    lessonContext: lessonContext || null,
                    examDate: examDate || null,
                }, { signal });

                aiContent = followUpData.text || aiContent;
            } catch (err) {
                console.error('Lỗi khi gọi lại Backend:', err);
                aiContent = aiContent.replace(/\[FETCH_DOC\].*/s, '*(Lỗi: Không thể phân tích tài liệu)*\n');
            }
        } else {
            aiContent = aiContent.replace(/\[FETCH_DOC\].*/s, '*(Lỗi: Không tìm thấy tài liệu phù hợp)*\n');
        }
    }

    let generatedImageUrl = data.generatedImageUrl || null;
    if (!generatedImageUrl && aiContent.includes('[GEN_IMAGE]')) {
        const imagePrompt = aiContent.split('[GEN_IMAGE]')[1].split('\n')[0].trim();
        generatedImageUrl = await generateImage(imagePrompt);
    }

    const cleanedContent = aiContent.replace(/\[GEN_IMAGE\].*/s, '').replace(/\[FETCH_DOC\].*/s, '');
    return { text: cleanedContent, generatedImageUrl };
}

/**
 * Chấm bài — gọi qua Backend (dùng PRIMARY_MODEL).
 */
export async function sendGradingRequest(prompt: string, signal?: AbortSignal): Promise<string> {
    const data = await callBackend('/api/ai/grade', { prompt }, { signal });
    return data.text || '{}';
}

/**
 * Generate an image using Gemini via Backend.
 */
export async function generateImage(prompt: string): Promise<string | null> {
    try {
        const data = await callBackend('/api/ai/image', { prompt });
        return data.imageUrl || null;
    } catch (error) {
        console.error('Image generation error:', error);
        return null;
    }
}

/**
 * Generate an educational infographic via Backend.
 */
export async function generateInfographic(workTitle: string, signal?: AbortSignal): Promise<string | null> {
    try {
        const data = await callBackend('/api/ai/infographic', { workTitle }, { signal });
        return data.imageUrl || null;
    } catch (err) {
        console.error('generateInfographic error:', err);
        return null;
    }
}

/**
 * Viết lại văn bản — gọi qua Backend (LITE_MODEL).
 */
export async function rewriteText(text: string): Promise<string | null> {
    try {
        const data = await callBackend('/api/ai/generate', {
            prompt: `Viết lại câu sau cho hay hơn, tự nhiên hơn: "${text}"`,
        });
        return data.text?.trim() || null;
    } catch (err) {
        console.error('rewriteText error:', err);
        return null;
    }
}

/**
 * Tạo bài kiểm tra chẩn đoán — gọi qua Backend (LITE_MODEL).
 */
export async function generateDiagnosticQuiz(prompt: string): Promise<string> {
    const data = await callBackend('/api/ai/generate', { prompt });
    return data.text || 'Lỗi tạo bài kiểm tra chẩn đoán';
}

/**
 * Tạo lời khuyên khắc phục điểm yếu — gọi qua Backend (LITE_MODEL).
 */
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
    try {
        const data = await callBackend('/api/ai/generate', { prompt });
        return data.text?.trim() || null;
    } catch {
        return null;
    }
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
 * Tạo quiz trắc nghiệm 10 câu — gọi qua Backend (LITE_MODEL).
 */
export async function generateDiagnosticMCQ(prompt: string, signal?: AbortSignal): Promise<DiagnosticQuizData | null> {
    try {
        const data = await callBackend('/api/ai/generate', {
            prompt,
            temperature: 0.7,
        }, { signal });

        let raw = data.text || '';
        if (!raw) return null;

        // Strip markdown code fences
        raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
        raw = raw.replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(raw) as DiagnosticQuizData;
    } catch (err) {
        console.error(`[Quiz] Error:`, err);
        return null;
    }
}

/**
 * Tạo câu hỏi chủ động — gọi qua Backend (LITE_MODEL).
 */
export async function sendProactiveMessage(
    messages: { role: string; content: string }[],
    proactivePrompt: string,
    pronoun = 'thầy',
): Promise<string | null> {
    try {
        const data = await callBackend('/api/ai/proactive', {
            messages,
            proactivePrompt,
            pronoun,
        });
        return data.text || null;
    } catch {
        return null;
    }
}

/**
 * Tạo đề thi AI — gọi qua Backend (LITE_MODEL).
 */
export async function generateAIExam(prompt: string, signal?: AbortSignal): Promise<AIExamData | null> {
    try {
        const data = await callBackend('/api/ai/generate', { prompt }, { signal });
        let raw = data.text || '';
        if (!raw) return null;
        raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
        raw = raw.replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(raw) as AIExamData;
    } catch (err) {
        console.error('[AIExam] Failed:', err);
        return null;
    }
}

/**
 * Tự động trả lời chat HS-GV — gọi qua Backend (LITE_MODEL).
 */
export async function generateChatAutoResponse(
    userMessage: string,
    chatHistory: { role: string; content: string }[] = [],
): Promise<string | null> {
    try {
        const data = await callBackend('/api/ai/auto-response', {
            userMessage,
            chatHistory,
        });
        return data.text || null;
    } catch (err) {
        console.error('Chat auto-response error:', err);
        return null;
    }
}

/**
 * Chấm bài nộp — gọi qua Backend (PRIMARY_MODEL).
 * Hỗ trợ: ảnh, PDF, DOCX (mammoth).
 */
export async function gradeStudentSubmission(prompt: string, file: File | null): Promise<ExamGrade> {
    let fileBase64: string | null = null;
    let fileMimeType: string | null = null;
    let fileText: string | null = null;

    if (file) {
        if (file.type.startsWith('image/') || file.type === 'application/pdf') {
            // Send as base64 to backend
            fileBase64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const res = reader.result as string;
                    resolve(res.split(',')[1]);
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            fileMimeType = file.type || 'application/pdf';
        } else if (file.name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const mammoth = await import('mammoth');
                const result = await mammoth.extractRawText({ arrayBuffer });
                fileText = result.value;
            } catch (e) {
                console.error('Lỗi khi đọc file docx:', e);
                fileText = '(Lưu ý: Không thể đọc được nội dung từ file docx đính kèm.)';
            }
        } else {
            try {
                fileText = await file.text();
            } catch (e) {
                console.error('Lỗi đọc file txt:', e);
            }
        }
    }

    const data = await callBackend('/api/ai/grade-submission', {
        prompt,
        fileBase64,
        fileMimeType,
        fileText,
    });

    const rawText = data.text || '';

    // ── Helper: sanitize and parse AI JSON robustly ──
    function tryParseGradingJson(text: string): ExamGrade | null {
        let clean = text
            .replace(/^[\s\S]*?```(?:json)?\s*/i, '')
            .replace(/\s*```[\s\S]*$/i, '')
            .trim();

        const jsonMatch = clean.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;
        clean = jsonMatch[0];

        clean = clean.replace(/,\s*([}\]])/g, '$1');
        clean = clean.replace(/(?<=:\s*")([\s\S]*?)(?=")/g, (match) =>
            match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
        );

        try {
            return JSON.parse(clean) as ExamGrade;
        } catch { /* continue */ }

        try {
            const fixedQuotes = clean.replace(
                /:\s*"((?:[^"\\]|\\.)*)"/g,
                (_, content: string) => {
                    const escaped = content.replace(/(?<!\\)"/g, '\\"');
                    return `: "${escaped}"`;
                }
            );
            return JSON.parse(fixedQuotes) as ExamGrade;
        } catch { /* continue */ }

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
        // Round score to the nearest multiple of 0.25
        parsed.score = Math.round(parsed.score * 4) / 4;
        return parsed;
    }

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
