// ── Dữ liệu Mini Games ─────────────────────────────────────────────────────

/** Nối Đôi: cặp tác phẩm ↔ tác giả */
export interface MatchPair {
    work: string;
    author: string;
}

export const MATCH_PAIRS: MatchPair[] = [
    { work: 'Truyện Kiều', author: 'Nguyễn Du' },
    { work: 'Chí Phèo', author: 'Nam Cao' },
    { work: 'Tắt Đèn', author: 'Ngô Tất Tố' },
    { work: 'Vợ Nhặt', author: 'Kim Lân' },
    { work: 'Vợ Chồng A Phủ', author: 'Tô Hoài' },
    { work: 'Rừng Xà Nu', author: 'Nguyễn Trung Thành' },
    { work: 'Đây Thôn Vĩ Dạ', author: 'Hàn Mặc Tử' },
    { work: 'Tràng Giang', author: 'Huy Cận' },
    { work: 'Sóng', author: 'Xuân Quỳnh' },
    { work: 'Tây Tiến', author: 'Quang Dũng' },
    { work: 'Việt Bắc', author: 'Tố Hữu' },
    { work: 'Đất Nước', author: 'Nguyễn Khoa Điềm' },
    { work: 'Người Lái Đò Sông Đà', author: 'Nguyễn Tuân' },
    { work: 'Ai Đã Đặt Tên Cho Dòng Sông', author: 'Hoàng Phủ Ngọc Tường' },
    { work: 'Hạnh Phúc Của Một Tang Gia', author: 'Vũ Trọng Phụng' },
    { work: 'Số Đỏ', author: 'Vũ Trọng Phụng' },
    { work: 'Lão Hạc', author: 'Nam Cao' },
    { work: 'Chiếc Thuyền Ngoài Xa', author: 'Nguyễn Minh Châu' },
    { work: 'Những Đứa Con Trong Gia Đình', author: 'Nguyễn Thi' },
    { work: 'Bình Ngô Đại Cáo', author: 'Nguyễn Trãi' },
    { work: 'Chuyện Người Con Gái Nam Xương', author: 'Nguyễn Dữ' },
    { work: 'Thuốc', author: 'Lỗ Tấn' },
    { work: 'Chiều Tối', author: 'Hồ Chí Minh' },
    { work: 'Từ Ấy', author: 'Tố Hữu' },
    { work: 'Đời Thừa', author: 'Nam Cao' },
    { work: 'Hai Đứa Trẻ', author: 'Thạch Lam' },
    { work: 'Chữ Người Tử Tù', author: 'Nguyễn Tuân' },
    { work: 'Mùa Xuân Nho Nhỏ', author: 'Thanh Hải' },
    { work: 'Sang Thu', author: 'Hữu Thỉnh' },
    { work: 'Ánh Trăng', author: 'Nguyễn Duy' },
];

/** Điền Câu Thơ: câu thơ nổi tiếng, bỏ trống 1-2 từ */
export interface PoetryFill {
    line: string;       // câu thơ với ___ thay chỗ trống
    answer: string;     // từ cần điền (viết thường)
    source: string;     // tên tác phẩm - tác giả
    hint?: string;      // gợi ý
}

