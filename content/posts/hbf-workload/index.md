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

안녕하세요? HyperAccel DV팀 소속 하드웨어 검증 엔지니어 임재원입니다.

지난 1편에서 신승빈 님이 친절히 풀어 주신 **High Bandwidth Flash(HBF)** 이야기, 잘 보셨나요? 한 줄로 줄이면 이런 이야기였습니다.

> **HBF는 빠르고 거대하지만, 너무 느리다.**

더 정확히 말하면, HBF는 **High Bandwidth Memory(HBM)** 대비 8~16배 큰 용량과 비슷한 대역폭을 제공하지만, latency는 약 100배 더 깁니다. 일반 메모리 자리에 그대로 끼워 넣기에는 부담스러운 숫자죠.

1편이 "HBF란 무엇인가"에 답했다면, 2편은 그다음 질문으로 넘어갑니다.

**"HBF, 실질적으로 어떻게 쓸 수 있을까요?"**

HBF는 아직 상용화 전 단계입니다. 시장과 가속기 회사 입장에서는 spec 너머의 그림 — 어떤 워크로드에서 쓰일지, 그 근거가 무엇인지 — 이 분명해져야 비로소 채택 결정이 움직입니다. 그래서 이번 편의 출발점은 이 질문입니다.

한 가지 흥미로운 사실이 있습니다. **워크로드만 잘 고른다면 HBF의 약점은 숨길 수 있습니다.** 이번 편에서는 SK하이닉스가 IEEE Computer Architecture Letters 2026에 발표한 **H³** 아키텍처와, 그 너머에서 HBF가 빛날 수 있는 자리들을 함께 찾아봅니다.

---

## HBF의 한계, 다시 짚기

1편에서 다룬 HBF의 약점을 다시 정리하면 세 가지입니다.

**첫째, latency.** HBF는 NAND flash 셀에 패키징을 입혀 만든 메모리입니다. 셀 자체의 읽기 메커니즘이 DRAM보다 본질적으로 느려서, HBM이 수십 ns 수준에서 데이터를 읽는 동안 HBF는 약 10~20μs를 필요로 합니다. 약 100배 차이입니다. 이 격차는 패키징을 아무리 잘 해도 셀 차원의 한계라 사라지지 않습니다.

**둘째, write endurance.** NAND flash는 erase/write 사이클에 물리적 수명 제한이 있습니다. 같은 위치에 반복해서 쓰는 워크로드라면 셀이 빠르게 마모됩니다. 학습이나 빈번하게 갱신되는 데이터에는 어울리지 않습니다.

**셋째, 전력.** HBF는 NAND 기반이라 비트당 전력 소모가 HBM보다 큽니다. SK하이닉스의 가정에 따르면 cube당 **Thermal Design Power(TDP)** 가 HBM의 약 4배입니다 (HBM3e 40W vs HBF 160W). 단순히 큰 용량이 좋아서 HBF를 들고 오면 throughput-per-power 측면에서 손해를 볼 수 있습니다.

이 세 약점을 동시에 무력화하려면 워크로드가 아래 조건을 만족해야 합니다.

- **한 번 적재하고 오래 반복 읽기** — write endurance 무력화
- **데이터 접근이 deterministic** — 미리 알 수 있어 prefetch로 latency를 숨김
- **batch가 충분히 커서** 전력 추가분을 throughput으로 만회

이 조건을 충족하는 후보를 LLM 추론에서 찾을 수 있을까요?

---

## LLM 추론에서 read-only 데이터 찾기

LLM 추론은 흔히 두 단계로 분리해서 봅니다. **Prefill** 과 **Decode** 입니다. 두 단계는 연산 특성이 꽤 다릅니다.

- **Prefill**: 입력 prompt 전체를 한 번에 처리합니다. 토큰 수만큼의 attention 연산이 동시에 진행되므로 compute-bound 성격이 강합니다.
- **Decode**: 출력 토큰을 한 개씩 순차적으로 생성합니다. 매 토큰마다 모델 weight 전체와 누적된 KV cache를 다시 읽어야 하므로 memory-bandwidth-bound 성격이 강합니다.

<!-- 그림 필요: prefill vs decode 메모리 접근 패턴 + read-only / read-write 구분 다이어그램 -->

이제 이 안에서 읽기만 발생하는 데이터를 골라봅시다.

**모델 weight.** 추론 중에는 절대 갱신되지 않습니다. Llama 3.1 405B를 FP8로 돌린다고 가정하면 weight 한 벌이 약 405GB이고, 이걸 매 batch마다 처음부터 끝까지 read합니다. 분명히 거대 + read-only입니다.

**공유 가능한 사전 계산 KV cache.** 여러 요청이 같은 거대 context (예: 큰 매뉴얼, 코드베이스, 사내 문서)를 공유한다면, 그 context의 KV cache는 한 번 만들어 두고 모든 요청이 같이 읽을 수 있습니다. 이런 패턴이 어떻게 만들어지는지는 다음 절(CAG)에서 살펴봅니다.

