# 디자인 시안 (프로토타입)

각 시안은 루트 `layouts/`·`assets/` 위에 오버레이로 얹히는 Hugo 설정입니다.
worktree 없이 같은 작업 트리에서 포트만 다르게 띄웁니다.

| 시안 | 컨셉 | 실행 | 포트 |
|---|---|---|---|
| 현재 | PaperMod + 2열 카드 | `hugo server -p 1313` | 1313 |
| A | 매거진형: 히어로 + 카테고리 칩 + 3열 카드 + 시리즈 + 아카이브. 세리프 헤드라인 | `hugo server --config hugo.yaml,design/a/hugo.yaml -p 1314` | 1314 |
| B | 엔지니어링 인덱스형: 사이드바 필터(카테고리·시리즈·작성자) + 연도별 밀도 높은 목록. 모노스페이스 메타 | `hugo server --config hugo.yaml,design/b/hugo.yaml -p 1315` | 1315 |
| C | 트랙형: 카테고리별 색상 선반(가로 스크롤) + 연재 시리즈 타일. 굵은 타이포 | `hugo server --config hugo.yaml,design/c/hugo.yaml -p 1316` | 1316 |

`design/compare.html`을 브라우저로 열면 4개를 한 화면에서 비교할 수 있습니다 (서버가 모두 떠 있어야 함).

## 구조

```
design/<x>/
  hugo.yaml                      # module.mounts 오버레이 설정
  layouts/index.html             # 홈
  layouts/_default/list.html     # 카테고리·태그·시리즈·작성자 목록
  layouts/partials/header.html   # 상단 내비게이션
  layouts/partials/extend_head.html  # 루트 것 + 웹폰트
  layouts/partials/d/*.html      # 카드·커버·바이라인 등 시안 전용 partial
  assets/css/extended/design-<x>.css
```

글 상세 페이지(single)는 세 시안 모두 아직 PaperMod 기본을 그대로 씁니다. 폰트만 바뀝니다.
시안이 확정되면 해당 디렉터리 내용을 루트 `layouts/`·`assets/`로 옮기고 `design/`은 삭제합니다.

## 웹폰트

- A: Pretendard(본문) + Noto Serif KR(제목)
- B: Pretendard + JetBrains Mono(메타)
- C: Pretendard

모두 CDN 링크입니다. 확정 후 self-host 여부를 결정합니다.
