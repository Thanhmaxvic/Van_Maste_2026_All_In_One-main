import React from 'react';
import { Send, Camera, Mic, MicOff, Loader2, Wand2 } from 'lucide-react';

interface ChatInputProps {
    input: string;
    isRecording: boolean;
    isRewriting: boolean;
    fileInputRef: React.RefObject<HTMLInputElement>;
    onInputChange: (value: string) => void;
    onSend: () => void;
    onToggleRecording: () => void;
    onMagicRewrite: () => void;
    onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onCameraClick: () => void;
}

const ChatInput: React.FC<ChatInputProps> = ({
    input,
    isRecording,
    isRewriting,
    fileInputRef,
    onInputChange,
    onSend,
    onToggleRecording,
    onMagicRewrite,
    onFileSelect,
    onCameraClick,
}) => (
    <div className="relative bg-white p-2 rounded-[2rem] shadow-2xl border border-slate-100 flex items-center gap-2">
        {/* Magic Rewrite Button */}
        {input.length > 5 && (
            <button
                onClick={onMagicRewrite}
                disabled={isRewriting}
                className="absolute -top-10 left-0 bg-gradient-to-r from-purple-500 to-indigo-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-lg flex items-center gap-1 animate-slide-up"
            >
                {isRewriting ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />} Nâng cấp văn phong ✨
            </button>
        )}

        {/* Mic Button */}
        <button
            onClick={onToggleRecording}
            className={`p-3 rounded-full transition-all ${isRecording ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-100 text-slate-500'
                }`}
        >
            {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
        </button>

        {/* Text Input */}
        <input
            className="flex-1 bg-transparent border-none py-3 px-2 font-bold focus:ring-0 outline-none text-slate-700 placeholder:text-slate-300"
            placeholder={isRecording ? 'Đang nghe...' : 'Nhập nội dung...'}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSend()}
        />

        {/* Camera Button */}
        <button onClick={onCameraClick} className="p-2 text-slate-400 hover:text-[#0EA5E9]">
            <Camera size={22} />
        </button>

        {/* Hidden File Input */}
        <input type="file" hidden ref={fileInputRef} accept="image/*" onChange={onFileSelect} />

        {/* Send Button */}
        <button
            onClick={onSend}
            className="p-3 bg-[#0EA5E9] text-white rounded-full shadow-lg hover:scale-105 transition-transform"
        >
            <Send size={20} />
        </button>
    </div>
);

export default ChatInput;
