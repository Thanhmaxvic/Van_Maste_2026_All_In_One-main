import React from 'react';

interface AcademicPaperProps {
    content: string;
}

const AcademicPaper: React.FC<AcademicPaperProps> = ({ content }) => {
    const cleanContent = content.replace('[EXAM_PAPER]', '').replace('[/EXAM_PAPER]', '');

    return (
        <div className="my-6 w-full animate-slide-up">
            <div className="bg-white shadow-xl rounded-xl overflow-hidden border border-slate-300 relative paper-pattern">
                <div className="h-8 bg-[#38BDF8] w-full absolute top-0 left-0 opacity-10"></div>
                <div className="p-8 pt-12 md:p-12 relative min-h-[400px]">
                    <div className="absolute left-10 top-0 bottom-0 w-[2px] bg-red-200"></div>
                    <div className="font-serif text-slate-800 leading-[1.8] text-base space-y-4 pl-6">
                        {cleanContent.split('\n').map((line, i) => (
                            <p
                                key={i}
                                className={
                                    line.includes('ĐỀ')
                                        ? 'text-center font-black text-xl text-[#0369A1] mb-6'
                                        : line.includes('Câu')
                                            ? 'font-bold text-[#0C4A6E] mt-4'
                                            : 'text-justify'
                                }
                            >
                                {line}
                            </p>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AcademicPaper;
