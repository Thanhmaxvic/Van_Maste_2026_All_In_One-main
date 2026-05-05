import { useState, useEffect, useCallback, useRef } from 'react';
import { WORD_SCRAMBLES, shuffle, scrambleWord } from '../../constants/miniGameData';
import { RotateCcw, ArrowLeft, Lightbulb, Timer } from 'lucide-react';

interface Props { onBack: () => void; }
const TOTAL = 10;
const TIME_LIMIT = 30;

export default function WordScrambleGame({ onBack }: Props) {
    const [words, setWords] = useState(WORD_SCRAMBLES.slice(0, TOTAL));
    const [current, setCurrent] = useState(0);
    const [displayScrambled, setDisplayScrambled] = useState('');
    const [userInput, setUserInput] = useState('');
    const [score, setScore] = useState(0);
    const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
    const [showHint, setShowHint] = useState(false);
    const [feedback, setFeedback] = useState<'correct'|'wrong'|'timeout'|null>(null);
    const [gameOver, setGameOver] = useState(false);
    const timerRef = useRef<ReturnType<typeof setInterval>|null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const initGame = useCallback(() => {
        const sel = shuffle(WORD_SCRAMBLES).slice(0, TOTAL);
        setWords(sel);
        setCurrent(0); setScore(0); setGameOver(false);
        setFeedback(null); setShowHint(false); setUserInput('');
        if (sel[0]) setDisplayScrambled(scrambleWord(sel[0].answer));
        setTimeLeft(TIME_LIMIT);
    }, []);

    useEffect(() => { initGame(); }, [initGame]);

    useEffect(() => {
        if (gameOver || feedback === 'correct') return;
        timerRef.current = setInterval(() => {
            setTimeLeft(t => {
                if (t <= 1) {
                    clearInterval(timerRef.current!);
                    setFeedback('timeout');
                    setTimeout(() => nextWord(), 1500);
                    return 0;
                }
                return t - 1;
            });
        }, 1000);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [current, gameOver, feedback]); // eslint-disable-line

    useEffect(() => { inputRef.current?.focus(); }, [current, feedback]);

    const w = words[current];

    const nextWord = () => {
        if (current + 1 >= TOTAL) { setGameOver(true); return; }
        const ni = current + 1;
        setCurrent(ni); setUserInput(''); setShowHint(false); setFeedback(null);
        if (words[ni]) setDisplayScrambled(scrambleWord(words[ni].answer));
        setTimeLeft(TIME_LIMIT);
    };

    const handleSubmit = () => {
        if (!userInput.trim() || !w || feedback === 'correct') return;
        if (userInput.trim().toLowerCase() === w.answer.toLowerCase()) {
            if (timerRef.current) clearInterval(timerRef.current);
            setFeedback('correct'); setScore(s => s + 1);
            setTimeout(() => nextWord(), 1200);
        } else {
            setFeedback('wrong');
            setTimeout(() => { setFeedback(null); setUserInput(''); }, 800);
        }
    };

    const timerPct = (timeLeft / TIME_LIMIT) * 100;
    const timerColor = timeLeft > 15 ? 'var(--color-success)' : timeLeft > 7 ? 'var(--color-warning)' : 'var(--color-danger)';

    if (!w && !gameOver) return null;

    return (
        <div className="minigame-container">
            <div className="minigame-header">
                <button className="mg-back-btn" onClick={onBack}><ArrowLeft size={18}/> Quay lại</button>
                <h2 className="mg-title">Ai Nhanh Hơn</h2>
                <div className="mg-stats">
                    <span className="mg-stat">Từ: <strong>{current+1}/{TOTAL}</strong></span>
                    <span className="mg-stat">Đúng: <strong>{score}</strong></span>
                </div>
            </div>

            {gameOver ? (
                <div className="mg-win-screen">
                    <div className="mg-win-stars">{score >= 8 ? '⭐⭐⭐' : score >= 5 ? '⭐⭐' : '⭐'}</div>
                    <h3>{score >= 8 ? 'Siêu nhanh!' : score >= 5 ? 'Khá lắm!' : 'Tập thêm nhé!'}</h3>
                    <p>Giải đúng {score}/{TOTAL} thuật ngữ</p>
                    <button className="mg-play-btn" onClick={initGame}><RotateCcw size={16}/> Chơi lại</button>
                </div>
            ) : (
                <div className="scramble-game-body">
                    <div className="scramble-timer-bar">
                        <Timer size={14} style={{color:timerColor}}/>
                        <div className="scramble-timer-track">
                            <div className="scramble-timer-fill" style={{width:`${timerPct}%`,background:timerColor}}/>
                        </div>
                        <span className="scramble-timer-text" style={{color:timerColor}}>{timeLeft}s</span>
                    </div>
                    <div className="scramble-letters">
                        {displayScrambled.split('').map((ch,i) => (
                            <span key={i} className={`scramble-letter ${ch===' '?'space':''}`}>{ch===' '?'\u00A0':ch}</span>
                        ))}
                    </div>
                    {showHint && <div className="poetry-hint"><Lightbulb size={14}/> {w.hint}</div>}
                    {feedback==='timeout' && <div className="scramble-timeout">Hết giờ! Đáp án: <strong>{w.answer}</strong></div>}
                    <div className="poetry-input-row">
                        <input ref={inputRef} className={`poetry-input ${feedback==='correct'?'correct':feedback==='wrong'?'wrong':''}`}
                            type="text" placeholder="Gõ thuật ngữ đúng..."
                            value={feedback==='correct'?w.answer:userInput}
                            onChange={e=>setUserInput(e.target.value)}
                            onKeyDown={e=>{if(e.key==='Enter')handleSubmit()}}
                            disabled={feedback==='correct'||feedback==='timeout'}/>
                        <button className="mg-submit-btn" onClick={handleSubmit} disabled={!userInput.trim()||feedback==='correct'||feedback==='timeout'}>OK</button>
                    </div>
                    <div className="poetry-actions">
                        {!showHint && <button className="mg-hint-btn" onClick={()=>setShowHint(true)}><Lightbulb size={14}/> Gợi ý</button>}
                        <button className="mg-skip-btn" onClick={nextWord}>Bỏ qua</button>
                    </div>
                </div>
            )}
        </div>
    );
}
