import { auth } from './firebase';

async function getAuthHeaders(includeJson = true) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('로그인이 필요합니다.');
  }

  const token = await user.getIdToken();
  const headers = {
    Authorization: `Bearer ${token}`,
  };

  if (includeJson) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

async function parseResponse(response) {
  const data = await response.json().catch(() => null);

  if (!response.ok || data?.success === false) {
    throw new Error(data?.error || '요청 처리에 실패했습니다.');
  }

  return data;
}

export async function saveTeacherSettings(uid, settings) {
  const response = await fetch('/api/teacher/settings', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(settings),
  });

  return parseResponse(response);
}

export async function getTeacherSettings(uid) {
  const response = await fetch('/api/teacher/settings', {
    method: 'GET',
    headers: await getAuthHeaders(false),
    cache: 'no-store',
  });

  const data = await parseResponse(response);
  return data.settings;
}

export async function createAssignment(teacherId, data) {
  const response = await fetch('/api/teacher/assignments', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(data),
  });

  const result = await parseResponse(response);
  return result.assignment;
}

export async function getAssignmentsByTeacher(teacherId) {
  const response = await fetch('/api/teacher/assignments', {
    method: 'GET',
    headers: await getAuthHeaders(false),
    cache: 'no-store',
  });

  const data = await parseResponse(response);
  return data.assignments;
}

export async function getAssignmentById(id) {
  const response = await fetch(`/api/teacher/assignments/${id}`, {
    method: 'GET',
    headers: await getAuthHeaders(false),
    cache: 'no-store',
  });

  const data = await parseResponse(response);
  return data.assignment;
}

export async function toggleAssignment(id, isActive) {
  const response = await fetch(`/api/teacher/assignments/${id}`, {
    method: 'PATCH',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ isActive }),
  });

  await parseResponse(response);
}

export async function deleteAssignment(id) {
  const response = await fetch(`/api/teacher/assignments/${id}`, {
    method: 'DELETE',
    headers: await getAuthHeaders(false),
  });

  await parseResponse(response);
}

export async function duplicateAssignment(id) {
  const response = await fetch(`/api/teacher/assignments/${id}`, {
    method: 'POST',
    headers: await getAuthHeaders(),
  });

  const data = await parseResponse(response);
  return data.assignment;
}

export async function updateAssignment(id, payload) {
  const response = await fetch(`/api/teacher/assignments/${id}`, {
    method: 'PATCH',
    headers: await getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  const data = await parseResponse(response);
  return data.assignment;
}

export async function getConversationsByAssignment(assignmentId) {
  const response = await fetch(`/api/teacher/assignments/${assignmentId}/conversations`, {
    method: 'GET',
    headers: await getAuthHeaders(false),
    cache: 'no-store',
  });

  const data = await parseResponse(response);
  return data.conversations;
}
