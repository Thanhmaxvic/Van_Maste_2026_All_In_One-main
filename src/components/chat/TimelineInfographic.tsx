import React from 'react';
import { Sparkles } from 'lucide-react';

interface TimelineInfographicProps {
    data: string;
}

const TimelineInfographic: React.FC<TimelineInfographicProps> = ({ data }) => {
    const events = data
        .split('\n')
        .filter((l) => l.includes('[TIMELINE]'))
        .map((l) => {
            const p = l.replace('[TIMELINE]', '').split('|');
            return { time: p[0]?.trim(), title: p[1]?.trim(), desc: p[2]?.trim() };
        });

    if (events.length === 0) return null;

    return (
        <div className="my-6 w-full animate-zoom-in">
            <div className="bg-[#FFFBEB] p-6 rounded-[2rem] shadow-xl border-4 border-[#F59E0B] relative overflow-hidden">
                <div className="absolute top-0 w-full h-4 bg-[#F59E0B]/20"></div>
                <h3 className="text-2xl font-black text-[#B45309] text-center mb-8 uppercase tracking-widest flex items-center justify-center gap-2">
                    <Sparkles className="text-yellow-500" /> Hành Trình Tác Phẩm
                </h3>
                <div className="space-y-6 relative">
                    <div className="absolute left-[19px] top-2 bottom-2 w-1 bg-[#FCD34D] rounded-full"></div>
                    {events.map((ev, idx) => (
                        <div key={idx} className="flex gap-4 relative pl-2">
                            <div className="z-10 flex-shrink-0">
                                <div className="w-10 h-10 rounded-full bg-[#F59E0B] text-white flex items-center justify-center font-bold shadow-lg border-4 border-[#FFFBEB]">
                                    {idx + 1}
                                </div>
                            </div>
                            <div className="bg-white p-4 rounded-2xl shadow-sm border border-[#FDE68A] flex-1 hover:scale-[1.02] transition-transform cursor-default">
                                <span className="inline-block px-2 py-1 bg-[#FEF3C7] text-[#92400E] text-[10px] font-black rounded-lg mb-1">
                                    {ev.time}
                                </span>
                                <h4 className="font-bold text-[#B45309] text-sm uppercase">{ev.title}</h4>
                                <p className="text-xs text-slate-600 mt-1 leading-relaxed">{ev.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default TimelineInfographic;
