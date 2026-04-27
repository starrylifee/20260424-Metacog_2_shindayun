'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';

import { bytesToApproxChars, formatStudentMessageByteRange, getUtf8ByteLength } from '@/lib/chatConstraints';
import { getStudentMessageCount } from '@/lib/conversationState';
import { getAssignmentMaxScore } from '@/lib/scoreConfig';

function buildWelcomeMessage(assignment) {
  return {
    role: 'bot',
    content: `안녕! 나는 오늘배움봇이야.\n\n오늘 **"${assignment?.title}"**에서 배운 내용을 네 말로 설명해 줘.\n필요한 부분만 짧게 더 물어보고 마무리할게.`,
  };
}

function buildInitialMessages(assignment, savedMessages = []) {
  const welcomeMessage = buildWelcomeMessage(assignment);
  return savedMessages.length > 0 ? [welcomeMessage, ...savedMessages] : [welcomeMessage];
}

export default function ChatPage() {
  const params = useParams();
  const code = params.code;

  const [assignment, setAssignment] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [studentName, setStudentName] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [finished, setFinished] = useState(false);
  const [score, setScore] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [nextStepTip, setNextStepTip] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState('');
  const [turnInfo, setTurnInfo] = useState({ current: 0, max: 0, remaining: 0 });
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const maxScore = useMemo(() => (assignment ? getAssignmentMaxScore(assignment) : null), [assignment]);
  const inputByteLength = useMemo(() => getUtf8ByteLength(input), [input]);
  const byteRangeLabel = useMemo(
    () => formatStudentMessageByteRange(assignment?.minStudentMessageBytes, assignment?.maxStudentMessageBytes),
    [assignment]
  );
  const inputLengthError = useMemo(() => {
    if (!assignment || !input.trim()) return '';

    if (inputByteLength < assignment.minStudentMessageBytes) {
      return `조금 더 길게 써 주세요. (최소 약 ${bytesToApproxChars(assignment.minStudentMessageBytes)}글자)`;
    }

    if (inputByteLength > assignment.maxStudentMessageBytes) {
      return `너무 길어요. 조금 줄여 주세요. (최대 약 ${bytesToApproxChars(assignment.maxStudentMessageBytes)}글자)`;
    }

    return '';
  }, [assignment, input, inputByteLength]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  useEffect(() => {
    if (loading || blocked || sending || finished || !conversationId) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [blocked, conversationId, finished, loading, sending]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      setBlocked(false);
      setBlockedMessage('');
      setFinished(false);
      setScore(null);
      setFeedback('');
      setNextStepTip('');
      setMessages([]);
      setConversationId(null);

      try {
        const response = await fetch(`/api/assignments/lookup?code=${code}`);
        const data = await response.json();

        if (!data.success) {
          setLoading(false);
          return;
        }

        setAssignment(data.assignment);

        // Read credentials from sessionStorage (set on home page)
        let studentNameVal = '';
        let studentPasswordVal = '';
        try {
          const raw = sessionStorage.getItem('metacog_auth');
          if (raw) {
            const parsed = JSON.parse(raw);
            studentNameVal = parsed.name || '';
            studentPasswordVal = parsed.password || '';
            sessionStorage.removeItem('metacog_auth');
          }
        } catch (_) {
          // ignore
        }

        const conversationResponse = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assignmentId: data.assignment.id,
            studentName: studentNameVal,
            studentPassword: studentPasswordVal,
          }),
        });
        const conversationData = await conversationResponse.json();

        if (conversationData.alreadyExists) {
          setBlocked(true);
          setBlockedMessage(
            conversationData.error || '이미 완료된 제출입니다. 선생님께 문의해 주세요.'
          );
          setLoading(false);
          return;
        }

        if (!conversationData.success) {
          setBlocked(true);
          setBlockedMessage(
            conversationData.error || '입장할 수 없습니다. 이름과 비밀번호를 확인해 주세요.'
          );
          setLoading(false);
          return;
        }

        const displayName =
          conversationData.conversation?.studentName || studentNameVal || '학생';
        setStudentName(displayName);
        setConversationId(conversationData.conversationId);

        const restoredConversation = conversationData.conversation;
        const restoredMessages = Array.isArray(restoredConversation?.messages)
          ? restoredConversation.messages
          : [];

        setMessages(buildInitialMessages(data.assignment, restoredMessages));

        if (restoredConversation?.status === 'completed') {
          setFinished(true);
          setScore(restoredConversation.score ?? null);
          setFeedback(restoredConversation.feedback || '');
          setNextStepTip(restoredConversation.nextStepTip || restoredConversation.higherScoreTip || '');
        }

        const restoredStudentTurns = getStudentMessageCount(restoredConversation);
        const maxTurns = data.assignment.maxTurns ?? 0;
        setTurnInfo({
          current: restoredStudentTurns,
          max: maxTurns,
          remaining: Math.max(0, maxTurns - restoredStudentTurns),
        });
      } catch (error) {
        console.error('Init error:', error);
      }

      setLoading(false);
    }

    void init();
  }, [code]);

  const sendMessage = async () => {
    if (!input.trim() || sending || finished || !conversationId || !assignment || inputLengthError) {
      return;
    }

    const userMessage = input.trim();
    setInput('');
    setSending(true);

    const nextMessages = [...messages, { role: 'student', content: userMessage }];
    setMessages(nextMessages);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          assignmentId: assignment.id,
          content: userMessage,
        }),
      });
      const data = await response.json();

      if (data.success) {
        const updatedMessages = [...nextMessages, { role: 'bot', content: data.reply }];
        setMessages(updatedMessages);

        if (data.finished) {
          setFinished(true);
          setScore(data.score);
          setFeedback(data.feedback || '');
          setNextStepTip(data.nextStepTip || data.higherScoreTip || '');
        }

        if (data.maxTurns !== undefined) {
          setTurnInfo({
            current: data.currentTurn ?? 0,
            max: data.maxTurns ?? 0,
            remaining: data.remainingTurns ?? 0,
          });
        }
      } else {
        setMessages([
          ...nextMessages,
          {
            role: 'unicorn',
            content: data.error || '문제가 생겼어요. 처음부터 다시 시작해 주세요.',
          },
        ]);
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages([
        ...nextMessages,
        { role: 'bot', content: '연결에 문제가 있어요. 한 번만 다시 설명해 줄래?' },
      ]);
    }

    setSending(false);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-container">
          <div className="bot-avatar bot-avatar-large">🦄</div>
          <p style={{ color: 'var(--text-secondary)' }}>오늘배움봇을 켜고 있어요...</p>
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="page-container">
        <div className="entry-container">
          <div className="bot-avatar bot-avatar-large">⚠️</div>
          <h2 style={{ marginTop: '1rem' }}>과제를 찾을 수 없어요.</h2>
          <p className="subtitle">입장 코드를 다시 확인해 주세요.</p>
          <Link href="/" className="btn btn-primary">돌아가기</Link>
        </div>
      </div>
    );
  }

  if (blocked) {
    return (
      <div className="page-container">
        <div className="entry-container">
          <div className="bot-avatar bot-avatar-large">🔒</div>
          <h2 style={{ marginTop: '1rem' }}>입장할 수 없어요.</h2>
          <p className="subtitle">{blockedMessage}</p>
          <Link href="/" className="btn btn-primary">돌아가기</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="chat-container">
        <div className="chat-header">
          <div className="bot-avatar">🤖</div>
          <div className="chat-header-info">
            <h2>오늘배움봇과 대화 중</h2>
            <p>{assignment.title} · {studentName}</p>
          </div>
          {!finished && turnInfo.max > 0 && (
            <span
              className="badge"
              style={{
                background: turnInfo.remaining <= 2
                  ? 'rgba(255, 100, 100, 0.2)'
                  : 'rgba(139, 92, 246, 0.2)',
                color: turnInfo.remaining <= 2 ? '#ff8a8a' : 'var(--primary)',
                border: `1px solid ${turnInfo.remaining <= 2 ? 'rgba(255,100,100,0.3)' : 'rgba(139,92,246,0.3)'}`,
                padding: '0.25rem 0.6rem',
                borderRadius: '999px',
                fontSize: '0.75rem',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {turnInfo.current}/{turnInfo.max}턴
            </span>
          )}
          {Number.isFinite(score) && finished && (
            <span className="badge badge-score">{score}점</span>
          )}
        </div>

        <div className="chat-messages">
          {messages.map((message, index) => (
            <div key={index} className={`chat-bubble chat-bubble-${message.role}`}>
              {message.role === 'bot' || message.role === 'unicorn' && (
                <div className="chat-sender">오늘배움봇</div>
              )}
              <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
            </div>
          ))}

          {sending && (
            <div className="chat-bubble chat-bubble-bot">
              <div className="chat-sender">오늘배움봇</div>
              <div className="typing-dots">
                <span /><span /><span />
              </div>
            </div>
          )}

          {finished && (
            <div className="chat-bubble chat-bubble-system">
              <div className="score-display">
                {Number.isFinite(score) && (
                  <div className="score-label">
                    {score}점{Number.isFinite(maxScore) ? ` / ${maxScore}점` : ''}
                  </div>
                )}
                {feedback && <div className="score-feedback">{feedback}</div>}
                {nextStepTip && (
                  <div className="score-feedback" style={{ marginTop: '0.75rem' }}>
                    <strong>💡 다음에 해보면 좋을 것</strong> {nextStepTip}
                  </div>
                )}
                <div style={{ marginTop: '1rem' }}>
                  <Link href="/" className="btn btn-primary btn-sm">처음으로</Link>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {!finished && (
          <div className="chat-input-area">
            {turnInfo.max > 0 && turnInfo.remaining <= 2 && turnInfo.remaining > 0 && (
              <div style={{
                fontSize: '0.72rem',
                color: turnInfo.remaining === 1 ? '#ff8a8a' : 'var(--text-muted)',
                textAlign: 'center',
                paddingBottom: '0.35rem',
                fontWeight: 500,
              }}>
                {turnInfo.remaining === 1
                  ? '⚠️ 마지막 대화 기회예요!'
                  : `💬 남은 대화 기회: ${turnInfo.remaining}번`}
              </div>
            )}
            {assignment?.minStudentMessageBytes && assignment?.maxStudentMessageBytes && (
              <div style={{
                fontSize: '0.72rem',
                color: inputLengthError ? '#ff8a8a' : 'var(--text-muted)',
                textAlign: 'center',
                paddingBottom: '0.35rem',
                fontWeight: 500,
              }}>
                {inputLengthError || `현재 ${bytesToApproxChars(inputByteLength)}글자 · 권장 범위 ${byteRangeLabel}`}
              </div>
            )}
            <input
              ref={inputRef}
              id="chat-input"
              type="text"
              className="form-input"
              placeholder="오늘배움봇에게 설명해 보세요..."
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              autoComplete="off"
            />
            <button
              id="btn-send"
              className="btn btn-primary"
              onClick={() => void sendMessage()}
              disabled={sending || !input.trim() || Boolean(inputLengthError)}
            >
              {sending ? '...' : '전송'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
