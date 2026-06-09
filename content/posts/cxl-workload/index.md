---
date: '2026-06-16T10:00:00+09:00'
draft: true
title: 'AI 시대의 필수 소비재, 메모리 이해하기 5편: CXL이 사용되는 Workload는 어디일까?'
cover:
  image: "01-cxl-workload-cover.webp"  # [작성 예정] 커버 이미지
  alt: "CXL이 LLM 서빙에서 채우는 자리 - GPU HBM 밖으로 밀려난 KV cache, CPU 옆 메모리 풀, hot/warm/cold tiering"
  caption: "CXL이 실제 워크로드에서 자리잡는 곳"
  relative: true
authors: [Seungbin Shin]
tags: ["CXL", "Compute Express Link", "memory", "memory pooling", "KV cache", "tiering", "VM consolidation", "LLM Inference", "CMM", "SOCAMM", "eSSD"]
series: ["AI 시대의 필수 소비재, 메모리 이해하기"]
series_idx: 5
categories: ["AI hardware", "Semiconductor"]
summary: "CXL이 무엇인지는 4편에서 살펴봤습니다. 그렇다면 CXL은 실제 LLM 서빙과 데이터센터 워크로드의 어디에 쓰일까요? KV cache offload, 메모리 풀링을 통한 VM 통합, hot/warm/cold tiering이라는 세 가지 활용 사례로 CXL이 잘 맞는 워크로드의 조건을 짚고, 마지막으로 SOCAMM2·eSSD까지 더해 메모리 계층 피라미드를 완성하며 시리즈를 닫습니다."
description: "CXL의 실전 활용 사례 — LLM 추론의 KV cache offload, 메모리 풀링 기반 VM consolidation, hot/warm/cold 메모리 tiering을 분석하고, 메모리 3사의 CMM 라인업이 각 활용처에 어떻게 자리잡는지 살펴봅니다. 시리즈를 닫으며 SOCAMM2와 eSSD가 메모리 계층의 어디를 채우는지도 함께 정리합니다."
comments: true
keywords: [
  "CXL", "Compute Express Link", "KV cache offload", "메모리 풀링", "memory pooling",
  "VM consolidation", "메모리 tiering", "hot cold tiering", "CMM",
  "SOCAMM", "SOCAMM2", "eSSD", "메모리 계층",
  "LLM 추론", "삼성", "SK하이닉스", "마이크론", "AI 메모리"
]
---

