import { useState, useRef, useEffect } from 'react';
import { UploadCloud, FileText, CheckCircle, Loader2, AlertCircle, Clock, User, Check, Edit3, RefreshCw, Trash2 } from 'lucide-react';
import type { ExamGrade } from '../../types';
import { getPendingSubmissions, approveSubmission, rejectSubmission, type PendingSubmission } from '../../services/firebaseService';

export default function TeacherGrading() {
    const [activeTab, setActiveTab] = useState<'pending' | 'offline'>('pending');

    // Offline logic
    const [studentFile, setStudentFile] = useState<File | null>(null);
    const [gradingGuide, setGradingGuide] = useState('');
    const [gradingGuideFile, setGradingGuideFile] = useState<File | null>(null);
    const [isGrading, setIsGrading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const studentFileRef = useRef<HTMLInputElement>(null);
    const guideFileRef = useRef<HTMLInputElement>(null);

    // Pending logic
    const [pendingList, setPendingList] = useState<PendingSubmission[]>([]);
    const [selectedPending, setSelectedPending] = useState<PendingSubmission | null>(null);
    const [isLoadingPending, setIsLoadingPending] = useState(false);
    const [isApproving, setIsApproving] = useState(false);

    // Shared Result State
    const [result, setResult] = useState<ExamGrade | null>(null);

    // Edited states
    const [editScore, setEditScore] = useState<number | ''>('');
    const [editFeedback, setEditFeedback] = useState('');

    useEffect(() => {
        loadPending();
    }, []);

    const loadPending = async () => {
        setIsLoadingPending(true);
        try {
            const list = await getPendingSubmissions();
            setPendingList(list);
        } catch (e: any) {
            console.error(e);
            setErrorMsg('Lỗi tải hàng chờ: ' + e.message);
        }
        setIsLoadingPending(false);
    };

    const handleSelectPending = (p: PendingSubmission) => {
        setSelectedPending(p);
        setResult(p.aiSuggestedGrade);
        setEditScore(p.aiSuggestedGrade?.score ?? '');
        setEditFeedback(p.aiSuggestedGrade?.feedback || '');
        setErrorMsg('');
    };

    const handleApprove = async () => {
        if (!selectedPending || editScore === '') return;
        setIsApproving(true);
        try {
            const finalGrade: ExamGrade = {
                score: Number(editScore),
                maxScore: selectedPending.aiSuggestedGrade?.maxScore ?? 10,
                feedback: editFeedback || '',
                details: selectedPending.aiSuggestedGrade?.details || '',
                errors: selectedPending.aiSuggestedGrade?.errors || [],
                improvements: selectedPending.aiSuggestedGrade?.improvements || [],
                weaknesses: selectedPending.aiSuggestedGrade?.weaknesses || [],
                strengths: selectedPending.aiSuggestedGrade?.strengths || []
            };
            
            await approveSubmission(selectedPending.uid, finalGrade, selectedPending.submissionId);
            setResult(null);
            setSelectedPending(null);
            await loadPending();
            alert('Đã duyệt điểm thành công! Điểm đã được ghi vào hồ sơ học sinh.');
        } catch (e: any) {
            alert('Lỗi: ' + e.message);
        }
        setIsApproving(false);
    };

    const handleReject = async () => {
        if (!selectedPending) return;
        if (!window.confirm("Bạn có chắc chắn muốn xóa bài này khỏi hàng chờ duyệt? Hành động này không thể hoàn tác.")) return;
        setIsApproving(true);
        try {
            await rejectSubmission(selectedPending.uid, selectedPending.submissionId);
            setResult(null);
            setSelectedPending(null);
            await loadPending();
            alert('Đã xóa bài thi khỏi hàng chờ.');
        } catch (e: any) {
            alert('Lỗi: ' + e.message);
        }
        setIsApproving(false);
    };

    const handleGradeOffline = async () => {
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
        setSelectedPending(null); // Clear any pending selection

        try {
            let guideText = gradingGuide;
            if (gradingGuideFile) {
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

            const { gradeStudentSubmission } = await import('../../services/geminiApi');
            const gradeData = await gradeStudentSubmission(prompt, studentFile);

            setResult(gradeData);
            setEditScore(gradeData.score);
            setEditFeedback(gradeData.feedback);
        } catch (err: any) {
            console.error('Grading error:', err);
            setErrorMsg('Lỗi khi chấm bài. Vui lòng thử lại. Chi tiết: ' + err.message);
        } finally {
            setIsGrading(false);
        }
    };

    return (
        <div className="teacher-grading p-6 max-w-7xl mx-auto h-[100dvh] overflow-y-auto w-full">
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <CheckCircle className="text-pink-500" /> Trung tâm chấm thi AI
            </h1>
            <p className="text-gray-500 mb-6 mt-1 text-sm">Hệ thống tuân thủ nguyên tắc kiểm duyệt: AI gợi ý - con người kiểm tra - con người quyết định - hệ thống thực thi.</p>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b border-gray-200 justify-between items-center">
                <div className="flex gap-2">
                    <button
                        onClick={() => { setActiveTab('pending'); setResult(null); setSelectedPending(null); loadPending(); }}
                        className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 ${activeTab === 'pending' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Hàng chờ duyệt ({pendingList.length})
                    </button>
                    <button
                        onClick={() => { setActiveTab('offline'); setResult(null); setSelectedPending(null); }}
                        className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 ${activeTab === 'offline' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Chấm bài offline
                    </button>
                </div>
                {activeTab === 'pending' && (
                    <button onClick={loadPending} className="flex items-center gap-1 text-sm text-pink-500 hover:text-pink-600 font-medium px-3 py-1 bg-pink-50 rounded-lg transition-colors">
                        <RefreshCw size={14} className={isLoadingPending ? "animate-spin" : ""} />
                        Làm mới
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left: Input / Queue Panel */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col max-h-[700px]">
                    {activeTab === 'pending' ? (
                        <>
                            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                <Clock size={20} className="text-orange-500" /> Bài thi học sinh mới nộp
                            </h2>
                            {isLoadingPending ? (
                                <div className="flex-1 flex justify-center items-center text-gray-400">
                                    <Loader2 className="animate-spin" size={24} />
                                </div>
                            ) : pendingList.length === 0 ? (
                                <div className="flex-1 flex flex-col justify-center items-center text-gray-400 text-sm">
                                    <CheckCircle size={32} className="text-green-400 mb-2" />
                                    Tuyệt vời! Không còn bài thi nào đang chờ duyệt.
                                </div>
                            ) : (
                                <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                                    {pendingList.map(p => (
                                        <div
                                            key={p.submissionId}
                                            onClick={() => handleSelectPending(p)}
                                            className={`p-4 rounded-xl border transition-all cursor-pointer hover:shadow-md ${selectedPending?.submissionId === p.submissionId ? 'border-pink-500 bg-pink-50 ring-2 ring-pink-200' : 'border-gray-200 bg-white'}`}
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center gap-2 font-bold text-gray-700">
                                                    <User size={16} /> {p.userName}
                                                </div>
                                                {p.cheating && <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded text-[10px] font-bold">GIAN LẬN</span>}
                                            </div>
                                            <div className="text-sm text-gray-500 mb-1">
                                                Đề thi số: #{p.examId}
                                            </div>
                                            <div className="text-xs text-gray-400">
                                                Nộp lúc: {p.createdAt?.toDate ? p.createdAt.toDate().toLocaleString() : 'Vừa xong'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {selectedPending && (
                                <div className="mt-4 pt-4 border-t border-gray-100">
                                    <h3 className="font-bold text-gray-700 mb-2 text-sm">Nội dung bài làm của học sinh:</h3>
                                    <div className="bg-gray-50 p-4 rounded border border-gray-200 text-sm text-gray-600 h-48 overflow-y-auto leading-relaxed whitespace-pre-wrap">
                                        {selectedPending.studentAnswer}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <>
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
                                    1. Bài làm (Ảnh chụp tự luận/Docx)
                                </label>
                                <div
                                    className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center hover:bg-gray-50 cursor-pointer transition-colors"
                                    onClick={() => studentFileRef.current?.click()}
                                >
                                    <FileText size={32} className="text-gray-400 mb-2" />
                                    <span className="text-sm text-gray-600 font-medium">
                                        {studentFile ? studentFile.name : 'Nhấn để định dạng file tải lên'}
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
                                    2. Hướng dẫn chấm (văn bản hoặc file)
                                </label>
                                <textarea
                                    className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent outline-none resize-none transition-shadow text-sm text-gray-800"
                                    placeholder="Dán nội dung hướng dẫn chấm vào đây..."
                                    value={gradingGuide}
                                    onChange={e => setGradingGuide(e.target.value)}
                                />
                                <div className="mt-2 text-[10px] text-gray-400 uppercase font-bold text-center">- HOẶC TẢI LÊN -</div>
                                <div
                                    className="mt-2 border border-gray-200 rounded-lg p-3 flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors text-sm"
                                    onClick={() => guideFileRef.current?.click()}
                                >
                                    <span className="text-gray-600 font-medium truncate w-full text-center">
                                        {gradingGuideFile ? gradingGuideFile.name : 'Tải lên HD chấm (PDF/Docx)'}
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
                                className="w-full bg-pink-500 hover:bg-pink-600 text-white font-medium py-3 rounded-lg flex justify-center items-center gap-2 transition-colors disabled:opacity-50 mt-auto"
                                onClick={handleGradeOffline}
                                disabled={isGrading}
                            >
                                {isGrading ? (
                                    <><Loader2 size={20} className="animate-spin" /> Mạng nơ-ron đang phân tích...</>
                                ) : (
                                    <><CheckCircle size={20} /> Chấm bài bằng AI</>
                                )}
                            </button>
                        </>
                    )}
                </div>

                {/* Right: Results Panel */}
                <div className="bg-slate-50 rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col h-full min-h-[500px]">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-200 flex items-center justify-between">
                        <span className="flex items-center gap-2"><Award size={20} className="text-purple-500" /> Kết quả đánh giá (AI gợi ý)</span>
                        {selectedPending && (
                            <span className="text-xs bg-orange-100 text-orange-600 px-2 py-1 rounded-full font-bold">Chờ giáo viên chốt</span>
                        )}
                    </h2>

                    {!result && !isGrading && (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 opacity-60">
                            <PenTool size={48} className="mb-4" />
                            <p>Chọn bài thi bên trái để bắt đầu duyệt</p>
                        </div>
                    )}

                    {isGrading && (
                        <div className="flex-1 flex flex-col items-center justify-center text-pink-500">
                            <Loader2 size={48} className="animate-spin mb-4" />
                            <p className="font-medium">Vui lòng chờ. Quá trình chấm có thể mất tới 30 giây.</p>
                        </div>
                    )}

                    {result && !isGrading && (
                        <div className="flex-1 overflow-y-auto pr-2 flex flex-col">
                            {/* Score header - Editable */}
                            <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-pink-100 shadow-sm mb-6">
                                <span className="text-gray-600 font-semibold text-sm flex items-center gap-1"><Edit3 size={14} /> Điểm Cuối Cùng:</span>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min="0" max="10" step="0.25"
                                        value={editScore}
                                        onChange={e => setEditScore(e.target.value === '' ? '' : Number(e.target.value))}
                                        className="w-20 text-3xl font-bold text-pink-500 bg-pink-50 border border-pink-200 rounded-lg text-center p-1 outline-none focus:ring-2 focus:ring-pink-400"
                                    />
                                    <span className="text-2xl font-bold text-pink-300">/10</span>
                                </div>
                            </div>

                            {/* Main feedback - Editable */}
                            <div className="mb-6">
                                <h3 className="text-sm uppercase tracking-wider font-bold text-gray-500 mb-2 flex items-center gap-1"><Edit3 size={14} /> Nhận xét chung cho học sinh</h3>
                                <textarea
                                    className="w-full bg-white p-4 rounded-lg border border-gray-200 text-gray-800 text-sm leading-relaxed shadow-sm min-h-[120px] outline-none focus:ring-2 focus:ring-pink-300 transition-shadow resize-y"
                                    value={editFeedback}
                                    onChange={e => setEditFeedback(e.target.value)}
                                />
                            </div>

                            {/* Readonly details from AI */}
                            <div className="space-y-6 flex-1">
                                {result.details && (
                                    <div>
                                        <h3 className="text-sm uppercase tracking-wider font-bold text-gray-400 mb-2">Chi tiết từng phần (AI phân tích - Readonly)</h3>
                                        <div className="bg-white/50 p-4 rounded-lg border border-gray-100 text-gray-500 text-sm whitespace-pre-wrap leading-relaxed">
                                            {result.details}
                                        </div>
                                    </div>
                                )}

                                {result.errors && result.errors.length > 0 && (
                                    <div>
                                        <h3 className="text-sm uppercase tracking-wider font-bold text-red-300 mb-2">Các lỗi phát hiện (AI)</h3>
                                        <div className="space-y-3 opacity-80">
                                            {result.errors.map((err, i) => (
                                                <div key={i} className="bg-red-50/50 p-4 rounded-lg border border-red-50 text-sm">
                                                    <div className="font-medium text-red-800 mb-1 flex items-center gap-2">
                                                        <XCircle size={14} /> {err.issue}
                                                    </div>
                                                    {err.quote && <div className="bg-white/60 px-3 py-2 italic text-gray-500 rounded mb-2 border-l-2 border-red-200 text-xs">"{err.quote}"</div>}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="h-8"></div> {/* spacer */}
                            </div>

                            {/* Action Form Footer */}
                            <div className="pt-4 mt-auto border-t border-gray-200">
                                {selectedPending ? (
                                    <div className="flex flex-col gap-2">
                                        <button
                                            onClick={handleApprove}
                                            disabled={isApproving}
                                            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold py-4 rounded-xl shadow-lg transition-all disabled:opacity-50"
                                        >
                                            {isApproving ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} />}
                                            DUYỆT ĐIỂM & LƯU HỒ SƠ
                                        </button>
                                        <button
                                            onClick={handleReject}
                                            disabled={isApproving}
                                            className="w-full flex items-center justify-center gap-2 bg-white hover:bg-red-50 text-red-500 border border-red-200 font-bold py-3 rounded-xl shadow-sm transition-all disabled:opacity-50"
                                        >
                                            <Trash2 size={20} />
                                            XÓA KHỎI HÀNG CHỜ
                                        </button>
                                    </div>
                                ) : (
                                    <div className="text-center text-sm text-gray-400 bg-gray-100 rounded-lg p-3 border border-gray-200 border-dashed">
                                        Đây là bài chấm Offline. Tính năng lưu hồ sơ cho chức năng này đang được phát triển. Dùng điểm gợi ý để nhập tay.
                                    </div>
                                )}
                            </div>
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