반대로 **생성 중인 KV cache나 activation** 은 매 토큰마다 새로 쓰입니다. 이건 read-only가 아닙니다.

핵심 통찰은 이렇습니다. **long-context로 갈수록 read-only 데이터의 비중이 폭발적으로 커집니다.** 1M context의 사전 KV cache는 수백 GB, 10M context면 수 TB 수준입니다. 이 정도 용량이라면 앞 절에서 도출한 "거대 + read-only + deterministic" 조건을 가뿐히 만족합니다.

그런데 정말로 사람들이 1M, 10M context를 활용하고 있을까요? 최근 떠오르는 추론 패턴 하나가 이 가능성을 적극적으로 끌어옵니다.

---

## CAG, RAG와 무엇이 다른가

최근 한두 해 사이 LLM 응답 품질을 올리는 가장 흔한 방법은 **Retrieval-Augmented Generation(RAG)** 이었습니다. 외부 지식 베이스(보통 vector DB)에서 질의에 관련된 문서를 검색해 prompt에 끼워 넣고, 그 위에서 답변을 생성하는 방식이죠. 매 요청마다 retrieve가 일어나고, 가져온 context로 새 KV cache를 만들어 냅니다.

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

정확히 일치합니다. SK하이닉스가 H³를 정당화하는 핵심 use case로 CAG를 꼽은 이유가 여기 있습니다.

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

---

## 시뮬레이션이 보여준 것

좋은 아이디어인 건 알겠습니다. 그런데 실제로 얼마나 좋아질까요?

SK하이닉스 연구진은 H³ 시스템을 시뮬레이터로 평가했습니다. 워크로드는 **Llama 3.1 405B** (FP8 기준 약 405GB weight), 하드웨어는 NVIDIA **B200** GPU 8장(1M context)과 32장(10M context)을 가정했습니다. HBM3e는 GPU당 192GB / 8TB/s, HBF는 GPU당 약 24TB / 8TB/s를 추가하는 셋업입니다. 입력과 출력 길이는 각 1K로 고정했고, 나머지 capacity는 사전 계산 공유 KV cache가 차지합니다 (1M context에서 약 35%, 10M에서 약 84%).

<!-- 그림 필요: HBM-only vs H³ batch size & throughput 비교 차트 (직접 그릴 것!) -->

결과를 정리하면 이렇습니다 (모두 HBM-only 대비 H³의 비율).

- **최대 batch size**: 1M context에서 약 **2.6배**, 10M context에서 약 **18.8배**
- **Throughput** (TPS/request): 1M에서 약 **1.25배**, 10M에서 약 **6.14배**
- **Throughput per power**: 최대 약 **2.69배** (HBF가 power를 더 먹는 점을 모두 반영한 결과)

long-context로 갈수록 H³의 이득이 가파르게 커진다는 점이 한눈에 보입니다. 사전 KV cache 비중이 클수록 HBF의 거대 용량이 많이 쓰이기 때문이죠.

또 한 가지 흥미로운 결과가 있습니다. **단일 GPU로 1M context 추론이 가능했고, GPU 두 장으로 10M context 추론이 가능했습니다.** HBM-only 시스템이라면 capacity 부족으로 각각 8장과 32장의 GPU가 필요한 워크로드입니다. 비용 측면에서 보면 차이가 작지 않습니다.

조금 더 보수적으로, 만약 HBF의 실제 양산 bandwidth가 HBM의 절반에 그친다고 가정해 보면 어떨까요? 그래도 10M context에서 throughput per power는 여전히 약 **2.09배** 가 나옵니다. H³의 이득이 HBF spec의 작은 변화에 그리 민감하지 않다는 뜻입니다.

물론 H³도 만능은 아닙니다. 이 결과는 **deterministic prefetch가 가능하고 read-only 비중이 충분히 큰 워크로드** 라는 전제 위에서 나옵니다. 짧은 context에 batch가 작은 서비스라면 HBF를 추가해 봐야 capacity 이점을 살리지 못한 채 전력만 더 쓰는 결과가 나올 수 있습니다. 워크로드 fit이 곧 H³의 fit입니다.

---

## H³ 너머: HBF가 어울릴 다른 workload

**(여기부터는 제 사견이 많이 반영되어 있습니다.)**

H³는 HBF + LLM 추론(특히 CAG)이라는 한 조합을 보여 주었습니다. 그런데 HBF의 "약점이 약점 아닌 조건" — 거대, read-only, deterministic prefetch 가능 — 을 만족하는 워크로드는 LLM 추론 안에만 있는 것이 아닙니다. 평소에 떠올려 본 후보 몇 가지를 풀어 봅니다.

