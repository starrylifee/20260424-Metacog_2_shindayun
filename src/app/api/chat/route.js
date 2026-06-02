import { NextResponse } from 'next/server';
import OpenAI from 'openai';

import { generateAIExampleAnswer } from '@/lib/aiExampleAnswer';
import { CHAT_SESSION_COOKIE, hashChatSessionToken } from '@/lib/chatSession';
import { getUtf8ByteLength, normalizeAssignmentConstraints } from '@/lib/chatConstraints';
import {
  formatScoreOptions,
  getAssignmentMaxScore,
  getAssignmentScoreOptions,
  getClosestAllowedScore,
  getNextHigherScore,
  getScoringStyleLabel,
  normalizeScoringStyle,
} from '@/lib/scoreConfig';
import {
  GROWND_BASE_URL,
  extractGrowndErrorDetail,
  parseGrowndResponse,
} from '@/lib/grownd';
import { FieldValue, adminDb } from '@/lib/serverDb';

let _openai = null;
function getOpenAI() {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY?.trim() });
  }
  return _openai;
}

const MODEL_NAME = 'gpt-4o-mini';

function getLowestAllowedScore(scoreOptions) {
  return Array.isArray(scoreOptions) && scoreOptions.length > 0 ? scoreOptions[0] : 0;
}

function buildScoringStyleGuidance(scoreOptions, scoringStyle) {
  const lowestScore = getLowestAllowedScore(scoreOptions);
  const nextScore = scoreOptions[1] ?? lowestScore;
  const middleScore = scoreOptions[Math.max(1, Math.floor((scoreOptions.length - 1) / 2))] ?? nextScore;
  const maxScore = scoreOptions[scoreOptions.length - 1] ?? lowestScore;

  if (scoringStyle === 'strict') {
    return `- 기본적으로 보수적으로 채점해.
- 핵심 개념이 조금 보여도 이유나 과정이 빠지면 ${nextScore}점 이하로 제한해.
- ${middleScore}점 이상은 오늘 배운 핵심과 왜 그런지가 분명히 드러날 때만 줘.
- 최고점 ${maxScore}점은 정확성, 구체성, 이유 설명, 예시나 근거가 모두 충분할 때만 줘.`;
  }

  if (scoringStyle === 'generous') {
    return `- 관련 있는 답변에는 약간 넓게 점수를 열어 둘 수 있어.
- 그래도 핵심이 거의 없거나 부정확하면 ${lowestScore}점 또는 ${nextScore}점이야.
- ${middleScore}점 이상은 오늘 배운 핵심을 대체로 맞게 설명했을 때만 줘.
- 최고점 ${maxScore}점은 후하게 채점하더라도 정확하고 구체적인 설명일 때만 줘.`;
  }

  return `- 기본적으로 균형 있게 채점해.
- 핵심이 조금 보여도 설명이 얕거나 이유가 없으면 ${nextScore}점 이하를 우선 고려해.
- ${middleScore}점 이상은 핵심 개념과 이유, 과정, 예시 중 적어도 일부가 분명해야 줘.
- 최고점 ${maxScore}점은 정확하고 구체적이며 자기 말 설명이 충분할 때만 줘.`;
}

