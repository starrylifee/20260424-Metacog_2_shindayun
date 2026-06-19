// 학생 대시보드 / 포트폴리오에서 공유하는 순수 유틸들.
// (기존 portfolio/page.js, class/[code]/page.js 에서 추출)

// 과목 표시 순서 (목록에 없는 과목은 뒤에 가나다순)
export const SUBJECT_ORDER = ['국어', '수학', '사회', '과학', '영어', '융합'];

export function subjectRank(subject) {
  const idx = SUBJECT_ORDER.indexOf(subject);
  return idx === -1 ? SUBJECT_ORDER.length : idx;
}

// 활성 과제 목록을 과목별로 묶어 정렬한다. → [ [subject, items[]], ... ]
export function groupBySubject(assignments) {
  const groups = {};
  for (const a of assignments) {
    const subject = a.subject?.trim() || '기타';
    if (!groups[subject]) groups[subject] = [];
    groups[subject].push(a);
  }
  return Object.entries(groups).sort(([a], [b]) => {
    const r = subjectRank(a) - subjectRank(b);
    return r !== 0 ? r : a.localeCompare(b, 'ko');
  });
}

// 대화에서 학생 발화만 모아 한 덩어리 텍스트로
export function studentAnswerText(conv) {
  const messages = Array.isArray(conv?.messages) ? conv.messages : [];
  return messages
    .filter((m) => m.role === 'student')
    .map((m) => m.content)
    .join('\n\n')
    .trim();
}

export function parseGrade(gradeStr) {
  if (!gradeStr) return { grade: '', semester: '' };
  const m = gradeStr.match(/(\d+)학년\s*(\d+)학기/);
  return m ? { grade: m[1], semester: m[2] } : { grade: '', semester: '' };
}

// conversations → subject → grade → semester → unit → lesson → conversation 트리
export function buildTree(conversations) {
  const tree = {};

  for (const conv of conversations) {
    const { assignment } = conv;
    if (!assignment) continue;

    const subject = assignment.subject || '수학';
    const { grade, semester } = parseGrade(assignment.grade);
    const [unitName, lessonTitle] = assignment.standards || [];
    if (!grade || !semester || !unitName || !lessonTitle) continue;

    if (!tree[subject]) tree[subject] = {};
    if (!tree[subject][grade]) tree[subject][grade] = {};
    if (!tree[subject][grade][semester]) tree[subject][grade][semester] = {};
    if (!tree[subject][grade][semester][unitName]) tree[subject][grade][semester][unitName] = {};
    tree[subject][grade][semester][unitName][lessonTitle] = conv;
  }

  return tree;
}

export function getMaxScore(scoreOptions) {
  if (!Array.isArray(scoreOptions) || scoreOptions.length === 0) return null;
  return Math.max(...scoreOptions);
}
