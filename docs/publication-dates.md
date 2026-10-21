# 최초 발행 날짜 자동화

## 정책

- 새 글의 `date`는 최초 배포용 Hugo 빌드 직전의 한국 시각(`+09:00`)으로 설정합니다. 실제 Pages 배포 완료 시각은 아닙니다.
- 같은 번들의 `index.md` 또는 `index.ko.md`와 `index.en.md`는 동시에 처음 발행하면 동일한 시각을 사용합니다.
- 이미 발행된 글의 날짜는 내용 핫픽스, 사이트 리팩토링, 수동 재배포로 변경하지 않습니다.
- 나중에 추가하는 번역은 원문의 발행 시각을 사용합니다.
- 기존 글은 `data/publications.json`에 기존 날짜를 등록했습니다. 기존 한·영 날짜가 달라도 각 날짜를 그대로 보존합니다.
- `publishDate`, `lastmod`는 자동 수정하지 않습니다. `draft: true`, 미래의 명시적 `publishDate`, 이미 지난 `expiryDate`는 발행 대상에서 제외합니다. 새 글의 `date` 자체는 예약 발행 설정으로 취급하지 않습니다.

## 배포 흐름

1. 빌드는 최신 `main`을 체크아웃합니다. 앞선 실행에서 발행 후 기록에 실패했으면 새 배포를 중단합니다.
2. `scripts/publication_dates.py prepare`가 발행 기록과 글을 비교합니다. 신규 글에 날짜와 `publication_id`를 설정하고, 날짜 변경 내역을 artifact `publication-plan`에 저장합니다.
3. 날짜가 반영된 파일로 Hugo를 빌드하고 Pages에 배포합니다.
4. 배포가 성공하면 `record-publication` 작업이 최신 `main`에 날짜 필드와 발행 기록만 반영합니다. 배포 중 추가된 핫픽스 본문은 덮어쓰지 않습니다.
5. `github-actions[bot]`이 일반 fast-forward push로 기록을 커밋합니다. 경쟁 push에는 최신 `main` 기준으로 최대 세 번 재시도하며, force push는 하지 않습니다. 변경이 없으면 커밋도 없습니다.

workflow 전체는 동일한 concurrency group으로 직렬화합니다. 기록 커밋은 `GITHUB_TOKEN`을 사용하므로 다시 push 배포를 발생시키지 않습니다.

## 이름 변경과 ID

기존 글과 새로 발행하는 글 모두 `publication_id`를 사용합니다. 기존 글에는 현재 폴더명을 ID로 추가하되 날짜·본문은 보존했습니다. 폴더를 옮겨도 이 값은 유지하고, 한·영 파일에는 같은 값을 사용합니다. 서로 다른 글에 같은 ID를 사용하면 빌드가 실패합니다. 예를 들어 `old-slug`를 `new-slug`로 변경해도 ID는 그대로 유지합니다:

```yaml
publication_id: old-slug
```

발행 기록은 글을 삭제해도 지우지 않습니다. 같은 ID로 복원하면 기존 발행일을 유지합니다. 독립된 새 글은 새 ID/slug를 사용하세요.

Front matter는 블록 형태의 YAML 매핑을 사용합니다. 따옴표 키와 다중행 날짜 값은 지원하며, 최상위 flow mapping(`{...}`), 중복 키, YAML merge 키·anchor·alias는 파일을 수정하기 전에 오류로 거부합니다. 수정 결과도 YAML로 재검증합니다.

## 실패 복구와 저장소 권한

- 빌드 또는 Pages 배포가 실패하면 소스의 날짜와 발행 기록은 바뀌지 않습니다.
- Pages 배포는 성공했지만 기록 커밋이 실패하면, 권한 또는 충돌을 해결한 뒤 **그 실행의 Re-run failed jobs**를 선택합니다. artifact의 같은 날짜를 재사용합니다. Re-run all jobs로 날짜를 새로 계산하지 마세요.
- 이 상태에서는 다음 빌드가 복구 확인 단계에서 실패해, 같은 글의 최초 발행일을 새 시각으로 덮어쓰지 못하게 합니다. API 조회가 실패해도 배포를 진행하지 않습니다.
- 기록 작업에는 `contents: write`가 필요합니다. 저장소/조직 정책과 `main` 브랜치 규칙이 `GITHUB_TOKEN`의 자동 커밋을 허용해야 합니다. 보호 규칙을 우회하거나 별도 PAT를 추가하지 않습니다.
- 복구 artifact는 90일 보관합니다. artifact가 만료되거나 실행 기록이 삭제된 경우, 실제 최초 발행 시각을 확인해 날짜와 발행 기록을 수동 복구한 뒤 새 배포를 진행해야 합니다.
- 발행 기록 파일을 삭제하거나 `bootstrap`을 다시 실행해 날짜를 초기화하지 마세요.

## 로컬 검증

```bash
uv run --with PyYAML==6.0.3 python -m unittest discover -s tests -p 'test_publication_dates.py' -v
actionlint .github/workflows/hugo.yml
shellcheck scripts/record_publication_dates.sh
hugo --minify
```

`prepare`는 실제 Markdown을 수정합니다. 로컬 미리보기에는 평소처럼 `hugo server`를 사용하세요. 최초 배포 시각을 지정하는 작업은 배포 workflow가 실행합니다. `bootstrap`은 자동화 도입 시 기존 글을 등록하는 일회성 명령이며 이미 수행했습니다.