export const POETRY_FILLS: PoetryFill[] = [
    { line: 'Người đi, châu chấu ___ vàng', answer: 'đá', source: 'Ca dao', hint: 'Loài côn trùng nhảy trên đá' },
    { line: 'Cỏ non xanh tận chân ___', answer: 'trời', source: 'Truyện Kiều — Nguyễn Du', hint: 'Ở phía trên đầu ta' },
    { line: 'Dốc lên khúc khuỷu dốc thăm ___', answer: 'thẳm', source: 'Tây Tiến — Quang Dũng', hint: 'Rất sâu, hun hút' },
    { line: 'Sông Mã xa rồi Tây Tiến ___', answer: 'ơi', source: 'Tây Tiến — Quang Dũng', hint: 'Tiếng gọi' },
    { line: 'Sao anh không về chơi thôn ___', answer: 'Vĩ', source: 'Đây Thôn Vĩ Dạ — Hàn Mặc Tử', hint: 'Tên thôn ở Huế' },
    { line: 'Con sóng dưới lòng sâu, Con sóng trên mặt ___', answer: 'nước', source: 'Sóng — Xuân Quỳnh', hint: 'H₂O' },
    { line: 'Mình về mình có nhớ ta, ___ nhớ hoa cùng người', answer: 'Mười lăm năm ấy thiết tha mặn nồng. Mình về mình có nhớ không, Nhìn cây', source: 'Việt Bắc — Tố Hữu', hint: 'Nhìn + loại thực vật' },
    { line: 'Khi ta lớn lên Đất Nước đã có ___', answer: 'rồi', source: 'Đất Nước — Nguyễn Khoa Điềm', hint: 'Từ chỉ đã xong' },
    { line: 'Thương nhau tay nắm lấy ___', answer: 'bàn tay', source: 'Ca dao', hint: 'Bộ phận cơ thể' },
    { line: 'Trăng cứ tròn vành ___ kể chi người vô tình', answer: 'vạnh', source: 'Ánh Trăng — Nguyễn Duy', hint: 'Vần với "vành"' },
    { line: 'Bỗng nhận ra hương ___ Phả vào trong gió se', answer: 'ổi', source: 'Sang Thu — Hữu Thỉnh', hint: 'Một loại quả' },
    { line: 'Hồn tôi là một vườn hoa ___', answer: 'lá', source: 'Vội Vàng — Xuân Diệu', hint: 'Mọc trên cành cây' },
    { line: 'Mọc giữa dòng sông ___', answer: 'xanh', source: 'Mùa Xuân Nho Nhỏ — Thanh Hải', hint: 'Một màu sắc' },
    { line: 'Tôi muốn tắt nắng đi, Cho màu ___ nhạt mãi', answer: 'đừng', source: 'Vội Vàng — Xuân Diệu', hint: 'Từ phủ định, mong muốn' },
    { line: 'Chị em thơ thẩn ___ đoài tay', answer: 'dan', source: 'Truyện Kiều — Nguyễn Du', hint: 'Cầm tay nhau' },
    { line: 'Nhìn nắng hàng cau nắng mới ___', answer: 'lên', source: 'Đây Thôn Vĩ Dạ — Hàn Mặc Tử', hint: 'Hướng đi lên' },
    { line: 'Lớp lớp mây cao đùn núi ___', answer: 'bạc', source: 'Tràng Giang — Huy Cận', hint: 'Màu trắng sáng' },
    { line: 'Ta về mình có nhớ ta, Ta về ta nhớ ___ hoa cùng người', answer: 'những', source: 'Việt Bắc — Tố Hữu', hint: 'Từ chỉ số nhiều' },
    { line: 'Chỉ có thuyền mới hiểu, Biển ___ mênh mông nhường nào', answer: 'mênh mông', source: 'Sóng — Xuân Quỳnh', hint: 'Rộng lớn bao la' },
    { line: 'Đau đớn thay phận ___ bạc', answer: 'đàn bà', source: 'Truyện Kiều — Nguyễn Du', hint: 'Phái yếu' },
    { line: 'Có biết bao người con ___ đã ngã xuống', answer: 'gái', source: 'Đất Nước — Nguyễn Khoa Điềm', hint: 'Phái nữ' },
    { line: 'Mùa xuân ___ gọi mùa xuân', answer: 'nho nhỏ', source: 'Mùa Xuân Nho Nhỏ — Thanh Hải', hint: 'Bé xinh' },
    { line: 'Ngày ngày mặt trời đi qua trên ___', answer: 'lăng', source: 'Viếng Lăng Bác — Viễn Phương', hint: 'Nơi yên nghỉ' },
    { line: 'Con ở miền ___ ra thăm lăng Bác', answer: 'Nam', source: 'Viếng Lăng Bác — Viễn Phương', hint: 'Phương hướng' },
    { line: 'Bác nằm trong giấc ngủ bình ___', answer: 'yên', source: 'Viếng Lăng Bác — Viễn Phương', hint: 'Thanh thản' },
];

