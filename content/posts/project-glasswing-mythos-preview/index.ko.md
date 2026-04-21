---
date: '2026-04-17T10:00:00+09:00'
draft: false
title: 'Project Glasswing: Claude Mythos Preview'
cover:
  image: "images/anthropic.jpg"
  alt: "Anthropic 브랜딩 및 Claude Mythos Preview 관련 이미지"
  caption: "Anthropic"
  relative: true
authors: [Hyunjun Park]
tags: ["Mythos", "Glasswing", "Security", "LLM", "Agents", "Anthropic"]
categories: ["Security", "AI"]
summary: ['Anthropic의 Project Glasswing과 Claude Mythos Preview를 중심으로, 모델의 사이버보안 역량이 왜 도약했는지, 벤치마크가 어떻게 바뀌었는지, 실제 방어 사례를 정리하고, 개발자가 에이전트와 소통하는 방식이 어디로 가야 하는지까지 짚습니다.']
description: 'Project Glasswing·Mythos Preview 공개의 의미, Opus 4.6 대비 정량 지표, 벤치마크 세대 전환, OpenBSD·FFmpeg·FreeBSD 사례, 방어자·개발자 인사이트를 한글로 정리합니다.'
comments: true
---

# Project Glasswing: Claude Mythos Preview

안녕하세요. HyperAccel CL(Compute Library)팀 박현준입니다.

