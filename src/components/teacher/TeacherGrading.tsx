import { useState, useRef } from 'react';
import { UploadCloud, FileText, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import type { ExamGrade } from '../../types';

export default function TeacherGrading() {
    const [studentFile, setStudentFile] = useState<File | null>(null);
    const [gradingGuide, setGradingGuide] = useState('');
    const [gradingGuideFile, setGradingGuideFile] = useState<File | null>(null);
    const [isGrading, setIsGrading] = useState(false);
    const [result, setResult] = useState<ExamGrade | null>(null);
    const [errorMsg, setErrorMsg] = useState('');

    const studentFileRef = useRef<HTMLInputElement>(null);
    const guideFileRef = useRef<HTMLInputElement>(null);

    const handleGrade = async () => {
        if (!studentFile) {
            setErrorMsg('Vui lòng tải lên bài làm của học sinh.');
            return;
        }
        if (!gradingGuide.trim() && !gradingGuideFile) {
            setErrorMsg('Vui lòng nhập hoặc tải lên hướng dẫn chấm.');
            return;
        }

        setErrorMsg('');
        setIsGrading(true);
        setResult(null);

        try {
            // Functionality to process files using Gemini Multimodal
            // For now we'll simulate reading the files as base64 (for images) 
            // and relying on geminiApi to parse it. We'll build the generic prompt.

            // To properly send images to Gemini, normally we'd need convert to base64. 
            // Here we just craft a prompt for the multimodal model.
            // If the user's geminiApi.ts supports images, we will pass them.
            // But right now geminiApi.ts text-only or chat-based might need adjustment.

            let guideText = gradingGuide;

            if (gradingGuideFile) {
                // simple assume the guide is text or we just mention it's attached
                guideText += `\n[Tài liệu hướng dẫn đính kèm: ${gradingGuideFile.name}]`;
            }

            const prompt = `Bạn là giám khảo chấm thi môn Ngữ Văn. 
Dưới đây là bài làm của học sinh (đã được đính kèm dưới dạng ảnh/tài liệu).
HÃY CHẤM ĐIỂM DỰA TRÊN HƯỚNG DẪN CHẤM SAU ĐÂY:
"""
${guideText}
"""

Nếu bài làm là file văn bản, hãy đọc cẩn thận. Nếu bài làm là ảnh chụp tự luận, hãy nhận diện chữ viết tay và chấm kỹ.
Kết quả trả về PHẢI là định dạng JSON đúng chuẩn với cấu trúc:
{
  "score": <điểm số>,
  "maxScore": 10,
  "feedback": "<Nhận xét tổng quan>",
  "details": "<Chi tiết từng phần>",
  "errors": [{"quote": "...", "issue": "...", "suggestion": "..."}],
  "improvements": ["..."],
  "weaknesses": ["..."],
  "strengths": ["..."]
}`;

            // We need a specific call to Gemini that supports files.
            // For now, we reuse sendGradingRequest, adding the base64 image if it's an image.
            const { gradeStudentSubmission } = await import('../../services/geminiApi');
            const gradeData = await gradeStudentSubmission(prompt, studentFile);

            setResult(gradeData);
        } catch (err: any) {
            console.error('Grading error:', err);
            setErrorMsg('Lỗi khi chấm bài. Vui lòng thử lại. Chi tiết: ' + err.message);
        } finally {
            setIsGrading(false);
        }
    };

    return (
        <div className="teacher-grading p-6 max-w-7xl mx-auto h-[100dvh] overflow-y-auto w-full">
            <h1 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                <CheckCircle className="text-pink-500" /> AI Trợ Lý Chấm Thi
            </h1>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left: Input Panel */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                        <UploadCloud size={20} className="text-blue-500" /> Tải Lên Dữ Liệu
                    </h2>

                    {errorMsg && (
                        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg flex items-center gap-2 text-sm">
                            <AlertCircle size={16} /> {errorMsg}
                        </div>
                    )}

                    {/* Student Work Upload */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            1. Bài làm của học sinh (Ảnh chụp, PDF, Docx)
                        </label>
                        <div
                            className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center hover:bg-gray-50 cursor-pointer transition-colors"
                            onClick={() => studentFileRef.current?.click()}
                        >
                            <FileText size={32} className="text-gray-400 mb-2" />
                            <span className="text-sm text-gray-600 font-medium">
                                {studentFile ? studentFile.name : 'Nhấn để chọn file bài làm'}
                            </span>
                            <input
                                ref={studentFileRef}
                                type="file"
                                className="hidden"
                                accept="image/*,.pdf,.doc,.docx"
                                onChange={e => setStudentFile(e.target.files?.[0] || null)}
                            />
                        </div>
                    </div>

                    {/* Grading Guide */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            2. Hướng dẫn chấm / Gợi ý chấm
                        </label>
                        <textarea
                            className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent outline-none resize-none transition-shadow text-sm text-gray-800"
                            placeholder="Dán nội dung hướng dẫn chấm hoặc barem điểm vào đây..."
                            value={gradingGuide}
                            onChange={e => setGradingGuide(e.target.value)}
                        />
                        <div className="text-center mt-2 text-sm text-gray-500 font-medium">- HOẶC -</div>
                        <div
                            className="mt-2 border border-gray-200 rounded-lg p-3 flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors text-sm"
                            onClick={() => guideFileRef.current?.click()}
                        >
                            <span className="text-gray-600 font-medium truncate w-full text-center">
                                {gradingGuideFile ? gradingGuideFile.name : 'Tải lên file hướng dẫn (PDF/Docx)'}
                            </span>
                            <input
                                ref={guideFileRef}
                                type="file"
                                className="hidden"
                                accept=".pdf,.doc,.docx,.txt"
                                onChange={e => setGradingGuideFile(e.target.files?.[0] || null)}
                            />
                        </div>
                    </div>

                    <button
                        className="w-full bg-pink-500 hover:bg-pink-600 text-white font-medium py-3 rounded-lg flex justify-center items-center gap-2 transition-colors disabled:opacity-50"
                        onClick={handleGrade}
                        disabled={isGrading}
                    >
                        {isGrading ? (
                            <><Loader2 size={20} className="animate-spin" /> Mạng nơ-ron đang phân tích...</>
                        ) : (
                            <><CheckCircle size={20} /> Chấm bài bằng AI</>
                        )}
                    </button>
                </div>

                {/* Right: Results Panel */}
                <div className="bg-slate-50 rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col h-full min-h-[500px]">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-200 flex items-center gap-2">
                        <Award size={20} className="text-purple-500" /> Kết Quả Đánh Giá
                    </h2>

                    {!result && !isGrading && (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 opacity-60">
                            <PenTool size={48} className="mb-4" />
                            <p>Kết quả chấm sẽ hiển thị ở đây</p>
                        </div>
                    )}

                    {isGrading && (
                        <div className="flex-1 flex flex-col items-center justify-center text-pink-500">
                            <Loader2 size={48} className="animate-spin mb-4" />
                            <p className="font-medium">Vui lòng chờ. Quá trình chấm có thể mất tới 30 giây.</p>
                        </div>
                    )}

                    {result && !isGrading && (
                        <div className="flex-1 overflow-y-auto pr-2 space-y-6">
                            {/* Score header */}
                            <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-pink-100 shadow-sm">
                                <span className="text-gray-600 font-semibold text-lg">Điểm Tổng:</span>
                                <span className="text-4xl font-bold text-pink-500">{result.score}<span className="text-2xl text-pink-300">/10</span></span>
                            </div>

                            {/* Main feedback */}
                            <div>
                                <h3 className="text-sm uppercase tracking-wider font-bold text-gray-500 mb-2">Nhận xét chung</h3>
                                <div className="bg-white p-4 rounded-lg border border-gray-100 text-gray-800 text-sm leading-relaxed shadow-sm">
                                    {result.feedback}
                                </div>
                            </div>

                            {/* Details */}
                            {result.details && (
                                <div>
                                    <h3 className="text-sm uppercase tracking-wider font-bold text-gray-500 mb-2">Chi tiết từng phần</h3>
                                    <div className="bg-white p-4 rounded-lg border border-gray-100 text-gray-700 text-sm whitespace-pre-wrap leading-relaxed shadow-sm">
                                        {result.details}
                                    </div>
                                </div>
                            )}

                            {/* Errors */}
                            {result.errors && result.errors.length > 0 && (
                                <div>
                                    <h3 className="text-sm uppercase tracking-wider font-bold text-red-400 mb-2">Các lỗi phát hiện</h3>
                                    <div className="space-y-3">
                                        {result.errors.map((err, i) => (
                                            <div key={i} className="bg-red-50 p-4 rounded-lg border border-red-100 text-sm shadow-sm">
                                                <div className="font-medium text-red-800 mb-1 flex items-center gap-2">
                                                    <XCircle size={14} /> {err.issue}
                                                </div>
                                                {err.quote && <div className="bg-white/60 px-3 py-2 italic text-gray-600 rounded mb-2 border-l-2 border-red-300">"{err.quote}"</div>}
                                                <div className="text-red-700"><span className="font-medium">Sửa:</span> {err.suggestion}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Improvements */}
                            {result.improvements && result.improvements.length > 0 && (
                                <div>
                                    <h3 className="text-sm uppercase tracking-wider font-bold text-blue-500 mb-2">Gợi ý cải thiện</h3>
                                    <ul className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-blue-800 text-sm space-y-2 list-disc pl-5 shadow-sm">
                                        {result.improvements.map((imp, i) => <li key={i}>{imp}</li>)}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Additional icons
function Award(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7" /><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" /></svg>; }
function PenTool(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19 7-7 3 3-7 7-3-3z" /><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="m2 2 7.586 7.586" /><circle cx="11" cy="11" r="2" /></svg>; }
function XCircle(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></svg>; }
