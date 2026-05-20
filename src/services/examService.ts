import { EXAM_COUNT, AI_DETECTION_PROMPT, GRADING_RUBRIC_PROMPT } from '../constants';
import { sendGradingRequest } from './geminiApi';
import type { ExamGrade } from '../types';

/** Pick a random exam ID from 1..count (default EXAM_COUNT if not provided) */
export function pickRandomExam(count = EXAM_COUNT): number {
    const safeCount = Math.max(1, count);
    return Math.floor(Math.random() * safeCount) + 1;
}

/** Cache so we only probe once per page session */
let _availableExamsCache: number | null = null;

/** Check if a single exam ID exists */
async function examExists(id: number): Promise<boolean> {
    try {
        let res = await fetch(`/dethi/${id}.docx`, { method: 'HEAD' });
        if (res.ok) return true;
        res = await fetch(`/dethi/${id}.doc`, { method: 'HEAD' });
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * Detect available exams using binary search — ~7 requests instead of 99.
 * Assumes exams are numbered sequentially starting from 1.
 * Results are cached for the session.
 */
export async function detectAvailableExams(): Promise<number> {
    if (_availableExamsCache !== null) return _availableExamsCache;

    // Quick check: does exam 1 exist?
    if (!(await examExists(1))) {
        _availableExamsCache = 0;
        return 0;
    }

    // Binary search for the highest existing exam ID
    let lo = 1, hi = 99;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi + 1) / 2);
        if (await examExists(mid)) {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }

    _availableExamsCache = Math.max(1, lo);
    return _availableExamsCache;
}

/** Lazy-loaded mammoth reference */
let _mammoth: typeof import('mammoth') | null = null;
async function getMammoth() {
    if (!_mammoth) _mammoth = await import('mammoth');
    return _mammoth;
}

/** Fetch a .docx from public folder and extract text using mammoth (lazy loaded) */
export async function fetchDocxAsText(url: string): Promise<string> {
    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();
    const mammoth = await getMammoth();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
}

/**
 * Estimate the number of main sections in a DOCX text content.
 * Looks for common patterns: numbered sections, headings, or clear paragraph breaks.
 */
export function estimateSectionCount(content: string): number {
    return splitDocxIntoSections(content).length;
}

/**
 * Split DOCX raw text into logical sections based on heading patterns.
 */
export function splitDocxIntoSections(content: string): string[] {
    if (!content || content.trim().length === 0) return [content || ''];

    const text = content.trim();
    const lines = text.split('\n');

    const headingPatterns = [
        /^\s*[0-9]+[.)]\s+/,
        /^\s*[IVX]+[.)]\s+/,
        /^\s*(?:PHẦN|CHƯƠNG|MỤC|BÀI)\s+[0-9IVX]+/i,
        /^\s*(?:Phần|Chương|Mục|Bài)\s+\d/,
    ];

    const isHeading = (line: string): boolean => {
        const trimmed = line.trim();
        if (!trimmed) return false;
        return headingPatterns.some(p => p.test(trimmed));
    };

    const sections: string[] = [];
    let currentSection: string[] = [];

    for (const line of lines) {
        if (isHeading(line) && currentSection.length > 0) {
            const sectionText = currentSection.join('\n').trim();
            if (sectionText.length > 50) {
                sections.push(sectionText);
            } else if (sections.length > 0) {
                sections[sections.length - 1] += '\n' + sectionText;
            }
            currentSection = [line];
        } else {
            currentSection.push(line);
        }
    }

    if (currentSection.length > 0) {
        const sectionText = currentSection.join('\n').trim();
        if (sectionText) {
            if (sectionText.length > 50 || sections.length === 0) {
                sections.push(sectionText);
            } else if (sections.length > 0) {
                sections[sections.length - 1] += '\n' + sectionText;
            }
        }
    }

    if (sections.length <= 1 && text.length > 4000) {
        const chunks: string[] = [];
        const paragraphs = text.split(/\n\s*\n/);
        let current = '';
        for (const para of paragraphs) {
            if (current.length + para.length > 3000 && current.length > 500) {
                chunks.push(current.trim());
                current = para;
            } else {
                current += '\n\n' + para;
            }
        }
        if (current.trim()) chunks.push(current.trim());
        if (chunks.length > 1) return chunks;
    }

    return sections.length > 0 ? sections : [text];
}

/**
 * Build a trimmed DOCX context for lesson mode.
 * Sends outline + current section + brief previous section.
 * Reduces token usage by 50-90% for large documents.
 */
export function buildLessonContext(fullContent: string, currentSectionIndex: number): string {
    const sections = splitDocxIntoSections(fullContent);
    if (sections.length <= 3) return fullContent;

    const parts: string[] = [];

    const outline = sections.map((s, i) => {
        const firstLine = s.split('\n')[0]?.trim().substring(0, 100) || `Phần ${i + 1}`;
        const status = i < currentSectionIndex ? '✓ đã học' : i === currentSectionIndex ? '→ đang học' : 'chưa học';
        return `  ${i + 1}. ${firstLine} [${status}]`;
    }).join('\n');
    parts.push(`[DÀN BÀI — ${sections.length} phần]:\n${outline}`);

    if (currentSectionIndex > 0) {
        const prev = sections[currentSectionIndex - 1];
        const prevTrimmed = prev.length > 400 ? '...' + prev.slice(-400) : prev;
        parts.push(`[PHẦN TRƯỚC (${currentSectionIndex}) — tóm tắt]:\n${prevTrimmed}`);
    }

    const safeIdx = Math.min(currentSectionIndex, sections.length - 1);
    parts.push(`[PHẦN HIỆN TẠI (${safeIdx + 1}/${sections.length}) — giảng phần này]:\n${sections[safeIdx]}`);

    if (safeIdx + 1 < sections.length) {
        const nextHead = sections[safeIdx + 1].split('\n')[0]?.trim().substring(0, 150) || '';
        parts.push(`[PHẦN TIẾP THEO]: ${nextHead}`);
    }

    return parts.join('\n\n');
}

