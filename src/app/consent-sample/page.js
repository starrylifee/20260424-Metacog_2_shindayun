import Link from 'next/link';

export const metadata = {
  title: '가정통신문 예시 | 오늘배움봇',
};

export default function ConsentSamplePage() {
  return (
    <div className="page-container">
      <div className="content-wrapper content-medium">
        <div className="legal-card">
          <div className="legal-header">
            <Link href="/" className="btn btn-ghost btn-sm">
              처음으로
            </Link>
            <h1 className="heading-section" style={{ marginBottom: '0.5rem' }}>
              가정통신문 예시
            </h1>
            <p className="subtitle" style={{ marginBottom: 0 }}>
              오늘배움봇 및 Grownd 연동 안내용 예시 문안입니다.
            </p>
          </div>

          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginBottom: 0 }}>
              이 문안은 예시입니다. 실제 발송 전에는 학교 내부 절차와 개인정보 처리 기준에 맞게
              담당 교사 또는 기관 검토 후 사용하시기 바랍니다.
            </p>
          </div>

          <div className="legal-body">
            <section className="legal-section">
              <h2>가정통신문 예시</h2>
              <p>학부모님 안녕하십니까.</p>
              <p>
                본교에서는 학생의 수업 이해를 돕고 자기설명 활동을 지원하기 위해 교육용 웹 프로그램
                '오늘배움봇'을 활용하고자 합니다. 오늘배움봇은 앱뜰(App-Tteul)
                플랫폼의 하위 프로그램으로, 학생이 오늘 배운 내용을 자기 말로 설명하면 AI가 관련
                질문과 피드백을 제공하는 학습 도구입니다.
              </p>
              <p>
                또한 학급 운영에 따라 교사가 별도로 설정한 경우, 학생의 승인된 학습 점수를
                Growndcard 서비스와 연동하여 학급경제 포인트로 지급할 수 있습니다. 이에 따라 아래와
                같이 개인정보 수집·이용 및 제3자 제공 내용을 안내드리오니 내용을 확인하신 뒤 동의
                여부를 표시해 주시기 바랍니다.
              </p>
            </section>

            <section className="legal-section">
              <h2>1. 개인정보 수집·이용 동의</h2>
              <ul>
                <li>수집·이용 항목: 학생 출석번호, 학습 대화 내용, 제출 기록, 점수, 평가 피드백</li>
                <li>
                  수집·이용 목적: 학생 학습 참여 구분, AI 기반 질문 및 피드백 제공, 교사의 학습 결과
                  확인 및 수업 운영
                </li>
                <li>보유·이용 기간: 과제 운영 및 결과 확인에 필요한 기간 동안 보유 후 파기</li>
                <li>
                  동의 거부 권리: 보호자는 위 개인정보 수집·이용에 동의하지 않을 권리가 있습니다.
                </li>
                <li>
                  거부 시 불이익: 오늘배움봇을 활용한 수업 참여 및 AI 피드백 제공이 제한될 수
                  있습니다.
                </li>
              </ul>
              <p>[ ] 동의함   [ ] 동의하지 않음</p>
            </section>

            <section className="legal-section">
              <h2>2. 개인정보의 제3자 제공 동의 (Grownd 연동 사용 시)</h2>
              <ul>
                <li>제공받는 자: Growndcard</li>
                <li>제공 항목: 학생 출석번호, 승인 점수, 지급 설명 정보</li>
                <li>제공 목적: 승인된 학습 결과에 따른 학급경제 포인트 지급</li>
                <li>보유·이용 기간: Growndcard의 운영 정책 및 보유 기준에 따름</li>
                <li>
                  동의 거부 권리: 보호자는 개인정보 제3자 제공에 동의하지 않을 권리가 있습니다.
                </li>
                <li>
                  거부 시 불이익: 오늘배움봇 학습 참여는 가능하나, Grownd 포인트 지급은 제한될 수
                  있습니다.
                </li>
              </ul>
              <p>[ ] 동의함   [ ] 동의하지 않음</p>
            </section>

            <section className="legal-section">
              <h2>3. 보호자 확인</h2>
              <p>학생 이름: ____________________</p>
              <p>학년 / 반 / 번호: ____________________</p>
              <p>보호자 성명: ____________________</p>
              <p>보호자 서명: ____________________</p>
              <p>제출일: ______년 ___월 ___일</p>
            </section>

            <section className="legal-section">
              <h2>4. 안내</h2>
              <p>
                오늘배움봇의 자세한 개인정보 처리 내용은 서비스 하단의
                <Link href="/privacy" style={{ marginLeft: '0.35rem', color: 'var(--cyan-primary)' }}>
                  개인정보 처리방침
                </Link>
                과
                <Link href="/terms" style={{ marginLeft: '0.35rem', color: 'var(--cyan-primary)' }}>
                  이용약관
                </Link>
                에서 확인하실 수 있습니다.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
