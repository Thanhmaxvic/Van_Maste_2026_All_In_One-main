import React from 'react';
import { BarChart3 } from 'lucide-react';

const StatsTab: React.FC = () => (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="w-48 h-48 bg-white rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(14,165,233,0.3)] border-8 border-[#F0F9FF] relative mb-8">
            <BarChart3 size={64} className="text-[#0EA5E9]" />
            <span className="absolute -bottom-4 bg-[#0EA5E9] text-white px-4 py-1 rounded-full text-xs font-black">
                TOP 10%
            </span>
        </div>
        <h3 className="text-2xl font-black text-slate-800 mb-2">THỐNG KÊ NĂNG LỰC</h3>
        <p className="text-slate-400 text-sm max-w-xs">
            Hệ thống đang phân tích dữ liệu từ các bài làm của bạn...
        </p>
    </div>
);

export default StatsTab;
