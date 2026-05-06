import { useState, useEffect, useCallback, useRef } from 'react';
import { TRUE_FALSE_ITEMS, shuffle } from '../../constants/miniGameData';
import { RotateCcw, ArrowLeft, Check, X } from 'lucide-react';

interface Props { onBack: () => void; }
const TOTAL = 10;
const TIME_PER_Q = 8;

export default function TrueFalseGame({ onBack }: Props) {
    const [items, setItems] = useState(TRUE_FALSE_ITEMS.slice(0, TOTAL));
    const [current, setCurrent] = useState(0);
    const [score, setScore] = useState(0);
    const [timeLeft, setTimeLeft] = useState(TIME_PER_Q);
    const [feedback, setFeedback] = useState<'correct' | 'wrong' | 'timeout' | null>(null);
    const [gameOver, setGameOver] = useState(false);
    const [results, setResults] = useState<{ correct: boolean; item: typeof TRUE_FALSE_ITEMS[0] }[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const initGame = useCallback(() => {
        const sel = shuffle(TRUE_FALSE_ITEMS).slice(0, TOTAL);
        setItems(sel); setCurrent(0); setScore(0); setGameOver(false);
        setFeedback(null); setTimeLeft(TIME_PER_Q); setResults([]);
    }, []);

    useEffect(() => { initGame(); }, [initGame]);

    useEffect(() => {
        if (gameOver || feedback) return;
        timerRef.current = setInterval(() => {
            setTimeLeft(t => {
                if (t <= 1) {
                    clearInterval(timerRef.current!);
                    handleAnswer(null);
                    return 0;
                }
                return t - 1;
            });
        }, 1000);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [current, gameOver, feedback]); // eslint-disable-line

    const q = items[current];

    const handleAnswer = (answer: boolean | null) => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (!q) return;

        if (answer === null) {
            setFeedback('timeout');
            setResults(r => [...r, { correct: false, item: q }]);
        } else if (answer === q.isTrue) {
            setFeedback('correct');
            setScore(s => s + 1);
            setResults(r => [...r, { correct: true, item: q }]);
        } else {
            setFeedback('wrong');
            setResults(r => [...r, { correct: false, item: q }]);
        }

        setTimeout(() => {
            if (current + 1 >= TOTAL) { setGameOver(true); }
            else {
                setCurrent(c => c + 1);
                setFeedback(null);
                setTimeLeft(TIME_PER_Q);
            }
        }, 1800);
    };

    const timerPct = (timeLeft / TIME_PER_Q) * 100;
    const timerColor = timeLeft > 5 ? 'var(--color-success)' : timeLeft > 3 ? 'var(--color-warning)' : 'var(--color-danger)';

    return (
        <div className="minigame-container">
            <div className="minigame-header">
                <button className="mg-back-btn" onClick={onBack}><ArrowLeft size={18} /> Quay lại</button>
                <h2 className="mg-title">Đúng hay sai</h2>
                <div className="mg-stats">
                    <span className="mg-stat">Câu: <strong>{Math.min(current + 1, TOTAL)}/{TOTAL}</strong></span>
                    <span className="mg-stat">Đúng: <strong>{score}</strong></span>
                </div>
            </div>

            {gameOver ? (
                <div className="mg-win-screen">
                    <div className="mg-win-stars">{score >= 8 ? '⭐⭐⭐' : score >= 5 ? '⭐⭐' : '⭐'}</div>
                    <h3>{score >= 8 ? 'Kiến thức vững!' : score >= 5 ? 'Ổn lắm!' : 'Ôn thêm nhé!'}</h3>
                    <p>Đúng {score}/{TOTAL} câu</p>

                    {/* Show wrong answers */}
                    {results.filter(r => !r.correct).length > 0 && (
                        <div className="tf-review">
                            <h4>Câu sai — xem lại:</h4>
                            {results.filter(r => !r.correct).map((r, i) => (
                                <div key={i} className="tf-review-item">
                                    <p className="tf-review-stmt">{r.item.statement}</p>
                                    <p className="tf-review-expl">{r.item.explanation}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    <button className="mg-play-btn" onClick={initGame}><RotateCcw size={16} /> Chơi lại</button>
                </div>
            ) : q ? (
                <div className="tf-game-body">
                    <div className="scramble-timer-bar">
                        <div className="scramble-timer-track">
                            <div className="scramble-timer-fill" style={{ width: `${timerPct}%`, background: timerColor, transition: 'width 1s linear' }} />
                        </div>
                        <span className="scramble-timer-text" style={{ color: timerColor }}>{timeLeft}s</span>
                    </div>

                    <div className={`tf-statement ${feedback === 'correct' ? 'correct' : feedback === 'wrong' || feedback === 'timeout' ? 'wrong' : ''}`}>
                        {q.statement}
                    </div>

                    {feedback && (
                        <div className={`tf-explanation ${feedback}`}>
                            {feedback === 'correct' ? 'Chính xác!' : feedback === 'timeout' ? 'Hết giờ!' : 'Sai rồi!'} {q.explanation}
                        </div>
                    )}

                    <div className="tf-buttons">
                        <button className="tf-btn tf-true" onClick={() => handleAnswer(true)} disabled={!!feedback}>
                            <Check size={22} /> Đúng
                        </button>
                        <button className="tf-btn tf-false" onClick={() => handleAnswer(false)} disabled={!!feedback}>
                            <X size={22} /> Sai
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
