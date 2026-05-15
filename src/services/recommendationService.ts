/**
 * Recommendation Engine — Cá nhân hoá lộ trình học tập
 * 
 * Maps student weaknesses → relevant lessons, detects spaced repetition needs,
 * and provides personalized learning suggestions.
 */

import { CURRICULUM, getLessonKey } from '../constants/curriculum';
import type { UserProfile } from '../types';

// ── Weakness → Tag keyword mapping ──────────────────────────────────────────
// Maps common AI-generated weakness strings to lesson tags
const WEAKNESS_TAG_MAP: Record<string, string[]> = {
    // Đọc hiểu
    'đọc hiểu': ['đọc hiểu', 'phân tích', 'nhận biết'],
    'phân tích': ['phân tích', 'đọc hiểu', 'phân tích tác phẩm'],
    'nhận biết': ['nhận biết', 'đọc hiểu'],
    'biện pháp tu từ': ['biện pháp tu từ', 'đọc hiểu'],
    'nội dung chính': ['nội dung chính', 'đọc hiểu'],
    'trả lời câu hỏi': ['trả lời câu hỏi', 'đọc hiểu'],
    // Viết
    'viết': ['viết', 'đoạn văn', 'bài văn', 'lập luận'],
    'diễn đạt': ['diễn đạt', 'viết', 'cấu trúc'],
    'lập luận': ['lập luận', 'viết', 'cấu trúc'],
    'cấu trúc bài': ['cấu trúc', 'mở bài', 'kết bài'],
    'dẫn chứng': ['dẫn chứng', 'NLXH', 'NLVH', 'dẫn chứng văn học'],
    'thiếu dẫn chứng': ['dẫn chứng', 'NLXH', 'NLVH'],
    'nghị luận xã hội': ['NLXH', 'nghị luận xã hội', 'dẫn chứng'],
    'nghị luận văn học': ['NLVH', 'nghị luận văn học', 'phân tích tác phẩm'],
    'nlxh': ['NLXH', 'nghị luận xã hội'],
    'nlvh': ['NLVH', 'nghị luận văn học'],
    // Tri thức
    'kiến thức nền': ['tri thức', 'lý thuyết', 'thể loại'],
    'thể loại': ['thể loại', 'tri thức'],
    'tác phẩm': ['tác phẩm', 'tri thức'],
};

export interface LessonRecommendation {
    sectionId: string;
    lessonId: string;
    title: string;
    sectionTitle: string;
    /** Why this lesson is recommended */
    reason: string;
    /** Type of recommendation */
    type: 'weakness' | 'review' | 'next';
    /** Priority score (higher = more important) */
    priority: number;
}

/**
 * Get lessons recommended based on student's weaknesses.
 * Matches weakness strings against lesson tags using fuzzy keyword matching.
 */
export function getWeaknessRecommendations(profile: UserProfile): LessonRecommendation[] {
    const weaknesses = profile.weaknesses || [];
    if (weaknesses.length === 0) return [];

    const lp = profile.lessonProgress || {};
    const recommendations: LessonRecommendation[] = [];
    const addedKeys = new Set<string>();

    for (const weakness of weaknesses) {
        const wLower = weakness.toLowerCase();
        
        // Find matching tags from the weakness map
        let matchingTags: string[] = [];
        for (const [key, tags] of Object.entries(WEAKNESS_TAG_MAP)) {
            if (wLower.includes(key) || key.includes(wLower)) {
                matchingTags = [...matchingTags, ...tags];
            }
        }
        
        // Also do direct keyword matching against lesson tags
        const wWords = wLower.split(/[\s,;]+/).filter(w => w.length > 2);

        for (const section of CURRICULUM) {
            for (const lesson of section.lessons) {
                const key = getLessonKey(section.id, lesson.id);
                if (addedKeys.has(key)) continue;

                const lessonStatus = lp[key]?.status;
                // Skip completed lessons for weakness recommendations
                if (lessonStatus === 'completed') continue;

                // Calculate match score
                let matchScore = 0;
                const lessonTagsLower = lesson.tags.map(t => t.toLowerCase());

                // Check mapped tags
                for (const tag of matchingTags) {
                    if (lessonTagsLower.includes(tag.toLowerCase())) {
                        matchScore += 3;
                    }
                }

                // Check direct word matches
                for (const word of wWords) {
                    for (const tag of lessonTagsLower) {
                        if (tag.includes(word) || word.includes(tag)) {
                            matchScore += 1;
                        }
                    }
                }

                if (matchScore >= 2) {
                    addedKeys.add(key);
                    recommendations.push({
                        sectionId: section.id,
                        lessonId: lesson.id,
                        title: lesson.title,
                        sectionTitle: section.title,
                        reason: `Giúp cải thiện: ${weakness}`,
                        type: 'weakness',
                        priority: matchScore + (lessonStatus === 'in_progress' ? 5 : 0),
                    });
                }
            }
        }
    }

    return recommendations.sort((a, b) => b.priority - a.priority);
}

