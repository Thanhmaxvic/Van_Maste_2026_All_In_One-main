/**
 * Curriculum data — 4 sections, 11 lessons.
 * Each lesson maps to a DOCX file in /public/lythuyet/...
 */

import { BookOpen, Search, Edit3, PenTool, LucideIcon } from 'lucide-react';

export interface CurriculumLesson {
    id: string;       // e.g. "b1"
    title: string;
    docxPath: string;  // relative to public/
    /** Skill tags for weakness-to-lesson matching */
    tags: string[];
    /** Difficulty level for personalized ordering */
    difficulty: 'basic' | 'standard' | 'advanced';
}

export interface CurriculumSection {
    id: string;        // e.g. "s1"
    title: string;
    icon: LucideIcon; // lucide icon component reference
    color: string;     // primary color
    lessons: CurriculumLesson[];
}

export const CURRICULUM: CurriculumSection[] = [
    {
        id: 's1',
        title: 'Tri thức ngữ văn',
        icon: BookOpen,
        color: '#3b82f6',
        lessons: [
            { id: 'b1', title: 'Ôn tập tri thức ngữ văn lớp 10', docxPath: '/lythuyet/trithucnguvan/bai1/lythuyet.docx', tags: ['tri thức', 'lý thuyết', 'thể loại', 'tác phẩm', 'lớp 10'], difficulty: 'basic' },
            { id: 'b2', title: 'Ôn tập tri thức ngữ văn lớp 11', docxPath: '/lythuyet/trithucnguvan/bai2/lythuyet.docx', tags: ['tri thức', 'lý thuyết', 'thể loại', 'tác phẩm', 'lớp 11'], difficulty: 'standard' },
            { id: 'b3', title: 'Ôn tập tri thức ngữ văn lớp 12', docxPath: '/lythuyet/trithucnguvan/bai3/lythuyet.docx', tags: ['tri thức', 'lý thuyết', 'thể loại', 'tác phẩm', 'lớp 12'], difficulty: 'advanced' },
        ],
    },
    {
        id: 's2',
        title: 'Đọc hiểu',
        icon: Search,
        color: '#8b5cf6',
        lessons: [
            { id: 'b1', title: 'Lý thuyết đọc hiểu', docxPath: '/lythuyet/dochieu/bai1/lythuyet.docx', tags: ['đọc hiểu', 'phân tích', 'nhận biết', 'biện pháp tu từ', 'nội dung chính'], difficulty: 'basic' },
            { id: 'b2', title: 'Thực hành đọc hiểu', docxPath: '/lythuyet/dochieu/bai2/lythuyet.docx', tags: ['đọc hiểu', 'thực hành', 'phân tích', 'trả lời câu hỏi', 'luyện đề'], difficulty: 'standard' },
        ],
    },
    {
        id: 's3',
        title: 'Viết đoạn văn',
        icon: Edit3,
        color: '#f59e0b',
        lessons: [
            { id: 'b1', title: 'Lý thuyết viết đoạn văn', docxPath: '/lythuyet/vietdoan/bai1/lythuyet.docx', tags: ['viết', 'đoạn văn', 'cấu trúc', 'lập luận', 'diễn đạt'], difficulty: 'basic' },
            { id: 'b2', title: 'Hướng dẫn viết đoạn NLXH', docxPath: '/lythuyet/vietdoan/bai2/lythuyet.docx', tags: ['viết', 'đoạn văn', 'NLXH', 'nghị luận xã hội', 'dẫn chứng'], difficulty: 'standard' },
            { id: 'b3', title: 'Hướng dẫn viết đoạn NLVH', docxPath: '/lythuyet/vietdoan/bai3/lythuyet.docx', tags: ['viết', 'đoạn văn', 'NLVH', 'nghị luận văn học', 'phân tích tác phẩm'], difficulty: 'advanced' },
        ],
    },
    {
        id: 's4',
        title: 'Viết bài Văn',
        icon: PenTool,
        color: '#10b981',
        lessons: [
            { id: 'b1', title: 'Lý thuyết viết bài văn', docxPath: '/lythuyet/vietbai/bai1/lythuyet.docx', tags: ['viết', 'bài văn', 'cấu trúc', 'mở bài', 'kết bài', 'lập luận'], difficulty: 'basic' },
            { id: 'b2', title: 'Hướng dẫn viết bài NLXH', docxPath: '/lythuyet/vietbai/bai2/lythuyet.docx', tags: ['viết', 'bài văn', 'NLXH', 'nghị luận xã hội', 'dẫn chứng', 'liên hệ thực tế'], difficulty: 'standard' },
            { id: 'b3', title: 'Hướng dẫn viết bài NLVH', docxPath: '/lythuyet/vietbai/bai3/lythuyet.docx', tags: ['viết', 'bài văn', 'NLVH', 'nghị luận văn học', 'phân tích', 'dẫn chứng văn học'], difficulty: 'advanced' },
        ],
    },
];


/** Get a lesson progress key, e.g. "s1-b2" */
export function getLessonKey(sectionId: string, lessonId: string): string {
    return `${sectionId}-${lessonId}`;
}

/** Find a lesson by its key */
export function findLesson(sectionId: string, lessonId: string) {
    const section = CURRICULUM.find(s => s.id === sectionId);
    if (!section) return null;
    const lesson = section.lessons.find(l => l.id === lessonId);
    if (!lesson) return null;
    return { section, lesson };
}
