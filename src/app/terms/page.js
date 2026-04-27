import Link from 'next/link';

export const metadata = {
  title: '이용약관 | 오늘배움봇',
};

export default function TermsPage() {
  return (
    <div className="page-container">
      <div className="content-wrapper content-medium">
        <div className="legal-card">
          <div className="legal-header">
            <Link href="/" className="btn btn-ghost btn-sm">
              처음으로
            </Link>
            <h1 className="heading-section" style={{ marginBottom: '0.5rem' }}>
              이용약관
            </h1>
            <p className="subtitle" style={{ marginBottom: 0 }}>
              오늘배움봇은 앱뜰(App-Tteul) 플랫폼의 하위 프로그램으로 제공됩니다.
            </p>
          </div>

          <div className="legal-body">
            <p>
              본 이용약관(이하 &apos;약관&apos;)은 오늘배움봇(이하 &apos;본 서비스&apos;)이
              제공하는 교육용 웹 애플리케이션 서비스의 이용에 관한 사항을 규정합니다.
            </p>

            <section className="legal-section">
              <h2>제1조 (목적)</h2>
              <p>
                이 약관은 본 서비스가 제공하는 무료 교육용 웹 애플리케이션 서비스(이하
                &apos;서비스&apos;)를 이용함에 있어 서비스 제공자와 이용자의 권리·의무 및 책임사항을
                규정함을 목적으로 합니다.
              </p>
            </section>

            <section className="legal-section">
              <h2>제2조 (정의)</h2>
              <ul>
                <li>
                  &apos;서비스&apos;란 앱뜰(App-Tteul) 플랫폼 내에서 제공되는 오늘배움봇
                  프로그램을 말합니다.
                </li>
                <li>
                  &apos;교사 이용자&apos;란 Google 로그인을 통해 과제를 생성·관리하고 학생 결과를
                  확인하는 이용자를 말합니다.
                </li>
                <li>
                  &apos;학생 이용자&apos;란 입장 코드와 출석번호를 입력하여 과제에 참여하는 이용자를
                  말합니다.
                </li>
                <li>
                  &apos;이용자&apos;란 교사 이용자와 학생 이용자를 모두 포함합니다.
                </li>
              </ul>
            </section>

            <section className="legal-section">
              <h2>제3조 (약관의 명시와 개정)</h2>
              <p>
                ① 본 서비스는 이 약관의 내용을 이용자가 쉽게 알 수 있도록 서비스 화면에 게시합니다.
              </p>
              <p>② 본 서비스는 관련 법령을 위배하지 않는 범위에서 이 약관을 개정할 수 있습니다.</p>
              <p>
                ③ 약관을 개정할 경우에는 적용일자 및 개정사유를 명시하여 현행약관과 함께 서비스 내에
                공지합니다.
              </p>
            </section>

            <section className="legal-section">
              <h2>제4조 (서비스의 제공)</h2>
              <ul>
                <li>본 서비스는 교육 목적의 무료 웹 애플리케이션을 제공합니다.</li>
                <li>
                  교사 이용자는 과제를 생성하고 학생 결과를 조회하며, 학생 이용자는 AI와의 대화를 통해
                  학습 내용을 설명하고 피드백을 받을 수 있습니다.
                </li>
                <li>
                  교사가 외부 연동을 설정한 경우, 승인된 학습 결과를 바탕으로 Grownd 포인트 지급 기능을
                  사용할 수 있습니다.
                </li>
                <li>서비스 이용은 무료이며, 별도의 유료 결제가 필요하지 않습니다.</li>
                <li>본 서비스는 교육 활동 지원을 목적으로 하며, 상업적 목적으로 운영되지 않습니다.</li>
              </ul>
            </section>

            <section className="legal-section">
              <h2>제5조 (서비스의 중단)</h2>
              <p>
                ① 본 서비스는 시스템 점검, 교체 및 고장, 통신 장애 등의 사유가 발생한 경우에는
                서비스의 제공을 일시적으로 중단할 수 있습니다.
              </p>
              <p>
                ② 본 서비스는 무료로 제공되는 교육용 서비스이므로, 서비스 중단으로 인한 별도의 보상은
                제공되지 않습니다.
              </p>
            </section>

            <section className="legal-section">
              <h2>제6조 (서비스 이용 방법)</h2>
              <p>
                ① 교사 이용자는 Google 계정 로그인을 통해 서비스에 접속할 수 있습니다.
              </p>
              <p>
                ② 학생 이용자는 별도의 회원가입 없이 입장 코드와 출석번호를 입력하여 과제에 참여할 수
                있습니다.
              </p>
              <p>
                ③ 만 14세 미만의 아동은 학교 수업 운영 절차 및 보호자 동의에 따라 서비스를 이용할 수
                있습니다.
              </p>
            </section>

            <section className="legal-section">
              <h2>제7조 (이용 중단 및 기록 삭제)</h2>
              <p>
                ① 교사 이용자는 언제든지 서비스 이용을 중단할 수 있으며, 저장된 설정 또는 기록 삭제가
                필요한 경우 운영자에게 요청할 수 있습니다.
              </p>
              <p>
                ② 학생 이용자의 제출 기록은 교사의 관리 기능 또는 별도 요청에 따라 삭제될 수 있습니다.
              </p>
            </section>

            <section className="legal-section">
              <h2>제8조 (이용자의 의무)</h2>
              <p>이용자는 다음 행위를 하여서는 안 됩니다.</p>
              <ul>
                <li>허위 내용의 입력 또는 등록</li>
                <li>타인의 정보 도용 또는 무단 사용</li>
                <li>서비스에 게시된 정보의 무단 변경</li>
                <li>서비스의 운영을 방해하는 행위</li>
                <li>타인의 명예를 손상시키거나 불이익을 주는 행위</li>
                <li>공서양속에 반하는 정보를 입력하거나 게시하는 행위</li>
              </ul>
            </section>

            <section className="legal-section">
              <h2>제9조 (저작권)</h2>
              <p>① 본 서비스가 작성한 저작물에 대한 저작권은 서비스 제공자에게 귀속합니다.</p>
              <p>
                ② 이용자는 서비스를 이용하여 얻은 정보를 서비스 제공자의 사전 승낙 없이 복제, 송신,
                출판, 배포하여서는 안 됩니다.
              </p>
            </section>

            <section className="legal-section">
              <h2>제10조 (면책조항)</h2>
              <p>
                ① 본 서비스는 무료로 제공되는 교육용 서비스로서, 서비스 이용 중 발생하는 기술적 문제나
                오류에 대하여 제한적 책임을 집니다.
              </p>
              <p>
                ② AI가 생성하는 질문, 점수, 피드백은 학습 지원을 위한 참고 정보이며, 최종적인 교육적
                판단과 활용 책임은 교사에게 있습니다.
              </p>
              <p>
                ③ 본 서비스가 연결하는 외부 서비스의 내용과 처리 결과에 대해서는 해당 외부 서비스
                제공자가 책임을 집니다.
              </p>
            </section>

            <section className="legal-section">
              <h2>제11조 (분쟁해결)</h2>
              <p>
                본 서비스와 이용자 간에 발생한 분쟁에 관하여는 대한민국 법을 적용하며, 소송이 제기되는
                경우 서비스 제공자의 소재지를 관할하는 법원을 관할법원으로 합니다.
              </p>
            </section>

            <section className="legal-section">
              <h2>부칙</h2>
              <p>이 약관은 2026년 3월 20일부터 시행됩니다.</p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
