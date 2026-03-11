import React from 'react';
import { Ghost, CheckCircle2, Target, Loader2 } from 'lucide-react';
import type { UserData } from '../../types';

interface HomeTabProps {
    userData: UserData;
    isDiagnosing: boolean;
    onStartDiagnosis: () => void;
}

const ROADMAP_ITEMS = ['Chẩn đoán', 'Lý thuyết', 'Thực hành', 'Luyện đề'];

const HomeTab: React.FC<HomeTabProps> = ({ userData, isDiagnosing, onStartDiagnosis }) => (
    <div className="p-6 space-y-6 overflow-y-auto h-full no-scrollbar pb-24">
        {/* Progress Card */}
        <div className="bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden">
            <Ghost className="absolute -right-5 -bottom-5 opacity-20" size={150} />
            <h3 className="text-4xl font-black mb-2">LỘ TRÌNH</h3>
            <p className="text-indigo-200 font-medium">Mục tiêu: 9+ THI TN THPT</p>
            <div className="mt-6 bg-black/20 h-3 rounded-full overflow-hidden">
                <div className="bg-[#FCD34D] h-full" style={{ width: `${userData.progress}%` }}></div>
            </div>
        </div>

        {/* Roadmap Grid */}
        <div className="grid grid-cols-2 gap-4">
            {ROADMAP_ITEMS.map((item, i) => (
                <div
                    key={i}
                    onClick={() => i === 0 && onStartDiagnosis()}
                    className={`bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col items-center justify-center gap-3 hover:border-[#0EA5E9] transition-all ${i === 0 ? 'cursor-pointer hover:shadow-lg' : ''
                        } ${isDiagnosing && i === 0 ? 'opacity-50' : ''}`}
                >
                    <div
                        className={`p-3 rounded-2xl ${i === 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'
                            }`}
                    >
                        {i === 0 ? (
                            isDiagnosing ? (
                                <Loader2 className="animate-spin" />
                            ) : (
                                <CheckCircle2 />
                            )
                        ) : (
                            <Target />
                        )}
                    </div>
                    <span className="font-bold text-sm text-slate-700">{item}</span>
                </div>
            ))}
        </div>
    </div>
);

export default HomeTab;
