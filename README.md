# HyperAccel Tech Blog

HyperAccel의 기술 블로그입니다. Hugo와 PaperMod 테마를 사용하여 구축되었습니다.

## 📋 목차

- [Hugo 설치](#hugo-설치)
- [프로젝트 설정](#프로젝트-설정)
- [다국어 지원 (Multilingual)](#다국어-지원-multilingual)
- [블로그 포스트 작성](#블로그-포스트-작성)
  - [시리즈 (Series) 작성 가이드](#시리즈-series-작성-가이드)
- [로컬 개발 서버 실행](#로컬-개발-서버-실행)
- [포스트 배포](#포스트-배포)

## Repository clone 받기
```bash
git clone git@github.com:Hyper-Accel/hyper-accel.github.io.git
cd hyper-accel.github.io
git submodule update --init --recursive
```
Repository를 clone받고, submodule을 초기화합니다. (recursive 옵션을 붙여 주십시오)

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
- `apt` 등 일부 Linux 패키지 매니저로 설치한 Hugo 버전이 낮아 호환성 문제가 발생할 수 있습니다. 자세한 해결 방법은 [리눅스 환경에서의 Hugo 버전 문제](#리눅스-환경에서의-hugo-버전-문제) 섹션을 참고해주세요.
```bash
# Ubuntu/Debian
sudo apt-get install hugo

# 또는 snap 사용
sudo snap install hugo
```

### 직접 다운로드

[Hugo Releases](https://github.com/gohugoio/hugo/releases)에서 운영체제에 맞는 바이너리를 다운로드하여 설치할 수 있습니다.

## 🌐 다국어 지원 (Multilingual)

이 블로그는 한국어(ko)와 영어(en)를 지원합니다. 모든 콘텐츠는 기본 버전(한국어)과 영어 버전(.en)을 작성해야 합니다.

### URL 구조

- **한국어 (기본 언어)**: `/posts/포스트-제목/` (언어 코드 없음)
- **영어**: `/en/posts/포스트-제목/` (언어 코드 포함)

### 중요 사항

⚠️ **새 포스트부터는 반드시 다국어 버전을 모두 작성해야 합니다.**

- 기본 버전(한국어): `index.md` 또는 `index.ko.md`
- 영어 버전: `index.en.md`

두 파일은 **같은 slug(폴더명 또는 기본 파일명)**를 가져야 하며, Hugo가 자동으로 번역으로 연결합니다.

## 👤 Author(저자) 추가 방법

새로운 Author(저자) 프로필을 추가하려면 아래 과정을 따라주세요.

### 1. author 마크다운 파일 생성

`content/authors/<author_id>/` 경로에 새로운 디렉터리를 만들고, **기본 버전과 영어 버전** 두 개의 파일을 생성합니다.

예시 (author_id가 `Minho Park`인 경우):

```bash
mkdir -p content/authors/Minho\ Park
hugo new content/authors/Minho\ Park/_index.md
hugo new content/authors/Minho\ Park/_index.en.md
```

### 2. `_index.md` 파일 내용 작성 (기본 버전 - 한국어)

```markdown
---
title: "Minho Park"
image: "https://avatars.githubusercontent.com/u/33409967?v=4"
linkedin: "https://www.linkedin.com/in/minho-park-804a56142/"
github: "https://github.com/mino-park7"
bio: "ML Engineering Lead"
---
```

### 3. `_index.en.md` 파일 내용 작성 (영어 버전)

```markdown
---
title: "Minho Park"
image: "https://avatars.githubusercontent.com/u/33409967?v=4"
linkedin: "https://www.linkedin.com/in/minho-park-804a56142/"
github: "https://github.com/mino-park7"
bio: "ML Engineering Lead"
---
```

**필수 사항:**
- `title` — 이름 (한국어/영어 동일 가능)
- `bio` — 간단한 한 줄 소개 (언어별로 다를 수 있음)

**선택 사항:**
- `image` — 프로필 사진 URL (추천: 깃허브 프로필사진 "이미지 주소 복사")
- `linkedin`/`github` — 소셜 미디어 링크

### 4. 포스트에 author 지정하기

포스트의 프론트매터에 작성자의 author id를 배열로 추가합니다.

```yaml
authors: ["Minho Park"]
```

### 5. 페이지에서 author 정보 확인

포스트 또는 `/authors/` (한국어), `/en/authors/` (영어) 페이지에서 프로필 정보가 자동으로 표시됩니다.

### 참고

- author 템플릿 샘플: [`archetypes/authors.md`](archetypes/authors.md) 참고
- 작성 예시: [`content/authors/Minho Park/`](content/authors/Minho%20Park/) 참고



## ✍️ 블로그 포스트 작성

### 1. 새 포스트 생성 (다국어 지원)

**⚠️ 중요: 새 포스트는 반드시 기본 버전과 영어 버전을 모두 작성해야 합니다.**

#### 방법 1: 페이지 번들 방식 (권장)

같은 폴더에 두 개의 파일을 생성합니다:

```bash
# 폴더 생성
mkdir -p content/posts/포스트-제목

# 기본 버전 (한국어) 생성
hugo new content/posts/포스트-제목/index.md --config hugo.yaml

# 영어 버전 생성
hugo new content/posts/포스트-제목/index.en.md --config hugo.yaml
```

**파일 구조:**
```
content/posts/포스트-제목/
├── index.md      (한국어 버전)
└── index.en.md   (영어 버전)
```

#### 방법 2: 단일 파일 방식

언어 접미사를 가진 두 개의 파일을 생성합니다:

```bash
# 기본 버전 (한국어)
hugo new content/posts/포스트-제목.ko.md

# 영어 버전
hugo new content/posts/포스트-제목.en.md
```

**파일 구조:**
```
content/posts/
├── 포스트-제목.ko.md  (한국어 버전)
└── 포스트-제목.en.md  (영어 버전)
```

### 다국어 포스트 작성 가이드

1. **같은 slug 사용**: 두 파일은 같은 slug(폴더명 또는 기본 파일명)를 가져야 합니다.
2. **제목과 내용**: 각 언어별로 제목과 내용을 다르게 작성할 수 있습니다.
3. **자동 연결**: Hugo가 자동으로 두 버전을 번역으로 연결합니다.
4. **URL 생성**: 
   - 한국어 (기본 언어): `/posts/포스트-제목/` (언어 코드 없음)
   - 영어: `/en/posts/포스트-제목/` (언어 코드 포함)

**예시:**
```yaml
# content/posts/my-post/index.md (한국어)
---
title: '나의 첫 포스트'
date: '2025-01-15T10:00:00+09:00'
draft: false
authors: ['Minho Park']
---

# 나의 첫 포스트

이것은 한국어 버전입니다.
```

```yaml
# content/posts/my-post/index.en.md (영어)
---
title: 'My First Post'
date: '2025-01-15T10:00:00+09:00'
draft: false
authors: ['Minho Park']
---

# My First Post

This is the English version.
```

### 시리즈 (Series) 작성 가이드

시리즈는 여러 포스트를 하나의 그룹으로 묶어 관련 글들을 함께 표시하는 기능입니다. 같은 시리즈에 속한 포스트들은 각 포스트 하단에 목록으로 표시됩니다.

#### 시리즈 추가 방법

포스트의 front matter에 `series` 필드를 추가합니다:

```yaml
---
title: '지피지기면 백전불태 2편: TPU의 등장과 부상'
date: '2026-01-03T17:20:16+09:00'
draft: false
authors: [Jaewon Lim]
tags: ["TPU", "Google", "Ironwood"]
categories: ["AI Hardware", "Computer Architecture"]
series: ["지피지기면 백전불태"]  # 시리즈 이름 추가
---
```

#### 다국어 시리즈

한국어와 영어 버전의 포스트는 각각의 언어로 시리즈 이름을 지정합니다:

**한국어 버전 (`index.md` 또는 `index.ko.md`):**
```yaml
series: ["지피지기면 백전불태"]
```

**영어 버전 (`index.en.md`):**
```yaml
series: ["Know Your Enemy, Know Yourself"]
```

#### 시리즈 표시 위치

- 시리즈 목록은 포스트 하단(post-footer)에 자동으로 표시됩니다
- 같은 시리즈에 속한 포스트가 2개 이상일 때만 표시됩니다
- 현재 포스트는 강조 표시되고, 다른 포스트들은 클릭 가능한 링크로 표시됩니다
- 포스트는 날짜순으로 정렬되어 표시됩니다

#### 예시

같은 시리즈에 속한 포스트들:
- "지피지기면 백전불태 1편: GPU의 역사와 기초" (`series: ["지피지기면 백전불태"]`)
- "지피지기면 백전불태 2편: TPU의 등장과 부상" (`series: ["지피지기면 백전불태"]`)

이 두 포스트는 각각의 포스트 하단에 시리즈 목록이 표시되어 서로 연결됩니다.

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

#### SEO 최적화를 위한 메타데이터

검색 엔진 최적화와 소셜 미디어 공유를 위해 다음 필드들을 설정하는 것을 권장합니다:

- **`description`**: 포스트 설명 (150-160자 권장)
  - 검색 결과에 표시되는 설명문
  - Open Graph와 Twitter Cards에 사용
  - 설정하지 않으면 `summary`가 자동으로 사용됨
  
- **`keywords`**: 포스트별 키워드 (배열, 선택사항)
  - 검색 엔진에 전달되는 키워드
  - 설정하지 않으면 `tags`가 자동으로 사용됨
  - 예: `keywords: ["Hugo", "SEO", "블로그"]`

- **`lastmod`**: 마지막 수정일 (선택사항)
  - 콘텐츠 업데이트 시 설정
  - 검색 엔진이 최신 콘텐츠로 인식
  - 형식: `lastmod: '2025-01-15T10:30:00+09:00'`

- **`canonicalURL`**: Canonical URL (선택사항)
  - 중복 콘텐츠 방지
  - 원본 콘텐츠가 다른 곳에 있을 때 설정
  - 예: `canonicalURL: "https://example.com/original-post"`

- **`locale`**: 언어 설정 (선택사항)
  - Open Graph locale 설정
  - 예: `locale: "ko_KR"` (기본값: 사이트 언어 설정)

- **`robotsNoIndex`**: 검색 엔진 인덱싱 제어 (선택사항)
  - `true`로 설정 시 검색 엔진 인덱싱 방지
  - 초안이나 임시 포스트에 사용

#### SEO 최적화 예시

```yaml
---
date: '2025-01-15T10:00:00+09:00'
lastmod: '2025-01-20T15:30:00+09:00'
title: 'Hugo 블로그 SEO 가이드'
draft: false
authors: ['Minho Park']
description: 'Hugo와 PaperMod 테마를 사용한 블로그의 SEO 최적화 방법을 알아봅니다. 메타 태그, Open Graph, Schema.org 설정 등을 포함합니다.'
keywords: ['Hugo', 'SEO', '블로그', 'PaperMod', '검색엔진최적화']
tags: ['Hugo', 'SEO', 'Tutorial']
categories: ['Tech']
summary: 'Hugo 블로그의 SEO 최적화 가이드입니다.'
cover:
  image: 'seo-guide.png'
  alt: 'SEO 최적화 가이드 커버 이미지'
  caption: 'Hugo 블로그 SEO 가이드'
  relative: true
---
```

#### 커버 이미지 SEO 최적화

커버 이미지는 Open Graph와 Twitter Cards에 사용되므로 다음을 권장합니다:

- **권장 크기**: 1200x630px (Open Graph 표준)
- **최소 크기**: 600x315px
- **파일 형식**: JPG, PNG, WebP
- **파일 크기**: 1MB 이하 권장
- **`alt` 텍스트**: 이미지 설명을 반드시 작성 (접근성 및 SEO)

### 3. 포스트 내용 작성

Markdown 문법을 사용하여 포스트 내용을 작성합니다:

```markdown
# 제목

## 소제목

일반 텍스트 내용입니다.

### 이미지 삽입

![이미지 설명](images/image-name.jpg)

### 링크

[HyperAccel 홈페이지](https://hyperaccel.ai/)
```

### 코드 블록

    ```python
    def hello_world():
        print("Hello, World!")
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
│   ├── about/
│   │   ├── index.md      # About 페이지 (한국어)
│   │   └── index.en.md   # About 페이지 (영어)
│   ├── authors/
│   │   └── Minho Park/
│   │       ├── _index.md    # Author 프로필 (한국어)
│   │       └── _index.en.md # Author 프로필 (영어)
│   └── posts/            # 블로그 포스트들
│       └── 포스트-제목/
│           ├── index.md     # 포스트 내용 (한국어)
│           ├── index.en.md  # 포스트 내용 (영어)
│           └── images/      # 포스트 이미지들
├── archetypes/
│   └── posts.md         # 포스트 템플릿
├── assets/
│   └── images/          # 전역 이미지들
├── i18n/
│   ├── ko.yaml          # 한국어 번역 파일
│   └── en.yaml          # 영어 번역 파일
├── themes/
│   └── PaperMod/        # Hugo 테마
├── hugo.yaml           # Hugo 설정 파일
└── README.md           # 이 파일
```

### 다국어 파일 구조 요약

**포스트 (Posts):**
- `content/posts/포스트-제목/index.md` (한국어)
- `content/posts/포스트-제목/index.en.md` (영어)

**작성자 (Authors):**
- `content/authors/작성자명/_index.md` (한국어)
- `content/authors/작성자명/_index.en.md` (영어)

**About 페이지:**
- `content/about/index.md` (한국어)
- `content/about/index.en.md` (영어)

### About 페이지 작성 방법

About 페이지도 다국어 버전을 모두 작성해야 합니다:

```bash
# About 페이지 생성
touch content/about/index.md
touch content/about/index.en.md
```

**예시:**
```markdown
# content/about/index.md (한국어)
---
date: '2025-01-15T10:00:00+09:00'
title: 'About'
---

# HyperAccel

HyperAccel에 대한 소개입니다.
```

```markdown
# content/about/index.en.md (영어)
---
date: '2025-01-15T10:00:00+09:00'
title: 'About'
---

# HyperAccel

Introduction to HyperAccel.
```

## 🎨 포스트 작성 팁

### 1. 이미지 최적화

- 이미지는 `content/posts/포스트-제목/images/` 폴더에 저장
- 권장 이미지 크기: 1200x630px (소셜 미디어 최적화)
- 파일 형식: JPG, PNG, WebP

### 2. 태그 및 카테고리

- **태그**: 포스트의 세부 주제 (예: "hugo", "blog", "tech")
- **카테고리**: 포스트의 주요 분류 (예: "Tech", "Tutorial", "News")

### 3. 다국어 작성 체크리스트

새 포스트 작성 시 확인 사항:

- [ ] 기본 버전 (`index.md` 또는 `index.ko.md`) 작성
- [ ] 영어 버전 (`index.en.md`) 작성
- [ ] 두 파일이 같은 slug를 사용하는지 확인
- [ ] 각 언어별로 제목과 내용이 적절히 번역되었는지 확인
- [ ] 메타데이터(authors, tags, categories 등)가 일관성 있게 설정되었는지 확인


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

### 리눅스 환경에서의 Hugo 버전 문제
`apt` 등 일부 Linux 패키지 매니저로 설치한 Hugo 버전(`v0.92.2`)이 낮아 `hugo server` 실행 시 오류가 발생할 수 있습니다.
이 문제를 해결하려면, `snap`을 사용하거나 [Hugo Releases](https://github.com/gohugoio/hugo/releases)에서 최신 바이너리를 직접 설치하는 것을 권장합니다.
이 레포지토리는 `v0.125.4` 이상의 Hugo 버전에 최적화되어 있습니다.

## 📚 추가 자료

- [Hugo 공식 문서](https://gohugo.io/documentation/)
- [PaperMod 테마 문서](https://github.com/adityatelange/hugo-PaperMod)
- [Markdown 가이드](https://www.markdownguide.org/)

---

