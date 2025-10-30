# HyperAccel Tech Blog

HyperAccel의 기술 블로그입니다. Hugo와 PaperMod 테마를 사용하여 구축되었습니다.

## 📋 목차

- [Hugo 설치](#hugo-설치)
- [프로젝트 설정](#프로젝트-설정)
- [블로그 포스트 작성](#블로그-포스트-작성)
- [로컬 개발 서버 실행](#로컬-개발-서버-실행)
- [포스트 배포](#포스트-배포)

## 🚀 Hugo 설치

### macOS (Homebrew 사용)

```bash
# Homebrew를 통한 설치
brew install hugo

# 설치 확인
hugo version
```

### Windows

```bash
# Chocolatey 사용
choco install hugo

# 또는 Scoop 사용
scoop install hugo
```

### Linux

```bash
# Ubuntu/Debian
sudo apt-get install hugo

# 또는 snap 사용
sudo snap install hugo
```

### 직접 다운로드

[Hugo Releases](https://github.com/gohugoio/hugo/releases)에서 운영체제에 맞는 바이너리를 다운로드하여 설치할 수 있습니다.

## ✍️ 블로그 포스트 작성

### 1. 새 포스트 생성

```bash
# 기본 포스트 생성
hugo new content/posts/포스트-제목/index.md

# 예시
hugo new content/posts/hugo-블로그-작성-가이드/index.md
```

### 2. 포스트 메타데이터 설명

포스트 생성 시 자동으로 생성되는 메타데이터 필드들:

- **`date`**: 포스트 작성일 (자동 생성)
- **`draft`**: 초안 여부 (`true`: 초안, `false`: 발행)
- **`title`**: 포스트 제목 (파일명에서 자동 생성, 수정 가능)
- **`cover`**: 커버 이미지 설정
  - `image`: 이미지 경로 또는 URL
  - `alt`: 이미지 대체 텍스트
  - `caption`: 이미지 캡션
  - `relative`: 상대 경로 사용 여부

추가로 설정할 수 있는 메타데이터:
- **`tags`**: 포스트 태그 (배열)
- **`categories`**: 포스트 카테고리 (배열)
- **`summary`**: 포스트 요약

### 3. 포스트 내용 작성

Markdown 문법을 사용하여 포스트 내용을 작성합니다:

```markdown
# 제목

## 소제목

일반 텍스트 내용입니다.

### 코드 블록

```python
def hello_world():
    print("Hello, World!")
```

### 이미지 삽입

![이미지 설명](images/image-name.jpg)

### 링크

[HyperAccel 홈페이지](https://hyperaccel.ai/)
```

### 4. 포스트 미리보기

```bash
# 로컬 서버 실행
hugo server -D

# 브라우저에서 http://localhost:1313 접속
```

## 🔧 로컬 개발 서버 실행

### 개발 모드 (초안 포함)

```bash
hugo server -D
```

### 프로덕션 모드

```bash
hugo server
```

### 특정 포트로 실행

```bash
hugo server -p 8080
```

## 📤 포스트 배포

### 1. 포스트 완성 후 초안 해제

포스트 파일에서 `draft: true`를 `draft: false`로 변경합니다.

### 2. 새 브랜치 생성 및 변경사항 커밋

```bash
# 새 브랜치 생성
git checkout -b feature/포스트-제목

# 변경사항 추가
git add .

# 커밋
git commit -m "feat: add new blog post about [포스트 제목]"

# 브랜치에 푸시
git push origin feature/포스트-제목
```

### 3. Pull Request 생성

1. GitHub에서 "Compare & pull request" 버튼 클릭
2. PR 제목: `feat: add new blog post about [포스트 제목]`
3. PR 설명에 포스트 내용 요약 작성
4. 리뷰어 지정 후 PR 생성

### 4. 리뷰 및 머지

- 리뷰어가 코드 리뷰 진행
- 승인 후 main 브랜치에 머지
- GitHub Pages 자동 배포 실행

## 📁 프로젝트 구조

```
hyper-accel.github.io/
├── content/
│   └── posts/           # 블로그 포스트들
│       └── 포스트-제목/
│           ├── index.md # 포스트 내용
│           └── images/  # 포스트 이미지들
├── archetypes/
│   └── posts.md         # 포스트 템플릿
├── assets/
│   └── images/          # 전역 이미지들
├── themes/
│   └── PaperMod/        # Hugo 테마
├── hugo.yaml           # Hugo 설정 파일
└── README.md           # 이 파일
```

## 🎨 포스트 작성 팁

### 1. 이미지 최적화

- 이미지는 `content/posts/포스트-제목/images/` 폴더에 저장
- 권장 이미지 크기: 1200x630px (소셜 미디어 최적화)
- 파일 형식: JPG, PNG, WebP

### 2. 태그 및 카테고리

- **태그**: 포스트의 세부 주제 (예: "hugo", "blog", "tech")
- **카테고리**: 포스트의 주요 분류 (예: "Tech", "Tutorial", "News")

### 3. SEO 최적화

- `summary` 필드에 포스트 요약 작성
- `cover` 이미지 설정
- 의미있는 제목과 URL 사용

## 🔄 워크플로우 요약

1. **저장소 포크** → 로컬 클론
2. **새 브랜치 생성** → `feature/포스트-제목`
3. **포스트 작성** → `hugo new posts/포스트-제목/index.md`
4. **로컬 미리보기** → `hugo server -D`
5. **변경사항 커밋** → PR 생성
6. **리뷰 및 머지** → 자동 배포

## 🆘 문제 해결

### Hugo 서버가 시작되지 않는 경우

```bash
# 포트가 사용 중인 경우
hugo server -p 8080

# 캐시 삭제
hugo --gc
```

### 테마가 적용되지 않는 경우

```bash
# 테마 다시 다운로드
hugo mod get -u github.com/adityatelange/hugo-PaperMod
hugo mod tidy
```

## 📚 추가 자료

- [Hugo 공식 문서](https://gohugo.io/documentation/)
- [PaperMod 테마 문서](https://github.com/adityatelange/hugo-PaperMod)
- [Markdown 가이드](https://www.markdownguide.org/)

---

