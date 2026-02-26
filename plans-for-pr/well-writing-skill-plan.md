# Well-Writing 스킬 계획서

## 📋 개요

**스킬 이름**: `well-writing`  
**목적**: HyperAccel 블로그의 마크다운 포스트 글쓰기 교정 및 품질 향상  
**주요 기능**:
1. 마크다운 포스트의 스타일 가이드 준수 확인 및 교정
2. Confluence 문서에서 이미지 다운로드 지원
3. 글쓰기 품질 검증 (가독성, 일관성, 기술적 정확성)

---

## 📁 디렉토리 구조 (Progressive Disclosure 원칙 적용)

```
well-writing/
├── SKILL.md                    # 메인 스킬 파일 (필수, lean하게 유지)
│   ├── YAML frontmatter (name, description)
│   └── 핵심 워크플로우 가이드라인만 포함
├── scripts/
│   └── download_confluence_images.py  # Confluence 이미지 다운로드 스크립트
├── references/                 # 상세 참조 문서 (필요시 로드)
│   ├── styleguide.md           # 전체 스타일 가이드 (.gemini/styleguide.md 기반)
│   └── checklist.md            # 빠른 체크리스트
└── assets/                     # 출력에 사용되는 파일 (선택적)
    └── (필요시 템플릿 파일)
```

**Progressive Disclosure 구조**:
1. **Metadata** (항상 컨텍스트): name + description (~100 words)
2. **SKILL.md body** (스킬 트리거 시): 핵심 워크플로우만 (<5k words)
3. **Bundled resources** (필요시 로드):
   - `references/`: 상세 스타일 가이드, 체크리스트
   - `scripts/`: 실행 가능한 코드

---

## 📝 파일별 상세 계획

### 1. SKILL.md (필수, Lean하게 작성)

**YAML Frontmatter** (3인칭 사용):
```yaml
name: Well-Writing
description: This skill should be used when reviewing and editing markdown blog posts for the HyperAccel technical blog. It provides style guide compliance checking, readability improvements, and Confluence image download support.
```

**주요 내용** (Imperative/Infinitive form 사용):
- **목적**: HyperAccel 블로그 마크다운 포스트의 글쓰기 교정 및 품질 향상
- **사용 시점**: 마크다운 포스트 작성/수정/검토 요청 시
- **핵심 워크플로우**:
  1. `references/styleguide.md`를 로드하여 스타일 가이드 확인
  2. Critical Issues 검사 (Bold Rendering, Acronym Usage, Capitalization)
  3. Content Quality 검사 (Readability, Technical Writing)
  4. Markdown Formatting 검사
  5. 구체적인 수정 제안 제공
  6. 필요시 `scripts/download_confluence_images.py`의 `download_confluence_images()` 함수 사용
     - 환경변수 확인 (`CONFLUENCE_EMAIL`, `CONFLUENCE_API_TOKEN`)
     - 없으면 사용자에게 인증 정보 요청
     - 함수 호출하여 이미지 다운로드

**작성 원칙**:
- **Lean하게 유지**: 핵심 워크플로우와 절차만 포함
- **상세 정보는 references/로**: 스타일 가이드 상세 내용은 `references/styleguide.md`에
- **Imperative form**: "To accomplish X, do Y" 형식 사용
- **중복 방지**: SKILL.md와 references/에 동일 정보 중복 금지

### 2. references/styleguide.md

**목적**: 상세 스타일 가이드 문서 (필요시 로드)

**내용**:
- `.gemini/styleguide.md`의 전체 내용을 기반으로 작성
- Critical Issues (Must Fix)
- Content Quality (High Priority)
- Markdown Formatting (Medium Priority)
- Frontmatter and Metadata
- Complete Examples

**사용 방법**:
- SKILL.md에서 grep 패턴 제공 (큰 파일인 경우)
- Claude가 필요시 로드하여 참조
- SKILL.md와 중복되지 않도록 주의

### 3. references/checklist.md

**목적**: 빠른 참조용 체크리스트 (필요시 로드)

**내용**:
- Critical Issues 체크리스트
- Content Quality 체크리스트
- Markdown Formatting 체크리스트
- Frontmatter 검증 체크리스트

### 4. scripts/download_confluence_images.py

**기능**:
- Confluence 페이지의 ADF 형식에서 이미지 정보 추출
- Attachment API를 통한 이미지 다운로드
- 로컬 파일명 매핑 및 저장