2026년 4월 초, Anthropic은 [Project Glasswing](https://www.anthropic.com/glasswing) 이라는 산업 연대와 함께 **Claude Mythos Preview** 라는 미공개 프론티어 모델을 공개했습니다. 최신 모델 소식은 보통 “벤치마크가 올랐다” 정도로 끝나는데, 이번에는 [Frontier Red Team 블로그](https://red.anthropic.com/2026/mythos-preview/) 에서 한 달간의 내부 평가와 취약점 사례를 아주 길게 풀었습니다. Mythos Preview 수준의 코딩·추론이 기존 벤치가 가리키던 범위를 넘어서 **취약점 탐지** 와 **공격 코드 작성** 까지 한 번에 끌고 올라왔기 때문이죠. 솔직히 처음엔 단순한 마케팅 전략인가 싶었는데, 읽다 보니 이번만큼은 숫자 너머 이야기가 꽤 크다는 느낌이 들었습니다.

---

## Mythos Preview란 무엇인가

![Anthropic 브랜딩 및 Claude Mythos Preview 관련 이미지](images/anthropic.jpg)

### Project Glasswing

Glasswing은 AWS, Apple, Google, Microsoft, Linux Foundation 등이 참여한 **방어 우선(defense-first)** 협력 프로그램입니다. 핵심은 모델의 성능을 빠르게 넓게 푸는 것보다, 고위험 역량을 먼저 방어 커뮤니티에 연결해 실제 대응력을 올리는 데 있습니다. 다시 말해, 모델을 "공개한다/안 한다"의 이분법으로 보기보다, 누구에게 어떤 통제 아래 먼저 접근권을 줄 것인지까지 포함해 배포 전략을 설계한 프로젝트라고 볼 수 있습니다.
Anthropic은 Mythos Preview에 대해 **일반 공개(GA) 계획이 없다** 고 명시했습니다. 이 결정은 강한 사이버 역량이 무분별하게 확산될 때 생길 수 있는 부작용을 통제하려는 선택인 것 같습니다.

Red Team 글에 따르면 Mythos Preview는 사용자의 지시가 주어졌을 때 **주요 운영체제와 주요 웹 브라우저** 에서 **제로데이(zero-day)** , 즉 아직 공개되지 않은 취약점을 찾아내고 공격 코드까지 만들 수 있는 수준입니다. 이런 능력은 방어 효율을 크게 높일 수 있지만, 동시에 악용 속도도 끌어올릴 수 있기에 Anthropic이 제한 공개를 택한 배경이 됩니다.

### 새로운 차원의 가치를 창출하는 LLM의 등장

Mythos가 기존 모델들과 차별화되는 지점은 "정답을 얼마나 잘 맞히는가"보다 "학습되지 않은 문제를 어디까지 해결하는가"에 있습니다. 과거 모델들은 학습된 패턴을 기억하여 사람이 직접 만든 시험에 대한 점수를 높여왔다면, Mythos는 학습되지 않은 **취약점 탐지** 에서도 새로운 차원의 가치를 창출하고 있습니다.

여기서 말하는 새로운 가치는 단순히 벤치마크 점수를 높이는 데 있지 않고, 실제 운영 환경에서 오랫동안 드러나지 않았던 치명적 시스템 결함을 찾아내 방어 의사결정에 바로 연결할 수 있다는 점을 의미합니다. 그리고 이 가치는 Red Team 보고서에서 공개된 OpenBSD, FFmpeg, FreeBSD 사례처럼, 장기간 누락되어 있던 결함이 실제로 식별된 결과를 통해 증명됩니다.

---

## Mythos Preview는 무엇이 다른가

### 벤치마크의 발전

프론티어 모델이 출시될 때마다 사용되는 벤치마크는 **해당 모델의 강점이 잘 드러나는 축** 으로 조금씩 기울거나, 새 지표가 덧붙는 경향이 있습니다.

LLM 등장 이래 벤치마크의 변화를 크게 네 단계로 나누어 보면 다음과 같습니다.

1. **패턴 맞추기에 가까운 시험** — 초기 벤치마크. 짧은 지식 문제, 작은 함수 하나 고치기 정도가 가능한지 평가합니다.
2. **실제 코드베이스 단위의 코딩** — 파일 한 조각이 아니라 프로젝트 전체 문맥을 보고 문제를 푸는지 체크합니다.
3. **장기 에이전틱 실행** — 한 번의 답을 맞추는 것이 아니라 **시도·실패·재시도** 를 포함해 더 고수준의 문제를 해결할 수 있는지 확인합니다.
4. **실전 결과 중심 평가** — 공개 벤치에 없는 **제로데이** (아직 공개되지 않은 취약점)를 찾으면 “외워서 푼 것”과 구분할 수 있습니다.

이 과정에서 기존 공개 벤치는 점수가 한계에 닿으면서 **포화(saturate)** 되고, 측정은 자연스럽게 다음 질문으로 넘어갑니다. “더 큰 덩어리의 작업을 끝까지 밀어붙일 수 있는가”, “특정 도메인의 문맥을 이해하고 손댈 수 있는가”처럼 **대규모 업무** 와 **도메인에 특화된 업무** 를 얼마나 잘 처리하는지를 가리키는 쪽으로 무게중심이 옮겨갑니다.

Anthropic이 [Claude Opus 4.7](https://www.anthropic.com/news/claude-opus-4-7) 을 내놓으면서 함께 실은 평가 표에도, 코딩 에이전트·터미널·긴 맥락·도구 사용·금융·문서 등 **도메인 벤치** 가 나란히 올라와 있는 것이 그 연장선에 있습니다.

### Mythos의 벤치마크 성능

Glasswing 페이지와 Red Team 글에는 여러 벤치마크 성능 표가 실려 있습니다. 제시된 항목에서는 Mythos Preview가 Opus 4.6보다 높은 점수를 보인다고 적혀 있고, 그 중 일부만 가져왔습니다.

- **CyberGym**: Mythos Preview **83.1%**, Opus 4.6 **66.6%**
- **SWE-bench Verified**: Mythos **93.9%**, Opus 4.6 **80.8%**
- **Terminal-Bench 2.0**: Mythos **82.0%**, Opus 4.6 **65.4%**

숫자만 봐도 개선 폭이 크다는 인상은 받았지만, 저는 낯선 벤치마크보다 [Red Team 글](https://red.anthropic.com/2026/mythos-preview/) 에 담긴 구체적인 사례가 더 많이 와닿았습니다. 그 내용은 다음 장에 정리했습니다.

## 방어적 활용에 성공한 사례

### OpenBSD, TCP SACK (27년 된 취약점)

**Selective Acknowledgment(SACK)** 는 TCP에서 “중간에 빠진 조각만 다시 보내자”고 알려 주는 기능입니다. Red Team 글에 따르면, Mythos Preview는 OpenBSD가 이 기능을 처리하는 코드에서 **확인해야 할 범위의 시작과 끝을 제대로 검사하지 못하는 틈** 과, 시퀀스 번호를 비교하는 방식의 **정수 연산 오버플로** 가 겹치는 조합을 찾았습니다. 평소에는 동시에 성립하지 않아야 할 조건이 한꺼번에 참이 되면서, 커널이 잘못된 주소에 쓰기를 시도하고 **원격에서 기계가 멈추는(Denial of Service, DoS)** 상황으로 이어진다고 설명합니다.

### FFmpeg, H.264 디코더 (16년 된 취약점)

H.264 영상은 화면을 잘게 나누어 **슬라이스** 단위로 디코딩합니다. 글은 “슬라이스 번호는 32비트까지 올라갈 수 있는데, 각 블록이 어느 슬라이스에 속하는지 적어 두는 표는 16비트”라는 **자릿수가 안 맞는** 구조를 짚습니다. 표는 비어 있음을 뜻하는 값 **65535** 로 채워 두는데, 극단적으로 슬라이스를 아주 많이 넣으면 **진짜 슬라이스 번호 65535** 와 그 “비어 있음” 표기가 겹쳐 버립니다. 그러면 옆 칸을 잘못 참조해 **힙 메모리를 조금 넘겨 쓰게** 된다고 합니다. 글은 치명도를 “최고 수준은 아니고, 실제 공격 코드로 바꾸기도 어려울 것”으로 적습니다. 같은 줄은 자동 퍼저에 의해 **수백만 번** 실행되기도 했다고 덧붙입니다.

### FreeBSD NFS, **Remote Code Execution(RCE)** (17년 된 취약점)

NFS는 파일을 네트워크로 공유할 때 쓰는 서비스입니다. Red Team 글에 따르면 Mythos Preview가 **로그인 없이도** 서버에 접근해 **root** 권한을 얻는 경로를, **버그 탐지부터 공격코드 작성까지** 사람 개입 없이 끝냈다고 합니다. 핵심은 **Remote Procedure Call(RPC)** 의 **RPCSEC_GSS** 처리에서 길이 검사가 느슨해 커널 스택 오버플로가 가능했고, 이를 **Return Oriented Programming(ROP)** 으로 이어 `authorized_keys` 에 공격자 키를 추가했다는 점입니다. 

---

## 개발자: 에이전트 시대에 우리는 어떻게 일해야 하는가

![에이전트 워크플로에서 플랜 리뷰를 쓰는 모습](images/plan_review.jpg)

예시를 통해 LLM은 점점 기존 벤치마크의 점수를 높게 받는 단계를 넘어서 실제 가치를 창출하는 단계에 도달하고 있다는 점을 확인할 수 있었습니다. 에이전트의 능력이 한 단계 오를 때마다 개발자가 **직접 코드를 작성하는 일**이 줄어들고, **설계하고 검증하고 책임지는** 쪽으로 역할이 옮겨가고 있습니다. 보안 사례는 하나의 케이스일 뿐, 일상 개발도 같은 방향의 압력을 받고 있다고 느낍니다. 2달 전에 작성한 [에이전트 도입기](/posts/how-we-use-ai/) 글에서 에이전트로 코드 생산성이 오름에 따라 병목이 되는 곳은 리뷰라고 언급했었는데요, 리뷰가 바로 **검증하고 책임지는** 작업에 해당합니다. 

사람이 코드를 줄 단위로 읽는 방식은 속도에 한계가 있어서, 일부 변화가 빠른 팀에게는 `plan.md` 를 리뷰해보려는 움직임도 보이고 있습니다. 다만 이 분야는 변화 속도가 너무 빠르기에 “어떤 방식이 정답이다”라고 지금 단정하기는 어렵습니다. 제가 생각했을 때 중요한 점은 하나의 고정된 프로세스를 선언하는 것이 아니라, **모델이 다음 점프를 할 때마다** 개발자도 변화에 맞춰 유기적으로 **작업 프로세스를 갱신할 준비**를 갖추는 일이라고 생각합니다. 

저희 팀은 이미 플랜 리뷰를 적극 권장하고 있고, 앞으로 출시될 에이전트 역량에 맞춰 프롬프트, 하네스, 검증 장치를 유기적으로 바꿔 가보려고 합니다. 예를 들면 에이전트가 무한 루프나 공회전에 빠지지 않도록 가드레일 및 표지판을 설계하고, 작업마다 서로 다른 모델을 사용하고, 스스로 공격을 시도하도록 하여 보안을 강화하는 식으로 하네스를 설계하려고 합니다. 앞으로도 여러 시행착오를 겪으며 인사이트를 공유드리겠습니다.

---

## 참고 링크

- [Project Glasswing](https://www.anthropic.com/glasswing)
- [Assessing Claude Mythos Preview’s cybersecurity capabilities (Red Team)](https://red.anthropic.com/2026/mythos-preview/)
- [Claude Mythos Preview System Card (PDF)](https://cdn.sanity.io/files/4zrzovbb/website/7624816413e9b4d2e3ba620c5a5e091b98b190a5.pdf)
- [Introducing Claude Opus 4.7](https://www.anthropic.com/news/claude-opus-4-7)

---

## HyperAccel 채용 중!

ChatGPT가 출시된 지 3년 반이 지났는데요, 이순신의 스마트폰에 대해 구구절절 이야기하던 LLM은 어느덧 장기간 널리 신뢰받고 있는 프로그램들의 보안 체계까지 위협하고 있습니다. HyperAccel은 빠르게 발전하는 최신 에이전트 사용을 주저하지 않고, 최소한의 보안 아래 회사의 적극적인 지원 및 사내 스터디를 통해 적극적으로 실무에 사용하고 있습니다.

또한 에이전트가 더 많은 업무 환경에 퍼질수록 추론에 필요한 **연산·메모리·전력** 수요도 함께 커집니다. HyperAccel은 이러한 시장의 흐름에 맞춰 지속 가능한 가속 인프라를 공급하는 목표를 갖고 있습니다.

저희가 다루는 기술에 관심이 있으시다면 [HyperAccel Career](https://hyperaccel.career.greetinghr.com/ko/guide) 로 지원해 주세요. 긴 글 읽어 주셔서 감사합니다.

