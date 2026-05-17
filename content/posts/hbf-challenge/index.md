---
date: '2026-04-29T03:00:00+09:00'
draft: true
title: 'AI 시대의 필수 소비재, 메모리 이해하기 3편: HBF가 풀어야 할 과제'
cover:
  image: "cover.jpg"
  alt: "HBF 상용화 도전 과제 커버 이미지"
  caption: "HBF가 universal로 가기 전에 풀어야 할 것들"
  relative: true
authors: [Jaewon Lim]
tags: ["HBF", "High Bandwidth Flash", "memory", "LLM", "Inference", "Sparse Attention", "SK Hynix", "H3"]
series: ["AI 시대의 필수 소비재, 메모리 이해하기"]
series_idx: 3
categories: ["AI hardware", "Semiconductor"]
summary: "HBF에게 적합한 자리는 분명히 있습니다. 하지만 memory hierarchy 피라미드에 들어가기 위해서는 아직 부족한 점이 많습니다. 최신 LLM 모델 및 추론 워크로드 트렌드, 그리고 Flash memory의 LLM 사용 방식을 살펴보며 HBF의 남은 과제와 극복 방안에 대해 살펴봅니다."
description: "HBF에게 적합한 자리는 분명히 있습니다. 하지만 memory hierarchy 피라미드에 들어가기 위해서는 아직 부족한 점이 많습니다. 최신 LLM 모델 및 추론 워크로드 트렌드, 그리고 Flash memory의 LLM 사용 방식을 살펴보며 HBF의 남은 과제와 극복 방안에 대해 살펴봅니다."
comments: true
keywords: [
  "HBF", "High Bandwidth Flash", "AI 메모리"
]
---

