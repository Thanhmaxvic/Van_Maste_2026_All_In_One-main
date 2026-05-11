import { fetchDocxAsText, detectAvailableExams } from './examService';
import { sendGradingRequest } from './geminiApi';
import type { AIExamData, AIExamQuestion } from '../types';

/** Pick N unique random numbers from 1..max */
function pickRandom(count: number, max: number): number[] {
    const all = Array.from({ length: max }, (_, i) => i + 1);
    for (let i = all.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [all[i], all[j]] = [all[j], all[i]];
    }
    return all.slice(0, count);
}

interface ParsedExamParts {
    readingPassage: string;
    readingQuestions: { id: number; prompt: string; points: number }[];
    writingQuestions: { id: number; prompt: string; points: number; part: 'nlxh' | 'nlvh' }[];
    readingAnswerKey: string;
    writingAnswerKey: string;
}

/**
 * Use AI to extract questions from raw exam text + answer key text.
 * Returns structured JSON with reading and writing parts.
 */
async function parseExamWithAI(examText: string, answerKeyText: string, signal?: AbortSignal): Promise<ParsedExamParts | null> {
    const prompt = `Phân tích đề thi Ngữ văn THPT và hướng dẫn chấm bên dưới. Trích xuất NGUYÊN VĂN các câu hỏi (không thay đổi từ nào).

ĐỀ THI:
${examText}

HƯỚNG DẪN CHẤM:
${answerKeyText}

Trả về JSON THUẦN (không markdown, không \`\`\`):
{
  "readingPassage": "<ngữ liệu/đoạn trích phần đọc hiểu — giữ nguyên văn>",
  "readingQuestions": [
    { "id": 1, "prompt": "<câu hỏi nguyên văn>", "points": 0.5 }
  ],
  "writingQuestions": [
    { "id": 6, "prompt": "<câu hỏi nguyên văn>", "points": 2.0, "part": "nlxh" },
    { "id": 7, "prompt": "<câu hỏi nguyên văn + đoạn trích đính kèm nếu có>", "points": 4.0, "part": "nlvh" }
  ],
  "readingAnswerKey": "<phần hướng dẫn chấm tương ứng với các câu ĐỌC HIỂU — giữ nguyên văn>",
  "writingAnswerKey": "<phần hướng dẫn chấm tương ứng với các câu VIẾT (Làm văn) — giữ nguyên văn>"
}

LƯU Ý QUAN TRỌNG:
- GIỮ NGUYÊN VĂN tất cả câu hỏi, không thay đổi từ nào
- Điểm mỗi câu phải đúng với thang điểm trong đề
- readingAnswerKey phải chứa hướng dẫn chấm tương ứng cho phần Đọc hiểu
- writingAnswerKey phải chứa hướng dẫn chấm tương ứng cho phần Làm văn (Nghị luận xã hội và Nghị luận văn học)
- NẾU câu viết (writingQuestions) có tham chiếu đến ngữ liệu/đoạn trích ở phần đọc hiểu (ví dụ: "ở phần đọc hiểu", "đoạn trích trên", "văn bản trên"), thì PHẢI gắn nguyên văn đoạn trích/ngữ liệu đó VÀO CUỐI prompt của câu viết. Ví dụ: nếu câu viết yêu cầu phân tích "hai khổ thơ đầu trong đoạn trích ở phần đọc hiểu", prompt phải chứa cả đoạn trích đó để câu hỏi tự đầy đủ.`;

    try {
        const raw = await sendGradingRequest(prompt, signal);
        // DeepSeek có thể trả về JSON bọc trong ```json ... ``` — cần strip
        let cleanRaw = raw
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```\s*$/i, '')
            .trim();
        cleanRaw = cleanRaw.replace(/,\s*([}\]])/g, '$1');

        const jsonMatch = cleanRaw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;
        const parsed = JSON.parse(jsonMatch[0]);
        return {
            readingPassage: parsed.readingPassage || '',
            readingQuestions: parsed.readingQuestions || [],
            writingQuestions: parsed.writingQuestions || [],
            // QUAN TRỌNG: Không dùng answerKeyText đầy đủ làm fallback
            // vì sẽ gây lẫn đáp án đọc hiểu ↔ viết
            readingAnswerKey: parsed.readingAnswerKey || 'Chấm theo kiến thức Đọc hiểu Ngữ văn THPT.',
            writingAnswerKey: parsed.writingAnswerKey || 'Chấm theo kiến thức Nghị luận Ngữ văn THPT.',
        };
    } catch (e) {
        console.error('Failed to parse exam:', e);
        return null;
    }
}

/**
 * Build an AI exam from the existing docx question pool.
 * 
 * @param type - 'reading' | 'writing' | 'full'
 * @returns AIExamData with answerKey, or null on failure
 */
export async function buildExamFromPool(
    type: 'reading' | 'writing' | 'full',
    signal?: AbortSignal
): Promise<AIExamData | null> {
    const totalExams = await detectAvailableExams();
    
    // Pick 2 random source exams for variety
    const sourceIds = pickRandom(2, totalExams);

    // Fetch all source exams and answer keys in parallel
    const sources = await Promise.all(
        sourceIds.map(async (id) => {
            try {
                const [examText, answerKeyText] = await Promise.all([
                    fetchDocxAsText(`/dethi/${id}.docx`),
                    fetchDocxAsText(`/huongdancham/${id}.docx`),
                ]);
                return { id, examText, answerKeyText };
            } catch {
                return null;
            }
        })
    );

    const validSources = sources.filter(Boolean) as { id: number; examText: string; answerKeyText: string }[];
    if (validSources.length === 0) return null;

    // Parse the first valid source with AI to extract structured questions
    const parsed = await parseExamWithAI(validSources[0].examText, validSources[0].answerKeyText, signal);
    if (!parsed) {
        // Fallback: use raw text directly
        return buildFallbackExam(validSources[0], type);
    }

    // Build exam based on requested type
    const questions: AIExamQuestion[] = [];
    let passage: string | null = null;
    let source: string | null = null;
    let answerKeyParts: string[] = [];
    let duration: number;

    if (type === 'reading' || type === 'full') {
        passage = parsed.readingPassage;
        source = `Trích từ đề thi số ${validSources[0].id}`;

        // Lọc bỏ câu hỏi viết bị AI phân loại nhầm vào readingQuestions
        const writingKeywords = /viết\s+(?:đoạn|bài)|nghị\s+luận|khoảng\s+\d+\s+chữ|phân\s+tích\s+cảm\s+nhận/i;
        const filteredReading = type === 'reading'
            ? parsed.readingQuestions.filter(q => !writingKeywords.test(q.prompt))
            : parsed.readingQuestions;

        filteredReading.forEach((q, i) => {
            questions.push({
                id: i + 1,
                part: 'reading',
                points: q.points,
                prompt: q.prompt,
            });
        });
        answerKeyParts.push(parsed.readingAnswerKey);
    }

    if (type === 'writing' || type === 'full') {
        // If full type, get writing from second source if available
        const writingSource = type === 'full' && validSources.length > 1
            ? await parseExamWithAI(validSources[1].examText, validSources[1].answerKeyText, signal)
            : parsed;

        const wSource = writingSource || parsed;
        const startId = questions.length + 1;

        // Check if any writing question references the reading passage
        const readingRefPattern = /phần đọc hiểu|đoạn trích trên|văn bản trên|ngữ liệu trên/i;
        const hasReadingRef = wSource.writingQuestions.some(q => readingRefPattern.test(q.prompt));

        // For writing-only exams: include reading passage if questions reference it
        if (type === 'writing' && hasReadingRef && wSource.readingPassage) {
            passage = wSource.readingPassage;
            source = `Ngữ liệu trích từ đề thi số ${validSources[0].id}`;
        }

        wSource.writingQuestions.forEach((q, i) => {
            questions.push({
                id: startId + i,
                part: q.part as 'nlxh' | 'nlvh',
                points: q.points,
                prompt: q.prompt,
            });
        });

        if (writingSource && writingSource !== parsed) {
            answerKeyParts.push(writingSource.writingAnswerKey);
        } else if (type === 'writing' || type === 'full') {
            // For writing or full exams using the same parsed source, include the writing answer key
            answerKeyParts.push(wSource.writingAnswerKey);
        }
    }

    if (type === 'reading') duration = 30;
    else if (type === 'writing') duration = 90;
    else duration = 120;

    const title = type === 'reading' ? 'Đề đọc hiểu'
        : type === 'writing' ? 'Đề viết'
            : 'Đề thi tổng hợp';

    return {
        type,
        title,
        durationMinutes: duration,
        passage,
        source,
        questions,
        answerKey: answerKeyParts.join('\n\n---\n\n'),
    };
}

/** Fallback: use the raw exam as-is when AI parsing fails.
 *  Cắt nội dung theo type để đề đọc hiểu không chứa phần viết và ngược lại.
 */
function buildFallbackExam(
    source: { id: number; examText: string; answerKeyText: string },
    type: 'reading' | 'writing' | 'full',
): AIExamData {
    const duration = type === 'reading' ? 30 : type === 'writing' ? 90 : 120;
    const title = type === 'reading' ? 'Đề đọc hiểu'
        : type === 'writing' ? 'Đề viết' : 'Đề thi tổng hợp';

    let examContent = source.examText;
    let answerKey = source.answerKeyText;

    // Tìm vị trí phân tách phần Đọc hiểu và phần Viết
    const writingSplitPattern = /\n\s*(?:II\s*[.)]?\s*(?:PHẦN\s*)?(?:VIẾT|LÀM VĂN)|PHẦN\s*(?:VIẾT|II|LÀM VĂN)|II\s*\.\s*LÀM VĂN)/i;
    const splitMatch = examContent.search(writingSplitPattern);

    if (type === 'reading' && splitMatch > 0) {
        // Chỉ lấy phần Đọc hiểu (trước mốc "PHẦN VIẾT")
        examContent = examContent.substring(0, splitMatch).trim();
    } else if (type === 'writing' && splitMatch > 0) {
        // Chỉ lấy phần Viết (từ mốc "PHẦN VIẾT" trở đi)
        examContent = examContent.substring(splitMatch).trim();
    }

    // Tương tự cho answer key
    const answerSplit = answerKey.search(writingSplitPattern);
    if (type === 'reading' && answerSplit > 0) {
        answerKey = answerKey.substring(0, answerSplit).trim();
    } else if (type === 'writing' && answerSplit > 0) {
        answerKey = answerKey.substring(answerSplit).trim();
    }

    return {
        type,
        title: `${title} (Đề ${source.id})`,
        durationMinutes: duration,
        passage: examContent,
        source: `Đề thi số ${source.id}`,
        questions: [
            {
                id: 1,
                part: type === 'writing' ? 'nlxh' : 'reading',
                points: type === 'reading' ? 4 : type === 'writing' ? 6 : 10,
                prompt: 'Làm bài theo đề thi ở trên.',
            },
        ],
        answerKey: answerKey,
    };
}