/**
 * Deep AI grading — strict THPT standard.
 * Grades each criterion from the official answer key.
 */
export async function gradeWithAI(
    examText: string,
    answerKeyText: string,
    studentAnswer: string,
    signal?: AbortSignal
): Promise<ExamGrade> {
    // Count words to enforce word-limit requirements
    const wordCount = studentAnswer.trim().split(/\s+/).filter(Boolean).length;

    const prompt = `Bạn là giám khảo chấm thi THPT môn Ngữ Văn. Nhiệm vụ: chấm điểm CHÍNH XÁC và NGHIÊM KHẮC theo đúng hướng dẫn chấm chính thức — KHÔNG hào phóng, KHÔNG suy đoán có ý khi bài làm không thể hiện rõ.

══════════════════════════════════════════
${GRADING_RUBRIC_PROMPT}

(Bài làm này có ${wordCount} chữ — so sánh với yêu cầu trong từng câu)

${AI_DETECTION_PROMPT}

══════════════════════════════════════════
ĐỀ THI:
${examText}

══════════════════════════════════════════
HƯỚNG DẪN CHẤM CHÍNH THỨC
(Căn cứ DUY NHẤT để chấm — đối chiếu TỪNG TIÊU CHÍ với bài làm):
${answerKeyText}

══════════════════════════════════════════
BÀI LÀM CỦA HỌC SINH (${wordCount} chữ):
${studentAnswer}

══════════════════════════════════════════
QUY TRÌNH CHẤM — thực hiện tuần tự TRƯỚC khi xuất JSON:

BƯỚC 1: Liệt kê từng câu trong hướng dẫn chấm và thang điểm tương ứng
BƯỚC 2: Với mỗi câu, đọc tiêu chí → kiểm tra bài làm có đáp ứng không → ghi điểm thực tế
BƯỚC 3: Kiểm tra yêu cầu độ dài từng phần (nếu có)
BƯỚC 4: Áp dụng giới hạn điểm (nguyên tắc ⑥) nếu có lỗi nghiêm trọng
BƯỚC 5: Tính tổng điểm

══════════════════════════════════════════
ĐẦU RA — Trả về JSON THUẦN (không markdown, không \`\`\`):
{
  "score": <điểm thực tế, tính đến 0.25>,
  "maxScore": <tổng điểm tối đa>,
  "feedback": "<nhận xét thẳng thắn: nêu cụ thể thiếu sót, không khen chung chung>",
  "details": "<chấm chi tiết từng câu: Câu X (Y/Z điểm): lý do được/bị trừ điểm>",
  "errors": [
    {
      "quote": "<trích đoạn hoặc mô tả lỗi cụ thể>",
      "issue": "<Thiếu ý / Không đủ chữ (X/Y chữ) / Sai đáp án / Thiếu dẫn chứng / Lập luận yếu / Thiếu phân tích>",
      "suggestion": "<hướng dẫn sửa cụ thể>"
    }
  ],
  "improvements": ["<gợi ý cụ thể tăng điểm, tối đa 3 mục>"],
  "weaknesses": ["<tag ≤4 từ, tối đa 4 tag>"],
  "strengths": ["<tag ≤4 từ, chỉ khi có thực, tối đa 4 tag>"]
}

RÀNG BUỘC BẮT BUỘC:
- Bài trống: {"score":0,"maxScore":10,"feedback":"Học sinh không nộp bài làm.","details":"Bài trống — 0/10 điểm.","errors":[],"improvements":["Cần viết bài đầy đủ"],"weaknesses":["không viết bài"],"strengths":[]}
- errors[] phải liệt kê TẤT CẢ lỗi quan trọng (thiếu ý, không đủ chữ, sai đáp án, thiếu dẫn chứng)
- Nếu bài thiếu ý/thiếu chữ nhưng AI vẫn cho điểm cao → vi phạm nguyên tắc chấm`;

    const rawText = await sendGradingRequest(prompt, signal);

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

        // Attempt 3: extract fields individually via regex
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
        // Safety net: cap score at 95% of maxScore (max 9.5/10)
        const capScore = (parsed.maxScore || 10) * 0.95;
        if (parsed.score > capScore) {
            parsed.score = capScore;
        }
        return parsed;
    }

    // Fallback — hiển thị lỗi thân thiện thay vì raw JSON/code
    console.error('[gradeWithAI] All JSON parse attempts failed. Raw text:', rawText.substring(0, 500));
    return {
        score: 0,
        maxScore: 10,
        feedback: 'AI chấm điểm gặp lỗi kỹ thuật — kết quả trả về không đúng định dạng. Giáo viên vui lòng chấm thủ công.',
        details: 'Bài làm đã được lưu. AI không thể phân tích kết quả do lỗi định dạng phản hồi.',
        errors: [],
        improvements: ['Giáo viên có thể chấm thủ công bài này'],
        weaknesses: [],
        strengths: [],
    };
}

