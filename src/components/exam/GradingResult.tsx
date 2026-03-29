import { X, Star, TrendingUp, Lightbulb, RefreshCw, Trophy } from 'lucide-react';
import type { ExamSubmission } from '../../types';


interface GradingResultProps {
    grade: NonNullable<ExamSubmission['grade']>;
    examId: number;
    onClose: () => void;
    onNewExam: () => void;
}

export default function GradingResult({ grade, examId, onClose, onNewExam }: GradingResultProps) {
    const percentage = Math.round((grade.score / grade.maxScore) * 100);

    const getScoreColor = () => {
        if (percentage >= 80) return 'from-emerald-500 to-green-400';
        if (percentage >= 65) return 'from-sky-500 to-blue-400';
        if (percentage >= 50) return 'from-amber-500 to-yellow-400';
        return 'from-red-500 to-rose-400';
    };

    const getScoreEmoji = () => {
        if (percentage >= 80) return '🏆';
        if (percentage >= 65) return '🎉';
        if (percentage >= 50) return '👍';
        return '💪';
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up">
                {/* Header gradient */}
                <div className={`bg-gradient-to-br ${getScoreColor()} p-8 rounded-t-3xl text-white text-center relative`}>
                    <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white">
                        <X size={20} />
                    </button>

                    <div className="text-5xl mb-2">{getScoreEmoji()}</div>
                    <h2 className="font-black text-xl mb-1 mt-2">Điểm AI Gợi Ý (Chờ Duyệt)</h2>
                    <p className="text-white/90 text-xs bg-black/20 px-3 py-1 rounded-full inline-block mt-1 mb-2">
                        Điểm sẽ được cập nhật chính thức sau khi Giáo viên duyệt
                    </p>
                    <p className="text-white/80 text-sm">Đề thi số #{examId}</p>

                    {/* Score circle */}
                    <div className="mt-4 inline-flex flex-col items-center bg-white/20 backdrop-blur-sm rounded-2xl px-8 py-4">
                        <div className="text-5xl font-black">
                            {grade.score}<span className="text-2xl font-bold opacity-70">/{grade.maxScore}</span>
                        </div>
                        <div className="flex gap-1 mt-1">
                            {Array.from({ length: 5 }, (_, i) => (
                                <Star
                                    key={i}
                                    size={16}
                                    className={i < Math.round(percentage / 20) ? 'text-yellow-300 fill-yellow-300' : 'text-white/30'}
                                />
                            ))}
                        </div>
                        <p className="text-white/80 text-xs mt-1">{percentage}% hoàn thành</p>
                    </div>
                </div>

                {/* Body */}
                <div className="p-6 space-y-5">
                    {/* Tổng nhận xét */}
                    <div className="bg-slate-50 rounded-2xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Trophy size={16} className="text-amber-500" />
                            <h3 className="font-bold text-slate-700 text-sm">Nhận xét tổng thể</h3>
                        </div>
                        <p className="text-slate-600 text-sm leading-relaxed">{grade.feedback}</p>
                    </div>

                    {/* Chi tiết điểm */}
                    <div className="bg-blue-50 rounded-2xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <TrendingUp size={16} className="text-blue-500" />
                            <h3 className="font-bold text-slate-700 text-sm">Chấm điểm chi tiết</h3>
                        </div>
                        <div className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap">
                            {grade.details}
                        </div>
                    </div>

                    {/* Góp ý cải thiện */}
                    <div className="bg-emerald-50 rounded-2xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Lightbulb size={16} className="text-emerald-600" />
                            <h3 className="font-bold text-slate-700 text-sm">Điểm cần cải thiện</h3>
                        </div>
                        <div className="text-slate-600 text-sm leading-relaxed">
                            {(grade.improvements || []).map((imp: string, i: number) => (
                                <div key={i} className="mb-1">- {imp}</div>
                            ))}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={onClose}
                            className="flex-1 py-3 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold text-sm hover:border-slate-300 transition-all"
                        >
                            Xem lại bài làm
                        </button>
                        <button
                            onClick={() => { onClose(); onNewExam(); }}
                            className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-[#0EA5E9] to-indigo-600 text-white font-bold text-sm flex items-center justify-center gap-2 hover:scale-105 transition-all shadow-md shadow-sky-200"
                        >
                            <RefreshCw size={15} /> Làm đề khác
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
