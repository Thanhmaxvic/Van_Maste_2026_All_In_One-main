import { Router } from 'express';
import { synthesizeHandler } from '../controllers/tts.controller.js';

export const ttsRouter = Router();

// Text-to-Speech synthesis
ttsRouter.post('/synthesize', synthesizeHandler);
