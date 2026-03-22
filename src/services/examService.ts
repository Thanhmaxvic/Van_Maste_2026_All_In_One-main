import mammoth from 'mammoth';
import { EXAM_COUNT } from '../constants';
import { sendGradingRequest } from './geminiApi';
import type { ExamGrade } from '../types';

/** Pick a random exam ID from 1..count (default EXAM_COUNT if not provided) */
export function pickRandomExam(count = EXAM_COUNT): number {
    const safeCount = Math.max(1, count);
    return Math.floor(Math.random() * safeCount) + 1;
}

/** Cache so we only probe once per page session */
let _availableExamsCache: number | null = null;

/**
 * Probe HEAD requests for /dethi/1.docx ... /dethi/N.docx
 * and return the actual number of available exams.
 * Results are cached for the session.
 */
export async function detectAvailableExams(): Promise<number> {
    if (_availableExamsCache !== null) return _availableExamsCache;

    // Scan up to 200 exams concurrently to be safe and handle holes or .doc
    const promises = Array.from({ length: 200 }, async (_, index) => {
        const i = index + 1;
        try {
            let res = await fetch(`/dethi/${i}.docx`, { method: 'HEAD' });
            if (res.ok) return i;

            res = await fetch(`/dethi/${i}.doc`, { method: 'HEAD' });
            if (res.ok) return i;

            return null;
        } catch {
            return null;
        }
    });

    const results = await Promise.all(promises);
    const validExams = results.filter(id => id !== null) as number[];

    _availableExamsCache = Math.max(1, validExams.length);
    return _availableExamsCache;
}

/** Fetch a .docx from public folder and extract text using mammoth */
export async function fetchDocxAsText(url: string): Promise<string> {
    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
}

/**
 * Estimate the number of main sections in a DOCX text content.
 * Looks for common patterns: numbered sections, headings, or clear paragraph breaks.
 */
export function estimateSectionCount(content: string): number {
    if (!content || content.trim().length === 0) return 10; // default

    const text = content.trim();

    // Pattern 1: Numbered sections (1., 2., 3., etc.)
    const numberedPattern = /^\s*[0-9]+[\.\)]\s+/gm;
    const numberedMatches = text.match(numberedPattern);
    if (numberedMatches && numberedMatches.length > 0) {
        return Math.max(numberedMatches.length, 5); // at least 5 sections
    }

    // Pattern 2: Roman numerals (I., II., III., etc.)
    const romanPattern = /^\s*[IVX]+[\.\)]\s+/gm;
    const romanMatches = text.match(romanPattern);
    if (romanMatches && romanMatches.length > 0) {
        return Math.max(romanMatches.length, 5);
    }

    // Pattern 3: "PHẦN", "CHƯƠNG", "MỤC" keywords
    const sectionKeywords = /(?:PHẦN|CHƯƠNG|MỤC|BÀI)\s+[0-9IVX]+/gi;
    const keywordMatches = text.match(sectionKeywords);
    if (keywordMatches && keywordMatches.length > 0) {
        return Math.max(keywordMatches.length, 5);
    }

    // Pattern 4: Double line breaks (clear paragraph separation)
    // Count significant breaks (2+ newlines) as potential section dividers
    const doubleBreaks = text.split(/\n\s*\n\s*\n/);
    if (doubleBreaks.length > 3) {
        return Math.min(Math.max(doubleBreaks.length - 1, 5), 20); // between 5-20
    }

    // Pattern 5: Estimate based on content length
    // Assume ~500-800 characters per section on average
    const charCount = text.length;
    const estimated = Math.max(Math.ceil(charCount / 600), 5);
    return Math.min(estimated, 25); // cap at 25 sections
}

/**
 * Deep AI grading — strict THPT standard.
 * Grades each criterion from the official answer key.
 */
