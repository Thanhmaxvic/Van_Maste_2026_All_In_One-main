import { useState } from 'react';
import { Layers, PenTool, Zap, HelpCircle } from 'lucide-react';
import MatchingGame from './MatchingGame';
import FillPoetryGame from './FillPoetryGame';
import WordScrambleGame from './WordScrambleGame';
import TrueFalseGame from './TrueFalseGame';

type GameId = 'matching' | 'poetry' | 'scramble' | 'truefalse' | null;

const GAMES = [
    {
        id: 'matching' as GameId,
        title: 'Nối Đôi',
        desc: 'Lật thẻ nối tác phẩm với tác giả',
        icon: <Layers size={28} />,
        color: '#1565C0',
        bg: 'linear-gradient(135deg, #E3F2FD, #BBDEFB)',
    },
    {
        id: 'poetry' as GameId,
        title: 'Điền Câu Thơ',
        desc: 'Điền từ còn thiếu trong câu thơ nổi tiếng',
        icon: <PenTool size={28} />,
        color: '#7B1FA2',
        bg: 'linear-gradient(135deg, #F3E5F5, #E1BEE7)',
    },
    {
        id: 'scramble' as GameId,
        title: 'Ai Nhanh Hơn',
        desc: 'Giải mã chữ cái xáo trộn thành thuật ngữ văn học',
        icon: <Zap size={28} />,
        color: '#E65100',
        bg: 'linear-gradient(135deg, #FFF3E0, #FFE0B2)',
    },
    {
        id: 'truefalse' as GameId,
        title: 'Đúng hay Sai',
        desc: 'Phản xạ nhanh với kiến thức văn học',
        icon: <HelpCircle size={28} />,
        color: '#2E7D32',
        bg: 'linear-gradient(135deg, #E8F5E9, #C8E6C9)',
    },
];

export default function MiniGamesHub() {
    const [activeGame, setActiveGame] = useState<GameId>(null);

    if (activeGame === 'matching') return <MatchingGame onBack={() => setActiveGame(null)} />;
    if (activeGame === 'poetry') return <FillPoetryGame onBack={() => setActiveGame(null)} />;
    if (activeGame === 'scramble') return <WordScrambleGame onBack={() => setActiveGame(null)} />;
    if (activeGame === 'truefalse') return <TrueFalseGame onBack={() => setActiveGame(null)} />;

    return (
        <div className="mg-hub">
            <div className="mg-hub-header">
                <h2 className="mg-hub-title">Mini Games</h2>
                <p className="mg-hub-subtitle">Vừa chơi vừa học — giải trí mà vẫn nhớ bài</p>
            </div>
            <div className="mg-hub-grid">
                {GAMES.map(g => (
                    <button
                        key={g.id}
                        className="mg-hub-card"
                        style={{ background: g.bg }}
                        onClick={() => setActiveGame(g.id)}
                    >
                        <div className="mg-hub-card-icon" style={{ color: g.color }}>{g.icon}</div>
                        <h3 className="mg-hub-card-title" style={{ color: g.color }}>{g.title}</h3>
                        <p className="mg-hub-card-desc">{g.desc}</p>
                    </button>
                ))}
            </div>
        </div>
    );
}
