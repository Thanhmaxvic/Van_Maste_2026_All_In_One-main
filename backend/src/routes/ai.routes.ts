import { Router } from 'express';
import {
    chatHandler,
    gradeHandler,
    gradeSubmissionHandler,
    generateHandler,
    imageHandler,
    infographicHandler,
    autoResponseHandler,
    proactiveHandler,
} from '../controllers/ai.controller.js';

export const aiRouter = Router();

// Chat with Gemini (lesson + free chat)
aiRouter.post('/chat', chatHandler);

// Grade exam answer (from examService)
aiRouter.post('/grade', gradeHandler);

// Grade student submission (with file support)
aiRouter.post('/grade-submission', gradeSubmissionHandler);

// Generic generate (quiz, exam, diagnostic, rewrite, weakness advice)
aiRouter.post('/generate', generateHandler);

// Image generation
aiRouter.post('/image', imageHandler);

// Infographic generation
aiRouter.post('/infographic', infographicHandler);

// Auto-response for student-teacher chat
aiRouter.post('/auto-response', autoResponseHandler);

// Proactive idle message
aiRouter.post('/proactive', proactiveHandler);