/** Days after completion before suggesting review */
const REVIEW_DAYS = 7;
/** Minimum accuracy to NOT suggest review */
const REVIEW_ACCURACY_THRESHOLD = 0.7;

/**
 * Get lessons that need spaced repetition review.
 * Criteria: completed > 7 days ago, OR completed with low accuracy.
 */
export function getSpacedRepetitionLessons(profile: UserProfile): LessonRecommendation[] {
    const lp = profile.lessonProgress || {};
    const now = Date.now();
    const recommendations: LessonRecommendation[] = [];

    for (const section of CURRICULUM) {
        for (const lesson of section.lessons) {
            const key = getLessonKey(section.id, lesson.id);
            const progress = lp[key];
            if (!progress || progress.status !== 'completed') continue;

            const daysSinceComplete = progress.completedAt
                ? Math.floor((now - progress.completedAt) / (1000 * 60 * 60 * 24))
                : 999; // If no completedAt, assume old

            const accuracy = progress.questionsAsked > 0
                ? progress.questionsCorrect / progress.questionsAsked
                : 1;

            let reason = '';
            let priority = 0;

            if (accuracy < REVIEW_ACCURACY_THRESHOLD) {
                reason = `Chỉ trả lời đúng ${Math.round(accuracy * 100)}% câu hỏi — nên ôn lại`;
                priority = 8 + Math.round((1 - accuracy) * 5);
            } else if (daysSinceComplete >= REVIEW_DAYS) {
                reason = `Đã ${daysSinceComplete} ngày kể từ khi hoàn thành — ôn lại để nhớ lâu`;
                priority = Math.min(daysSinceComplete / 7, 5);
            }

            if (reason) {
                recommendations.push({
                    sectionId: section.id,
                    lessonId: lesson.id,
                    title: lesson.title,
                    sectionTitle: section.title,
                    reason,
                    type: 'review',
                    priority,
                });
            }
        }
    }

    return recommendations.sort((a, b) => b.priority - a.priority);
}

/**
 * Get the next recommended lesson for the student based on their level.
 * Considers diagnostic score to skip basic lessons for advanced students.
 */
export function getNextRecommendedLesson(profile: UserProfile): LessonRecommendation | null {
    const lp = profile.lessonProgress || {};
    const diagScore = profile.diagnosticScore ?? 0;

    // Determine starting difficulty based on diagnostic score
    let minDifficulty: 'basic' | 'standard' | 'advanced' = 'basic';
    if (diagScore >= 8) minDifficulty = 'advanced';
    else if (diagScore >= 6) minDifficulty = 'standard';

    const difficultyOrder = { basic: 0, standard: 1, advanced: 2 };

    for (const section of CURRICULUM) {
        for (const lesson of section.lessons) {
            const key = getLessonKey(section.id, lesson.id);
            const status = lp[key]?.status;
            
            if (status === 'in_progress') {
                return {
                    sectionId: section.id,
                    lessonId: lesson.id,
                    title: lesson.title,
                    sectionTitle: section.title,
                    reason: 'Bài đang học dang dở',
                    type: 'next',
                    priority: 100,
                };
            }

            if (!status || status === 'not_started') {
                // Skip lessons below student's level (if diagnostic shows they're advanced)
                if (difficultyOrder[lesson.difficulty] < difficultyOrder[minDifficulty]) {
                    continue;
                }

                return {
                    sectionId: section.id,
                    lessonId: lesson.id,
                    title: lesson.title,
                    sectionTitle: section.title,
                    reason: diagScore >= 6
                        ? `Phù hợp trình độ hiện tại (${lesson.difficulty === 'advanced' ? 'nâng cao' : 'chuẩn'})`
                        : 'Bài tiếp theo trong lộ trình',
                    type: 'next',
                    priority: 50,
                };
            }
        }
    }

    return null;
}

/**
 * Calculate skill scores for radar chart (0-100 per skill area).
 * Based on lesson progress + quiz accuracy in each section.
 */
