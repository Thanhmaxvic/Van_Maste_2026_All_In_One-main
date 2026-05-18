import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { aiRouter } from './routes/ai.routes.js';
import { ttsRouter } from './routes/tts.routes.js';

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
    origin: [FRONTEND_URL, 'http://localhost:5173', 'http://localhost:4173'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
}));

// Parse JSON bodies — increase limit for base64 images in grading
app.use(express.json({ limit: '50mb' }));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/ai', aiRouter);
app.use('/api/tts', ttsRouter);

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n🚀 Van Master Backend đang chạy tại http://localhost:${PORT}`);
    console.log(`   📡 CORS cho phép: ${FRONTEND_URL}`);
    console.log(`   🤖 Gemini API: ${process.env.GOOGLE_API_KEY ? '✓ Đã cấu hình' : '✗ Thiếu GOOGLE_API_KEY'}`);
    console.log(`   🔊 TTS API: ${process.env.GOOGLE_TTS_API_KEY ? '✓ Đã cấu hình' : '✗ Thiếu GOOGLE_TTS_API_KEY'}\n`);
});
