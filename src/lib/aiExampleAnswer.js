import OpenAI from 'openai';

import { getAssignmentMaxScore, getAssignmentScoreOptions } from '@/lib/scoreConfig';

let _openai = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY?.trim() });
  return _openai;
}

export async function generateAIExampleAnswer(assignment) {
  try {
    const keywords = (assignment.keywords || []).join(', ');
    const scoreOptions = getAssignmentScoreOptions(assignment);
    const maxScore = getAssignmentMaxScore(assignment);

    const prompt = `다음 학습 과제에 대해 최고 점수를 받을 수 있는 이상적인 학생 답변을 작성해줘.

과제 제목: ${assignment.title}
학습 목표: ${assignment.learningObjective || ''}
수업 내용: ${assignment.content || ''}
핵심 키워드: ${keywords}
${maxScore !== null ? `최고 점수: ${maxScore}점 만점` : ''}

지침:
- 학생이 직접 설명하는 것처럼 자연스럽게 작성해줘
- 핵심 개념을 명확히 설명하고 그 이유와 예시도 포함해
- 150~250자 정도로 작성해줘
- 답변 내용만 작성하고 다른 설명은 하지 마`;

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content?.trim() || null;
  } catch (error) {
    console.error('AI example answer generation error:', error);
    return null;
  }
}