export function calculateSkillScores(profile: UserProfile): Record<string, number> {
    const lp = profile.lessonProgress || {};
    const scores: Record<string, number> = {};

    for (const section of CURRICULUM) {
        let totalWeight = 0;
        let earnedWeight = 0;

        for (const lesson of section.lessons) {
            const key = getLessonKey(section.id, lesson.id);
            const progress = lp[key];
            const weight = lesson.difficulty === 'advanced' ? 3 : lesson.difficulty === 'standard' ? 2 : 1;
            totalWeight += weight;

            if (!progress) continue;

            if (progress.status === 'completed') {
                // Completion = 60% of weight
                earnedWeight += weight * 0.6;
                // Accuracy = remaining 40%
                if (progress.questionsAsked > 0) {
                    const accuracy = progress.questionsCorrect / progress.questionsAsked;
                    earnedWeight += weight * 0.4 * accuracy;
                } else {
                    earnedWeight += weight * 0.2; // Some credit for completing without questions
                }
            } else if (progress.status === 'in_progress') {
                const sectionPct = progress.sectionsTotal > 0
                    ? progress.sectionsDone / progress.sectionsTotal
                    : 0;
                earnedWeight += weight * 0.4 * sectionPct;
            }
        }

        scores[section.title] = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
    }

    return scores;
}

export function getAllRecommendations(profile: UserProfile): {
    weakness: LessonRecommendation[];
    review: LessonRecommendation[];
    next: LessonRecommendation | null;
} {
    return {
        weakness: getWeaknessRecommendations(profile).slice(0, 3),
        review: getSpacedRepetitionLessons(profile).slice(0, 3),
        next: getNextRecommendedLesson(profile),
    };
}

import type { TimelineItem } from '../types';

/**
 * Compute the real-time status of each timeline item based on current profile data.
 * This is called at render time — statuses are NOT persisted.
 */
export function computeTimelineStatus(
    timeline: TimelineItem[],
    profile: UserProfile,
): TimelineItem[] {
    const lp = profile.lessonProgress || {};
    let foundFirstPending = false;

    return timeline.map(item => {
        let status: TimelineItem['status'] = 'pending';

        if (item.type === 'exam') {
            // Exam milestones: done if student has submitted enough exams
            const requiredSubmissions = item.lessonKey === 'exam-1' ? 1 : item.lessonKey === 'exam-3' ? 3 : 2;
            if ((profile.submissionCount || 0) >= requiredSubmissions) {
                status = 'done';
            }
        } else if (item.lessonKey) {
            const progress = lp[item.lessonKey];
            if (progress?.status === 'completed') {
                status = 'done';
            } else if (progress?.status === 'in_progress') {
                status = 'in_progress';
            }
        } else if (item.type === 'weakness') {
            // Weakness milestones without specific lesson: done if weakness resolved
            const weaknesses = (profile.weaknesses || []).map(w => w.toLowerCase());
            const titleLower = item.title.toLowerCase();
            // If the weakness topic no longer appears, it's resolved
            const stillExists = weaknesses.some(w => titleLower.includes(w) || w.includes(titleLower.split(':').pop()?.trim() || ''));
            if (!stillExists && (profile.submissionCount || 0) > 0) {
                status = 'done';
            }
        }

        // Mark the first non-done item as "in_progress" (current milestone)
        if (status === 'pending' && !foundFirstPending) {
            foundFirstPending = true;
            status = 'in_progress';
        }

        return { ...item, status };
    });
}

/**
 * Generate an adaptive, phase-based learning roadmap based on the student's
 * current weaknesses, lesson progress, diagnostic score, and exam history.
 * 
 * Phases:
 *   GĐ1: Nền tảng — build foundation based on diagnostic level
 *   GĐ2: Khắc phục — target specific weaknesses
 *   GĐ3: Nâng cao — advance to harder content
 *   GĐ4: Thực chiến — practice exams under timed conditions
 * 
 * Each item is linked to a specific lesson or action.
 */