function buildSystemPrompt(assignment, options = {}) {
  const { shouldForceFinish = false, allowFinish = true, maxTurns = 3, aiExampleAnswer = null } = options;
  const keywords = (assignment.keywords || []).join(', ');
  const scoreOptions = getAssignmentScoreOptions(assignment);
  const maxScore = getAssignmentMaxScore(assignment);
  const scoringStyle = normalizeScoringStyle(assignment.scoringStyle);
  const lowestScore = getLowestAllowedScore(scoreOptions);

  return `너는 "오늘배움봇"이라는 이름의 친근한 학습 도우미야.
학생이 오늘 배운 내용을 자기 말로 설명하면, 짧게 되묻고 마지막에는 점수와 피드백을 알려 줘.

=== 학습 주제 ===
${assignment.title}

=== 오늘 수업 범위 ===
${assignment.learningObjective || '(미설정)'}

=== 수업 자료 ===
${assignment.content}

${keywords ? `=== 꼭 챙길 표현 ===\n${keywords}\n\n` : ''}${aiExampleAnswer ? `=== 모범 답안 참고 ===\n아래는 만점 수준의 이상적인 답변 예시야. 학생이 이런 요소들을 자기 말로 설명할 수 있도록 유도해줘. 이 내용을 직접 말해주지 마.\n${aiExampleAnswer}\n\n` : ''}=== 질문 규칙 ===
1. 반드시 오늘 수업 범위 안에서만 질문해.
2. 다음 차시나 단원 전체 내용으로 확장하지 마.
3. 학생에게 교과서 표현을 그대로 외우게 하지 말고, 학생 말로 설명하게 도와.
4. 한 번에 질문을 너무 많이 하지 말고 꼭 필요한 것만 1~2개 물어봐.
5. 학생 설명이 충분하면 더 캐묻지 말고 바로 마무리해.

=== 채점 성향 ===
- 현재 채점 성향은 "${getScoringStyleLabel(scoringStyle)}"이야.
${buildScoringStyleGuidance(scoreOptions, scoringStyle)}

=== 점수 체계 ===
- 사용할 수 있는 점수는 ${formatScoreOptions(scoreOptions)}점뿐이야. 반드시 이 중 하나만 사용해.
- 최고점 ${maxScore}점은 오늘 배운 핵심을 정확하고 구체적으로, 자기 말로 설명한 경우야.
- 낮은 점수일수록 핵심이 빠졌거나, 이유·과정·예시가 부족하거나, 설명이 부정확한 경우야.
- 점수 단계가 여러 개면 정확성, 구체성, 이유 설명, 예시 제시 정도에 따라 자연스럽게 나눠서 사용해.
- 채점 성향은 관련 있는 학습 답변에만 적용해.
- 장난, 말장난, 엉뚱한 농담, 무의미한 반복, 질문 회피, 오늘 수업과 무관한 답, "몰라요"만 반복하는 답은 반드시 ${lowestScore}점이야.
- 아주 짧더라도 오늘 수업의 핵심 개념이 실제로 들어 있을 때만 최저점보다 높은 점수를 고려해.

=== 마무리 형식 ===
대화를 마무리할 때는 학생에게 자연스럽게 한두 문장으로 말한 뒤, 마지막 줄들에 아래 형식을 정확히 넣어.
[SCORE:X]
[FEEDBACK:현재 점수를 준 이유를 1~2문장으로 설명]
[HIGHER_SCORE_TIP:더 높은 다음 점수를 받으려면 어떤 말이나 이유나 예시를 더 말했어야 했는지 1~2문장으로 구체적으로 설명. 이미 최고점이면 '이미 최고 점수야.'라고 써.]

=== 중요 ===
- 학생 발화 기회는 최대 ${maxTurns}번이야.
- ${maxTurns}번째 학생 답변 뒤에는 반드시 마무리해야 해.
- HIGHER_SCORE_TIP에는 막연한 조언 말고, 학생이 실제로 어떤 내용을 더 말했어야 하는지 써.
- HIGHER_SCORE_TIP도 오늘 수업 범위를 벗어나면 안 돼.
- 학생이 "모르겠어"처럼 짧게 답해도 남은 내용으로 평가하고 마무리해.
- ${shouldForceFinish ? '이번 응답은 마지막 응답이야. 질문하지 말고 바로 마무리해.' : allowFinish ? '학생이 충분히 설명했거나 턴이 거의 다 찼다면 더 캐묻지 말고 종료해.' : `아직 학생 답변이 충분히 쌓이지 않았어. [SCORE], [FEEDBACK], [HIGHER_SCORE_TIP] 태그를 절대 사용하지 말고, 핵심이 부족한 부분을 한두 가지만 짧게 더 물어봐.`}`;
}

