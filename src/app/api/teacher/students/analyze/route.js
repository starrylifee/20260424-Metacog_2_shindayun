import { NextResponse } from 'next/server';
import OpenAI from 'openai';

import { authenticateFirebaseRequest, RequestError } from '@/lib/serverAuth';
import { adminDb, serializeDoc } from '@/lib/serverDb';

let _openai;
function getOpenAI() {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY?.trim() });
  }
  return _openai;
}

export async function POST(request) {
  try {
    const teacher = await authenticateFirebaseRequest(request);
    const { studentName, analysisMode, startDate, endDate, periodLabel, subject } = await request.json();

    if (!studentName) {
      return NextResponse.json({ success: false, error: '학생 이름이 필요합니다.' }, { status: 400 });
    }

    // 과목 범위: 값이 있으면 해당 과목만, 없으면 전체 과목 통합
    const subjectFilter = subject && subject !== 'all' ? subject : null;

    // 교사의 전체 과제 조회 (과목 지정 시 해당 과목만)
    const assignmentsSnap = await adminDb
      .collection('assignments')
      .where('teacherId', '==', teacher.uid)
      .get();

    if (assignmentsSnap.empty) {
      return NextResponse.json({ success: false, error: '과제가 없습니다.' });
    }

    const assignmentMap = {};
    const assignmentIds = [];
    for (const doc of assignmentsSnap.docs) {
      const data = serializeDoc(doc);
      if (subjectFilter && data.subject !== subjectFilter) {
        continue;
      }
      assignmentMap[doc.id] = data;
      assignmentIds.push(doc.id);
    }

    if (assignmentIds.length === 0) {
      return NextResponse.json({
        success: false,
        error: subjectFilter ? `[${subjectFilter}] 과목의 과제가 없습니다.` : '과제가 없습니다.',
      });
    }

    // 학생의 모든 대화 조회
    const allConversations = [];
    for (let i = 0; i < assignmentIds.length; i += 30) {
      const batch = assignmentIds.slice(i, i + 30);
      const convSnap = await adminDb
        .collection('conversations')
        .where('assignmentId', 'in', batch)
        .get();

      for (const doc of convSnap.docs) {
        const data = serializeDoc(doc);
        const name = data.studentName || `${data.studentCode}번`;
        if (name === studentName) {
          allConversations.push(data);
        }
      }
    }

    // 날짜 기준 필터
    let filtered = allConversations;

    // 1. 대화 기록을 시간순으로 우선 정렬하여 첫 활동 시점 확인
    const sortedConvs = [...allConversations].sort((a, b) => {
      const aTime = a.startedAt ? new Date(a.startedAt).getTime() : 0;
      const bTime = b.startedAt ? new Date(b.startedAt).getTime() : 0;
      return aTime - bTime;
    });

    const firstConv = sortedConvs.find(c => c.startedAt);
    const firstConvDate = firstConv ? new Date(firstConv.startedAt) : null;

    if (analysisMode === 'relative-2w') {
      if (!firstConvDate) {
        return NextResponse.json({
          success: false,
          error: '대화 기록이 없어 초기 날짜를 측정할 수 없습니다.',
        });
      }
      const endDateObj = new Date(firstConvDate.getTime() + 14 * 24 * 60 * 60 * 1000);
      filtered = allConversations.filter((conv) => {
        const d = conv.startedAt ? new Date(conv.startedAt) : null;
        return d && d >= firstConvDate && d <= endDateObj;
      });
    } else if (analysisMode === 'relative-1m') {
      if (!firstConvDate) {
        return NextResponse.json({
          success: false,
          error: '대화 기록이 없어 초기 날짜를 측정할 수 없습니다.',
        });
      }
      const endDateObj = new Date(firstConvDate);
      endDateObj.setMonth(endDateObj.getMonth() + 1);
      filtered = allConversations.filter((conv) => {
        const d = conv.startedAt ? new Date(conv.startedAt) : null;
        return d && d >= firstConvDate && d <= endDateObj;
      });
    } else {
      // 일반 날짜(monthly, custom, all) 필터링
      if (startDate) {
        const start = new Date(startDate + 'T00:00:00');
        filtered = filtered.filter((conv) => {
          const d = conv.startedAt ? new Date(conv.startedAt) : null;
          return d && d >= start;
        });
      }
      if (endDate) {
        const end = new Date(endDate + 'T23:59:59');
        filtered = filtered.filter((conv) => {
          const d = conv.startedAt ? new Date(conv.startedAt) : null;
          return d && d <= end;
        });
      }
    }

    // 시간순 정렬
    filtered.sort((a, b) => {
      const aTime = a.startedAt ? new Date(a.startedAt).getTime() : 0;
      const bTime = b.startedAt ? new Date(b.startedAt).getTime() : 0;
      return aTime - bTime;
    });

    if (filtered.length === 0) {
      return NextResponse.json({
        success: false,
        error: periodLabel
          ? `[${periodLabel}] 기간 내의 대화 기록이 없습니다.`
          : '이 학생의 대화 기록이 없습니다.',
      });
    }

    // 대화 데이터 요약 구성
    const conversationSummaries = filtered.map((conv, index) => {
      const assignment = assignmentMap[conv.assignmentId];
      const messages = Array.isArray(conv.messages) ? conv.messages : [];
      const studentMessages = messages.filter((m) => m.role === 'student');
      const maxScore = Array.isArray(assignment?.scoreOptions)
        ? Math.max(...assignment.scoreOptions)
        : null;

      const startedAt = conv.startedAt
        ? new Date(conv.startedAt).toLocaleDateString('ko-KR')
        : '날짜 없음';

      return [
        `--- ${index + 1}일차 (${startedAt}) ---`,
        `과제: ${assignment?.title || '(알 수 없음)'}`,
        `과목: ${assignment?.subject || '?'} · ${assignment?.grade || ''}`,
        `점수: ${Number.isFinite(conv.score) ? `${conv.score}${maxScore ? `/${maxScore}` : ''}점` : '미완료'}`,
        `상태: ${conv.status === 'completed' ? '완료' : '진행 중'}`,
        conv.feedback ? `AI 피드백: ${conv.feedback}` : '',
        conv.higherScoreTip ? `개선 제안: ${conv.higherScoreTip}` : '',
        `학생 답변 (${studentMessages.length}개):`,
        ...studentMessages.map((m, j) => `  [답변 ${j + 1}] ${m.content}`),
      ].filter(Boolean).join('\n');
    });

    const scoreSummary = filtered
      .filter((c) => c.status === 'completed' && Number.isFinite(c.score))
      .map((c) => {
        const a = assignmentMap[c.assignmentId];
        const maxScore = Array.isArray(a?.scoreOptions) ? Math.max(...a.scoreOptions) : null;
        const date = c.startedAt ? new Date(c.startedAt).toLocaleDateString('ko-KR') : '?';
        return `${date}: ${c.score}${maxScore ? `/${maxScore}` : ''}점 (${a?.title || '?'})`;
      })
      .join('\n');

    const cutoffLabel = periodLabel || '전체 기간';
    const subjectLabel = subjectFilter || '전체 과목';

    const systemPrompt = `당신은 초등학교 교사를 위한 학생 분석 AI 어시스턴트입니다.
아래에 한 학생의 여러 과제에 걸친 대화 기록과 점수가 제공됩니다.

교사가 이해하기 쉽도록 다음 항목을 분석해 주세요:

1. 전체 요약: 참여 과제 수, 완료율, 평균 점수 등 기본 통계
2. 점수 변화 분석: 시간에 따른 점수 변화 추이와 패턴
3. 답변 품질 분석: 학생의 설명 방식, 깊이, 구체성의 변화
4. 강점: 학생이 잘하는 점
5. 개선 필요 영역: 부족한 부분과 구체적인 개선 방향
6. 교사에게 드리는 조언: 이 학생을 위한 맞춤형 교수 전략

분석 기준 시점: ${cutoffLabel}
분석 과목 범위: ${subjectLabel}

★ 중요 작성 지침 (마크다운 절대 사용 금지):
- 출력 시 어떠한 마크다운 특수 기호(예: #, ##, ###, **, -, *, _, \` 등)도 사용하지 마세요. 볼드 처리(**글자**)나 글머리 기호(-, *)도 절대 사용하지 마세요.
- 교사가 화면에서 읽기 편리하도록, 줄바꿈(엔터키)과 띄어쓰기만을 활용하여 친근하고 정중한 한글 문장으로 작성해 주세요.
- 문단을 구분할 때는 위의 1. 전체 요약, 2. 점수 변화 분석 과 같이 번호와 함께 줄바꿈을 두 번(double line break)하여 깔끔한 일반 텍스트 형태로 흘러가듯 작성해 주세요.
- 초등학생 수준에 맞게 설명하되, 보고서는 교사를 위한 것입니다.
- 구체적인 근거(어떤 과제에서 어떤 답변)를 들어 분석해 주세요.
- 긍정적인 변화가 있으면 반드시 언급해 주세요.
- 한국어로 작성해 주세요.`;

    const userPrompt = `학생: ${studentName}
분석 과목: ${subjectLabel}
분석 기준: ${cutoffLabel} 기록

=== 점수 추이 ===
${scoreSummary || '완료된 과제 없음'}

=== 과제별 상세 기록 ===
${conversationSummaries.join('\n\n')}`;

    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const report = completion.choices?.[0]?.message?.content?.trim() || '분석 결과를 생성하지 못했습니다.';

    // Firestore에 리포트 저장 (과목·시작·끝 시점을 식별값에 포함하여 다중 시점/과목의 리포트 공존 보장)
    const startStr = startDate || 'all';
    const endStr = endDate || 'all';
    const subjectStr = (subjectFilter || 'all').replace(/[/\\]/g, '_');
    const reportId = `${teacher.uid}_${studentName}_${subjectStr}_${startStr}_${endStr}`;
    const reportData = {
      teacherId: teacher.uid,
      studentName,
      analysisMode: analysisMode || 'all',
      subject: subjectFilter || null,
      subjectLabel,
      startDate: startDate || null,
      endDate: endDate || null,
      periodLabel: cutoffLabel,
      report,
      conversationCount: filtered.length,
      completedCount: filtered.filter((c) => c.status === 'completed').length,
      avgScore: (() => {
        const completed = filtered.filter((c) => c.status === 'completed' && Number.isFinite(c.score));
        if (completed.length === 0) return null;
        return Math.round((completed.reduce((sum, c) => sum + c.score, 0) / completed.length) * 10) / 10;
      })(),
      generatedAt: new Date().toISOString(),
    };

    await adminDb.collection('studentReports').doc(reportId).set(reportData);

    return NextResponse.json({
      success: true,
      report,
      reportId,
      studentName,
      conversationCount: filtered.length,
      periodLabel: cutoffLabel,
      subjectLabel,
    });
  } catch (error) {
    if (error instanceof RequestError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }

    console.error('Student analyze API error:', error);
    return NextResponse.json({ success: false, error: 'AI 분석 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
