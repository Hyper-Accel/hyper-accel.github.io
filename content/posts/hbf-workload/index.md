---
date: '2026-04-29T02:00:00+09:00'
draft: false
title: 'AI 시대의 필수 소비재, 메모리 이해하기 2편: HBF의 잠재 workload 찾아보기'
cover:
  image: "01-cover.jpg"
  alt: "HBF 워크로드 커버 이미지"
  caption: "HBF의 잠재 workload 찾아보기"
  relative: true
authors: [Jaewon Lim]
tags: ["HBF", "High Bandwidth Flash", "memory", "LLM", "Inference", "CAG", "RAG", "SK Hynix", "H3"]
series: ["AI 시대의 필수 소비재, 메모리 이해하기"]
series_idx: 2
categories: ["AI hardware", "Semiconductor"]
summary: "HBF의 한계가 약점이 아닌 워크로드는 무엇일까? SK하이닉스의 H³ 아키텍처를 짚어보고, 그 너머에서 HBF가 빛날 수 있는 다른 워크로드까지 탐색합니다."
description: "HBF의 latency, endurance, power 한계가 오히려 무력화되는 read-only 워크로드를 찾고, SK하이닉스가 제안한 H³ 하이브리드 아키텍처와 CAG의 결합, 그리고 그 너머의 잠재 워크로드들을 탐색합니다."
comments: true
keywords: [
  "HBF", "High Bandwidth Flash", "LLM Inference", "CAG", "Cache-Augmented Generation",
  "RAG", "SK Hynix", "H3", "메모리 계층", "AI 메모리", "AI 가속기", "MoE", "Speculative Decoding"
]
---

