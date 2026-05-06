import { useState, useEffect, useCallback, useRef } from 'react';
import { MATCH_PAIRS, shuffle } from '../../constants/miniGameData';
import type { MatchPair } from '../../constants/miniGameData';
import { RotateCcw, ArrowLeft } from 'lucide-react';

interface Card {
    id: number;
    text: string;
    pairId: number;
    type: 'work' | 'author';
    flipped: boolean;
    matched: boolean;
}

interface Props {
    onBack: () => void;
}

export default function MatchingGame({ onBack }: Props) {
    const [cards, setCards] = useState<Card[]>([]);
    const [selected, setSelected] = useState<number[]>([]);
    const [moves, setMoves] = useState(0);
    const [matchedCount, setMatchedCount] = useState(0);
    const [gameWon, setGameWon] = useState(false);
    const lockRef = useRef(false);

    const initGame = useCallback(() => {
        const pairs = shuffle(MATCH_PAIRS).slice(0, 6);
        const cardList: Card[] = [];
        pairs.forEach((p: MatchPair, i: number) => {
            cardList.push({ id: i * 2, text: p.work, pairId: i, type: 'work', flipped: false, matched: false });
            cardList.push({ id: i * 2 + 1, text: p.author, pairId: i, type: 'author', flipped: false, matched: false });
        });
        setCards(shuffle(cardList));
        setSelected([]);
        setMoves(0);
        setMatchedCount(0);
        setGameWon(false);
        lockRef.current = false;
    }, []);

    useEffect(() => { initGame(); }, [initGame]);

    const handleFlip = (idx: number) => {
        if (lockRef.current) return;
        const card = cards[idx];
        if (card.flipped || card.matched) return;

        const newCards = [...cards];
        newCards[idx] = { ...newCards[idx], flipped: true };
        const newSelected = [...selected, idx];
        setCards(newCards);
        setSelected(newSelected);

        if (newSelected.length === 2) {
            lockRef.current = true;
            setMoves(m => m + 1);
            const [a, b] = newSelected;
            const cardA = newCards[a];
            const cardB = newCards[b];

            if (cardA.pairId === cardB.pairId && cardA.type !== cardB.type) {
                // Match!
                setTimeout(() => {
                    setCards(prev => prev.map((c, i) =>
                        i === a || i === b ? { ...c, matched: true } : c
                    ));
                    const newCount = matchedCount + 1;
                    setMatchedCount(newCount);
                    if (newCount === 6) setGameWon(true);
                    setSelected([]);
                    lockRef.current = false;
                }, 500);
            } else {
                // No match — flip back
                setTimeout(() => {
                    setCards(prev => prev.map((c, i) =>
                        i === a || i === b ? { ...c, flipped: false } : c
                    ));
                    setSelected([]);
                    lockRef.current = false;
                }, 900);
            }
        }
    };

    const stars = moves <= 8 ? 3 : moves <= 12 ? 2 : 1;

    return (
        <div className="minigame-container">
            <div className="minigame-header">
                <button className="mg-back-btn" onClick={onBack}><ArrowLeft size={18} /> Quay lại</button>
                <h2 className="mg-title">Nối đôi</h2>
                <div className="mg-stats">
                    <span className="mg-stat">Lượt: <strong>{moves}</strong></span>
                    <span className="mg-stat">Đã nối: <strong>{matchedCount}/6</strong></span>
                </div>
            </div>

            {gameWon ? (
                <div className="mg-win-screen">
                    <div className="mg-win-stars">{'⭐'.repeat(stars)}</div>
                    <h3>Xuất sắc!</h3>
                    <p>Hoàn thành trong {moves} lượt lật</p>
                    <button className="mg-play-btn" onClick={initGame}>
                        <RotateCcw size={16} /> Chơi lại
                    </button>
                </div>
            ) : (
                <div className="matching-grid">
                    {cards.map((card, i) => (
                        <div
                            key={card.id}
                            className={`match-card ${card.flipped || card.matched ? 'flipped' : ''} ${card.matched ? 'matched' : ''} ${card.type}`}
                            onClick={() => handleFlip(i)}
                        >
                            <div className="match-card-inner">
                                <div className="match-card-front">?</div>
                                <div className="match-card-back">
                                    <span className="match-card-label">{card.type === 'work' ? '📖' : '✍️'}</span>
                                    <span className="match-card-text">{card.text}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
