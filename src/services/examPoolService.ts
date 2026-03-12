import { fetchDocxAsText } from './examService';
import { sendGradingRequest } from './geminiApi';
import type { AIExamData, AIExamQuestion } from '../types';

const TOTAL_EXAMS = 51;

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
    answerKey: string;
}

/**
 * Use AI to extract questions from raw exam text + answer key text.
 * Returns structured JSON with reading and writing parts.
 */
async function parseExamWithAI(examText: string, answerKeyText: string): Promise<ParsedExamParts | null> {
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
  "relevantAnswerKey": "<phần hướng dẫn chấm tương ứng với các câu hỏi đã trích — giữ nguyên văn>"
}

LƯU Ý:
- GIỮ NGUYÊN VĂN tất cả câu hỏi, không thay đổi từ nào
- Điểm mỗi câu phải đúng với thang điểm trong đề
- relevantAnswerKey phải chứa hướng dẫn chấm tương ứng cho TẤT CẢ câu hỏi đã trích`;

    try {
        const raw = await sendGradingRequest(prompt);
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;
        const parsed = JSON.parse(jsonMatch[0]);
        return {
            readingPassage: parsed.readingPassage || '',
            readingQuestions: parsed.readingQuestions || [],
            writingQuestions: parsed.writingQuestions || [],
            answerKey: parsed.relevantAnswerKey || answerKeyText,
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
    type: 'reading' | 'writing' | 'full'
): Promise<AIExamData | null> {
    // Pick 2 random source exams for variety
    const sourceIds = pickRandom(2, TOTAL_EXAMS);

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
    const parsed = await parseExamWithAI(validSources[0].examText, validSources[0].answerKeyText);
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
        parsed.readingQuestions.forEach((q, i) => {
            questions.push({
                id: i + 1,
                part: 'reading',
                points: q.points,
                prompt: q.prompt,
            });
        });
        answerKeyParts.push(parsed.answerKey);
    }

    if (type === 'writing' || type === 'full') {
        // If full type, get writing from second source if available
        const writingSource = type === 'full' && validSources.length > 1
            ? await parseExamWithAI(validSources[1].examText, validSources[1].answerKeyText)
            : parsed;

        const wSource = writingSource || parsed;
        const startId = questions.length + 1;

        wSource.writingQuestions.forEach((q, i) => {
            questions.push({
                id: startId + i,
                part: q.part as 'nlxh' | 'nlvh',
                points: q.points,
                prompt: q.prompt,
            });
        });

        if (writingSource && writingSource !== parsed) {
            answerKeyParts.push(writingSource.answerKey);
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

/** Fallback: use the raw exam as-is when AI parsing fails */
function buildFallbackExam(
    source: { id: number; examText: string; answerKeyText: string },
    type: 'reading' | 'writing' | 'full',
): AIExamData {
    const duration = type === 'reading' ? 30 : type === 'writing' ? 90 : 120;
    const title = type === 'reading' ? 'Đề đọc hiểu'
        : type === 'writing' ? 'Đề viết' : 'Đề thi tổng hợp';

    // Create a single question with the full exam text
    return {
        type,
        title: `${title} (Đề ${source.id})`,
        durationMinutes: duration,
        passage: source.examText,
        source: `Đề thi số ${source.id}`,
        questions: [
            {
                id: 1,
                part: type === 'writing' ? 'nlxh' : 'reading',
                points: 10,
                prompt: 'Làm bài theo đề thi ở trên.',
            },
        ],
        answerKey: source.answerKeyText,
    };
}