> 이 글은 **AI 시대의 필수 소비재, 메모리 이해하기** 시리즈의 2편입니다.  
> [1편: HBF 이해하기](https://hyper-accel.github.io/posts/what-is-hbf/) 에서는 HBF가 무엇이고 메모리 계층의 어디에 위치하는지를 다뤘습니다.  
> 이번 편에서는 **그 한계를 안고도 HBF가 빛날 수 있는 자리는 어디인가** 를 묻고, SK하이닉스가 제안한 **H³** 아키텍처와 그 너머의 잠재 워크로드까지 살펴봅니다.

<!-- 그림 필요: 커버 이미지 (01-cover.jpg) -->

## 들어가며

안녕하세요? HyperAccel 하드웨어 검증 엔지니어 임재원입니다.

지난 1편에서는 메모리의 종류와 메모리 계층 구조의 새로운 자리를 차지하려는 **HBF(High Bandwidth Flash)**에 대해 알아보았습니다. HBF의 특징을 한 줄로 표현해보면 다음과 같습니다.

> **대역폭과 용량은 크지만, 너무 느린 메모리.**

더 정확히 말하면, HBF는 **HBM(High Bandwidth Memory)** 에 견줄 만한 대역폭에 8~16배 더 큰 용량을 얹은 메모리입니다. 단, 지연시간(latency)는 기존 SSD와 비슷한 수준으로 HBM 대비 약 100배 깁니다. **bandwidth와 capacity는 HBM에 비견되거나 오히려 우월한데 latency는 SSD급**, 결과적으로 어디에 끼워 넣어야 의미가 있을지 자체가 애매한 스펙입니다. 그래서 HBF가 잘 맞는 워크로드를 따로 발굴하는 과정이 필요합니다.

1편이 "HBF란 무엇인가"에 답했다면, 2편은 그 다음 질문으로 넘어갑니다.

**"HBF, 실질적으로 어떻게 쓸 수 있을까?"**

HBF는 아직 상용화 전 단계입니다. 시장과 가속기 회사 입장에서는 spec 너머의 그림. 즉, 어떤 워크로드에서 쓰일지, 그 근거가 무엇인지가 분명해져야 비로소 채택 결정이 움직입니다. 그래서 이번 편의 출발점은 이 질문입니다.

HBF 관련 workload를 조사하면서 발견한 한 가지 흥미로운 사실이 있습니다. **적절한 워크로드에 약간의 하드웨어 기법을 더하면 HBF의 약점은 숨길 수 있다는 것입니다.** 이번 편에서는 SK하이닉스가 IEEE Computer Architecture Letters 2026에 발표한 **H³** 아키텍처를 중심으로, HBF가 빛날 수 있는 자리들을 찾아봅니다.

---

## HBF의 한계, 다시 짚기

1편에서 다룬 HBF의 약점을 다시 정리하면 세 가지입니다.

**첫째, latency.** HBF는 NAND flash 셀에 패키징을 입혀 만든 메모리입니다. 셀 자체의 읽기 메커니즘이 DRAM보다 본질적으로 느려서, HBM이 수십 ns 수준에서 데이터를 읽는 동안 HBF는 약 10~20μs를 필요로 합니다. 약 100배 차이입니다. 이 격차는 패키징을 아무리 잘 해도 셀 차원의 한계라 사라지지 않습니다.

**둘째, write endurance.** NAND flash는 erase/write 사이클에 물리적 수명 제한이 있습니다. 같은 위치에 반복해서 쓰는 워크로드라면 셀이 빠르게 마모됩니다. 학습이나 빈번하게 갱신되는 데이터에는 어울리지 않습니다.

---

## 한계를 비껴가는 워크로드 조건

위 두 약점을 동시에 무력화하려면 워크로드가 아래 조건을 만족해야 합니다.

- **한 번 적재하고 오래 반복 읽기** — write endurance 무력화
- **데이터 접근이 deterministic** — 미리 알 수 있어 prefetch로 latency를 숨김

이 조건이 LLM 워크로드 어디에 들어맞을지 보려면, 가장 먼저 **학습(training)** 과 **추론(inference)** 을 비교해 볼 만합니다. 둘은 메모리 입장에서 정반대 성격을 가집니다.

**학습** 은 매 step마다 weight를 갱신합니다. backward pass에서 gradient를 계산하고 optimizer state까지 함께 update하기 때문에 메모리 위에서 "쓰기"가 끊임없이 일어납니다. write endurance에 한계가 있는 HBF에는 가장 부적합한 워크로드 — 첫 번째 조건(read-only)에서 곧바로 탈락합니다.

**추론** 은 이야기가 다릅니다. 일단 학습이 끝난 뒤의 weight는 추론 내내 **절대 갱신되지 않습니다.** Llama 3.1 405B를 FP8로 돌린다고 가정하면 weight 한 벌이 약 405GB이고, 이걸 매 batch마다 처음부터 끝까지 읽기만 합니다. **거대 + read-only.** HBF가 원하는 패턴이 정확히 여기 있습니다.

<!-- 그림 필요: 학습 vs 추론 메모리 패턴 비교 — 학습은 weight write 빈번, 추론은 read-only weight + (선택적) 공유 KV cache -->

그런데 추론에서 weight만큼 거대해질 수 있는 데이터가 하나 더 있습니다. **KV cache** 입니다. 1M, 10M context를 활용한다면 KV cache는 수백 GB ~ 수 TB까지 부풀어 오릅니다. 이걸 HBF에 올릴 수 있다면 활용 폭이 단번에 넓어집니다. 단, 일반적인 KV cache는 HBF가 가장 싫어하는 패턴이라, 어떻게 거기까지 HBF로 끌어올 수 있을지가 별도 문제입니다. 다음 절에서 본격적으로 다룹니다.

---

## CAG, RAG와 무엇이 다른가

KV cache가 HBF에 까다로운 이유는 두 가지입니다.

- **매 토큰마다 새로 쓰입니다.** decode 단계에서 출력 토큰이 하나씩 생성될 때마다 모든 layer의 KV에 새 entry가 누적됩니다. write 빈도가 무척 높습니다.
- **요청마다 값이 다릅니다.** 사용자 query가 매번 다르니, 같은 모델이라도 KV cache 내용은 매번 새로 계산됩니다. 한 요청을 위한 cache가 다른 요청에서 재사용되지 않습니다.

두 특성은 정확히 HBF가 약한 지점입니다. 잦은 write는 endurance를 깎고, 재사용되지 않는 데이터는 HBF의 거대 capacity를 살릴 명분이 없습니다. 즉, KV cache를 **단일 write × 다중 read** 형태로 바꿀 수 있다면, 비로소 HBF가 의미를 가집니다.

LLM 응답 품질을 올리는 가장 흔한 기법은 **Retrieval-Augmented Generation(RAG)** 입니다. 외부 지식 베이스(보통 vector DB)에서 질의에 관련된 문서를 검색해 prompt에 끼워 넣고, 그 위에서 답변을 생성하는 방식이죠. 매 요청마다 retrieve가 일어나고, 가져온 context로 새 KV cache를 만들어 냅니다. 여기까지는 KV cache가 여전히 per-request 단발성이라 위 두 특성을 그대로 안고 있습니다.

그런데 만약 모델이 참조해야 하는 지식이 **요청마다 크게 바뀌지 않는 거대한 공유 자료** 라면 어떨까요? 같은 매뉴얼, 같은 코드베이스, 같은 사내 문서를 매번 retrieve & 재계산하는 것은 명백히 낭비입니다.

2024년 말 발표된 한 논문(Chan et al., "Don't Do RAG", arxiv:2412.15605)은 이 낭비를 정면으로 지적하며 새로운 패턴을 제안했습니다. 바로 **Cache-Augmented Generation(CAG)** 입니다.

<!-- 그림 필요: RAG vs CAG 흐름 비교 — RAG는 매 요청마다 retrieve+compute, CAG는 사전 KV cache 1회 생성 후 재사용 -->

CAG의 작동 방식은 단순합니다.

1. 공유될 만한 거대 지식 자료를 **사전에 한 번** 모델에 통과시켜 KV cache를 만들어 둡니다.
2. 사용자 질의가 들어오면, 이 사전 KV cache를 prefix처럼 그대로 활용해 답변을 생성합니다. 같은 자료를 다시 계산하지 않습니다.
3. 여러 요청이 들어오면 같은 KV cache를 **공유** 하면서 각자의 답변만 만들어 냅니다.

RAG와 CAG를 한 줄로 비교하면 이렇습니다.

- **RAG**: retrieve + recompute every time
- **CAG**: compute once, read many times

메모리 입장에서 보는 차이는 더 극명합니다. RAG의 KV cache는 요청별로 짧고 일회용이지만, CAG의 KV cache는 **거대하고, read-only이며, 여러 요청에서 반복 접근됩니다.** 1M context면 수백 GB, 10M context면 수 TB 수준입니다.

이 메모리 프로파일을 앞 절에서 정의한 "HBF의 숨겨지는 조건"과 겹쳐 보세요.

- 거대 + read-only → endurance 문제 무력화 ✓
- 한 번 적재 후 반복 읽기 → 매번 recompute보다 amortize 가능 ✓
- layer-by-layer로 deterministic → prefetch로 latency 숨김 가능 ✓

정확히 일치합니다 — 적어도 layer-by-layer 라는 가정이 유효한 한에서요. 이 단서는 다음 편에서 다시 따져 봅니다. SK하이닉스가 H³를 정당화하는 핵심 use case로 CAG를 꼽은 이유가 여기 있습니다.

---

## SK하이닉스의 H³: HBM과 HBF의 역할 분담

SK하이닉스 연구진(Minho Ha, Euiseok Kim, Hoshik Kim)이 IEEE CAL 2026에 발표한 **H³** 의 핵심 아이디어는 한 줄로 요약됩니다.

> **HBF로 HBM을 대체하지 말고, 거대 read-only 데이터 전용 슬롯으로 옆에 추가하자.**

<!-- 그림 필요: H³ 구조도 — GPU 옆 HBM, HBM 뒤 HBF daisy-chain, HBM base die 안에 LHB (직접 그릴 것!) -->

### 물리 구조: HBM 뒤로 HBF를 daisy-chain

일반적인 GPU에서는 HBM 스택들이 인터포저 위에서 GPU와 나란히 배치되어, GPU shoreline의 한정된 공간을 모두 사용합니다. H³는 이 구조를 건드리지 않습니다. **HBM은 그대로 GPU shoreline에 직접 연결합니다.**

변화는 그 뒤에서 일어납니다. 각 HBM 스택의 base die에 **Die-to-Die(D2D)** 인터페이스를 추가해, HBM 뒤로 HBF 스택을 한 단계 더 매답니다. 마치 HBM 옆에 HBF를 daisy-chain으로 잇는 모양새입니다.

GPU 입장에서는 HBM과 HBF 모두 **통합 주소 공간(unified address space)** 안의 main memory처럼 보입니다. HBM base die 안의 address decoder & router가 들어온 요청을 HBM core로 보낼지, HBF로 hop을 한 번 더 줄지 판단합니다.

이 daisy-chain 구조의 장점은 GPU shoreline 면적을 더 쓰지 않으면서 HBM 용량의 수십 배를 추가로 끌어다 쓸 수 있다는 점입니다. SK하이닉스의 가정에 따르면 GPU당 HBM3e가 192GB / 8TB/s라면, 같은 GPU 뒤로 붙는 HBF는 GPU당 약 3TB / 8TB/s를 더해 줍니다. 약 16배의 capacity 추가입니다.

### 데이터 배치 규칙: 누가 어디에 사나

H³의 운영 철학은 데이터의 성격에 따라 두 메모리에 나눠 배치하는 것입니다.

- **HBF에 둘 것**: 모델 weight, CAG의 사전 계산 공유 KV cache — 둘 다 거대하고 추론 중 read-only
- **HBM에 둘 것**: 생성 중인 KV cache, activation, 그 밖에 자주 갱신되는 데이터

이렇게 나누면 HBF의 약점이 자연스럽게 비껴갑니다. 거대 read-only 데이터에는 endurance 문제가 발생하지 않고, batch가 큰 추론 워크로드에서는 HBF의 추가 전력이 throughput 증가로 만회됩니다.

### Latency Hiding Buffer

그래도 한 가지 문제는 남습니다. NAND 셀의 ~수십 μs latency입니다. HBM의 ns 단위 응답을 가정하고 동작하던 GPU compute pipeline이 갑자기 μs 단위 메모리를 만나면 거의 멈추게 됩니다.

SK하이닉스의 해법은 **Latency Hiding Buffer(LHB)** 입니다. HBM base die 안에 prefetch 전용 SRAM 버퍼를 통합하는 방식입니다.

작동 원리는 LLM 추론의 한 가지 특성에 기댑니다. **layer-by-layer 데이터 접근 패턴이 deterministic** 이라는 점입니다. 다음 layer에서 어떤 weight와 KV cache가 필요한지 미리 알 수 있다는 뜻이죠. 딥러닝 framework가 이 정보를 prefetch hint로 넘겨주면, LHB는 다음 layer 데이터를 미리 끌어와 두고, 현재 layer 계산이 진행되는 동안 latency를 시간적으로 숨깁니다.

LHB의 사이즈는 단순한 식으로 정해집니다.

```text
Capacity_LHB = 2 × BW_HBF × Latency_HBF
```

double buffering을 가정한 식입니다. SK하이닉스가 든 예시 숫자(BW 1 TB/s, latency 20 μs)로 계산하면 약 **40MB** 가 됩니다. 3nm SRAM 공정 기준으로 따져도 약 8mm² 정도이고, 이는 HBM base die 면적(약 121mm²)의 6.7%에 해당합니다. base die의 여유 공간 안에서 충분히 수용 가능한 오버헤드입니다.

즉 H³는 "HBM의 빈 자리(base die 면적)에 약간의 SRAM을 추가하는" 비교적 소박한 변경으로 latency 문제를 푼 셈입니다.

### 시뮬레이션 결과

좋은 아이디어인 건 알겠습니다. 그런데 실제로 얼마나 좋아질까요?

SK하이닉스 연구진은 H³ 시스템을 시뮬레이터로 평가했습니다. 워크로드는 **Llama 3.1 405B** (FP8 기준 약 405GB weight), 하드웨어는 NVIDIA **B200** GPU 8장(1M context)과 32장(10M context)을 가정했습니다. HBM3e는 GPU당 192GB / 8TB/s, HBF는 GPU당 약 24TB / 8TB/s를 추가하는 셋업입니다. 입력과 출력 길이는 각 1K로 고정했고, 나머지 capacity는 사전 계산 공유 KV cache가 차지합니다 (1M context에서 약 35%, 10M에서 약 84%).

<!-- 그림 필요: HBM-only vs H³ batch size & throughput 비교 차트 (직접 그릴 것!) -->

수치를 보기 전에 **roofline** 관점을 잠깐 짚고 갑시다. LLM 추론 decode는 본질적으로 memory-bandwidth-bound 입니다. batch가 작을 때는 GPU의 compute 자원이 놀고 메모리 bandwidth만 다 쓰는 상태죠.

batch를 키울수록 한 번 메모리에서 읽은 weight를 여러 토큰이 같이 활용해 arithmetic intensity가 올라갑니다. 그러다 어느 시점부터 compute-bound regime 으로 넘어가고, GPU의 compute 자원이 비로소 다 쓰입니다.

문제는 batch를 키우려면 그만큼 KV cache를 담을 capacity가 있어야 한다는 점입니다. **HBF의 거대 capacity가 batch 확장의 ceiling을 끌어올려 주면 GPU compute 자원을 더 알차게 쓸 수 있다는 뜻입니다.** H³의 throughput 이득이 단순한 capacity 자랑이 아니라 roofline 곡선 위에서 의미 있는 이유가 여기 있습니다.

결과를 정리하면 이렇습니다 (모두 HBM-only 대비 H³의 비율).

- **최대 batch size**: 1M context에서 약 **2.6배**, 10M context에서 약 **18.8배**
- **Throughput** (Tokens Per Second / request): 1M에서 약 **1.25배**, 10M에서 약 **6.14배**
- **Throughput per power**: 최대 약 **2.69배** (HBF가 power를 더 먹는 점을 모두 반영한 결과)

long-context로 갈수록 H³의 이득이 가파르게 커진다는 점이 한눈에 보입니다. 사전 KV cache 비중이 클수록 HBF의 거대 용량이 많이 쓰이기 때문이죠.

또 한 가지 흥미로운 결과가 있습니다. **단일 GPU로 1M context 추론이 가능했고, GPU 두 장으로 10M context 추론이 가능했습니다.** HBM-only 시스템이라면 capacity 부족으로 각각 8장과 32장의 GPU가 필요한 워크로드입니다. 비용 측면에서 보면 차이가 작지 않습니다.

조금 더 보수적으로, 만약 HBF의 실제 양산 bandwidth가 HBM의 절반에 그친다고 가정해 보면 어떨까요? 그래도 10M context에서 throughput per power는 여전히 약 **2.09배** 가 나옵니다. H³의 이득이 HBF spec의 작은 변화에 그리 민감하지 않다는 뜻입니다.

물론 H³도 만능은 아닙니다. 이 결과는 **deterministic prefetch가 가능하고 read-only 비중이 충분히 큰 워크로드** 라는 전제 위에서 나옵니다. 짧은 context에 batch가 작은 서비스라면 HBF를 추가해 봐야 capacity 이점을 살리지 못한 채 전력만 더 쓰는 결과가 나올 수 있습니다. 워크로드 fit이 곧 H³의 fit입니다.

---

## H³ 너머: HBF가 어울릴 다른 workload

여기부터는 글쓴이의 시각이 좀 더 강하게 들어갑니다. H³는 HBF + LLM 추론(특히 CAG)이라는 한 조합을 보여 주었습니다. 그런데 HBF의 "약점이 약점 아닌 조건" — 거대, read-only, deterministic prefetch 가능 — 을 만족하는 워크로드는 LLM 추론 안에만 있는 것이 아닙니다. 시장에서 HBF 후보로 자주 거론되는 세 가지를 짚어 봅니다.

### 후보 1. Mixture of Experts(MoE) 추론

<!-- 그림 필요: MoE expert routing + HBF placement 다이어그램 (선택) -->

최근 frontier LLM의 상당수는 **Mixture of Experts(MoE)** 구조를 쓰고 있습니다. 모델 안에 수십~수백 개의 expert **Feed-Forward Network(FFN)** 이 있고, 토큰마다 일부(보통 2~8개)만 활성화됩니다. 활성화되지 않은 expert도 메모리에는 상주해야 하므로 weight 총합이 매우 커집니다.

- **HBF**: 사용 빈도가 낮은 expert weight 보관 (read-only)
- **HBM**: hot expert와 attention layer (자주 활성)

한계도 있습니다. expert routing 결과는 token마다 달라지는 stochastic 패턴이라, LHB가 가정하는 deterministic prefetch가 어렵습니다. 활성 expert 예측을 어떻게 풀 것이냐가 별도의 연구 주제가 됩니다. 세 후보 가운데 prefetch 친화도가 가장 낮은 자리입니다.

### 후보 2. 멀티모달 모델의 인코더 weight

멀티모달 모델은 이미지/비디오/음성 인코더와 LLM이 합쳐진 형태입니다. 인코더 자체도 거대하고 (예: ViT-G, video encoder), 추론 중에는 weight가 갱신되지 않습니다. LLM 본체의 weight까지 더하면 단일 GPU 메모리에 다 올리기 어려운 규모로 커집니다.

- **HBF**: 인코더 weight (입력마다 read이지만 그 외에는 정적)
- **HBM**: LLM hot path와 KV cache

한계: 인코더 weight는 입력이 들어올 때만 활성화되므로 LLM weight만큼 read 빈도가 높지 않을 수 있습니다. 다만 인코더 내부의 layer 진행 자체는 LLM과 똑같이 deterministic 하기 때문에, prefetch 측면에서는 호의적입니다. HBF의 bandwidth 이득보다는 capacity 이득이 더 크게 작용하는 그림에 가깝습니다.

### 후보 3. 추천/검색 시스템의 임베딩 테이블

추천 시스템(예: **Deep Learning Recommendation Model(DLRM)**) 이나 two-tower 검색 시스템에서 user/item 임베딩 테이블은 종종 billion-scale에 달합니다. 용량이 수백 GB ~ 수 TB 수준이고, 추론 환경에서는 거의 read-only입니다.

- **HBF**: 거대 임베딩 테이블 보관
- **HBM**: 모델 본체와 hot한 임베딩 일부

한계: 임베딩 lookup은 입력 쿼리마다 random access 패턴을 보일 수 있습니다. random access는 prefetch 효과를 약화시키므로, 임베딩 sharding/caching 전략과 같이 가야 의미 있는 성능이 나옵니다.

---

세 후보를 prefetch 친화도 한 축으로 줄세우면 그림이 의외로 가혹합니다. **"거대 + read-only"** 라는 조건은 모두 만족하지만, **deterministic prefetch** 까지 자연스러운 후보는 멀티모달 인코더 정도이고, MoE와 임베딩 테이블은 routing 예측·sharding 같은 추가 mechanism에 기대야 합니다. H³가 LLM 추론에서 그렇게 깔끔하게 동작한 이유는 layer-by-layer 패턴이 매우 잘 정의되어 있기 때문이고, 이 트릭이 다른 워크로드에서는 그대로 통하지 않습니다.

여기서 한 걸음 더 들어가면 더 불편한 질문이 따라옵니다. **그 layer-by-layer 라는 가정이, frontier가 가는 방향에서도 그대로 유지될까요?** 이 질문, 그리고 HBF가 universal로 가기 전에 풀어야 할 더 큰 숙제들은 다음 편에서 본격적으로 다룹니다.

---

## 마무리

이번 글의 흐름을 한 번에 정리하면 이렇습니다.

① HBF는 HBM 대비 거대한 용량과 비슷한 대역폭을 주지만 latency, endurance, power 세 약점을 안고 있다.  
② 이 약점들이 무력화되려면 워크로드가 "거대 + read-only + deterministic + 큰 batch"여야 한다.  
③ CAG는 그 조건을 정확히 충족하는 새 추론 패턴이고, 메모리 프로파일이 HBF의 자리를 만든다.  
④ SK하이닉스의 H³는 HBM 뒤로 HBF를 daisy-chain하고 LHB로 latency를 숨겨 그 자리를 채우자는 제안이며, 시뮬레이션이 long-context에서 throughput-per-power 최대 약 2.69배 이득을 보였다.  
⑤ 그 너머의 MoE, 멀티모달 인코더, 임베딩 테이블 같은 후보들도 같은 조건을 따라가지만, deterministic prefetch 친화도에서는 후보별 편차가 크다.

이번 편의 한 줄 결론은 **"워크로드를 잘 고르면 HBF의 약점은 사라진다"** 입니다. 단 이 문장에는 조용한 단서가 한 가지 붙어 있죠 — frontier가 가는 방향이 그 "잘 고른 워크로드"의 가정을 어디까지 유지해 줄지가 별도의 질문이라는 점입니다. 그 질문, 그리고 HBF가 universal memory로 가기 전에 풀어야 할 숙제들은 다음 편에서 다룹니다.

---

## 추신: HyperAccel은 채용 중입니다!

메모리 계층이 다양해질수록 가속기 설계자가 풀어야 할 문제는 더 흥미로워집니다.

저는 HyperAccel DV팀에서 LLM 가속 ASIC의 하드웨어 검증을 담당하고 있습니다. 단일 칩의 검증을 넘어 메모리 계층, 시스템 통합, 워크로드 매칭까지 함께 고민할 수 있는 자리에서 매일 새로운 문제를 만나고 있습니다.

HyperAccel은 HW, SW, AI를 모두 다루는 회사입니다. 폭넓은 지식을 깊게 배우며 함께 성장하고 싶으신 분들은 언제든지 [채용 사이트](https://hyperaccel.career.greetinghr.com/ko/guide) 에서 지원해 주세요!

---

## Reference

- M. Ha, E. Kim, H. Kim, "H³: Hybrid Architecture using High Bandwidth Memory and High Bandwidth Flash for Cost-Efficient LLM Inference," *IEEE Computer Architecture Letters*, 2026. DOI: [10.1109/LCA.2026.3660969](https://doi.org/10.1109/LCA.2026.3660969)
- B. J. Chan, C.-T. Chen, J.-H. Cheng, H.-H. Huang, "Don't Do RAG: When Cache-Augmented Generation is All You Need for Knowledge Tasks," *Proc. The ACM Web Conference (WWW) 2025*, 2025. [arxiv:2412.15605](https://arxiv.org/abs/2412.15605)
- [SanDisk, "Memory-Centric AI: Sandisk's High Bandwidth Flash Will Redefine AI Infrastructure"](https://www.sandisk.com/company/newsroom/blogs/2025/memory-centric-ai-sandisks-high-bandwidth-flash-will-redefine-ai-infrastructure)
- [1편: AI 시대의 필수 소비재, 메모리 이해하기 1편: HBF 이해하기](https://hyper-accel.github.io/posts/what-is-hbf/)
- [Llama 3 herd of models — Meta](https://arxiv.org/abs/2407.21783)
- [NVIDIA Blackwell Architecture Technical Brief](https://resources.nvidia.com/en-us-blackwell-architecture)