function extractTaggedValue(text, tagName) {
  const pattern = new RegExp(`\\[${tagName}:(.*?)\\]`, 's');
  const match = text.match(pattern);
  return match ? match[1].trim() : '';
}

function stripCompletionTags(text) {
  return text
    .replace(/\[SCORE:.*?\]/s, '')
    .replace(/\[FEEDBACK:.*?\]/s, '')
    .replace(/\[HIGHER_SCORE_TIP:.*?\]/s, '')
    .replace(/\[NEXT_STEP_TIP:.*?\]/s, '')
    .trim();
}

function extractCompletionData(content, assignment) {
  const replyText = typeof content === 'string' ? content.trim() : '';
  const scoreOptions = getAssignmentScoreOptions(assignment);
  const scoreMatch = replyText.match(/\[SCORE:(-?\d+)\]/);

  if (!scoreMatch) {
    return {
      finished: false,
      score: null,
      feedback: null,
      higherScoreTip: null,
      reply: replyText,
    };
  }

  const parsedScore = Number.parseInt(scoreMatch[1], 10);
  const score = getClosestAllowedScore(scoreOptions, parsedScore) ?? getLowestAllowedScore(scoreOptions);

  return {
    finished: true,
    score,
    feedback: extractTaggedValue(replyText, 'FEEDBACK'),
    higherScoreTip: extractTaggedValue(replyText, 'HIGHER_SCORE_TIP'),
    nextStepTip: extractTaggedValue(replyText, 'NEXT_STEP_TIP'),
    reply: stripCompletionTags(replyText),
  };
}

function parseJsonResponse(content) {
  if (typeof content !== 'string') {
    return null;
  }

  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }

  const candidates = [trimmed];
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    candidates.unshift(fencedMatch[1].trim());
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (_) {
      // keep trying
    }
  }

  return null;
}

function buildConversationTranscript(conversationMessages) {
  return conversationMessages
    .map((message, index) => {
      const speaker = message.role === 'user' ? '학생' : '봇';
      return `${index + 1}. ${speaker}: ${String(message.content ?? '').trim()}`;
    })
    .join('\n');
}

function normalizeStructuredFinalReply(payload, assignment) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const scoreOptions = getAssignmentScoreOptions(assignment);
  const score = getClosestAllowedScore(scoreOptions, Number(payload.score));
  const reply = typeof payload.reply === 'string' ? payload.reply.trim() : '';
  const feedback = typeof payload.feedback === 'string' ? payload.feedback.trim() : '';

  if (!Number.isFinite(score) || !reply || !feedback) {
    return null;
  }

  return {
    finished: true,
    score,
    feedback,
    reply,
    higherScoreTip: typeof payload.higherScoreTip === 'string' ? payload.higherScoreTip.trim() : '',
    nextStepTip: '',
  };
}

async function createChatReply(messages, options = {}) {
  const completion = await getOpenAI().chat.completions.create({
    model: MODEL_NAME,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 650,
    ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
  });

  return completion.choices[0]?.message?.content?.trim() || '';
}

function buildForcedFinalEvaluationPrompt(assignment) {
  const scoreOptions = getAssignmentScoreOptions(assignment);
  const maxScore = getAssignmentMaxScore(assignment);

  return `너는 학습 대화의 최종 채점기다.
반드시 JSON 객체만 출력하고, 마크다운이나 코드블록은 쓰지 마.

채점 기준:
- 허용 점수는 ${formatScoreOptions(scoreOptions)}점뿐이다.
- 학생이 오늘 배운 개념을 자신의 말로 얼마나 정확하고 구체적으로 설명했는지 평가한다.
- reply는 학생에게 보내는 2~4문장 마무리 말이다. 질문형으로 끝내지 마.
- feedback는 왜 그 점수를 주었는지 1~2문장으로 설명한다.
- higherScoreTip는 다음 점수를 받으려면 무엇을 더 말했어야 하는지 구체적으로 적는다.
- 최고 점수는 ${maxScore}점이다.

반드시 아래 형태의 JSON만 출력해.
{"reply":"string","score":0,"feedback":"string","higherScoreTip":"string"}`;
}

