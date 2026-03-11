import React from 'react';
import { Layout, Search, Zap, FileText } from 'lucide-react';

const QUICK_ACTIONS = [
    { icon: <Layout size={14} />, label: 'Đồ họa' },
    { icon: <Search size={14} />, label: 'Dẫn chứng' },
    { icon: <Zap size={14} />, label: 'Quiz' },
    { icon: <FileText size={14} />, label: 'Đề thi' },
];

const QuickActions: React.FC = () => (
    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-2">
        {QUICK_ACTIONS.map((btn, idx) => (
            <button
                key={idx}
                className="flex-shrink-0 bg-white text-[#0EA5E9] px-4 py-2 rounded-full text-xs font-bold shadow-sm border border-[#0EA5E9]/20 flex items-center gap-2 cursor-default"
            >
                {btn.icon} {btn.label}
            </button>
        ))}
    </div>
);

export default QuickActions;