**개선 사항** (인증 정보 처리):
1. **환경변수 우선 확인**: `CONFLUENCE_EMAIL`, `CONFLUENCE_API_TOKEN`
2. **에이전트 요청 방식**: 환경변수가 없으면 함수가 `None`을 반환하고, Claude가 사용자에게 요청
3. **함수화**: 스킬 컨텍스트에서 쉽게 사용할 수 있도록 함수로 제공
   - `get_credentials()`: 인증 정보 가져오기 (환경변수 또는 파라미터)
   - `download_confluence_images(page_id, output_dir, email=None, api_token=None)`: 메인 함수
4. **에러 핸들링 강화**: 명확한 에러 메시지 및 대안 제시
5. **진행 상황 표시 개선**: 다운로드 진행률 표시

**인증 정보 처리 우선순위**:
1. 함수 파라미터로 전달된 값 (최우선)
2. 환경변수 (`CONFLUENCE_EMAIL`, `CONFLUENCE_API_TOKEN`)
3. 환경변수도 없으면 `None` 반환 → Claude가 사용자에게 요청

**함수 시그니처**:
```python
def get_credentials(email=None, api_token=None):
    """
    인증 정보를 가져옵니다.
    
    우선순위:
    1. 파라미터로 전달된 값
    2. 환경변수 (CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN)
    3. 없으면 (None, None) 반환 → 사용자에게 요청 필요
    
    Returns:
        tuple: (email, api_token) 또는 (None, None)
    """
    pass

def download_confluence_images(
    page_id, 
    output_dir, 
    email=None, 
    api_token=None,
    image_mapping=None
):
    """
    Confluence 페이지에서 이미지를 다운로드합니다.
    
    Args:
        page_id: Confluence 페이지 ID
        output_dir: 출력 디렉토리 (Path 객체 또는 문자열)
        email: Confluence 이메일 (선택적, 없으면 환경변수 또는 사용자 요청)
        api_token: Confluence API 토큰 (선택적, 없으면 환경변수 또는 사용자 요청)
        image_mapping: 이미지 매핑 딕셔너리 (선택적)
    
    Returns:
        dict: {'downloaded': int, 'failed': int, 'total': int}
    """
    pass
```

**사용 방법**:
- SKILL.md에서 명시: "To download images from Confluence, use `download_confluence_images()` function. If credentials are not in environment variables, request them from the user."
- Claude가 필요시:
  1. 환경변수 확인
  2. 없으면 사용자에게 이메일/API 토큰 요청
  3. 함수 호출하여 이미지 다운로드

---

## 🎯 스킬 사용 시나리오 (구체적인 예시)

### 시나리오 1: 새 포스트 작성 후 교정
```
사용자: "이 포스트를 well-writing 스킬로 검토해줘"
→ Metadata 확인 (name + description)
→ SKILL.md 로드
→ references/styleguide.md 로드 (필요시)
→ Critical Issues 검사
→ Content Quality 검사
→ Markdown Formatting 검사
→ 구체적인 수정 제안 제공
```

### 시나리오 2: Confluence에서 이미지 다운로드
```
사용자: "Confluence 페이지 332202045의 이미지를 다운로드해줘"
→ Metadata 확인
→ SKILL.md 로드
→ scripts/download_confluence_images.py 읽기
→ get_credentials() 호출하여 환경변수 확인
→ 환경변수 없으면 사용자에게 이메일/API 토큰 요청
→ download_confluence_images(page_id, output_dir, email, api_token) 호출
→ 이미지 다운로드 및 적절한 위치에 삽입
```

### 시나리오 3: 스타일 가이드 위반 수정
```
사용자: "이 문서의 약어 사용 규칙을 확인해줘"
→ Metadata 확인
→ SKILL.md 로드
→ references/styleguide.md의 약어 섹션 로드
→ 약어 사용 패턴 검사
→ 수정 제안 제공
```

### 시나리오 4: 빠른 체크리스트 확인
```
사용자: "이 포스트의 Critical Issues를 빠르게 확인해줘"
→ Metadata 확인
→ SKILL.md 로드
→ references/checklist.md 로드
→ Critical Issues 체크리스트로 빠른 검사
```

---

## 🔧 기술적 요구사항

### 의존성
- Python 3.7+
- `requests` 라이브러리 (이미지 다운로드용)
- Claude Desktop (Skills 기능 지원)

### 환경 변수 (선택적)
- `CONFLUENCE_EMAIL`: Confluence API 인증용 (없으면 사용자에게 요청)
- `CONFLUENCE_API_TOKEN`: Confluence API 인증용 (없으면 사용자에게 요청)

**인증 정보 처리**:
- 환경변수가 설정되어 있으면 자동 사용
- 환경변수가 없으면 Claude가 사용자에게 이메일과 API 토큰을 요청
- API 토큰 생성 방법 안내: Atlassian 계정 → Security → API tokens → Create API token

---