async function createForcedFinalReply(assignment, conversationMessages, aiExampleAnswer = null) {
  const { maxTurns } = normalizeAssignmentConstraints(assignment);

  const attempts = [
    {
      temperature: 0.3,
      maxTokens: 420,
      systemPrompt: buildSystemPrompt(assignment, { shouldForceFinish: true, maxTurns, aiExampleAnswer }),
    },
    {
      temperature: 0,
      maxTokens: 420,
      systemPrompt: `${buildSystemPrompt(assignment, { shouldForceFinish: true, maxTurns, aiExampleAnswer })}

=== 출력 형식 재강조 ===
- 이번 응답은 마지막 응답이야.
- 추가 질문은 하지 마.
- 2~4문장으로 짧게 마무리한 뒤 아래 태그를 반드시 포함해.
[SCORE:X]
[FEEDBACK:현재 점수를 준 이유]
[HIGHER_SCORE_TIP:더 높은 점수를 받으려면 무엇을 더 말했어야 하는지]`,
    },
  ];

  for (const attempt of attempts) {
    const reply = await createChatReply(
      [{ role: 'system', content: attempt.systemPrompt }, ...conversationMessages],
      { temperature: attempt.temperature, maxTokens: attempt.maxTokens }
    );
    const parsed = extractCompletionData(reply, assignment);

    if (parsed.finished) {
      return parsed;
    }
  }

  return null;
}

