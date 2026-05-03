---
date: '2026-04-29T03:00:00+09:00'
draft: true
title: 'AI 시대의 필수 소비재, 메모리 이해하기 3편: HBF 상용화가 풀어야 할 숙제들'
cover:
  image: "01-cover.jpg"
  alt: "HBF 상용화 도전 과제 커버 이미지"
  caption: "HBF가 universal로 가기 전에 풀어야 할 것들"
  relative: true
authors: [Jaewon Lim]
tags: ["HBF", "High Bandwidth Flash", "memory", "LLM", "Inference", "Sparse Attention", "SK Hynix", "H3"]
series: ["AI 시대의 필수 소비재, 메모리 이해하기"]
series_idx: 3
categories: ["AI hardware", "Semiconductor"]
summary: "HBF를 잘 쓰는 자리는 분명히 있습니다. 그렇다면 HBF가 universal memory로 가는 데 무엇이 부족할까요? sparse attention frontier, 범용 상용화 조건, 그리고 현실적인 niche 시장을 짚어 봅니다."
description: "HBF의 진짜 병목이 capacity가 아니라 latency라는 시각, frontier가 가는 방향(sparse attention, native multimodal)이 HBF에 적대적인 이유, HBM4/5의 capacity 추격과 cost economics 미검증 같은 universal화 조건들, 그리고 그럼에도 가장 먼저 의미 있는 제품이 나올 niche를 정리합니다."
comments: true
keywords: [
  "HBF", "High Bandwidth Flash", "Sparse Attention", "NSA", "MoBA",
  "Lightning Attention", "HBM4", "HBM5", "KV compression", "Specialized Accelerator",
  "Enterprise AI", "Video understanding", "AI 메모리"
]
---