export function generateAdaptiveTimeline(profile: UserProfile): TimelineItem[] {
    const recs = getAllRecommendations(profile);
    const lp = profile.lessonProgress || {};
    const avgScore = profile.avgScore || 0;
    const diagScore = profile.diagnosticScore ?? 0;
    const submissions = profile.submissionCount || 0;
    const timeline: TimelineItem[] = [];

    // ── Determine student level ──
    const effectiveScore = avgScore > 0 ? avgScore : diagScore;
    const level: 'basic' | 'standard' | 'advanced' =
        effectiveScore >= 8 ? 'advanced' : effectiveScore >= 6 ? 'standard' : 'basic';

    // ── GĐ1: Nền tảng ─────────────────────────────────────────────
    // Pick foundation lessons based on level
    const foundationLessons = level === 'advanced'
        ? [{ key: 's1-b3', title: 'Ôn tập tri thức ngữ văn lớp 12' }]
        : level === 'standard'
            ? [{ key: 's1-b2', title: 'Ôn tập tri thức ngữ văn lớp 11' }]
            : [{ key: 's1-b1', title: 'Ôn tập tri thức ngữ văn lớp 10' }];

    // Add reading comprehension foundation
    const readingLesson = lp['s2-b1']?.status === 'completed'
        ? { key: 's2-b2', title: 'Thực hành đọc hiểu' }
        : { key: 's2-b1', title: 'Lý thuyết đọc hiểu' };

    timeline.push({
        time: 'GĐ 1',
        title: `Nền tảng: ${foundationLessons[0].title}`,
        desc: `Xây dựng kiến thức gốc rễ ${level === 'advanced' ? 'nâng cao' : level === 'standard' ? 'chuẩn' : 'cơ bản'} trước khi đi sâu vào kỹ năng.`,
        lessonKey: foundationLessons[0].key,
        type: 'next',
    });

    timeline.push({
        time: 'GĐ 1',
        title: `Nền tảng: ${readingLesson.title}`,
        desc: 'Nắm vững kỹ năng đọc hiểu — chiếm 4/10 điểm trong đề thi.',
        lessonKey: readingLesson.key,
        type: 'next',
    });

    // ── GĐ2: Khắc phục ────────────────────────────────────────────
    if (recs.weakness.length > 0) {
        for (const rec of recs.weakness.slice(0, 2)) {
            const lessonKey = getLessonKey(rec.sectionId, rec.lessonId);
            timeline.push({
                time: 'GĐ 2',
                title: `Khắc phục: ${rec.title}`,
                desc: rec.reason,
                lessonKey,
                type: 'weakness',
            });
        }
    } else {
        // No specific weaknesses — suggest writing practice
        const writingLesson = lp['s3-b1']?.status === 'completed'
            ? (lp['s3-b2']?.status === 'completed' ? 's3-b3' : 's3-b2')
            : 's3-b1';
        const writingTitle = CURRICULUM.flatMap(s => s.lessons).find(l => getLessonKey(
            CURRICULUM.find(s => s.lessons.includes(l))!.id, l.id
        ) === writingLesson)?.title || 'Luyện viết đoạn văn';

        timeline.push({
            time: 'GĐ 2',
            title: `Luyện tập: ${writingTitle}`,
            desc: 'Rèn kỹ năng viết — chiếm 6/10 điểm trong đề thi.',
            lessonKey: writingLesson,
            type: 'next',
        });
    }

    // ── GĐ3: Nâng cao ─────────────────────────────────────────────
    if (recs.review.length > 0) {
        // Prioritize spaced repetition review
        const rev = recs.review[0];
        timeline.push({
            time: 'GĐ 3',
            title: `Ôn tập: ${rev.title}`,
            desc: rev.reason,
            lessonKey: getLessonKey(rev.sectionId, rev.lessonId),
            type: 'review',
        });
    }

    if (recs.next) {
        timeline.push({
            time: 'GĐ 3',
            title: `Học mới: ${recs.next.title}`,
            desc: recs.next.reason,
            lessonKey: getLessonKey(recs.next.sectionId, recs.next.lessonId),
            type: 'next',
        });
    } else {
        // All lessons done — suggest advanced writing
        const advancedLesson = lp['s4-b3']?.status === 'completed' ? 's4-b2' : 's4-b3';
        timeline.push({
            time: 'GĐ 3',
            title: 'Nâng cao kỹ năng viết bài NLVH',
            desc: 'Bứt phá điểm số với kỹ năng phân tích văn học nâng cao.',
            lessonKey: advancedLesson,
            type: 'next',
        });
    }

    // ── GĐ4: Thực chiến ───────────────────────────────────────────
    const examDesc = submissions === 0
        ? 'Làm đề thi thử đầu tiên để đánh giá năng lực tổng hợp.'
        : submissions < 3
            ? `Đã làm ${submissions} đề. Cần thêm ${3 - submissions} đề để đủ dữ liệu đánh giá chính xác.`
            : `Đã làm ${submissions} đề (TB: ${avgScore.toFixed(1)}/10). Tiếp tục luyện để nâng điểm.`;

    timeline.push({
        time: 'GĐ 4',
        title: 'Thực chiến: Đề thi thử tổng hợp',
        desc: examDesc,
        lessonKey: submissions < 1 ? 'exam-1' : submissions < 3 ? 'exam-3' : 'exam-more',
        type: 'exam',
    });

    // Apply real-time status computation
    return computeTimelineStatus(timeline, profile);
}

/** @deprecated Use generateAdaptiveTimeline instead */
export function generateDefaultTimeline(profile: UserProfile): TimelineItem[] {
    return generateAdaptiveTimeline(profile);
}