async function createStructuredForcedFinalReply(assignment, conversationMessages) {
  const transcript = buildConversationTranscript(conversationMessages);

  const attempts = [
    { temperature: 0, maxTokens: 360 },
    { temperature: 0.2, maxTokens: 420 },
  ];

  for (const attempt of attempts) {
    const reply = await createChatReply(
      [
        { role: 'system', content: buildForcedFinalEvaluationPrompt(assignment) },
        {
          role: 'user',
          content: `아래 대화는 이미 마지막 학생 답변까지 끝난 상태야. 추가 질문 없이 이 대화 자체만 보고 최종 평가해.\n\n${transcript}`,
        },
      ],
      {
        temperature: attempt.temperature,
        maxTokens: attempt.maxTokens,
        responseFormat: { type: 'json_object' },
      }
    );

    const parsed = normalizeStructuredFinalReply(parseJsonResponse(reply), assignment);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function buildFallbackCompletion(assignment, partialReply = '') {
  const scoreOptions = getAssignmentScoreOptions(assignment);
  const fallbackScore = getLowestAllowedScore(scoreOptions);
  const nextHigherScore = getNextHigherScore(scoreOptions, fallbackScore);
  const fallbackTip = nextHigherScore === null
    ? '이미 최고 점수야.'
    : `${nextHigherScore}점을 받으려면 장난이나 짧은 답으로 끝내지 말고, 오늘 배운 핵심이 무엇인지와 왜 그런지 또는 어떤 예시가 있는지 함께 설명해 줘.`;

  return {
    finished: true,
    score: fallbackScore,
    feedback: '오늘 수업과 연결된 핵심 설명이 충분히 드러나지 않아 낮은 점수로 마무리했어.',
    higherScoreTip: fallbackTip,
    nextStepTip: '',
    reply: partialReply || '여기까지 설명한 내용을 바탕으로 이번 대화는 마무리할게.',
  };
}

async function performSecondaryScoreAdjustment(assignment, conversationMessages, originalScore) {
  const studentMessages = conversationMessages
    .filter((m) => m.role === 'user')
    .map((m, i) => `학생 답변 ${i + 1}: ${String(m.content ?? '').trim()}`)
    .join('\n');

  if (!studentMessages) return { adjustment: 0, reason: '' };

  try {
    const reply = await createChatReply(
      [
        {
          role: 'system',
          content: `너는 학습 대화 품질 보정기다.
학생의 대화 전체를 보고, 현재 1차 점수(${originalScore}점)가 적절한지 ±1점 범위에서 보정해라.

보정 기준:
- +1: 대화를 통해 학생 설명이 점진적으로 향상됐거나, 핵심 개념을 점점 더 명확하게 설명했다.
- -1: 대화 내내 핵심을 회피하거나, 마지막 답변도 처음과 같이 얕고 부정확하다.
- 0: 변화가 없거나 이미 최고/최저 점수라 보정이 불필요하다.

반드시 JSON만 출력해: {"adjustment": 0, "reason": "보정 이유 1문장"}`,
        },
        { role: 'user', content: studentMessages },
      ],
      { temperature: 0, maxTokens: 120, responseFormat: { type: 'json_object' } }
    );

    const parsed = parseJsonResponse(reply);
    if (!parsed || !Number.isFinite(Number(parsed.adjustment))) return { adjustment: 0, reason: '' };

    const adjustment = Math.max(-1, Math.min(1, Math.round(Number(parsed.adjustment))));
    const reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : '';
    return { adjustment, reason };
  } catch {
    return { adjustment: 0, reason: '' };
  }
}

async function sendGrowndPoints(assignment, conversation, score) {
  if (!score || score <= 0) return;

  try {
    const teacherSnap = await adminDb.collection('teachers').doc(assignment.teacherId).get();
    if (!teacherSnap.exists) return;

    const { growndApiKey, growndClassId } = teacherSnap.data() || {};
    if (!growndApiKey || !growndClassId || !conversation.studentCode) return;

    const growndAbort = new AbortController();
    const timeout = setTimeout(() => growndAbort.abort(), 6000);

    let growndResponse;
    try {
      growndResponse = await fetch(
        `${GROWND_BASE_URL}/api/v1/classes/${growndClassId}/students/${conversation.studentCode}/points`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': growndApiKey,
          },
          body: JSON.stringify({
            type: 'reward',
            points: score,
            description: `오늘배움봇 과제 완료 (${score}점)`,
            source: 'OneumBaeumBot',
          }),
          signal: growndAbort.signal,
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    const growndResult = await parseGrowndResponse(growndResponse);

    if (growndResponse.ok) {
      return { success: true };
    } else {
      const errMsg = extractGrowndErrorDetail(growndResponse, growndResult);
      console.error('[Grownd] auto-send failed:', errMsg);
      return { success: false, error: errMsg };
    }
  } catch (err) {
    console.error('[Grownd] auto-send error:', err?.message || err);
    return { success: false, error: err?.message };
  }
}

export async function POST(request) {
  try {
    const { conversationId, assignmentId, content } = await request.json();
    const userMessage = typeof content === 'string' ? content.trim() : '';
    const sessionToken = request.cookies.get(CHAT_SESSION_COOKIE)?.value;

    if (!conversationId || !assignmentId || !userMessage || !sessionToken) {
      return NextResponse.json(
        { success: false, error: '세션이 유효하지 않습니다. 처음부터 다시 시작해 주세요.' },
        { status: 400 }
      );
    }

    const assignmentRef = adminDb.collection('assignments').doc(assignmentId);
    const conversationRef = adminDb.collection('conversations').doc(conversationId);
    const [assignmentSnap, conversationSnap] = await Promise.all([
      assignmentRef.get(),
      conversationRef.get(),
    ]);

    if (!assignmentSnap.exists) {
      return NextResponse.json({ success: false, error: '과제를 찾을 수 없습니다.' }, { status: 404 });
    }

    if (!conversationSnap.exists) {
      return NextResponse.json({ success: false, error: '대화 기록을 찾을 수 없습니다.' }, { status: 404 });
    }

    const assignment = assignmentSnap.data();
    const conversation = conversationSnap.data();

    // AI 모범 답안: 캐시에 있으면 사용, 없으면 백그라운드에서 생성·캐싱
    let aiExampleAnswer = assignment.aiExampleAnswer || null;
    if (!aiExampleAnswer) {
      (async () => {
        const generated = await generateAIExampleAnswer(assignment);
        if (generated) await assignmentRef.update({ aiExampleAnswer: generated });
      })().catch(console.error);
    }

    if (conversation.assignmentId !== assignmentId || conversation.status === 'completed') {
      return NextResponse.json(
        { success: false, error: '이 대화는 더 이상 진행할 수 없습니다.' },
        { status: 409 }
      );
    }

    if (
      !conversation.sessionTokenHash ||
      conversation.sessionTokenHash !== hashChatSessionToken(sessionToken)
    ) {
      return NextResponse.json(
        { success: false, error: '세션이 만료되었습니다. 처음부터 다시 시작해 주세요.' },
        { status: 401 }
      );
    }

    const existingMessages = Array.isArray(conversation.messages) ? conversation.messages : [];
    const studentTurnCount =
      existingMessages.filter((message) => message.role === 'student').length + 1;
    const chatConstraints = normalizeAssignmentConstraints(assignment);
    const effectiveMaxTurns = chatConstraints.maxTurns;
    const minTurns = chatConstraints.minTurns;
    const userMessageBytes = getUtf8ByteLength(userMessage);

    if (userMessageBytes < chatConstraints.minStudentMessageBytes) {
      return NextResponse.json(
        {
          success: false,
          error: `답변이 너무 짧아요. 최소 ${chatConstraints.minStudentMessageBytes}B 이상으로 적어 주세요.`,
          messageBytes: userMessageBytes,
          minStudentMessageBytes: chatConstraints.minStudentMessageBytes,
          maxStudentMessageBytes: chatConstraints.maxStudentMessageBytes,
        },
        { status: 400 }
      );
    }

    if (userMessageBytes > chatConstraints.maxStudentMessageBytes) {
      return NextResponse.json(
        {
          success: false,
          error: `답변이 너무 길어요. 최대 ${chatConstraints.maxStudentMessageBytes}B 안으로 적어 주세요.`,
          messageBytes: userMessageBytes,
          minStudentMessageBytes: chatConstraints.minStudentMessageBytes,
          maxStudentMessageBytes: chatConstraints.maxStudentMessageBytes,
        },
        { status: 400 }
      );
    }

    const shouldForceFinish = studentTurnCount >= effectiveMaxTurns;
    const allowFinish = studentTurnCount >= minTurns;

    const conversationMessages = [
      ...existingMessages.map((message) => ({
        role: message.role === 'unicorn' ? 'assistant' : 'user',
        content: message.content,
      })),
      { role: 'user', content: userMessage },
    ];

    const systemPrompt = buildSystemPrompt(assignment, {
      shouldForceFinish,
      allowFinish,
      maxTurns: effectiveMaxTurns,
      aiExampleAnswer,
    });

    let parsedReply = extractCompletionData(
      await createChatReply(
        [{ role: 'system', content: systemPrompt }, ...conversationMessages],
        { temperature: shouldForceFinish ? 0.35 : 0.7, maxTokens: 650 }
      ),
      assignment
    );

    if (parsedReply.finished && !allowFinish) {
      parsedReply = {
        finished: false,
        score: null,
        feedback: null,
        higherScoreTip: null,
        reply: parsedReply.reply || '조금 더 설명해 줄 수 있어? 어떤 부분이 특히 중요했는지 알려줘.',
      };
    }

    // 만점 미만 조기 종료 방지: 남은 턴이 있는데 만점이 아니면 추가 질문으로 전환
    if (parsedReply.finished && allowFinish && !shouldForceFinish) {
      const maxScoreVal = getAssignmentMaxScore(assignment);
      if (Number.isFinite(parsedReply.score) && parsedReply.score < maxScoreVal) {
        const followUpPrompt = buildSystemPrompt(assignment, {
          shouldForceFinish: false,
          allowFinish: false,
          maxTurns: effectiveMaxTurns,
          aiExampleAnswer,
        });
        const followUpText = await createChatReply(
          [{ role: 'system', content: followUpPrompt }, ...conversationMessages],
          { temperature: 0.7, maxTokens: 300 }
        );
        const followUpParsed = extractCompletionData(followUpText, assignment);
        parsedReply = {
          finished: false,
          score: null,
          feedback: null,
          higherScoreTip: null,
          reply: followUpParsed.reply || '조금 더 설명해 줄 수 있어? 구체적인 예시나 이유를 더 말해 줘.',
        };
      }
    }

    if (shouldForceFinish && !parsedReply.finished) {
      const forcedFinalReply =
        await createStructuredForcedFinalReply(assignment, conversationMessages) ||
        await createForcedFinalReply(assignment, conversationMessages, aiExampleAnswer);
      if (forcedFinalReply) {
        parsedReply = forcedFinalReply;
      }
    }

    if (shouldForceFinish && !parsedReply.finished) {
      console.warn('Forced finalization fell back to default completion.', { assignmentId, conversationId });
      parsedReply = buildFallbackCompletion(assignment, parsedReply.reply);
    }

    const { reply, finished, feedback, higherScoreTip, nextStepTip } = parsedReply;
    let { score } = parsedReply;
    const safeFeedback = typeof feedback === 'string' ? feedback : '';
    const safeHigherScoreTip = typeof higherScoreTip === 'string' ? higherScoreTip : '';
    const safeNextStepTip = typeof nextStepTip === 'string' ? nextStepTip : '';

    let originalScore = score;
    let scoreAdjustmentReason = '';
    if (finished && Number.isFinite(score)) {
      const { adjustment, reason } = await performSecondaryScoreAdjustment(
        assignment, conversationMessages, score
      );
      if (adjustment !== 0) {
        const scoreOptions = getAssignmentScoreOptions(assignment);
        const adjusted = getClosestAllowedScore(scoreOptions, score + adjustment) ?? score;
        originalScore = score;
        score = adjusted;
        scoreAdjustmentReason = reason;
      }
    }

    const updatedMessages = [
      ...existingMessages,
      { role: 'student', content: userMessage, timestamp: new Date().toISOString() },
      { role: 'unicorn', content: reply, timestamp: new Date().toISOString() },
    ];

    const updateData = {
      messages: updatedMessages,
      studentMessageCount: studentTurnCount,
    };

    if (finished) {
      updateData.score = score;
      updateData.originalScore = originalScore;
      updateData.scoreAdjustmentReason = scoreAdjustmentReason;
      updateData.feedback = safeFeedback;
      updateData.higherScoreTip = safeHigherScoreTip;
      updateData.nextStepTip = safeNextStepTip;
      updateData.status = 'completed';
      updateData.approved = false;
      updateData.approvalStatus = null;
      updateData.completedAt = FieldValue.serverTimestamp();
      updateData.sessionTokenHash = null;
    }

    await conversationRef.update(updateData);

    // Auto-send score to Grownd when chat completes
    if (finished) {
      const growndResult = await sendGrowndPoints(assignment, conversation, score);
      if (growndResult?.success) {
        await conversationRef.update({
          approved: true,
          approvedAt: FieldValue.serverTimestamp(),
          approvalStatus: 'approved',
        });
      } else if (growndResult && !growndResult.success) {
        await conversationRef.update({
          approvalStatus: 'failed',
          lastGrowndError: {
            message: growndResult.error || '자동 전송 실패',
            at: FieldValue.serverTimestamp(),
          },
        });
      }
    }

    const remainingTurns = Math.max(0, effectiveMaxTurns - studentTurnCount);

    const response = NextResponse.json({
      success: true,
      reply,
      finished,
      score,
      feedback: safeFeedback,
      higherScoreTip: safeHigherScoreTip,
      nextStepTip: safeNextStepTip,
      remainingTurns,
      maxTurns: effectiveMaxTurns,
      currentTurn: studentTurnCount,
    });

    if (finished) {
      response.cookies.set(CHAT_SESSION_COOKIE, '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 0,
      });
    }

    return response;
  } catch (error) {
    console.error('Chat API Error:', error?.message || error);
    if (error?.response) {
      console.error('API Response status:', error.response.status);
    }
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 500 }
    );
  }
}