/** Ai Nhanh Hơn: thuật ngữ văn học bị xáo trộn chữ cái */
export interface WordScramble {
    scrambled: string;  // chữ cái đã xáo
    answer: string;     // đáp án gốc
    hint: string;       // gợi ý nghĩa
}

export const WORD_SCRAMBLES: WordScramble[] = [
    { scrambled: 'ẩn dụ', answer: 'ẩn dụ', hint: 'Gọi tên sự vật bằng tên sự vật khác có nét tương đồng' },
    { scrambled: 'áoh nv', answer: 'hoán vị', hint: 'Đảo trật tự thông thường của từ ngữ' },
    { scrambled: 'ón gịa', answer: 'nói giảm', hint: 'Nói tránh đi cho nhẹ nhàng hơn' },
    { scrambled: 'pnéh udt từ', answer: 'phép đối', hint: 'Đặt các vế tương xứng cạnh nhau' },
    { scrambled: 'ệlti ệk', answer: 'liệt kê', hint: 'Kể ra hàng loạt sự vật cùng loại' },
    { scrambled: 'hnâ aóh', answer: 'nhân hoá', hint: 'Gán tính chất con người cho vật' },
    { scrambled: 'so sáhn', answer: 'so sánh', hint: 'Đối chiếu hai sự vật có nét giống nhau' },
    { scrambled: 'óngi áuq', answer: 'nói quá', hint: 'Phóng đại quy mô, mức độ' },
    { scrambled: 'ệphi ẫul', answer: 'phép lặp', hint: 'Lặp lại từ ngữ hoặc cấu trúc' },
    { scrambled: 'uđệi ptừ', answer: 'điệp từ', hint: 'Lặp lại cùng một từ nhiều lần' },
    { scrambled: 'câu hỏi ut từ', answer: 'câu hỏi tu từ', hint: 'Hỏi nhưng không cần trả lời' },
    { scrambled: 'ntậh hậou', answer: 'nhận hậu', hint: 'Kết quả, hệ quả' },
    { scrambled: 'ihgn ậuln', answer: 'nghị luận', hint: 'Thể loại dùng lý lẽ và dẫn chứng' },
    { scrambled: 'ựt sự', answer: 'tự sự', hint: 'Kể lại sự việc, câu chuyện' },
    { scrambled: 'iểum ảt', answer: 'miêu tả', hint: 'Dùng ngôn ngữ tái hiện sự vật' },
    { scrambled: 'ểiub ảcm', answer: 'biểu cảm', hint: 'Bộc lộ cảm xúc, tình cảm' },
    { scrambled: 'ityuếh hnmi', answer: 'thuyết minh', hint: 'Giới thiệu, giải thích tri thức' },
    { scrambled: 'ếtih ơth', answer: 'thể thơ', hint: 'Hình thức tổ chức bài thơ' },
    { scrambled: 'lụtc ạbt', answer: 'lục bát', hint: 'Thể thơ 6-8 chữ truyền thống VN' },
    { scrambled: 'ưgđờn ậtlu', answer: 'đường luật', hint: 'Thể thơ 7 chữ theo niêm luật' },
    { scrambled: 'ựt do', answer: 'tự do', hint: 'Thể thơ không theo quy tắc cố định' },
    { scrambled: 'ếhc ợgii', answer: 'thế giới', hint: 'Toàn bộ không gian tồn tại' },
    { scrambled: 'yểbu ượtgn', answer: 'biểu tượng', hint: 'Hình ảnh mang ý nghĩa sâu xa' },
    { scrambled: 'đề àti', answer: 'đề tài', hint: 'Phạm vi hiện thực được phản ánh' },
    { scrambled: 'hủc ềđ', answer: 'chủ đề', hint: 'Vấn đề chính được đặt ra trong tác phẩm' },
];