## 📊 구현 우선순위 (스킬 생성 프로세스 기반)

### Step 1: 구체적인 예시 이해 ✅
- [x] 사용 시나리오 정의
- [x] 기능 요구사항 명확화

### Step 2: 재사용 가능한 리소스 계획 ✅
- [x] scripts/ 필요성 확인 (이미지 다운로드)
- [x] references/ 필요성 확인 (스타일 가이드)
- [x] assets/ 필요성 확인 (현재는 불필요)

### Step 3: 스킬 초기화
- [ ] `init_skill.py` 스크립트 실행 (또는 수동으로 디렉토리 생성)
- [ ] 기본 디렉토리 구조 생성

### Step 4: 스킬 편집
- [ ] **references/ 구현** (우선):
  - [ ] `references/styleguide.md` 작성 (.gemini/styleguide.md 기반)
  - [ ] `references/checklist.md` 작성
- [ ] **scripts/ 구현**:
  - [ ] `scripts/download_confluence_images.py` 개선 및 이동
  - [ ] 인증 정보 처리 개선:
    - [ ] `get_credentials()` 함수 추가 (환경변수 또는 파라미터)
    - [ ] `download_confluence_images()` 메인 함수화
    - [ ] 환경변수 없을 때 사용자 요청 방식 구현
  - [ ] 스킬 컨텍스트에서 사용 가능하도록 함수화
- [ ] **SKILL.md 작성** (마지막, lean하게):
  - [ ] YAML frontmatter 작성 (3인칭)
  - [ ] 핵심 워크플로우만 포함 (imperative form)
  - [ ] references/ 및 scripts/ 참조 방법 명시
  - [ ] 인증 정보 요청 방법 명시

### Step 5: 패키징
- [ ] `package_skill.py` 실행
- [ ] 검증 통과 확인
- [ ] ZIP 파일 생성

### Step 6: 반복 개선
- [ ] 실제 포스트로 테스트
- [ ] 사용자 피드백 수집
- [ ] SKILL.md 또는 bundled resources 업데이트

---

## 🎨 스킬 활성화 조건 (description에 반영)

**description 작성 원칙**:
- 3인칭 사용: "This skill should be used when..."
- 구체적이고 명확하게
- 사용 시점을 명확히 표현

**예상 트리거 시나리오**:
1. 마크다운 파일(`.md`) 편집/작성/검토 요청
2. "교정", "검토", "스타일", "가이드", "well-writing" 등의 키워드
3. Confluence 이미지 다운로드 요청
4. 블로그 포스트 품질 개선 요청
5. 스타일 가이드 준수 확인 요청

---

## 📌 참고 자료

- `.gemini/styleguide.md`: 전체 스타일 가이드
- `.gemini/config.yaml`: Gemini 설정 (참고용)
- `content/posts/`: 실제 블로그 포스트 예시
- Claude Skills 공식 문서

---

## ✅ 다음 단계 (구현 순서)

### 즉시 실행 가능한 단계

1. **스킬 초기화**:
   - `init_skill.py` 실행 또는 수동으로 디렉토리 생성
   - `well-writing/` 폴더 및 하위 구조 생성

2. **references/ 구현** (우선순위 높음):
   - `references/styleguide.md`: `.gemini/styleguide.md` 기반으로 작성
   - `references/checklist.md`: 빠른 참조용 체크리스트 작성

3. **scripts/ 구현**:
   - `scripts/download_confluence_images.py`: 기존 스크립트 개선 및 이동
   - **인증 정보 처리 개선**:
     - `get_credentials()` 함수 추가
     - `download_confluence_images()` 메인 함수화
     - 환경변수 없을 때 사용자 요청 방식 구현
   - 스킬 컨텍스트에서 사용 가능하도록 함수화

4. **SKILL.md 작성** (마지막):
   - YAML frontmatter (3인칭, 명확한 description)
   - 핵심 워크플로우만 포함 (imperative form)
   - references/ 및 scripts/ 참조 방법 명시
   - 인증 정보 요청 방법 명시
   - **중요**: references/와 중복되지 않도록 주의

5. **패키징 및 테스트**:
   - `package_skill.py` 실행하여 검증
   - 실제 포스트로 테스트
   - 피드백 반영하여 반복 개선

### 작성 스타일 가이드

- **SKILL.md**: Imperative/Infinitive form ("To accomplish X, do Y")
- **description**: 3인칭 ("This skill should be used when...")
- **Lean principle**: SKILL.md는 핵심만, 상세는 references/
- **No duplication**: 정보는 한 곳에만 (SKILL.md 또는 references/)
- **인증 정보**: 환경변수 우선, 없으면 사용자 요청
