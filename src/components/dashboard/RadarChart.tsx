export function RadarChart({ scores }: { scores: Record<string, number> }) {
    const labels = Object.keys(scores);
    const values = Object.values(scores);
    const n = labels.length;
    if (n < 3) return null;

    const size = 200;
    const cx = size / 2;
    const cy = size / 2;
    const maxR = 75;
    const levels = [25, 50, 75, 100];

    const getPoint = (idx: number, value: number) => {
        const angle = (Math.PI * 2 * idx) / n - Math.PI / 2;
        const r = (value / 100) * maxR;
        return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    };

    const dataPoints = values.map((v, i) => getPoint(i, v));
    const polygon = dataPoints.map(p => `${p.x},${p.y}`).join(' ');

    return (
        <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', maxWidth: 220, margin: '0 auto', display: 'block' }}>
            {/* Grid levels */}
            {levels.map(level => {
                const pts = Array.from({ length: n }, (_, i) => getPoint(i, level));
                return (
                    <polygon
                        key={level}
                        points={pts.map(p => `${p.x},${p.y}`).join(' ')}
                        fill="none"
                        stroke="var(--color-border)"
                        strokeWidth={0.5}
                        opacity={0.5}
                    />
                );
            })}

            {/* Axis lines */}
            {Array.from({ length: n }, (_, i) => {
                const p = getPoint(i, 100);
                return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="var(--color-border)" strokeWidth={0.5} opacity={0.4} />;
            })}

            {/* Data polygon */}
            <polygon points={polygon} fill="rgba(99, 102, 241, 0.15)" stroke="#6366F1" strokeWidth={2} />
            
            {/* Data points */}
            {dataPoints.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="#6366F1" stroke="#fff" strokeWidth={1.5} />
            ))}

            {/* Labels */}
            {labels.map((label, i) => {
                const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
                const labelR = maxR + 18;
                const lx = cx + labelR * Math.cos(angle);
                const ly = cy + labelR * Math.sin(angle);
                return (
                    <text
                        key={i}
                        x={lx}
                        y={ly}
                        textAnchor="middle"
                        dominantBaseline="central"
                        style={{ fontSize: 10, fontWeight: 600, fill: 'var(--color-text-secondary)' }}
                    >
                        {label.length > 10 ? label.slice(0, 9) + '…' : label}
                    </text>
                );
            })}

            {/* Center score */}
            {(() => {
                const avg = Math.round(values.reduce((a, b) => a + b, 0) / n);
                return (
                    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
                        style={{ fontSize: 16, fontWeight: 800, fill: '#6366F1' }}>
                        {avg}%
                    </text>
                );
            })()}
        </svg>
    );
}