export async function gradeWithAI(
    examText: string,
    answerKeyText: string,
    studentAnswer: string,
): Promise<ExamGrade> {
    // Count words to enforce word-limit requirements
    const wordCount = studentAnswer.trim().split(/\s+/).filter(Boolean).length;

    const prompt = `Bạn là giám khảo chấm thi THPT môn Ngữ Văn. Nhiệm vụ: chấm điểm CHÍNH XÁC và NGHIÊM KHẮC theo đúng hướng dẫn chấm chính thức — KHÔNG hào phóng, KHÔNG suy đoán có ý khi bài làm không thể hiện rõ.

══════════════════════════════════════════
NGUYÊN TẮC CHẤM BẮT BUỘC (vi phạm = chấm sai):

① CHỈ cho điểm khi học sinh ĐÃ VIẾT ĐỦ Ý theo hướng dẫn chấm.
   - Thiếu ý → trừ điểm phần đó, KHÔNG cho điểm toàn phần
   - Suy đoán "có ý ngầm" là SAI nguyên tắc

② YÊU CẦU ĐỘ DÀI: Nếu đề ghi "khoảng X chữ":
   - Bài viết < 75% số chữ yêu cầu: trừ 0.25–0.5đ phần đó (chưa triển khai đủ)
   - Ví dụ: yêu cầu ~200 chữ, viết 140 chữ = chỉ đạt 70% → PHẢI trừ điểm
   (Bài làm này có ${wordCount} chữ — so sánh với yêu cầu trong từng câu)

③ CÂU ĐỌC HIỂU: Chỉ cho điểm tối đa khi trả lời đúng VÀ đủ ý theo đáp án.
   - Trả lời đúng nhưng thiếu ý → cho một nửa điểm câu đó
   - Trả lời sai/thiếu ý chính → 0 điểm câu đó

④ CÂU NGHỊ LUẬN XÃ HỘI: Kiểm tra đủ 4 tiêu chí:
   (a) Có đủ bố cục mở/thân/kết rõ ràng
   (b) Luận điểm rõ ràng, đúng hướng yêu cầu
   (c) Có dẫn chứng cụ thể (người thật, sự kiện thật)
   (d) Đủ số chữ yêu cầu (xem ②)
   Thiếu tiêu chí nào → trừ điểm tương ứng

⑤ CÂU NGHỊ LUẬN VĂN HỌC: Kiểm tra:
   (a) Phân tích đúng tác phẩm/đoạn trích theo hướng dẫn
   (b) Có dẫn chứng trực tiếp từ văn bản (trích thơ/văn)
   (c) Đủ các luận điểm chính mà hướng dẫn chấm yêu cầu
   Thiếu luận điểm nào trong hướng dẫn → trừ điểm phần đó

⑥ GIỚI HẠN ĐIỂM CAO:
   - ≥ 2 lỗi nghiêm trọng (thiếu ý chính / thiếu dẫn chứng / không đủ chữ): điểm ≤ 7.0
   - ≥ 1 lỗi nghiêm trọng: điểm ≤ 8.0
   - KHÔNG BAO GIỜ cho điểm tối đa (10/10). Điểm tổng tối đa tuyệt đối = 9.5
   - Bài xuất sắc nhất cũng chỉ đạt 8.75–9.5 điểm

⑦ GIỚI HẠN ĐIỂM CÂU VIẾT (NGHỊ LUẬN):
   - Câu nghị luận xã hội: điểm tối đa = 100% thang điểm (VD: câu 2đ → max 2.0đ)
   - Câu nghị luận văn học: điểm tối đa = 90% thang điểm (VD: câu 5đ → max 4.5đ)
   - Lý do: Bài viết của học sinh THPT luôn có thể cải thiện — cho điểm tối đa là không thực tế
   - Chỉ câu đọc hiểu (trắc nghiệm/trả lời ngắn) mới được phép cho điểm tối đa nếu đúng hoàn toàn

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

    const rawText = await sendGradingRequest(prompt);

    try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]) as ExamGrade;
            // Ensure arrays exist
            parsed.errors = parsed.errors || [];
            parsed.improvements = parsed.improvements || [];
            parsed.weaknesses = parsed.weaknesses || [];
            parsed.strengths = parsed.strengths || [];
            // Safety net: cap score at 95% of maxScore (max 9.5/10)
            const capScore = parsed.maxScore * 0.95;
            if (parsed.score > capScore) {
                parsed.score = capScore;
            }
            return parsed;
        }
    } catch (e) {
        console.error('Failed to parse grading JSON:', e);
    }

    // Fallback
    return {
        score: 0,
        maxScore: 10,
        feedback: rawText,
        details: 'Không thể phân tích kết quả chi tiết.',
        errors: [],
        improvements: [],
        weaknesses: ['lỗi phân tích'],
        strengths: [],
    };
}