> 이 글은 **AI 시대의 필수 소비재, 메모리 이해하기** 시리즈의 3편입니다.  
> [2편](https://hyper-accel.github.io/posts/hbf-workload/) 에서는 HBF가 효과적으로 쓰일 수 있는 자리들(CAG, H³, 그리고 그 너머의 후보 워크로드들)을 정리했습니다.  
> 이번 편에서는 HBF가 본격적으로 상용화 되기 위해 풀어야 할 과제들에 대해 알아보겠습니다.

<!-- 그림 #1: 커버 이미지 (cover.jpg) -->

## 들어가며

안녕하세요. HyperAccel DV팀 임재원입니다.

지난 2편의 결론은 다음과 같았습니다. 
> **워크로드를 잘 고르면 HBF의 약점은 숨길 수 있다.** 
HBF가 가진 약점과 이를 극복할 수 있는 워크로드의 조건, 그리고 활용 예시인 SK하이닉스의 H³와 조지아텍의 HAVEN과 같은 아이디어들을 살펴보았습니다.

하지만 이는 HBF의 약점을 숨길 수 있는 방법이지 완전히 극복할 수 있는 방법은 아닙니다. 여러가지 가정이 충족된 workload에서 이룰 수 있는 조건부 아이디어입니다. LLM 워크로드가 HBF를 많이 필요로 하지 않는 방향으로 발전한다면 기술이 발전한다고 하더라도 수요는 크지 않을 것입니다.
아울러 HBF의 약점은 NAND Flash 자체의 약점이기도 합니다. HBF는 HBM의 용량 한계를 극복하기 위해 제안된 아이디어이지만, HBF가 Flash를 기반으로 만들어진 대안인 만큼 우리는 LLM에서 Flash memory가 현재 어디서 어떻게 사용되는지 확인해봐야 합니다. 이것이 선행되어야 HBF가 기존이 Flash memory와는 어떤 차별점을 가질 수 있는지 알 수 있기 때문입니다.

이번 편에서는 최신 LLM workload의 추세와 Flash memory(SSD)가 LLM 서빙 환경에서 어떻게 사용되는지 알아보고 HBF가 상용화 되기 위해 풀어야 할 과제들을 알아보겠습니다. 

---

## 최신 LLM 트렌드 살펴보기

지난 편 알아본 HBF의 단점을 숨길 수 있는 워크로드의 조건 중 하나는 **워크로드가 deterministic 하다면 prefetch로 숨길 수 있다.** H³의 실험도 정확히 이 가정 위에 서 있습니다. 다음 layer가 어떤 weight와 KV cache를 읽을지 미리 알 수 있다는 전제입니다.

하지만 최근 frontier 모델들의 개발 방식은 이 전제를 조금 흔들고 있습니다.

## Sparse attention: KV cache의 일부만 연산에 활용하기

Transformer model의 가장 중요한 연산인 attention mechanism의 가장 큰 문제는 입력 길이에 따라 연산량이 quadratic하게 증가한다는 것입니다. 이를 극복하기 위해 [Mamba]와 같은 linear attention도 연구되고 있지만, Transfomer에 비해서는 성능 한계가 뚜렷하여 기존의 full attention과 mamba를 hybrid 형태로 사용하는 방식으로서만 사용되고 있습니다.

때문에 최근 frontier 연구들은 full attention의 연산량을 줄이기 위해 현재까지 입력된 token으로 만들어진 Key-Value 중 실제 연산에는 일부만 사용하여 연산량과 메모리 통신량을 줄이는 방법을 사용하고 있습니다. Attention mechanism은 근본적으로 모든 단어간의 맥락을 통해 다음 토큰을 예측하지만, 실제로 중요한 토큰은 일부만 필요하다는 주장에서 비롯된 아이디어입니다. 이를 그림으로 나타내보면 아래와 같습니다.

<!-- 그림 #2: Full attention vs Sparse attention (01-full-attention-vs-sparse-attention.jpg) -->

KV cache 자체는 연산되고 메모리에 저장되어야 하기 때문에 KV cache를 저장할 용량은 여전히 필요합니다. 이로 인해 용량적인 측면에서는 HBF의 이점을 사용할 수 있습니다. 하지만 sparse attention의 종류에 따라 KV cache를 선택하는 알고리즘이 조금씩 다르며, KV cache를 읽는 패턴도 조금씩 달라집니다.

### StreamingLLM: Attention sink + sliding window attetnion

비교적 단순한 형태의 [StreamingLLM]은 특정 토큰이 처음 토큰과 현재 위치 기준으로 근접한 몇개의 토큰과의 attention만 연산합니다. 이 경우 기존의 attention 패턴과 유사하게 필요한 KV cache의 위치를 예측하는 것이 비교적 수월합니다.

<!-- 그림 #3: StreamingLLM -->

하지만 이 경우 현재 위치한 토큰이 첫 토큰과 인접한 토큰과의 관계만을 파악하여 중간에 위치한 토큰과의 관계는 완전히 무시해버린다는 단점이있습니다. 

### InfLLM & Quest: query-aware sparse attention

이후에 나온 기법인 [InfLLM]과 [Quest]는 이를 보완하고자 조금 다른 방식을 사용합니다. 두 방식의 약간의 차이는 있지만 두 방식 모두 현재 처리 중인 토큰으로 만들어진 query와 저장된 KV cache 중 일부를 연산하여 필요한 Key-value의 idx를 계산합니다. 이후 구해진 idx에 해당하는 Key-value만을 사용하여 attention 연산을 진행합니다. 앞선 방식과 다른 점은 토큰에 따라 필요한 Key value의 위치가 달라지기 때문에 이를 미리 예측하는 것이 어렵다는 점입니다. 추가로 idx를 계산하기 위해 사용되는 Key들도 읽기 패턴이 불규칙합니다.

<!-- 그림 #4: InfLLM & Quest -->

### Compressed Sparse Attention(CSA) & Heavily Compressed Attention(HCA): KV cache를 압축해서 저장하기

가장 최근에 발표된 Deepseek-V4에서는 앞에서 설명한 selection 방식에서 더 나아가 전체 KV cache를 토큰 방향으로 압축합니다. 이를 통해 실제 attention 연산에 사용되는 KV cache를 줄일 수 있습니다. 압축하는 과정에서 전체 KV cache가 projection matrix를 한번 거치기 때문에 read가 최소 한번 일어나고 압축된 KV cache는 이후에도 반복적으로 재사용될 수 있습니다.

<!-- 그림 #5: deepseek KV cache management diagram -->

Sparse Attention과 같은 새로운 소프트웨어 기법의 등장은 HBF 적용 시 오히려 병목을 만들 수 있습니다. 읽어야할 주소를 찾는 것이 어려워지게 되면 miss되는 비율이 올라가거나 불필요한 양의 데이터를 읽어와야 하는 일이 생길 수 있습니다. 이 경우 HBF의 성능을 제대로 발휘하기 어려워집니다. 소프트웨어 최적화를 통해 prefetch hint를 효과적으로 주거나 하드웨어를 고려한 모델 설계가 필요합니다.

흥미로운 점은 Deepseek에서 발표한 paper에서는 이렇게 만들어진 KV cache를 메모리에서 어떻게 관리할 것인가에 대한 고민도 담겨 있다는 것입니다. Deepseek은 모델 서비스 과정에서 이 압축된 KV를 SSD storage에 보관하여 재사용의 이점을 살린다고 소개하고 있습니다. 이러한 방식의 메모리 맞춤형 최적화 방식은 Flash에 기반한 HBF를 활용하는데도 큰 이점으로 작용할 것입니다.

그러면 다음으로 LLM 서빙에서 기존의 Flash 기반 SSD storage가 어떻게 사용되고 있는지 살펴보겠습니다.

## LLM 서비스 내에서의 SSD Storage 활용처

model loading, 공유 SSD storage -> 서비스용 GPU memory로 로드 (현재도 모델 로딩은 그렇게, DRAM은 volatile, SSD는 non-volatile이니까) 여러 디바이스가 가져가려고 할때도 Storage에 접근 필요

KV cache swapping : 비활성 세션은 GPU memory -> CPU DRAM / SSD로 swapping (미 사용 메모리의 GPU 점유 방지)

최근 trend : GPU가 사용하는 memory를 SSD로 offloading (model offload, KV cache offload)
GPU -> CPU -> SSD 거치지 않고 direct로 넘기는 기술도 등장 (GPU direct storage, GDS) 

on-device AI를 위해 edge device의 Flash memory를 활용하여 model구동하려는 시도도 등장 [LLM in a Flash]
적은 GPU로 큰 모델을 서빙하기 위해 SSD Storage 적극 사용 중

[Flexgen]

---

## 현실적인 문제, 그리고 HBF에 대한 회의론

write-endurance를 견딜 수 있도록 cell 선택 (수명 중요, HBF + XPU같이 패키징되면 교체도 불가능)
hardware-software co-design
Hot / Warm / Cold KV cache의 적절한 구분
효과적인 prefetch hint를 위한 SW적 지원 + 하드웨어 가속을 위해 HBF 근처에서 간단한 연산을 처리/보조 하는 등의 노력 필요
HBF controller

산업계 입장 : HBF를 외치고 있는 것은 memory vendor들(특히 Flash 사업에 주력하는 Sandisk 중심으로)뿐, HBM도  

JEDEC 스펙이 어떻게 나오느냐가 관건이 될 듯 
PCIe 사용한다? -> 안정적인 방법이지만 대역폭 처리 불가, PCIe 자체가 병목, CXL같은 추가적인 기술이 필요해짐
HBM과 같이 패키징 기반 interposer 사용 -> 수명 관리를 위한 controller + SW 지원 필수적
---

## 마무리

오늘 글에서는..


---

## 추신: HyperAccel은 채용 중입니다!

메모리 계층이 다양해질수록 가속기 설계자가 풀어야 할 문제는 더 흥미로워집니다.

저는 HyperAccel DV팀에서 LLM 가속 ASIC의 하드웨어 검증을 담당하고 있습니다. 단일 칩의 검증을 넘어 메모리 계층, 시스템 통합, 워크로드 매칭까지 함께 고민할 수 있는 자리에서 매일 새로운 문제를 만나고 있습니다.

HyperAccel은 HW, SW, AI를 모두 다루는 회사입니다. 폭넓은 지식을 깊게 배우며 함께 성장하고 싶으신 분들은 언제든지 [채용 사이트](https://hyperaccel.career.greetinghr.com/ko/guide) 에서 지원해 주세요!

---

## Reference

An I/O Characterizing Study of Offloading LLM Models
and KV Caches to NVMe SSD
LLM in a Flash
SSD Offloading for LLM Mixture-of-Experts
Weights Considered Harmful in Energy Efficiency
Flexgen