> 이 글은 **AI 시대의 필수 소비재, 메모리 이해하기** 시리즈의 5편입니다.
> [1편](https://hyper-accel.github.io/posts/what-is-hbf/), [2편](https://hyper-accel.github.io/posts/hbf-workload/), [3편](https://hyper-accel.github.io/posts/hbf-challenge/) 에서는 GPU 옆 메모리 계층의 빈 자리를 채우는 **High Bandwidth Flash(HBF)** 를 다뤘고,
> [4편](https://hyper-accel.github.io/posts/what-is-cxl/) 에서는 시점을 시스템 레벨로 옮겨 **Compute Express Link(CXL)** 이 *무엇인지* 살펴봤습니다.
> 이번 5편에서는 그 CXL이 *실제 워크로드에서 어떻게 쓰이는지*를 살펴봅니다.

## 들어가며

안녕하세요, HyperAccel에서 RTL Designer로 재직 중인 신승빈입니다.

지난 4편에서 우리는 CXL이라는 인터페이스의 정체를 뜯어봤습니다. DDR과 PCIe 사이의 빈 자리, 세 가지 sub-protocol(CXL.io / CXL.cache / CXL.mem), Type 1·2·3 디바이스, 그리고 메모리 3사의 CMM 제품군까지요.

그런데 4편을 마무리하면서 저는 정작 가장 궁금한 질문을 다음 편으로 미뤄 뒀습니다.

> **CXL이 실제 LLM 서빙 워크로드에서 어떻게 쓰이고, 어떤 워크로드에 잘 맞는가?**

생각해 보면 HBF도 똑같은 흐름이었습니다. 1편에서 "HBF가 무엇인가"를 다룬 뒤, 2편에서 "그래서 HBF는 어떤 workload에 쓸 수 있는가"를 찾아 나섰죠. CXL도 같은 순서를 밟을 차례입니다. 도구의 생김새를 알았으니, 이제 그 도구가 실제로 손에 잡히는 자리를 찾아볼 차례입니다.

이번 편의 출발점은 4편에서 정리한 CXL의 **두 가지 본질적 성질** 입니다.

- **장점**: 일관성 있는(coherent) 큰 메모리를, 시스템 외부로 확장해 여러 호스트가 나눠 쓸 수 있다.
- **대가**: DDR 직결 메모리보다 **2-3배 느리다**(약 170-300 ns). 이른바 latency tax.

이 둘은 동전의 양면입니다. 그래서 "CXL이 어디에 쓰이는가"라는 질문은 결국 **"이 latency tax를 감당하고도 남을 만큼, 용량과 풀링이 절실한 워크로드는 무엇인가?"** 로 좁혀집니다.

이 글에서는 그런 후보를 세 가지 활용 사례 — **① KV cache offload, ② 메모리 풀링을 통한 VM 통합, ③ hot/warm/cold tiering** — 로 나눠 살펴보고, 마지막에 메모리 3사의 CMM 라인업이 각 활용처에 어떻게 자리잡는지를 4편의 제품군 분류와 이어 보겠습니다.

이 포스팅의 내용은 제가 개인적으로 공부하고, 경험한 내용을 바탕으로 작성되었습니다.
오류가 있다면 언제든지 댓글로 알려주세요.

---

## 활용 사례 ① — KV cache: GPU 밖으로 밀려나는 메모리

![작성 예정: GPU HBM에 다 담기지 못한 KV cache가 CXL 메모리 풀로 내려가는 계층 그림](02-kv-cache-offload.webp)

결론부터 말하면, **CXL이 LLM 서빙에서 가장 먼저 노리는 자리는 KV cache** 입니다.

### 왜 KV cache가 문제인가

LLM 추론에서 모델은 이전까지 생성한 모든 토큰의 Key/Value 벡터를 저장해 두고 재사용합니다. 이 **Key-Value(KV) cache** 는 시퀀스가 길어질수록, 그리고 동시 사용자가 많아질수록 선형으로 불어납니다.

[작성 예정: KV cache 크기 산식과 예시 — (레이어 수 × 헤드 수 × head_dim × 2 × 시퀀스 길이 × batch × dtype) 정도로 풀고, 긴 컨텍스트/멀티턴에서 수십 GB~수백 GB로 커지는 구체 수치 한두 개. 2편에서 이미 다룬 부분이 있으면 중복 피하고 링크로 연결.]

문제는 이 KV cache가 가장 비싼 메모리인 **GPU의 HBM** 을 잡아먹는다는 점입니다. HBM 용량은 한정적인데, KV cache가 차지하는 만큼 실제로 동시에 처리할 수 있는 요청 수(batch)가 줄어듭니다.

### 기존 방식의 한계

그래서 업계는 이미 KV cache를 GPU 밖으로 내리는 시도를 하고 있습니다. 흔한 방식은 host DRAM이나 NVMe SSD에 KV cache를 offload 했다가 필요할 때 다시 올리는 것입니다.

그런데 이 경로는 4편에서 본 **PCIe의 한계** 를 그대로 물려받습니다.

- 일관성이 없어, OS가 명시적으로 데이터를 복사해(memcpy 등) 올렸다 내렸다 해야 합니다.
- transaction 단위가 거칠어, 캐시 라인 단위의 fine-grained access가 어렵습니다.

즉 "필요한 KV 블록만 살짝 참조"하는 게 아니라, "블록 통째로 복사"가 기본이 됩니다.

### CXL이 바꾸는 지점

CXL 메모리(Type 3)는 이 그림을 바꿉니다. KV cache를 담아 둔 메모리가 **호스트의 물리 주소 공간 안에 일관성 있게 들어와 있어**, GPU/호스트가 일반적인 load/store로 직접 접근할 수 있습니다.

[작성 예정: 여기서 핵심 논지를 분명히. CXL이 주는 이득을 (a) 용량 — HBM보다 훨씬 큰 KV 풀, (b) 접근 방식 — 명시적 복사 대신 coherent load/store, (c) 위치 — SSD보다 한 tier 가까움, 으로 정리. 단, GPU가 CXL.mem을 직접 타는지 / CPU를 경유하는지의 경로 구분은 [확인 필요]. 과장 금지 — latency tax 때문에 "핫한 KV는 여전히 HBM, 식어가는 KV가 CXL"이라는 위치 설정이 정확.]

> [확인 필요] CXL KV cache offload의 공개된 사례·벤치마크(예: vendor 데모, 논문, 오픈소스 추론 엔진의 CXL backend)가 있으면 1-2개 인용. 없으면 "아직 초기 단계"로 정직하게 서술.

---

## 활용 사례 ② — 메모리 풀링과 VM 통합

![작성 예정: 노드마다 stranded된 메모리 vs CXL 풀에서 동적 할당받는 그림](03-memory-pooling-vm.webp)

두 번째 자리는 LLM과 직접 관련이 없는, 그러나 데이터센터 경제성 측면에서 가장 즉각적인 효과를 내는 곳입니다. 바로 **메모리 풀링** 입니다.

### Stranded memory 문제

4편에서 잠깐 언급했듯, 데이터센터의 메모리 평균 활용률은 **40-50%** 수준입니다. 어떤 노드는 메모리가 모자라 작업을 못 받고, 바로 옆 노드는 절반 이상이 놀고 있는 상황이 흔합니다.

특히 한 서버에 여러 **Virtual Machine(VM)** 을 얹는 클라우드 환경에서 이 문제가 두드러집니다. CPU 코어는 남는데 메모리가 모자라서(혹은 그 반대라서) VM을 더 못 올리는, 이른바 **stranded memory** 가 발생합니다.

### CXL 풀링이 푸는 방식

4편에서 본 CXL 2.0의 풀링이 정확히 이 문제를 겨냥합니다. 거대한 메모리 디바이스를 **Multi-Logical Device(MLD)** 로 쪼개고, **Fabric Manager(FM)** 가 노드별 수요에 맞춰 chunk를 동적으로 배정합니다.

핵심은 4편에서 강조한 대로 **동시 공유가 아니라 동적 할당** 이라는 점입니다(호텔 객실 비유를 떠올려 주세요). 한 chunk는 한 시점에 한 호스트만 소유하므로 일관성 충돌이 없고, 그래서 구현이 단순하면서도 효과가 큽니다.

[작성 예정: VM 통합 관점에서의 이득을 구체화. (a) 노드마다 최악을 가정해 메모리를 과다 구매하던 관행 → 풀에서 빌려쓰기로 TCO 절감, (b) VM live migration·재배치와의 시너지. 삼성 CMM-B(Box) 같은 풀링 어플라이언스가 여기에 직접 대응한다는 점 연결.]

> [확인 필요] 메모리 풀링의 절감 효과를 보여 주는 대표 레퍼런스(예: Microsoft Azure "Pond" 류의 연구에서 보고된 메모리 절감률/stranding 통계). 수치 인용 전 출처 검증 필수 — 기억에 의존하지 말 것.

---

## 활용 사례 ③ — hot / warm / cold tiering

![작성 예정: 가까운 DDR(hot) - 먼 CXL(warm/cold) 2-tier 구성과 페이지 이동 그림](04-memory-tiering.webp)

세 번째는 앞의 두 사례를 관통하는, 더 일반적인 운영 모델입니다. CXL 메모리를 메인 메모리의 **대체** 가 아니라 **한 칸 아래 계층** 으로 두는 **tiering** 입니다.

### 왜 tiering인가

CXL 메모리는 DDR보다 2-3배 느립니다. 그러니 모든 데이터를 CXL에 두는 건 손해입니다. 대신 데이터를 온도로 나눕니다.

- **hot**: 자주 접근하는 데이터 → 가까운 DDR
- **warm / cold**: 가끔 접근하거나 용량만 차지하는 데이터 → 한 단계 먼 CXL

CPU 입장에서 CXL 메모리는 "조금 느린 **Non-Uniform Memory Access(NUMA)** 노드"처럼 보입니다. 그래서 OS와 런타임이 어떤 페이지를 어느 tier에 둘지를 관리하게 됩니다.

### 자동 tiering vs 명시적 배치

여기서 4편 말미에 적었던 관찰이 다시 등장합니다.

- 범용 워크로드라면 OS의 자동 tiering(hot/cold page tracking, transparent page migration)에 맡기는 편이 편합니다. Linux 커널이 이 방향으로 빠르게 정비 중입니다.
- 반면 **LLM 추론처럼 메모리 접근 패턴이 결정론적인 워크로드** 라면, OS의 추측에 맡기기보다 애플리케이션이 직접 "이 데이터는 DDR, 저 KV 블록은 CXL"로 배치하는 편이 더 효율적입니다.

[작성 예정: 이 절을 ①·② 사례와 묶어 마무리. KV cache offload는 결국 "KV의 온도에 따른 tiering"의 특수한 경우이고, VM 풀링은 "노드 사이의 tiering"이라는 식으로 세 사례를 하나의 그림으로 수렴시키면 글의 응집력이 올라감. 가속기 설계자 관점에서 "결정론적 접근 패턴을 가진 추론이 tiering에 유리하다"는 한 줄을 본인 경험과 연결해도 좋음.]

---

## 그래서 어떤 워크로드에 잘 맞는가

![작성 예정(선택): CXL이 잘 맞는 조건 / 안 맞는 조건 2열 정리 그림 또는 표]

세 사례를 관통하는 공통 조건을 뽑아 보면, CXL이 빛나는 워크로드는 대략 이렇습니다.

- **용량이 병목** 인 워크로드 (latency보다 capacity가 아쉬운 경우)
- **latency에 관대** 한 데이터를 다루는 워크로드 (식은 데이터, 큰 working set)
- **접근 패턴이 예측 가능** 해서 명시적 배치가 가능한 워크로드

반대로 **매 접근이 critical path에 있는 핫 데이터**(예: attention 연산이 매 스텝 두드리는 활성 KV, weight)는 여전히 HBM/DDR의 자리입니다. CXL은 그 자리를 **대체** 하는 게 아니라, 그 **아래 칸을 넓혀** 주는 기술이라는 점이 이 글의 핵심입니다.

[작성 예정: HBF(2편)와의 한 줄 비교로 시리즈를 묶기. HBF는 'GPU 옆'에서 용량을 늘리고, CXL은 'CPU 옆 / 시스템 레벨'에서 용량을 늘린다. 둘 다 "느리지만 큰" 계층을 비싼 메모리 아래에 까는 같은 철학의 다른 구현. → 시리즈 전체를 관통하는 메시지로 자연스럽게 연결.]

---

## 메모리 3사의 CMM은 이 활용처에 어떻게 자리잡는가

4편에서 메모리 3사의 CMM 라인업을 **1차 라인(정직한 메모리 확장)** 과 **2차 라인(풀링·연산 통합)** 으로 나눴습니다. 이번 글의 세 활용 사례에 그 제품군을 다시 얹어 보면 그림이 또렷해집니다.

| 활용 사례 | 맞는 CMM 라인 | 대표 제품 |
|---|---|---|
| KV cache offload / tiering 2번째 칸 | 1차 라인 (단순 용량 확장) | 삼성 CMM-D, SK하이닉스 CMM-DDR5, 마이크론 CZ120/CZ122 |
| 메모리 풀링 / VM 통합 | 2차 라인 (풀링 박스) | 삼성 CMM-B |
| 데이터 옆 연산 (RAG, KV 압축 등) | 2차 라인 (연산 통합 / NMP·PIM) | SK하이닉스 CMM-Ax, 삼성 CXL-PNM |

[작성 예정: 표 아래에 한두 문단. (a) 1차 라인이 KV cache·tiering이라는 '가장 큰 즉시 시장'을 노린다는 점, (b) 2편에서 다룬 HBF + HAVEN(데이터 옆 search) 발상이 CXL 영역에서는 CMM-Ax 같은 NMP 모듈로 다시 나타난다는, 4편에서 이미 깔아 둔 연결을 한 번 더 회수, (c) 본인(가속기 설계자) 관점에서 어떤 라인이 LPU/추론 가속기와 가장 잘 붙을지에 대한 짧은 코멘트.]

---

## 다시 피라미드로 — 아직 비어있는 자리들

이번 시리즈는 1편에서 그린 한 장의 그림에서 출발했습니다. SRAM → DRAM → HBM → HBF → SSD로 이어지는 **메모리 계층 피라미드** 죠. 지금까지 우리는 그 피라미드에서 두 개의 빈 자리를 채웠습니다.

- **HBF** (1-3편): GPU 옆, HBM과 SSD 사이의 '용량형' 자리
- **CXL** (4-5편): GPU 바깥, CPU 옆 / 시스템 레벨의 '확장형' 자리

그런데 이 피라미드는 지금도 양 끝에서 동시에 움직이고 있습니다. 시리즈를 닫기 전에, 앞으로 눈여겨볼 두 조각을 짧게만 짚어 두겠습니다. 각각은 그 자체로 한 편을 쓸 만한 주제지만, 여기서는 깊이 들어가기보다 **"피라미드의 어디를 건드리는가"** 라는 위치만 잡아 두려고 합니다.

### SOCAMM2 — CPU 옆 메인 메모리, 그 형태가 바뀐다

[작성 예정 / 확인 필요]
- **SOCAMM(Small Outline Compression Attached Memory Module)** 이 무엇인지: LPDDR 기반의 착탈식(modular) 메모리 폼팩터. NVIDIA가 AI 서버·superchip을 위해 밀고 있는 방향이고, SOCAMM2는 그 2세대. (구체 스펙·세대 차이는 다음 단계 조사.)
- **피라미드에서의 위치**: CXL이 'DDR 아래 칸'을 넓혔다면, SOCAMM2는 'DDR 그 칸 자체'의 폼팩터와 DRAM 종류를 바꾸는 시도다. RDIMM/DDR5 → 착탈식 LPDDR 모듈로 가면서 전력·밀도·대역폭의 trade-off가 달라진다.
- **연결고리**: 3편에서 HyperAccel이 LPDDR과 독자적 하드웨어 최적화로 메모리 문제를 푼다고 언급했는데, SOCAMM2는 그 LPDDR이 서버 메인 메모리 자리로까지 올라오는 흐름. 가속기 설계자 관점에서 의미 있는 변화.
- 메모리 3사 모두 참여 중. (제품·로드맵 수치는 다음 단계 조사.)

### eSSD — 피라미드의 바닥이 위로 올라온다

[작성 예정 / 확인 필요]
- **enterprise SSD(eSSD)**: 피라미드의 가장 아래 칸인 스토리지. AI 시대에 이 바닥이 빠르게 두꺼워지고(초고용량 QLC) 위로 당겨지고 있다.
- **원을 닫는 연결**: HBF가 바로 이 NAND/HBM 경계에서 태어난 기술이라는 점에서, eSSD는 시리즈의 출발점(1편 HBF)과 다시 만난다. 피라미드의 꼭대기에서 시작해 바닥으로 돌아오는 셈.
- **AI 데이터센터에서의 역할**: 모델 weight·체크포인트·데이터셋 저장, 그리고 KV cache의 가장 차가운 tier. (용량·대역폭 수치는 다음 단계 조사.)

### 한 장으로 다시 보기

[작성 예정: 1편의 피라미드 그림에 HBF · CXL · SOCAMM2 · eSSD를 모두 얹은 '완성본' 다이어그램 한 장으로 시리즈를 시각적으로 닫기. — 이미지 TODO]

---

## 마무리 — 메모리 이해하기 시리즈를 닫으며

이번 글에서 살펴본 5편의 내용을 정리하면 이렇습니다.

- **세 활용 사례**: KV cache offload / 메모리 풀링 기반 VM 통합 / hot·warm·cold tiering.
- **공통 조건**: 용량이 병목이고, latency에 관대하며, 접근 패턴이 예측 가능한 워크로드.
- **CXL의 자리**: 비싼 메모리를 *대체* 하는 게 아니라 그 *아래 칸을 넓히는* 계층.
- **CMM 매핑**: 1차 라인 → KV·tiering, 2차 풀링 박스 → VM 통합, 2차 NMP → 데이터 옆 연산.

[작성 예정: 시리즈 전체 회고 한두 문단. "비싼 메모리 아래에 '느리지만 큰' 계층을 까는" 같은 흐름이 HBF · CXL · SOCAMM2 · eSSD를 관통한다는 메시지로 5편의 시리즈를 닫기. 함께 읽어 주신 독자와 시리즈를 채워 준 공동 저자(Jaewon Lim)에게 감사, 앞으로의 변화를 함께 지켜보자는 톤으로 마무리.]

---

## 추신

저는 HyperAccel에서 LLM 가속 ASIC 칩 출시를 위해 RTL을 설계하고 있습니다.
메모리 계층을 GPU 옆에서 GPU 바깥, 시스템 레벨까지 확장해 보니 가속기 설계자가 풀어야 할 문제도 한층 다양해집니다.
이 시리즈를 통해 메모리 기술의 흐름을 함께 이해하고, 앞으로의 변화를 함께 지켜볼 수 있으면 좋겠습니다.

HyperAccel은 HW, SW, AI를 모두 다루는 회사로, 전 방면에 걸쳐 뛰어난 인재들이 모여 있습니다.
폭넓은 지식을 깊게 배우며 함께 성장하고 싶으신 분들은 언제든지 지원해 주세요!

**채용 사이트**: https://hyperaccel.career.greetinghr.com/ko/guide

## Reference

<!-- [작성 예정] 본문에서 실제 인용한 출처만 남기고 정리. 후보: -->
- [Compute Express Link Consortium — Specifications](https://www.computeexpresslink.org/)
- [Linux Kernel CXL / Memory Tiering Documentation](https://docs.kernel.org/driver-api/cxl/index.html)
- [Samsung — CXL Memory Module (CMM-D / CMM-B)](https://semiconductor.samsung.com/news-events/tech-blog/)
- [SK hynix CMM-DDR5 / CMM-Ax Product Briefs](https://news.skhynix.com/)
- [Micron CZ120 / CZ122 CXL Memory Expansion Module](https://www.micron.com/products/memory/cxl-memory)
<!-- [확인 필요] KV cache offload 사례, Azure Pond류 풀링 연구 등 본문에서 인용 시 정식 서지정보로 추가 -->