### 후보 1. Mixture of Experts(MoE) 추론

<!-- 그림 필요: MoE expert routing + HBF placement 다이어그램 (선택) -->

최근 frontier LLM의 상당수는 **Mixture of Experts(MoE)** 구조를 쓰고 있습니다. 모델 안에 수십~수백 개의 expert FFN이 있고, 토큰마다 일부(보통 2~8개)만 활성화됩니다. 활성화되지 않은 expert도 메모리에는 상주해야 하므로 weight 총합이 매우 커집니다.

- **HBF**: 사용 빈도가 낮은 expert weight 보관 (read-only)
- **HBM**: hot expert와 attention layer (자주 활성)

한계도 있습니다. expert routing 결과는 token마다 달라지는 stochastic 패턴이라, LHB가 가정하는 deterministic prefetch가 어렵습니다. 활성 expert 예측을 어떻게 풀 것이냐가 별도의 연구 주제가 됩니다.

### 후보 2. 멀티모달 모델의 인코더 weight

멀티모달 모델은 이미지/비디오/음성 인코더와 LLM이 합쳐진 형태입니다. 인코더 자체도 거대하고 (예: ViT-G, video encoder), 추론 중에는 weight가 갱신되지 않습니다. LLM 본체의 weight까지 더하면 단일 GPU 메모리에 다 올리기 어려운 규모로 커집니다.

- **HBF**: 인코더 weight (입력마다 read이지만 그 외에는 정적)
- **HBM**: LLM hot path와 KV cache

한계: 인코더 weight는 입력이 들어올 때만 활성화되므로 LLM weight만큼 read 빈도가 높지 않을 수 있습니다. 그렇다면 HBF의 bandwidth 이득보다는 capacity 이득이 더 크게 작용합니다.

### 후보 3. 추천/검색 시스템의 임베딩 테이블

추천 시스템(예: **Deep Learning Recommendation Model(DLRM)**) 이나 two-tower 검색 시스템에서 user/item 임베딩 테이블은 종종 billion-scale에 달합니다. 용량이 수백 GB ~ 수 TB 수준이고, 추론 환경에서는 거의 read-only입니다.

- **HBF**: 거대 임베딩 테이블 보관
- **HBM**: 모델 본체와 hot한 임베딩 일부

한계: 임베딩 lookup은 입력 쿼리마다 random access 패턴을 보일 수 있습니다. random access는 prefetch 효과를 약화시키므로, 임베딩 sharding/caching 전략과 같이 가야 의미 있는 성능이 나옵니다.

### 후보 4. Speculative Decoding의 draft model

