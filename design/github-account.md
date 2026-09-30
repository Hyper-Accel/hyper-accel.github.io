# GitHub 계정 기능 연결 메모

GitHub 로그인 후 스크랩, 좋아요 관리, 댓글 알림을 제공하려면 GitHub Pages 밖의 인증·저장 계층이 필요하다. 정적 페이지에 OAuth client secret을 넣어서는 안 된다.

## 필요한 구성

- GitHub OAuth App: 로그인과 사용자 식별
- 인증 콜백을 처리할 서버리스 함수 또는 별도 API
- 사용자별 스크랩·좋아요·알림 설정을 보관할 데이터베이스
- HttpOnly/Secure 쿠키 기반 세션과 CSRF 방어
- Giscus 댓글과 GitHub Discussions 알림 연결 정책

## 권장 데이터 모델

- `users`: GitHub user id, login, avatar URL
- `bookmarks`: user id, post permalink, created at
- `likes`: user id, post permalink, created at
- `notification_preferences`: user id, post permalink, enabled

백엔드와 OAuth App이 정해지면 헤더의 계정 버튼, 글 카드의 스크랩 버튼, 글 상세의 좋아요·댓글 알림 버튼을 이 API에 연결한다.
