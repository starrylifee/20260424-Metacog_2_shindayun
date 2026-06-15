import { adminDb } from './serverDb';

const CLASS_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateClassCode() {
  let code = '';

  for (let index = 0; index < 6; index += 1) {
    code += CLASS_CODE_CHARS.charAt(Math.floor(Math.random() * CLASS_CODE_CHARS.length));
  }

  return code;
}

export async function generateUniqueClassCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const classCode = generateClassCode();
    const existing = await adminDb
      .collection('teachers')
      .where('classCode', '==', classCode)
      .limit(1)
      .get();

    if (existing.empty) {
      return classCode;
    }
  }

  throw new Error('학급 코드를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.');
}