> 이 글은 **AI 시대의 필수 소비재, 메모리 이해하기** 시리즈의 3편입니다.  
> [2편: HBF의 잠재 workload 찾아보기](https://hyper-accel.github.io/posts/hbf-workload/) 에서는 HBF가 효과적으로 쓰일 수 있는 자리들 — CAG, H³, 그리고 그 너머의 후보 워크로드들 — 을 정리했습니다.  
> 이번 편에서는 같은 메모리에 대해 **반대 방향** 의 질문을 던집니다. HBF가 universal memory로 자리잡기 전에 풀어야 할 숙제는 무엇인가.

<!-- 그림 필요: 커버 이미지 (01-cover.jpg) -->

## 들어가며

다시, HyperAccel DV팀 임재원입니다.

지난 2편의 결론은 단순했습니다. **워크로드를 잘 고르면 HBF의 약점은 숨길 수 있다.** CAG, MoE, 멀티모달 인코더, 임베딩 테이블 — HBF가 효과적으로 쓰일 자리들이 분명히 있고, SK하이닉스의 H³ 같은 아키텍처가 그 자리에 정확히 들어맞는다는 이야기였죠.

그런데 한 발 떨어져서 다시 보면 한 가지 불편한 점이 있습니다. 위 결론들은 모두 한 가지 가정 위에 서 있습니다 — **layer-by-layer 라는 deterministic 접근 패턴이 유효하다** 는 가정입니다. H³의 LHB도, "거대 + read-only + deterministic" 조건도, 그 가정이 깨지는 순간 함께 흔들립니다.

이번 편에서는 이 가정 자체를 따져 보고, 그 위에 — HBF가 universal로 가기 위해 풀어야 할 더 큰 조건들과, 그 조건들이 다 풀리지 않더라도 의미 있게 동작할 niche 시장까지 — 차례로 정리합니다.

---

## 그런데 진짜 병목은 latency 아닌가

지난 편까지의 논리는 단순했습니다. **HBF의 latency는 불리하지만, 워크로드가 deterministic 하다면 prefetch로 숨길 수 있다.** H³의 LHB는 정확히 이 가정 위에 서 있습니다. layer-by-layer 패턴이 깔끔히 정의되어 있어서, 다음 layer가 어떤 weight와 KV cache를 읽을지 미리 알 수 있다는 전제죠.

문제는 frontier 모델이 가는 방향이 점점 이 전제에서 멀어지고 있다는 점입니다.

### Sparse attention: prefetch가 본질적으로 어려운 패턴

최근 long-context 모델 진영의 흐름은 attention을 그대로 두지 않습니다. DeepSeek의 **Native Sparse Attention(NSA)**, Moonshot AI의 **Mixture of Block Attention(MoBA)**, MiniMax의 Lightning Attention 같은 frontier 사례들이 보여주듯, dense attention을 그대로 쓰는 대신 **content-dependent 하게 일부만 골라 보는 sparse attention** 으로 이동 중입니다.

이 흐름이 HBF에 불리한 이유는 명확합니다. 어떤 KV를 읽을지가 token의 내용에 의해 결정되기 때문에, 다음 layer에서 무엇이 필요할지 미리 알 수 없습니다. prefetch가 불가능한 게 아니라, prefetch라는 패러다임 자체가 잘 안 맞는 워크로드입니다. LHB가 가정하는 sequential & deterministic 모델이 깨집니다.

### Structured sparsity 비유: 정확도를 일부 양보하는 길

비슷한 trade-off를 NVIDIA가 한 번 통과한 적이 있습니다. **2:4 structured sparsity** 입니다. unstructured sparse weight는 hardware 가속이 어려워서, NVIDIA는 모델에게 "4개 중 2개는 0이어야 한다"는 구조적 제약을 강제하고, 그 대가로 Tensor Core의 가속을 제공했습니다. 정확도는 미미하게 떨어지지만 hardware 친화도가 극적으로 올라갑니다.

HBF도 비슷한 길을 갈 가능성이 있습니다. 자연 그대로의 sparse attention은 prefetch에 적대적이지만, 모델이 block 단위로 정해진 패턴 안에서만 sparse 하도록 제약된다면 prefetch가 가능해집니다. 다만 이건 frontier가 자연스럽게 그쪽으로 갈 거라는 보장이 아니라, **hardware 친화도를 위해 모델이 정확도를 양보하는 구조** 입니다. 양보의 폭이 어디까지 가능할지가 별개의 연구 주제입니다.

### 멀티모달도 같은 갈림길

멀티모달도 비슷한 분기에 서 있습니다.

- **Frontier 방향 (GPT-4o, Gemini 류)**: early fusion + token 단위로 텍스트와 비전이 섞이는 native multimodal. 여기에 sparse attention이 결합되면 prefetch 친화도는 거의 0에 가까워집니다.
- **Efficient 방향 (Q-Former, late fusion 류)**: 비전 인코더가 LLM과 명확히 분리되고, 인코더 layer는 deterministic. HBF에 호의적이지만 **현재 frontier가 가는 길은 아닙니다.**

같은 멀티모달이라도 어느 쪽 계열을 따르느냐에 따라 HBF의 fit이 정반대가 됩니다.

### Sparse attention vs HBF: 같은 문제, 다른 해법

이 흐름을 한 발 떨어져서 보면 흥미로운 frame이 보입니다. sparse attention과 HBF는 **본질적으로 같은 문제 — long-context inference의 cost — 에 대한 서로 다른 해법** 입니다.

- **Sparse attention**: algorithmic 해법. KV의 일부만 보면서 long context를 다룬다.
- **HBF**: hardware 해법. KV를 전부 보더라도 더 거대하고 싼 메모리에 통째로 들고 다닌다.

둘은 complementary 일 수 있습니다. 거대 KV cache를 HBF에 두되 그 안에서 sparse 하게 sampling 하는 방식이라면 같이 갈 수 있습니다. 그러나 동시에 substitute 일 수도 있습니다. sparse attention이 충분히 잘 동작해 long-context cost를 algorithmic 으로 충분히 낮추면, 굳이 거대 KV를 HBF에 통째로 들고 있을 이유가 약해집니다. 이 갈림길의 결과는 앞으로 몇 년 메모리 계층 설계의 핵심 변수가 됩니다.

---

## 범용으로 가기 위한 조건들

앞 절에서 본 갈림길은 HBF가 specialized component 로 살아남는 길과 universal component 로 도약하는 길의 분기점이기도 합니다. universal로 가려면 풀어야 할 조건이 적어도 셋 있습니다.

### (a) HBM 자체의 capacity 추격

HBF의 가장 큰 자랑은 HBM 대비 8~16배의 capacity 입니다. 그러나 이 격차는 고정값이 아닙니다. HBM4가 stack 당 36~48GB로 2025~2026년 상용화를 앞두고 있고, HBM5는 64GB를 넘어설 거라는 로드맵이 이미 공개되어 있습니다. HBM이 capacity 측면에서 매년 따라오는 속도가 HBF의 양산 속도보다 빠르다면, "16배 capacity 우위"는 시간이 갈수록 8배, 4배로 줄어듭니다. HBF가 양산 단계에서 그 줄어든 격차를 cost·power로도 정당화할 수 있어야 universal로 갈 자리가 남습니다.

### (b) Sparse attention/KV compression 같은 algorithmic substitute

앞 절에서 짚은 sparse attention은 HBF의 자리를 algorithmic 해법으로 substitute 할 수 있는 가장 강력한 후보입니다. 거기에 더해 **KV compression** (8-bit, 4-bit quantization, eviction policy, paged KV) 같은 흐름까지 합쳐지면 long-context 자체의 KV cache 부피가 1/4, 1/8까지 줄어들 수 있습니다. 그러면 굳이 거대 메모리에 통째로 들고 있을 필요가 없어집니다.

HBF가 universal 이 되려면 이 algorithmic 흐름과 공존하는 그림 — 즉 **sparse-aware HBF architecture** — 이 등장해야 합니다. 단순히 KV를 통째로 들고 다니는 메모리가 아니라, sparse selection을 인지하고 hot block만 prefetch 하는 형태로 진화해야 한다는 뜻입니다. 현재 H³는 이 단계까지는 가지 못합니다.

### (c) Datacenter power density 제약

세 번째 조건은 가장 실무적입니다. SK하이닉스의 가정에 따르면 HBF cube 한 개의 TDP는 약 **160W** 입니다. NVIDIA DGX 시스템 한 대에 GPU가 8장 들어가고 각 GPU에 HBF 1~2 cube가 daisy-chain 된다면, 시스템당 1~3 kW의 추가 전력이 필요해집니다. 데이터센터 입장에서는 rack 당 power budget 안에서 GPU 한 장을 더 넣을지 HBF cube 두 개를 넣을지 같은 trade-off가 새로 생깁니다.

이 조건이 풀리려면 cube 단위 power 자체가 내려와야 합니다. 셀 read 에너지가 본질적으로 NAND 기반이라 한계는 분명히 있지만, channel/stack 수준의 power gating, idle cube의 deep-sleep 같은 운영 수준 최적화가 함께 가야 universal화가 가능합니다.

### 모든 조건의 전제: cost economics

위 세 조건의 바탕에는 더 근본적인 가정이 깔려 있습니다. **HBF가 정말 "16배 capacity per dollar"의 경제성을 줄 것인가** 입니다. NAND 자체는 DRAM보다 비트당 훨씬 싸지만, HBF는 일반 SSD가 아니라 **Through-Silicon Via(TSV)** 로 다이를 쌓아 올린 NAND입니다. 이 stacking 공정은 HBM과 비슷한 수준의 yield 부담을 안고 갑니다. SanDisk와 SK하이닉스 모두 양산 단가를 공식 발표한 적은 없습니다. "HBM 대비 1/8 ~ 1/16 가격"이라는 시장 기대가 실제 양산 라인에서 나오는 숫자와 일치할지는 아직 검증되지 않았습니다.

cost economics가 깨지면 (a)(b)(c)가 모두 풀려도 무의미합니다. 반대로 cost가 압도적이면 (a)(b)(c)가 일부 부족해도 HBF가 자리를 잡습니다. 그래서 HBF의 universal화 가능성은 본질적으로 **(a) HBM capacity 추격 속도**, **(b) sparse-aware로의 진화**, **(c) power optimization**, 그리고 그 모두를 결정짓는 **cost economics** 의 함수입니다. 이 중 어느 하나라도 충분히 풀리지 않으면 HBF는 specialized accelerator의 component 자리에 머무릅니다.

---

## 현실적인 niche, 그리고 다음 경쟁의 축

앞 절의 조건이 한 번에 다 풀릴 가능성은 낮습니다. 그러나 일부만 풀려도 — 특히 cost economics가 통과하면 — 의미 있게 동작하는 자리는 있습니다. 그 자리란 **(a) HBM의 capacity 추격이 따라오기 전에, (b) sparse-aware HBF로 진화하지 않은 채로, (c) power 제약을 unit economics로 흡수할 수 있는 곳** 입니다. 그래서 HBF의 단기 미래는 universal component 가 아니라 **specialized accelerator의 component** 로 보는 것이 가장 합리적입니다. 체감 시나리오로 정리하면 이렇습니다 (확률은 글쓴이의 주관적 추정).

- **Bull (~20%)**: sparse-aware HBF architecture가 등장하고 cost economics가 압도적으로 좋아지면서, HBM과 함께 universal memory 계층의 한 축이 됩니다. 모든 GPU에 HBM이 들어가듯, 모든 가속기에 HBF가 들어가는 그림.
- **Base (~50%)**: HBF는 long-context, multimodal, embedding-heavy 워크로드 전용 accelerator의 component 로 자리잡습니다. 일반 GPU 시스템에는 들어가지 않지만, 특정 유형의 inference 서비스에는 표준 부품이 됩니다.
- **Bear (~30%)**: HBM의 capacity 추격 + sparse attention의 algorithmic substitute가 더 빠르게 성숙해, HBF는 양산은 되지만 시장 점유율을 의미 있게 가져가지 못합니다. niche product에 머무릅니다.

base case가 현실이라면, 그 50% 안에서 가장 먼저 의미 있는 제품이 나올 자리는 어디일까요. 네 가지 후보가 보입니다.

### Enterprise document AI

의료 영상 판독 보고서, 법률 case 데이터베이스, 금융 규제 문서 같은 대용량·고정형 long-context 자료를 다루는 enterprise inference 서비스가 첫 자리입니다. **CAG의 메모리 프로파일이 거의 그대로 들어맞고**, 사용자별 갱신은 미미합니다. 의료/법률/금융처럼 정확도가 단가를 정당화하는 도메인에서는 HBF의 추가 cost를 흡수할 수 있는 unit economics 가 있습니다. 가장 가까운 시장입니다.

### Video understanding

영상 1분이 LLM 입장에서는 수만~수십만 token에 해당합니다. 영상 전체의 vision token KV는 한 번 계산되고 나면 자연스럽게 read-only이고, 이후 query마다 다시 참조됩니다. 이건 **자연 발생적인 CAG** 패턴에 가깝습니다. video QA, video search, security/surveillance 분석 같은 서비스에서 HBF가 vision KV의 home으로 자리할 가능성이 큽니다.

### Multimodal RAG의 vision embedding store

multimodal RAG가 보편화되면 텍스트 임베딩 위에 이미지·도표·스크린샷 임베딩 store가 추가됩니다. 일반 vector DB보다 수십 배 거대하고, 추론 환경에서는 read-only이며, 한 번 적재 후 질의마다 일부 sharding이 필요합니다. 임베딩이 이미 random access 패턴이라 prefetch 친화도는 낮지만, **capacity 이득** 만으로도 충분히 의미 있는 자리입니다.

### Cost-sensitive single-chip serving

마지막은 결이 약간 다릅니다. T급(1조 파라미터급) 모델을 GPU 1~2장에 올려서 서비스하려는 시도는 항상 capacity 부족에 부딪힙니다. HBF가 daisy-chain 으로 capacity를 16배 늘려준다면, 같은 모델을 8장 대신 1~2장으로 서빙할 수 있습니다. 비용 측면에서 이는 큰 변수입니다. 단 throughput-per-dollar가 HBM-only 8장보다 좋아야 의미가 있고, 이건 앞 절의 (b)(c) 조건과 직결됩니다.

### 그러나 모든 GPU에 들어가지는 않습니다

이 네 niche의 공통점은 **거대 read-only 데이터가 워크로드의 주된 비용** 이라는 점입니다. 반대로 일반 chatbot, 코드 어시스턴트, 짧은 context의 일반 inference는 이 패턴이 아닙니다. **HBF가 모든 GPU에 들어가는 보편 부품이 될 가능성은 낮습니다.** 1편이 답한 "HBF란 무엇인가", 2편이 답한 "HBF는 어디에 쓰이는가" 다음에, 3편의 답은 다음과 같습니다. **시장이 강조하는 것보다 좁은 자리, 그러나 그 좁은 자리에서는 다른 무엇으로도 대체하기 어려운 메모리.**

**HyperAccel 입장에서는 이 결론이 양가적입니다.** universal로 가지 못하는 메모리는 가속기 설계자에게 매번 "이 칩이 어느 niche를 노리는가" 라는 더 어려운 질문을 남깁니다. 그러나 동시에 메모리 mix가 다양해질수록 던질 수 있는 카드도 늘어나고, 그건 우리 같은 회사에 분명한 기회입니다. 어쩌면 다음 경쟁의 축은 **워크로드별 메모리 mix를 빠르게 실험하고 검증하는 능력** 그 자체일지도 모르겠습니다. HBF는 그 흐름의 시작점에 있는 메모리입니다.

---

## 마무리

이번 글의 흐름을 한 번에 정리하면 이렇습니다.

① HBF의 prefetch 친화 가정은 frontier가 가는 sparse attention 흐름과 어긋난다. NVIDIA 2:4 사례처럼 모델이 정확도를 양보하고 hardware 친화 구조로 강제되지 않는 한, sparse attention은 algorithmic 해법으로 HBF를 substitute 할 수 있다.  
② HBF가 universal로 가려면 (a) HBM capacity 추격 속도, (b) sparse-aware 로의 진화, (c) datacenter power 최적화, 그리고 그 모두를 결정짓는 cost economics 가 풀려야 한다. 어느 하나라도 미해결이면 specialized accelerator의 component 에 머무른다.  
③ 그 specialized component 자리에서 가장 먼저 의미 있는 제품이 나올 곳은 enterprise document AI, video understanding, multimodal RAG의 vision embedding store, cost-sensitive single-chip serving — 거대 read-only 데이터가 워크로드의 주된 비용인 niche들이다.

2편에서 본 "HBF의 자리"와 3편에서 본 "HBF의 한계"를 합치면 결론은 한 줄입니다. **HBF는 워크로드를 잘 고르면 약점이 사라지는 메모리지만, 그 자리는 시장이 강조하는 것보다 좁다.** universal memory로 도약하느냐, specialized accelerator의 component 로 자리잡느냐는 향후 몇 년 algorithmic 진영의 진전, 양산 단가, 그리고 power 최적화의 함수가 될 것입니다.

이 시리즈를 통해 메모리 계층의 변화 한 축을 함께 살펴보았습니다. 다음 시리즈에서도 메모리/가속기 분야의 또 다른 흐름을 짚어 보겠습니다.

---

## 추신: HyperAccel은 채용 중입니다!

메모리 계층이 다양해질수록 가속기 설계자가 풀어야 할 문제는 더 흥미로워집니다.

저는 HyperAccel DV팀에서 LLM 가속 ASIC의 하드웨어 검증을 담당하고 있습니다. 단일 칩의 검증을 넘어 메모리 계층, 시스템 통합, 워크로드 매칭까지 함께 고민할 수 있는 자리에서 매일 새로운 문제를 만나고 있습니다.

HyperAccel은 HW, SW, AI를 모두 다루는 회사입니다. 폭넓은 지식을 깊게 배우며 함께 성장하고 싶으신 분들은 언제든지 [채용 사이트](https://hyperaccel.career.greetinghr.com/ko/guide) 에서 지원해 주세요!

---

## Reference

- M. Ha, E. Kim, H. Kim, "H³: Hybrid Architecture using High Bandwidth Memory and High Bandwidth Flash for Cost-Efficient LLM Inference," *IEEE Computer Architecture Letters*, 2026. DOI: [10.1109/LCA.2026.3660969](https://doi.org/10.1109/LCA.2026.3660969)
- J. Yuan et al., "Native Sparse Attention: Hardware-Aligned and Natively Trainable Sparse Attention," 2025. [arxiv:2502.11089](https://arxiv.org/abs/2502.11089)
- E. Lu et al., "MoBA: Mixture of Block Attention for Long-Context LLMs," 2025. [arxiv:2502.13189](https://arxiv.org/abs/2502.13189)
- MiniMax-AI, "MiniMax-01: Scaling Foundation Models with Lightning Attention," 2025. [arxiv:2501.08313](https://arxiv.org/abs/2501.08313)
- A. Mishra et al., "Accelerating Sparse Deep Neural Networks (NVIDIA 2:4 structured sparsity)," 2021. [arxiv:2104.08378](https://arxiv.org/abs/2104.08378)
- [SanDisk, "Memory-Centric AI: Sandisk's High Bandwidth Flash Will Redefine AI Infrastructure"](https://www.sandisk.com/company/newsroom/blogs/2025/memory-centric-ai-sandisks-high-bandwidth-flash-will-redefine-ai-infrastructure)
- [1편: AI 시대의 필수 소비재, 메모리 이해하기 1편: HBF 이해하기](https://hyper-accel.github.io/posts/what-is-hbf/)
- [2편: AI 시대의 필수 소비재, 메모리 이해하기 2편: HBF의 잠재 workload 찾아보기](https://hyper-accel.github.io/posts/hbf-workload/)
