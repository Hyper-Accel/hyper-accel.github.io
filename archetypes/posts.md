---
date: '{{ .Date }}'
draft: true
title: '{{ replace .File.ContentBaseName "-" " " | title }}'
cover:
  image: "<image path/url>"
  # can also paste direct link from external site
  # ex. https://i.ibb.co/K0HVPBd/paper-mod-profilemode.png
  alt: "<alt text>"
  caption: "<text>"
  relative: false # To use relative path for cover image, used in hugo Page-bundles
authors: [] # must match with content/authors
tags: []
categories: []
summary: []
comments: true
---

# Multilingual Post Guide
# 다국어 포스트 작성 가이드

## How to create multilingual posts
## 다국어 포스트 작성 방법

To create a post in both Korean and English, create two files with the same slug:

한국어와 영어로 포스트를 작성하려면, 같은 slug를 가진 두 개의 파일을 생성하세요:

### Option 1: Page Bundle (Recommended)
### 방법 1: 페이지 번들 (권장)

Create a folder and add language-specific files:
폴더를 생성하고 언어별 파일을 추가하세요:

```
content/posts/my-post/
  ├── index.ko.md  (Korean version)
  └── index.en.md  (English version)
```

### Option 2: Single Files
### 방법 2: 단일 파일

Create two files with language suffix:
언어 접미사를 가진 두 개의 파일을 생성하세요:

```
content/posts/
  ├── my-post.ko.md  (Korean version)
  └── my-post.en.md  (English version)
```

## Important Notes
## 중요 사항

- Both files should have the same slug (folder name or base filename)
- 두 파일은 같은 slug를 가져야 합니다 (폴더 이름 또는 기본 파일명)
- The title and content can be different for each language
- 제목과 내용은 각 언어별로 다를 수 있습니다
- Hugo will automatically link them as translations
- Hugo가 자동으로 번역으로 연결합니다
- URLs will be: `/ko/posts/my-post/` and `/en/posts/my-post/`
- URL은 `/ko/posts/my-post/`와 `/en/posts/my-post/`가 됩니다