/** Đúng hay Sai: mệnh đề kiến thức văn học */
export interface TrueFalseItem {
    statement: string;
    isTrue: boolean;
    explanation: string;
}

export const TRUE_FALSE_ITEMS: TrueFalseItem[] = [
    { statement: 'Truyện Kiều có tổng cộng 3254 câu thơ lục bát.', isTrue: true, explanation: 'Truyện Kiều của Nguyễn Du gồm 3254 câu thơ lục bát.' },
    { statement: 'Chí Phèo là tác phẩm của Ngô Tất Tố.', isTrue: false, explanation: 'Chí Phèo là tác phẩm của Nam Cao, không phải Ngô Tất Tố.' },
    { statement: 'Bài thơ "Tây Tiến" được sáng tác năm 1948.', isTrue: true, explanation: 'Quang Dũng sáng tác "Tây Tiến" năm 1948 tại Phù Lưu Chanh.' },
    { statement: '"Đây Thôn Vĩ Dạ" thuộc thể thơ 7 chữ.', isTrue: true, explanation: 'Bài thơ viết theo thể 7 chữ (thất ngôn).' },
    { statement: 'Nguyễn Tuân là tác giả của "Vợ Nhặt".', isTrue: false, explanation: '"Vợ Nhặt" là tác phẩm của Kim Lân.' },
    { statement: '"Sóng" của Xuân Quỳnh sáng tác tại biển Diêm Điền.', isTrue: true, explanation: 'Xuân Quỳnh viết "Sóng" năm 1967 trong chuyến đi thực tế ở biển Diêm Điền.' },
    { statement: 'Ẩn dụ và hoán dụ là cùng một biện pháp tu từ.', isTrue: false, explanation: 'Ẩn dụ dựa trên sự tương đồng, hoán dụ dựa trên sự tương cận (gần gũi).' },
    { statement: 'Thể thơ lục bát có câu 6 chữ rồi câu 8 chữ.', isTrue: true, explanation: 'Lục = 6, bát = 8. Cặp lục bát gồm câu 6 tiếng và câu 8 tiếng.' },
    { statement: 'Tố Hữu là nhà thơ cách mạng tiêu biểu nhất.', isTrue: true, explanation: 'Tố Hữu được xem là lá cờ đầu của thơ ca cách mạng Việt Nam.' },
    { statement: '"Người Lái Đò Sông Đà" là truyện ngắn.', isTrue: false, explanation: '"Người Lái Đò Sông Đà" là tùy bút của Nguyễn Tuân.' },
    { statement: 'Nghị luận xã hội (NLXH) trong đề thi THPT thường yêu cầu viết ~200 chữ.', isTrue: true, explanation: 'Phần NLXH chuẩn đề THPT yêu cầu viết đoạn văn khoảng 200 chữ, 2 điểm.' },
    { statement: 'Nhân vật Mị trong "Vợ Chồng A Phủ" quê ở Tây Bắc.', isTrue: true, explanation: 'Mị là cô gái dân tộc Mông ở vùng Tây Bắc.' },
    { statement: '"Chiếc Thuyền Ngoài Xa" kể về đời sống ngư dân vùng biển.', isTrue: true, explanation: 'Tác phẩm của Nguyễn Minh Châu phản ánh cuộc sống ngư dân với nhiều bi kịch ẩn giấu.' },
    { statement: 'Phương thức biểu đạt chính của thơ là tự sự.', isTrue: false, explanation: 'Phương thức biểu đạt chính của thơ là biểu cảm, không phải tự sự.' },
    { statement: 'Đề thi tốt nghiệp THPT 2025 dùng 100% ngữ liệu ngoài SGK.', isTrue: true, explanation: 'Từ 2025, đề Ngữ văn tốt nghiệp THPT sử dụng hoàn toàn ngữ liệu ngoài sách giáo khoa.' },
    { statement: '"Hạnh Phúc Của Một Tang Gia" trích từ tiểu thuyết "Số Đỏ".', isTrue: true, explanation: 'Đây là chương XV trong tiểu thuyết "Số Đỏ" của Vũ Trọng Phụng.' },
    { statement: '"Bình Ngô Đại Cáo" được viết bằng chữ Quốc ngữ.', isTrue: false, explanation: '"Bình Ngô Đại Cáo" được Nguyễn Trãi viết bằng chữ Hán (năm 1428).' },
    { statement: 'Thạch Lam thuộc nhóm Tự Lực Văn Đoàn.', isTrue: true, explanation: 'Thạch Lam là một trong các thành viên của nhóm Tự Lực Văn Đoàn.' },
    { statement: 'Câu hỏi tu từ là câu hỏi cần người nghe trả lời.', isTrue: false, explanation: 'Câu hỏi tu từ không nhằm mục đích hỏi thông tin mà để khẳng định, phủ định hoặc bộc lộ cảm xúc.' },
    { statement: '"Sang Thu" của Hữu Thỉnh mở đầu bằng hương ổi.', isTrue: true, explanation: '"Bỗng nhận ra hương ổi / Phả vào trong gió se" — mở đầu bài thơ.' },
    { statement: 'Nguyễn Du sống ở thế kỷ 19.', isTrue: true, explanation: 'Nguyễn Du (1765–1820) sống ở cuối thế kỷ 18, đầu thế kỷ 19.' },
    { statement: '"Chữ Người Tử Tù" lấy bối cảnh nhà tù thời phong kiến.', isTrue: true, explanation: 'Tác phẩm của Nguyễn Tuân lấy bối cảnh nhà tù, ca ngợi vẻ đẹp của Huấn Cao.' },
    { statement: 'Trong đề thi THPT, phần Đọc hiểu chiếm 6 điểm.', isTrue: false, explanation: 'Phần Đọc hiểu chiếm 4 điểm, phần Viết chiếm 6 điểm.' },
    { statement: '"Hai Đứa Trẻ" thuộc thể loại truyện ngắn trữ tình.', isTrue: true, explanation: '"Hai Đứa Trẻ" của Thạch Lam là truyện ngắn trữ tình tiêu biểu.' },
    { statement: 'Hồ Chí Minh viết "Nhật Ký Trong Tù" bằng tiếng Việt.', isTrue: false, explanation: '"Nhật Ký Trong Tù" được Hồ Chí Minh viết bằng chữ Hán.' },
    { statement: '"Viếng Lăng Bác" là bài thơ của Viễn Phương.', isTrue: true, explanation: 'Viễn Phương sáng tác "Viếng Lăng Bác" năm 1976.' },
    { statement: '"Rừng Xà Nu" lấy bối cảnh Tây Nguyên.', isTrue: true, explanation: 'Tác phẩm của Nguyễn Trung Thành lấy bối cảnh buôn làng Tây Nguyên trong kháng chiến chống Mỹ.' },
    { statement: 'Phép đối là đặt hai vế có cấu trúc tương tự cạnh nhau.', isTrue: true, explanation: 'Phép đối sử dụng các vế câu có cấu trúc tương xứng, ngữ nghĩa cân đối.' },
    { statement: 'Nam Cao tên thật là Trần Hữu Tri.', isTrue: true, explanation: 'Nam Cao (1915–1951), tên thật là Trần Hữu Tri, quê Hà Nam.' },
    { statement: '"Tràng Giang" của Huy Cận mang âm hưởng Đường thi.', isTrue: true, explanation: 'Bài thơ có ảnh hưởng rõ nét của thơ Đường, đặc biệt ở bốn câu cuối.' },
];

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Fisher-Yates shuffle — returns a new shuffled array */
export function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/** Scramble the characters of a Vietnamese string (preserving diacritics per char) */
export function scrambleWord(word: string): string {
    const chars = word.split('');
    let result = chars;
    // Keep shuffling until it's different from original
    let attempts = 0;
    do {
        result = shuffle(chars);
        attempts++;
    } while (result.join('') === word && attempts < 10);
    return result.join('');
}
