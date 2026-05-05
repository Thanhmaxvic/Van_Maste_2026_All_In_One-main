import { useState, useEffect, useCallback, useRef, Fragment, type KeyboardEvent } from 'react';
import { POETRY_FILLS, shuffle } from '../../constants/miniGameData';
import type { PoetryFill } from '../../constants/miniGameData';
import { RotateCcw, ArrowLeft, Lightbulb, Check, X } from 'lucide-react';

interface Props {
    onBack: () => void;
}

const TOTAL_QUESTIONS = 10;

export default function FillPoetryGame({ onBack }: Props) {
    const [questions, setQuestions] = useState<PoetryFill[]>([]);
    const [current, setCurrent] = useState(0);
    const [userInput, setUserInput] = useState('');
    const [score, setScore] = useState(0);
    const [attempts, setAttempts] = useState(0);
    const [showHint, setShowHint] = useState(false);
    const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
    const [gameOver, setGameOver] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const initGame = useCallback(() => {
        setQuestions(shuffle(POETRY_FILLS).slice(0, TOTAL_QUESTIONS));
        setCurrent(0);
        setUserInput('');
        setScore(0);
        setAttempts(0);
        setShowHint(false);
        setFeedback(null);
        setGameOver(false);
    }, []);

    useEffect(() => { initGame(); }, [initGame]);
    useEffect(() => { inputRef.current?.focus(); }, [current, feedback]);

    const q = questions[current];

    const handleSubmit = () => {
        if (!userInput.trim() || !q) return;
        const clean = userInput.trim().toLowerCase();
        const answer = q.answer.toLowerCase();

        if (clean === answer || answer.includes(clean)) {
            setFeedback('correct');
            setScore(s => s + 1);
            setTimeout(nextQuestion, 1200);
        } else {
            setAttempts(a => a + 1);
            setFeedback('wrong');
            if (attempts >= 1) {
                setShowHint(true);
            }
            setTimeout(() => {
                setFeedback(null);
                setUserInput('');
            }, 1000);
        }
    };

    const nextQuestion = () => {
        if (current + 1 >= TOTAL_QUESTIONS) {
            setGameOver(true);
        } else {
            setCurrent(c => c + 1);
            setUserInput('');
            setAttempts(0);
            setShowHint(false);
            setFeedback(null);
        }
    };

    const skipQuestion = () => {
        setFeedback(null);
        nextQuestion();
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') handleSubmit();
    };

    if (!q) return null;

    return (
        <div className="minigame-container">
            <div className="minigame-header">
                <button className="mg-back-btn" onClick={onBack}><ArrowLeft size={18} /> Quay lại</button>
                <h2 className="mg-title">Điền Câu Thơ</h2>
                <div className="mg-stats">
                    <span className="mg-stat">Câu: <strong>{current + 1}/{TOTAL_QUESTIONS}</strong></span>
                    <span className="mg-stat">Đúng: <strong>{score}</strong></span>
                </div>
            </div>

            {gameOver ? (
                <div className="mg-win-screen">
                    <div className="mg-win-stars">{score >= 8 ? '⭐⭐⭐' : score >= 5 ? '⭐⭐' : '⭐'}</div>
                    <h3>{score >= 8 ? 'Xuất sắc!' : score >= 5 ? 'Khá lắm!' : 'Cố gắng thêm nhé!'}</h3>
                    <p>Đúng {score}/{TOTAL_QUESTIONS} câu thơ</p>
                    <button className="mg-play-btn" onClick={initGame}>
                        <RotateCcw size={16} /> Chơi lại
                    </button>
                </div>
            ) : (
                <div className="poetry-game-body">
                    <div className="poetry-source">{q.source}</div>
                    <div className="poetry-line">
                        {q.line.split('___').map((part, i, arr) => (
                            <Fragment key={i}>
                                <span>{part}</span>
                                {i < arr.length - 1 && (
                                    <span className={`poetry-blank ${feedback === 'correct' ? 'correct' : feedback === 'wrong' ? 'wrong' : ''}`}>
                                        {feedback === 'correct' ? q.answer : '___'}
                                    </span>
                                )}
                            </Fragment>
                        ))}
                    </div>

                    {showHint && q.hint && (
                        <div className="poetry-hint">
                            <Lightbulb size={14} /> Gợi ý: {q.hint}
                        </div>
                    )}

                    <div className="poetry-input-row">
                        <input
                            ref={inputRef}
                            className={`poetry-input ${feedback === 'correct' ? 'correct' : feedback === 'wrong' ? 'wrong' : ''}`}
                            type="text"
                            placeholder="Điền từ còn thiếu..."
                            value={userInput}
                            onChange={e => setUserInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={feedback === 'correct'}
                        />
                        <button className="mg-submit-btn" onClick={handleSubmit} disabled={!userInput.trim() || feedback === 'correct'}>
                            <Check size={18} />
                        </button>
                    </div>

                    <div className="poetry-actions">
                        {!showHint && q.hint && (
                            <button className="mg-hint-btn" onClick={() => setShowHint(true)}>
                                <Lightbulb size={14} /> Xem gợi ý
                            </button>
                        )}
                        <button className="mg-skip-btn" onClick={skipQuestion}>
                            Bỏ qua <X size={14} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