[지피지기면 백전불태 3편(LPU)](https://hyper-accel.github.io/posts/lpu-deep-dive/) 에서 다룬 **Speculative Decoding** 도 흥미로운 후보입니다. target/draft 두 모델 운영 시 draft model weight는 자주 변하지 않습니다. 그러나 draft model 자체가 작아서 HBF의 거대 용량 이점을 그대로 살리기는 어렵습니다.

더 흥미로운 변형은 "**도메인별로 다른 draft model 여러 개를 한 시스템에 상주**"시키는 시나리오입니다. 코드 도메인용, 자연어 도메인용, 수학 도메인용 draft model을 모두 메모리에 두고 query에 따라 골라 쓰는 방식이라면 capacity 이점이 살아납니다.

- **HBF**: 도메인별 draft model 여러 벌
- **HBM**: target model 본체와 hot path

한계: LPU 글에서도 짚었듯, target과 draft가 KV cache를 주고받을 때 발생하는 통신 오버헤드는 메모리 계층 분리 자체와 별개로 검토해야 할 문제입니다.

### 후보 5. Agentic AI의 long-term memory

Agentic AI는 추론 trace, tool 호출 결과, 외부 지식 캐시 같은 누적 상태를 들고 다닙니다. session 단위로 길게 유지되면서 갱신 빈도는 낮은 데이터들입니다. CAG의 KV cache와 비슷한 성격이지만, 사용자별로 분리되고 갱신되는 빈도가 워크로드마다 천차만별이라는 점이 다릅니다.

- **HBF**: agent의 누적 reference, tool 응답 캐시
- **HBM**: 현재 추론 hot path

한계: agent마다 갱신 패턴이 다릅니다. write가 많은 agent라면 HBF의 endurance가 발목을 잡습니다. 워크로드 프로파일링이 선행되어야 합니다.

---

다섯 후보 모두 공통점이 있습니다. **"거대 + read-only"** 조건은 만족하지만, **deterministic prefetch 가능 여부** 에서는 후보별로 편차가 큽니다. H³가 LLM 추론에서 그렇게 깔끔하게 동작한 이유는 layer-by-layer 패턴이 매우 잘 정의되어 있기 때문이고, 다른 워크로드에서는 같은 트릭이 그대로 통하지 않을 수 있습니다. 새 메모리 계층의 가치를 끌어내려면 워크로드마다 prefetch-friendly한 데이터 배치 전략을 따로 설계해야 한다는 뜻입니다.

---

## 시장 전망과 시장/학계에 미칠 영향

HBF는 2026년 현재 아직 양산 전 단계입니다. SanDisk와 SK하이닉스가 표준화를 함께 추진 중이고, 1편에서 짚었듯 HBM과 호환되는 footprint와 PHY를 지향하면서도 호스트 컨트롤러는 일부 변경이 필요한 새로운 메모리입니다.

이런 시점에 H³ 같은 아키텍처 제안이 나오는 의미는 작지 않습니다. 메모리 회사 입장에서 "spec만 만들어 놓고 시장이 알아서 쓰겠지"는 더 이상 통하지 않습니다. **어떤 워크로드에 어떻게 쓸지, 그래서 어떤 spec이 가장 비용 대비 효과가 큰지** 가 함께 정의되어야 양산 라인을 도는 결정이 빨라집니다. H³는 SK하이닉스가 그 답을 먼저 던진 사례로 읽을 수 있습니다.

시장 측면에서 보면 더 큰 흐름은 **HBM 단일 의존 구조의 다변화** 입니다. 지금까지 가속기 설계자에게 메모리 선택지는 사실상 "HBM을 몇 단 쌓느냐"였습니다. 만약 HBF가 양산되면 한 시스템 안에 HBM/HBF/CXL 메모리/SSD가 함께 살게 됩니다. "어떤 데이터가 어느 계층에 가야 하는가" 자체가 설계 변수로 새로 추가됩니다.

학계가 받을 자극도 적지 않을 것 같습니다.

- **CAG-style workload 연구**: 어떤 도메인이 cache 친화적인지, 사전 KV cache의 quality vs cost trade-off는 어떤지
- **Prefetch-friendly model design**: 모델 구조 자체를 deterministic 접근 패턴이 잘 보이도록 다시 설계하는 방향
- **Cost model 재정의**: long-context inference의 실제 운영 비용을 GPU만이 아니라 메모리 mix 단위로 모델링
- **Compiler / framework 계층**: tensor placement와 prefetch hint를 자동화하는 흐름

HyperAccel 입장에서는 양가적인 감정이 듭니다. 메모리 mix가 다양해질수록 가속기 설계자가 던질 수 있는 카드는 늘어나고, 그건 우리 같은 회사에 분명한 기회입니다. 그러나 동시에 "어떤 mix가 우리 칩에 최적인가"를 더 빨리, 더 정확히 답해야 한다는 압박도 같이 늘어납니다.

어쩌면 다음 경쟁의 축은 **워크로드별 메모리 mix를 빠르게 실험하고 검증하는 능력** 그 자체일지도 모르겠습니다. HBF는 그 흐름의 시작점에 있는 메모리입니다.

---

## 마무리

이번 글의 흐름을 한 번에 정리하면 이렇습니다.

① HBF는 HBM 대비 거대한 용량과 비슷한 대역폭을 주지만 latency, endurance, power 세 약점을 안고 있다.  
② 이 약점들이 약점이 아니게 되려면 워크로드가 "거대 + read-only + deterministic"이어야 한다.  
③ LLM 추론 안에서 그 조건을 만족하는 데이터는 **모델 weight + 공유 가능한 사전 계산 KV cache** 다.  
④ CAG는 그 공유 KV cache를 폭발적으로 키우는 새 추론 패턴이고, 정확히 HBF의 자리를 만든다.  
⑤ SK하이닉스의 H³는 HBM 뒤로 HBF를 daisy-chain하고 LHB로 latency를 숨겨 그 자리를 채우자는 제안이다.  
⑥ 시뮬레이션은 long-context에서 throughput-per-power 최대 약 2.69배까지 보여 주었다.  
⑦ 그 너머에도 MoE, 멀티모달 인코더, 임베딩 테이블, speculative decoding의 도메인별 draft model, agentic memory 같은 잠재 워크로드가 보인다.

HBF는 한 줄로 요약하면 "**워크로드를 잘 고르면 약점이 사라지는 메모리**"입니다. 양산까지는 아직 시간이 더 필요하지만, 어떤 자리에 끼울지에 대한 답은 이미 시장과 학계가 함께 그려 가고 있습니다. 다음 편에서도 메모리 계층의 또 다른 변화를 함께 짚어 보겠습니다.

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
- [지피지기면 백전불태 3편: LPU 글](https://hyper-accel.github.io/posts/lpu-deep-dive/)
- [Llama 3 herd of models — Meta](https://arxiv.org/abs/2407.21783)
- [NVIDIA Blackwell Architecture Technical Brief](https://resources.nvidia.com/en-us-blackwell-architecture)
