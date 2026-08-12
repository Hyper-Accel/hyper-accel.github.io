---
date: '2026-08-10T16:32:14+09:00'
draft: false
title: 'AI 시대의 필수 소비재, 메모리 이해하기 5편: CXL Workload 알아보기'
cover:
  image: "cxl-workload-cover.webp"
  alt: "GPU HBM의 KV cache가 CXL 메모리로 offload되고, 여러 서버의 메모리 pooling과 메모리 tiering으로 이어지는 모습"
  caption: "CXL의 세 가지 workload · AI generated image"
  relative: true
authors: [Jaewon Lim]
tags: ["CXL", "KV cache", "메모리 pooling", "메모리 tiering", "LLM Inference"]
series: ["AI 시대의 필수 소비재, 메모리 이해하기"]
series_idx: 5
categories: ["AI hardware", "Semiconductor"]
summary: "CXL이 무엇인지는 4편에서 살펴봤습니다. 그렇다면 CXL은 실제 LLM 서빙과 데이터센터 워크로드의 어디에 쓰일까요? KV cache offload, 메모리 풀링을 통한 VM 통합, hot/warm/cold tiering이라는 세 가지 활용 사례로 CXL이 잘 맞는 워크로드의 조건을 짚어 봅니다."
description: "KV cache offload, 메모리 풀링, 메모리 tiering을 통해 CXL이 실제 워크로드에서 어떻게 쓰이는지 살펴봅니다."
comments: true
keywords: [
  "CXL", "Compute Express Link", "KV cache offload", "메모리 pooling",
  "VM consolidation", "메모리 tiering", "CMM", "LLM 추론"
]
---

