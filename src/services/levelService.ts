export interface LevelInfo {
    level: string;
    levelName: string;
    badges: string[];
}

/**
 * Tính toán cấp độ người dùng và phần thưởng Huy hiệu dựa vào điểm trung bình (avgScore).
 * 
 * Logic các mốc điểm:
 * 1. Sĩ Tử Nhập Môn: < 4 điểm
 * 2. Tú Tài Khai Bút: 4 - 6.9 điểm
 * 3. Cử Nhân Bút Nghiên: 7 - 8.9 điểm
 * 4. Bảng Nhãn: 9 - 9.49 điểm
 * 5. Trạng Nguyên: 9.5 - 10 điểm
 * 
 * @param avgScore Điểm trung bình từ 0 đến 10
 * @param isProfileComplete Tùy chọn, dùng để cấp "Huy hiệu Nhập môn" cho Tân binh
 */
export function calculateUserLevel(avgScore: number, isProfileComplete: boolean = true): LevelInfo {
    // 5. Trạng Nguyên (9.5 - 10.0 điểm)
    if (avgScore >= 9.5) {
        return {
            level: 'Trạng Nguyên',
            levelName: 'Trạng Nguyên',
            badges: ['✨ Kim Bảng Đề Danh']
        };
    }

    // 4. Bảng Nhãn (9.0 - 9.49 điểm)
    if (avgScore >= 9.0) {
        return {
            level: 'Bảng Nhãn',
            levelName: 'Bảng Nhãn',
            badges: ['🌺 Bút Hoa']
        };
    }

    // 3. Cử Nhân Bút Nghiên (7.0 - 8.9 điểm)
    if (avgScore >= 7.0) {
        const badges = [];
        badges.push('🌸 Giấy Hoa Tiên');
        if (avgScore >= 8.0) {
            badges.push('🔖 Nghiên Mực Đá Trầm');
        }
        return {
            level: 'Cử Nhân Bút Nghiên',
            levelName: 'Cử Nhân Bút Nghiên',
            badges
        };
    }

    // 2. Tú Tài Khai Bút (4.0 - 6.9 điểm)
    if (avgScore >= 4.0) {
        return {
            level: 'Tú Tài Khai Bút',
            levelName: 'Tú Tài Khai Bút',
            badges: ['🎒 Tráp Bút', '🖌️ Bút Lông']
        };
    }

    // 1. Sĩ Tử Nhập Môn (< 4.0 điểm)
    return {
        level: 'Sĩ Tử Nhập Môn',
        levelName: 'Sĩ Tử Nhập Môn',
        badges: isProfileComplete ? ['🪔 Đèn Khuya', '📜 Thẻ Tre'] : []
    };
}
