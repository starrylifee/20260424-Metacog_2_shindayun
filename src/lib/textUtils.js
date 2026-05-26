export function stripMarkdown(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/^#{1,6}\s+/gm, '')        // ### 헤딩 제거
    .replace(/\*\*(.+?)\*\*/g, '$1')    // **굵게** 제거
    .replace(/__(.+?)__/g, '$1')         // __굵게__ 제거
    .replace(/\*(.+?)\*/g, '$1')         // *기울임* 제거
    .replace(/_(.+?)_/g, '$1')           // _기울임_ 제거
    .replace(/`(.+?)`/g, '$1')           // `코드` 제거
    .replace(/^>\s+/gm, '')              // > 인용 제거
    .replace(/^[\-\*]\s+/gm, '')         // - * 목록 기호 제거
    .replace(/\n{3,}/g, '\n\n')          // 3줄 이상 공백 → 2줄
    .trim();
}
