const TURN_LIMITS = {
  math: {
    minTurns: 2,
    maxTurns: 3,
    legacyMaxTurns: 3,
  },
};

const LEGACY_DEFAULT_MIN_STUDENT_MESSAGE_BYTES = 15;

const BYTE_LIMITS = {
  minStudentMessageBytes: 9,
  maxStudentMessageBytes: 220,
};

export const CHAT_LENGTH_EXAMPLES = [
  {
    label: '짧은 한 문장',
    text: '파란색이 가장 눈에 띄어요.',
  },
  {
    label: '설명 한두 문장',
    text: '하늘이 소용돌이처럼 보여서 바람이 세게 부는 밤 같아요.',
  },
  {
    label: '이유까지 붙인 답변',
    text: '저는 가운데 큰 나무가 눈에 띄고, 주변 하늘이 움직이는 것처럼 보여서 그림이 살아 있는 느낌이 들어요.',
  },
];

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function normalizeMinStudentMessageBytes(value, fallback) {
  const normalized = clampInteger(value, 1, 1000, fallback);

  // Relax the old default so previously created assignments/settings also allow shorter replies.
  if (normalized === LEGACY_DEFAULT_MIN_STUDENT_MESSAGE_BYTES) {
    return BYTE_LIMITS.minStudentMessageBytes;
  }

  return normalized;
}

export function getUtf8ByteLength(text) {
  return new TextEncoder().encode(String(text ?? '')).length;
}

export function getChatLengthExamples() {
  return CHAT_LENGTH_EXAMPLES.map((example) => ({
    ...example,
    bytes: getUtf8ByteLength(example.text),
  }));
}

export function getDefaultTurnLimits() {
  return TURN_LIMITS.math;
}

export function getDefaultAssignmentConstraints() {
  const turnDefaults = getDefaultTurnLimits();

  return {
    minTurns: turnDefaults.minTurns,
    maxTurns: turnDefaults.maxTurns,
    minStudentMessageBytes: BYTE_LIMITS.minStudentMessageBytes,
    maxStudentMessageBytes: BYTE_LIMITS.maxStudentMessageBytes,
  };
}

export function getLegacyMaxTurns() {
  return getDefaultTurnLimits().legacyMaxTurns;
}

export function getTeacherConstraintDefaults(settings = {}) {
  const assignmentDefaults = getDefaultAssignmentConstraints();
  const maxTurnsFallback = assignmentDefaults.maxTurns;
  const minTurnsFallback = assignmentDefaults.minTurns;

  const maxTurns = clampInteger(
    settings.defaultMathMaxTurns,
    1,
    12,
    maxTurnsFallback
  );

  const minTurns = clampInteger(
    settings.defaultMathMinTurns,
    1,
    maxTurns,
    Math.min(minTurnsFallback, maxTurns)
  );

  const minStudentMessageBytes = normalizeMinStudentMessageBytes(
    settings.defaultMinStudentMessageBytes,
    BYTE_LIMITS.minStudentMessageBytes
  );

  const maxStudentMessageBytes = clampInteger(
    settings.defaultMaxStudentMessageBytes,
    minStudentMessageBytes,
    4000,
    Math.max(BYTE_LIMITS.maxStudentMessageBytes, minStudentMessageBytes)
  );

  return {
    minTurns,
    maxTurns,
    minStudentMessageBytes,
    maxStudentMessageBytes,
  };
}

export function normalizeAssignmentConstraints(assignment = {}) {
  const defaults = getDefaultAssignmentConstraints();
  const legacyMaxTurns = getLegacyMaxTurns();

  const explicitMaxTurns = Number(assignment.maxTurns);
  const maxTurns = Number.isFinite(explicitMaxTurns) && explicitMaxTurns >= 1
    ? clampInteger(explicitMaxTurns, 1, 12, defaults.maxTurns)
    : legacyMaxTurns;

  const minTurns = clampInteger(
    assignment.minTurns,
    1,
    maxTurns,
    Math.min(defaults.minTurns, maxTurns)
  );

  const minStudentMessageBytes = normalizeMinStudentMessageBytes(
    assignment.minStudentMessageBytes,
    defaults.minStudentMessageBytes
  );

  const maxStudentMessageBytes = clampInteger(
    assignment.maxStudentMessageBytes,
    minStudentMessageBytes,
    4000,
    Math.max(defaults.maxStudentMessageBytes, minStudentMessageBytes)
  );

  return {
    minTurns,
    maxTurns,
    minStudentMessageBytes,
    maxStudentMessageBytes,
  };
}

export function bytesToApproxChars(bytes) {
  return Math.round(bytes / 3);
}

export function formatStudentMessageByteRange(minBytes, maxBytes) {
  if (!Number.isFinite(minBytes) || !Number.isFinite(maxBytes)) {
    return '-';
  }

  const minChars = Math.ceil(minBytes / 3);
  const maxChars = Math.floor(maxBytes / 3);
  return `약 ${minChars}~${maxChars}글자`;
}