> 이 글은 **AI 시대의 필수 소비재, 메모리 이해하기** 시리즈의 5편입니다.
> [1편](https://hyper-accel.github.io/posts/what-is-hbf/), [2편](https://hyper-accel.github.io/posts/hbf-workload/), [3편](https://hyper-accel.github.io/posts/hbf-challenge/)에서는 GPU 옆 메모리 계층의 빈 자리를 채우는 **High Bandwidth Flash(HBF)**를 다뤘고,
> [4편](https://hyper-accel.github.io/posts/what-is-cxl/)에서는 시점을 시스템 레벨로 옮겨 **Compute Express Link(CXL)**이 *무엇인지* 살펴봤습니다.
> 이번 5편에서는 그 CXL이 *실제 워크로드에서 어떻게 쓰이는지*를 살펴봅니다.

## 들어가며

안녕하세요, HyperAccel RTL 검증 엔지니어 임재원입니다.

지난 4편에서 우리는 CXL이라는 인터페이스의 정체를 뜯어봤습니다. DDR과 PCIe 사이의 빈 자리, 세 가지 sub-protocol(CXL.io / CXL.cache / CXL.mem), Type 1·2·3 디바이스, 그리고 메모리 3사의 CMM 제품군까지요.

그런데 4편을 마무리하면서 저는 정작 가장 궁금한 질문을 다음 편으로 미뤄 뒀습니다.

> **CXL이 실제 LLM 서빙 워크로드에서 어떻게 쓰이고, 어떤 워크로드에 잘 맞는가?**

도구의 생김새를 안 뒤에는 그 도구가 실제로 손에 잡히는 자리를 찾아볼 차례입니다.

이번 편의 출발점은 4편에서 정리한 CXL의 **두 가지 본질적 성질**입니다.

- **장점**: 일관성 있는(coherent) 큰 메모리를, 시스템 외부로 확장해 여러 호스트가 나눠 쓸 수 있다.
- **대가**: DDR 직결 메모리보다 **2-3배 느리다**(약 170-300 ns). 이른바 latency tax.

이 둘은 동전의 양면입니다. 그래서 "CXL이 어디에 쓰이는가"라는 질문은 결국 **"이 latency tax를 감당하고도 남을 만큼, 용량과 풀링이 절실한 워크로드는 무엇인가?"**로 좁혀집니다.

이 글에서는 그런 후보를 세 가지 활용 사례 — **① KV cache offload, ② 메모리 풀링을 통한 VM 통합, ③ hot/warm/cold tiering** — 로 나눠 살펴보겠습니다.

이 포스팅의 내용은 제가 개인적으로 공부하고 경험한 내용을 바탕으로 작성되었습니다.
오류가 있다면 언제든지 댓글로 알려주세요.

---

## 활용 사례 ① — KV cache: GPU 밖으로 밀려나는 메모리

CXL이 LLM 서빙에서 가장 먼저 노리는 자리는 **KV cache 저장고**입니다.

### 왜 KV cache가 문제인가

LLM 추론에서 모델은 이전까지 생성한 모든 토큰의 Key/Value 벡터를 저장해 두고 재사용합니다. 이 **Key-Value cache(KV cache)**는 시퀀스가 길어질수록, 그리고 동시 사용자가 많아질수록 선형으로 불어납니다.

KV cache의 전체 용량은 다음 식으로 계산할 수 있습니다.

$$\text{KV cache size} = 2 \times B \times S \times L \times H_{kv} \times D_h \times P$$

여기서 $B$는 batch 크기, $S$는 시퀀스 길이, $L$은 레이어 수입니다. $H_{kv}$는 KV head 수, $D_h$는 head dimension, $P$는 데이터 한 원소의 byte 수입니다. 맨 앞의 2는 Key와 Value를 모두 저장한다는 뜻입니다.

예를 들어 Llama 3.1 405B를 FP8 weight와 FP16 KV cache 구성으로 서빙하면 토큰당 약 516KB가 필요합니다. 사용자 한 명이 10만 토큰을 사용하면 약 48GB입니다. 이런 요청 128개를 동시에 처리하면 KV cache만 약 6TB까지 커집니다. 계산 과정은 이전 [NVIDIA ICMS post](https://hyper-accel.github.io/posts/nvidia-icms-dpu/#context-is-the-new-bottleneck--%EB%A9%94%EB%AA%A8%EB%A6%AC-%EC%9A%A9%EB%9F%89-%EC%9E%90%EC%B2%B4%EA%B0%80-%EB%B3%91%EB%AA%A9%EC%9D%B4-%EB%90%98%EB%8B%A4)에서도 다룬 바 있습니다.

{{< figure src="llama31-kv-cache-size.webp" alt="Llama 3.1 405B의 토큰 수에 따라 KV cache 용량이 516KB에서 48GB, 6TB로 증가하는 계산 결과" caption="Llama 3.1 405B의 KV cache 용량 계산." attr="출처: LMCache KV Cache Size Calculator" attrlink="https://zhuohangu.github.io/kv-calculator/" align="center" >}}

문제는 이 KV cache가 가장 비싼 메모리인 **GPU의 HBM**을 잡아먹는다는 점입니다. HBM 용량은 한정적인데, KV cache가 차지하는 만큼 실제로 동시에 처리할 수 있는 요청 수(batch)가 줄어듭니다.

### 기존 방식의 한계

그래서 업계는 이미 KV cache를 GPU 밖으로 내리고 있습니다. 흔한 방식은 host DRAM이나 NVMe SSD에 KV cache를 offload 했다가 필요할 때 다시 올리는 것입니다.

하지만 GPU HBM과 host DRAM, SSD는 할당 메모리 영역이 서로 다릅니다. serving runtime이 KV block의 위치와 복사를 명시적으로 관리해야 합니다.

- **host DRAM**은 GPU와 데이터를 주고받을 때 DMA와 staging이 필요합니다.
- **NVMe SSD**는 block I/O와 더 긴 지연시간을 감수해야 합니다.

어느 쪽이든 "필요한 KV block을 HBM으로 언제 올릴지"를 소프트웨어가 결정해야 합니다.

### CXL을 사용한다면?

CXL Type 3 메모리는 호스트의 물리 주소 공간에 들어옵니다. CPU는 별도의 block I/O 없이 일반적인 load/store로 접근할 수 있습니다. 이때 얻는 이점은 세 가지입니다.

- **용량**: HBM보다 큰 KV cache 공간을 호스트 주소 공간에 붙일 수 있습니다.
- **접근 방식**: CPU는 CXL 메모리를 바이트 단위로 주소를 지정할 수 있는 메모리로 다룰 수 있습니다.
- **위치**: SSD보다 가까운 DRAM 계층이라 block I/O를 거치지 않습니다.

공개된 사례로는 SK hynix의 [TraCT](https://arxiv.org/abs/2512.18194)가 있습니다. TraCT는 NVIDIA Dynamo-vLLM에 CXL 공유 메모리를 붙였습니다. 이 공유 메모리를 prefill GPU와 decode GPU 사이의 KV 전송 공간이자 rack-level prefix cache로 사용한 것입니다. 두 서버의 실험에서 평균 **Time to First Token(TTFT)**을 최대 9.8배 개선하고, peak throughput을 최대 1.6배 높였습니다.

{{< figure src="tract-overview.webp" alt="TraCT에서 CXL 공유 메모리가 prefill worker와 decoding worker 사이의 KV 전송 공간과 prefix cache로 동작하는 구조" caption="CXL 공유 메모리를 이용한 KV cache 전송과 prefix cache 구조." attr="출처: TraCT, Figure 2" attrlink="https://arxiv.org/abs/2512.18194" align="center" >}}

---

## 활용 사례 ② — 메모리 풀링과 VM 통합

두 번째 활용처는 데이터센터 경제성을 곧바로 개선할 수 있는 **메모리 풀링**입니다.

### Stranded 메모리 문제

클라우드 서버는 CPU core 수와 DRAM 용량이 고정된 비율로 묶여 있습니다. 고객이 CPU를 모두 빌려 가면, 남아 있는 DRAM만 따로 판매할 수 없습니다. 반대로 메모리가 먼저 소진되면 남은 CPU core가 놀게 됩니다.

이처럼 한쪽 자원이 먼저 소진되어 다른 자원이 남는 현상을 **stranded 메모리**라고 합니다. 이 문제는 특히 한 서버에 여러 **Virtual Machine(VM)**을 배치하는 클라우드 환경에서 두드러지게 나타납니다.

### CXL 풀링이 푸는 방식

4편에서 본 CXL 2.0의 풀링이 정확히 이 문제를 겨냥합니다. 거대한 메모리 디바이스를 **Multi-Logical Device(MLD)** 로 쪼개고, **Fabric Manager(FM)** 가 노드별 수요에 맞춰 chunk를 동적으로 배정합니다.

핵심은 **동시 공유가 아니라 동적 할당**이라는 점입니다. 한 chunk는 한 시점에 한 호스트만 소유하므로 일관성 충돌이 없고, 그래서 구현이 단순하면서도 효과가 큽니다.

이 구조에서는 모든 노드가 peak 수요를 가정해 DRAM을 과다 구매할 필요가 없습니다. 평소에는 작은 local DRAM으로 운영하다가 부족한 용량만 pool에서 빌릴 수 있습니다. 여러 노드의 peak가 정확히 같은 시간에 오지 않는다는 점을 이용하는 셈입니다.

VM scheduler도 CPU와 메모리를 더 독립적으로 배치할 수 있습니다.

Microsoft Azure의 [Pond](https://www.microsoft.com/en-us/research/wp-content/uploads/2022/10/2023_Pond_asplos23_official_asplos_version.pdf)는 Azure 100개 production cluster에서 수집한 75일치 VM 배치 trace와, 158개 workload에서 CXL latency를 모사해 얻은 성능 측정값을 결합해 end-to-end simulation을 수행했습니다. local DRAM보다 메모리 지연시간이 2.22배 높은 조건에서 16-socket pool을 구성하고 성능 저하 허용치를 5%로 두었을 때, 필요한 전체 DRAM 용량이 7% 줄었습니다. 이를 전체 cloud server 비용으로 환산하면 3.5%입니다.

{{< figure src="pond-memory-stranding.webp" alt="CPU core 할당률에 따른 stranded 메모리와 CXL 메모리 pool 크기에 따른 DRAM 절감 효과" caption="Azure의 stranded 메모리와 pool 크기에 따른 DRAM 절감 효과." attr="출처: Pond, Figure 2·3" attrlink="https://www.microsoft.com/en-us/research/wp-content/uploads/2022/10/2023_Pond_asplos23_official_asplos_version.pdf" align="center" >}}

---

## 활용 사례 ③ — hot / warm / cold tiering

세 번째는 앞의 두 사례를 관통하는 운영 모델입니다. CXL 메모리를 메인 메모리의 **대체**가 아니라 **한 칸 아래 계층**으로 두는 **tiering**입니다.

### 왜 tiering인가

CXL 메모리는 DDR보다 2-3배 느립니다. 그러니 모든 데이터를 CXL에 두는 건 손해입니다. 대신 데이터 사용 빈도에 따라 tier를 나눕니다.

- **hot**: 자주 접근하는 데이터 → 가까운 DDR
- **warm / cold**: 가끔 접근하거나 용량만 차지하는 데이터 → 한 단계 먼 CXL

CPU 입장에서 CXL 메모리는 "조금 느린 **비균일 메모리 접근(NUMA) 노드**"처럼 보입니다. 그래서 OS와 런타임이 어떤 페이지를 어느 tier에 둘지를 관리하게 됩니다.

### 자동 tiering vs 명시적 배치

Tiering을 관리하는 주체는 해당 서버가 사용되는 workload의 범위에 따라 조금씩 달라질 수 있습니다.

- 범용 workload라면 OS의 자동 tiering에 맡기는 편이 편합니다. Linux가 page access를 추적하고 hot page를 DDR로 올리며 cold page를 CXL로 내립니다.
- 반면 **LLM 추론처럼 접근 패턴이 결정론적인 workload**라면 애플리케이션이 직접 배치할 수 있습니다. "활성 KV block은 HBM, 재사용할 prefix는 CXL"처럼 의미를 아는 주체가 결정하는 방식입니다.

자동 tiering에서 말하는 "접근 추적"에는 하나의 정답이 없습니다. 구현마다 최근 접근 여부, 접근 빈도, 마지막 접근 이후 시간을 조합합니다. 예를 들어 Linux의 [DAMON_LRU_SORT](https://docs.kernel.org/admin-guide/mm/damon/lru_sort.html)는 기본 설정에서 관찰 구간 중 50% 이상 접근된 메모리 영역을 hot으로, 120초 이상 접근되지 않은 영역을 cold로 분류합니다. 그런 다음 hot 페이지의 LRU 우선순위는 높이고 cold 페이지의 우선순위는 낮춰, 메모리가 부족할 때 cold 페이지가 먼저 정리되도록 합니다.

또 다른 예시인 [TPP](https://arxiv.org/abs/2206.02878)는 이러한 분류를 실제 CXL에서 사용합니다. 로컬 DDR에서 당장 사용하지 않는다고 판단된 cold 페이지는 CXL 메모리로 비동기적으로 내려보냅니다. 반대로 CXL에 있는 페이지가 접근되면 바로 올리지 않고 우선 활성 페이지 목록에 표시합니다. 이후 NUMA 접근 추적에서 다시 사용된 것이 확인되면 로컬 DDR로 올립니다. 단발성 접근 때문에 페이지가 두 계층 사이를 왕복하지 않도록 사용 여부를 한 번 더 확인하는 방식입니다.

### Vistara — production에서 검증한 CXL tiering

Meta의 [Vistara](https://aisystemcodesign.github.io/papers/isca26/vistara_camera_ready.pdf)는 두 방식 중 자동 tiering의 대표 사례입니다. Vistara는 퇴역 서버에서 회수한 DDR4를 CXL Type 3 장치로 연결합니다. AMD Turin 서버 한 대에 local DDR5 768GB와 CXL DDR4 256GB를 구성해 총 1TB로 확장했습니다.

Linux는 CXL 메모리를 CPU가 없는 NUMA node로 노출합니다. **TPP**와 **TMO**가 hot page는 local DDR5에 남기고 cold page는 CXL DDR4로 옮깁니다. 한 host에 **메모리 확장 + tiering**을 적용한 것입니다.

{{< figure src="vistara-memserver.webp" alt="AMD Turin CPU의 local DDR5와 두 개의 Vistara CXL card에 연결된 DDR4로 구성한 MemServer" caption="Local DDR5와 CXL DDR4를 결합한 Vistara MemServer." attr="출처: Vistara, Figure 6" attrlink="https://aisystemcodesign.github.io/papers/isca26/vistara_camera_ready.pdf" align="center" >}}

Meta는 CXL을 통해 실질적으로 서버 성능을 향상시킬 수 있다는 것을 보여주었습니다. CXL을 켠 CI·개발 환경에서는 서버당 job 또는 VM 수가 33% 늘었습니다. ML workload에서는 필요한 서버 수가 25% 줄고 처리량은 4% 늘었습니다.

---

## 그래서 어떤 워크로드에 잘 맞는가

세 사례를 관통하는 공통 조건을 뽑아 보면, CXL이 유리한 워크로드는 대략 이렇습니다.

- **용량이 병목**인 워크로드 (latency보다 capacity가 아쉬운 경우)
- **latency에 관대**한 데이터를 다루는 워크로드 (식은 데이터, 큰 working set)
- **접근 패턴이 예측 가능**해서 명시적 배치가 가능한 워크로드

반대로 **매 접근이 critical path에 있는 핫 데이터**(예: attention 연산이 매 스텝 두드리는 활성 KV, weight)는 여전히 HBM/DDR에 위치해야 합니다. CXL은 그 자리를 **대체**하는 게 아니라, 그 **아래 칸을 넓혀** 주는 기술이라는 점이 이 글의 핵심입니다.

이 지점에서 HBF와 CXL의 공통점을 발견할 수 있습니다. HBF는 GPU 바로 옆에서 HBM과 SSD 사이의 용량을 늘립니다. CXL은 CPU 옆과 시스템 수준에서 local DRAM 아래의 용량을 늘립니다. 물리적 위치와 지연시간은 다르지만, 둘 다 **빠르고 비싼 메모리 아래에 느리지만 큰 계층을 둔다**는 같은 철학을 공유합니다.

---

## 마무리

이번 5편에서 살펴본 내용을 정리하면 이렇습니다.

- **세 활용 사례**: KV cache offload / 메모리 풀링 기반 VM 통합 / hot·warm·cold tiering.
- **공통 조건**: 용량이 병목이고, latency에 관대하며, 접근 패턴이 예측 가능한 워크로드.
- **CXL의 자리**: 비싼 메모리를 *대체* 하는 게 아니라 그 *아래 칸을 넓히는* 계층.

이 시리즈는 SRAM, DRAM, HBM, NAND와 같은 서로 다른 메모리가 왜 하나로 합쳐질 수 없는지 묻는 데서 시작했습니다. 그 이유는 메모리의 본질적인 trade-off 한계에서 기인합니다. 속도와 용량, 비용을 한 종류의 메모리가 모두 만족시킬 수 없기 때문이었습니다.

HBF와 CXL도 그 trade-off를 없애지는 않습니다. 대신 빠르고 비싼 메모리에는 지금 필요한 data를 남기고, 느리지만 큰 메모리에는 나중에 쓸 data를 보냅니다. HBF는 GPU 가까이에서, CXL은 CPU와 system level에서 그 아래 칸을 넓힙니다.

{{< figure src="memory-hierarchy-completed.webp" alt="SRAM, HBM, DRAM 아래에서 HBF와 CXL 메모리가 용량을 확장하고 NVMe SSD로 이어지는 메모리 계층 피라미드" caption="HBF와 CXL 메모리가 메모리 계층의 용량을 확장합니다 · AI generated image" align="center" >}}

결국 하나의 메모리로 모든 문제를 풀 수는 없습니다. 데이터의 성격에 따라 적합한 메모리를 고르고, 여러 계층을 조합해 workload가 요구하는 성능과 용량을 맞춰야 합니다.

이는 엔지니어링에 본질적으로 하나의 정답이 없기 때문입니다. 엔지니어링은 당대의 기술과 예산 안에서 최적점을 찾고, 새로운 workload와 기술이 등장할 때마다 그 최적점을 조정하는 과정입니다.

다섯 편에 걸쳐 서로 다른 메모리가 왜 존재하고, 새로운 기술들이 어떤 문제를 풀기 위해 등장했는지 살펴봤습니다. 메모리 이해하기 시리즈는 여기서 마치겠습니다. 이 시리즈가 메모리 기술을 이해하는 데 도움이 되었기를 바랍니다. 읽어 주셔서 감사합니다.

---

## 추신

메모리 계층이 다양해질수록 가속기 회사는 더 복잡하고 흥미로운 문제를 풀어내야 합니다. 더욱이 메모리와 연산 로직, 소프트웨어와 알고리즘 등 하나의 영역에 국한되지 않고 서로 다른 도메인이 하나로 통합되어야 최적화된 가속기를 개발할 수 있습니다.
HyperAccel은 HW, SW, AI를 모두 다루는 회사로, 전 방면에 걸쳐 뛰어난 인재들이 모여 있습니다.
폭넓은 지식을 깊게 배우며 함께 성장하고 싶으신 분들은 언제든지 지원해 주세요!

**채용 사이트**: https://hyperaccel.career.greetinghr.com/ko/guide

## Reference

- [Compute Express Link Consortium — Specifications](https://www.computeexpresslink.org/)
- [Linux Kernel — CXL Driver Documentation](https://www.kernel.org/doc/html/latest/driver-api/cxl/index.html)
- D. Yoon et al., "TraCT: Disaggregated LLM Serving with CXL Shared Memory KV Cache at Rack-Scale," 2025. [arXiv:2512.18194](https://arxiv.org/abs/2512.18194)
- H. Li et al., "Pond: CXL-Based Memory Pooling Systems for Cloud Platforms," *ASPLOS*, 2023. [DOI: 10.1145/3575693.3578835](https://doi.org/10.1145/3575693.3578835)
- Linux Kernel, ["DAMON-based LRU-lists Sorting"](https://docs.kernel.org/admin-guide/mm/damon/lru_sort.html)
- H. Al Maruf et al., "TPP: Transparent Page Placement for CXL-Enabled Tiered-Memory," *ISCA*, 2023. [arXiv:2206.02878](https://arxiv.org/abs/2206.02878)
- N. Gholkar et al., "Vistara: Making CXL Real—Full Path from ASIC Design and OS Support to Hyperscale Deployment," *ISCA*, 2026. [Paper](https://aisystemcodesign.github.io/papers/isca26/vistara_camera_ready.pdf)
