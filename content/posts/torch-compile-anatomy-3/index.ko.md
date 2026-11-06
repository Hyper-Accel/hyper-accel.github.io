---
date: '2026-11-02T18:00:00+09:00'
title: "[torch.compile() 알아보기 - Part 03] PyTorch Conference 2026 참관기"
cover:
  image: "images/pytorch.jpg"
  alt: "PyTorch 로고"
  caption: "PyTorch"
  relative: true
authors: [Hyunjun Park]
tags: ["PyTorch", "torch.compile", "TorchInductor", "PyTorch Conference", "vLLM", "AI Agent", "NPU", "CI"]
series: ['torch.compile() 알아보기']
series_idx: 3
categories: ["Compilers and Kernels"]
summary: 'PyTorch Conference 2026에서 본 업계의 방향을 Agent, Acceleration, Ecosystem 세 키워드로 정리합니다. 에이전트가 바꾼 개발 방식, PyTorch와 vLLM의 가속 연구, NPU 회사들이 생태계에 들어오는 방식을 살펴봅니다.'
description: 'PyTorch Conference 2026 참관기입니다. 늘어나는 기여를 검증하기 위한 CI와 리팩토링, C++ FakeTensor 등 torch.compile 개선, vLLM의 추론 최적화, 그리고 Huawei Ascend와 IBM Spyre 등 NPU 회사들이 도구를 만들어 PyTorch 생태계에 합류하는 과정을 정리합니다.'
comments: true
keywords: [
  "PyTorch Conference 2026", "torch.compile", "AI agent", "CI",
  "FakeTensor", "graph break", "vLLM",
  "Spyre", "Ascend", "PrivateUse1", "OpenReg", "CRCR", "KTIR"
]
---

<!-- b:torch-compile-anatomy-3-1 -->
## 개요

<!-- b:torch-compile-anatomy-3-2 -->
안녕하세요. HyperAccel CL(Compute Library)팀 박현준입니다. [1편](https://hyper-accel.github.io/posts/torch-compile-anatomy/)에서는 `torch.compile()` 이 어떻게 동작하는지, [2편](https://hyper-accel.github.io/posts/torch-compile-anatomy-2/)에서는 왜 세 단계로 나뉘어 있고 누가 그 구조를 활용하는지 살펴봤습니다. 두 편은 이번 글을 위한 밑그림이었습니다. 이번에는 10월 20~21일 미국 산호세에서 열린 PyTorch Conference 2026에서 본 연구와 개발 동향을 정리해 보겠습니다.

<!-- b:torch-compile-anatomy-3-3 -->
컨퍼런스를 다녀온 뒤 에이전트에게 주요 연구 동향을 물어보니 학습, 추론, PyTorch 핵심 모듈, 커널 최적화 등을 꼽았습니다. 저는 이 가운데 추론과 컴파일러, 가속기 세션을 주로 들었습니다. 따라서 이 글은 컨퍼런스 전체의 요약이 아니라, **제가 고른 세션에서 본 흐름을 제 관점으로 해석한 글** 입니다. 직접 듣지 못한 세션은 공개된 소개를 바탕으로 정리하고, 본문에 따로 표시했습니다.

여러 세션에서 공통으로 느낀 흐름을 **Agent**, **Acceleration**, **Ecosystem** 세 키워드로 묶었습니다. 본문도 이에 맞춰 세 부분으로 구성했습니다.

<!-- b:torch-compile-anatomy-3-5 -->
1. 에이전트로 개발 속도가 빨라지면서, 프로젝트들이 **Continuous Integration(CI)** 과 구조를 어떻게 바꾸고 있는가
2. PyTorch와 vLLM은 무엇을 더 빠르게 만들고 있는가
3. **Neural Processing Unit(NPU)** 회사들은 어떤 도구를 만들어 PyTorch 생태계에 들어오고 있는가

<!-- b:torch-compile-anatomy-3-6 -->
---

<!-- b:torch-compile-anatomy-3-7 -->
## Part 1. Agent: 빨라진 개발 속도를 감당하기 {#part1}

![여러 개발자가 PyTorch를 중심으로 코드를 작성하고 함께 검토하는 모습을 그린 일러스트](images/part1-pytorch-contributors.webp)

<!-- b:torch-compile-anatomy-3-8 -->
### 병목이 리뷰로 옮겨 가다

<!-- b:torch-compile-anatomy-3-9 -->
제가 들은 vLLM Roadmap 세션에서 새 기능만큼 인상적이었던 화두는 **프로젝트 관리** 였습니다. 커밋과 기여자가 빠르게 늘면서 릴리스와 관리 방식을 개편하고 있다는 이야기였습니다. GitHub에서 각 연도 10월에 생성된 **Pull Request(PR)** 수를 비교하면 그 증가 폭을 볼 수 있습니다.

<!-- b:torch-compile-anatomy-3-10 -->
| 저장소 | 2024년 10월 | 2025년 10월 | 2026년 10월 |
| --- | ---: | ---: | ---: |
| vllm-project/vllm | 453 | 1,323 | 4,577 |
| pytorch/pytorch | 1,711 | 1,900 | 2,887 |

<!-- b:torch-compile-anatomy-3-11 -->
*GitHub 검색 기준이며 봇이 만든 PR도 포함합니다. 조회일은 2026년 11월 4일입니다.*

<!-- b:torch-compile-anatomy-3-12 -->
vLLM의 PR 수는 2년 만에 약 10배로 늘었습니다. 이 수치에는 프로젝트 자체의 성장도 반영되어 있어, 증가분을 모두 에이전트의 영향으로 볼 수는 없습니다. 다만 늘어나는 기여를 검토하고 유지하는 부담은 커지고 있었습니다. PyTorch의 [Fighting Agents with Agents](https://pytorch.org/blog/core-pytorch-sessions-at-pytorch-conference-north-america-2026/) 세션 소개도 메인테이너가 검토할 에이전트 작성 PR이 계속 늘고 있다는 이야기로 시작합니다.

<!-- b:torch-compile-anatomy-3-13 -->
코드를 쓰는 비용이 낮아질수록 **그 코드를 읽고 검증하고 유지하는 일** 이 중요해집니다. 프로젝트들은 먼저 기여자가 지켜야 할 규칙을 명확히 했습니다. [vLLM 기여 가이드](https://docs.vllm.ai/en/v0.28.0/contributing/)는 "pure agent" PR을 제출하지 말라고 합니다. 변경된 모든 줄을 검토하고 동작을 끝까지 검증할 책임은 제출한 사람에게 있다고 명시합니다.

<!-- b:torch-compile-anatomy-3-14 -->
### CI: 에이전트로 에이전트를 상대하다

<!-- b:torch-compile-anatomy-3-15 -->
규칙을 정하는 것과 함께 CI와 리뷰 과정도 바뀌고 있습니다. 이 절의 세션들은 제가 직접 듣지 못해 공개된 소개를 기준으로 정리했습니다.

<!-- b:torch-compile-anatomy-3-16 -->
- **Fighting Agents with Agents: Bringing Claude to PyTorch CI, triage, and PR review:** PyTorch 인프라에 이슈 자동 분류, PR 리뷰 스킬, CI 실패와 자동 되돌림(autorevert) 조사를 넣었습니다. 목표는 메인테이너를 대체하는 것이 아니라 돕는 것이라고 합니다.
- **Shipping PyTorch and Its Ecosystem: A Modern Release Story:** Triton과 vLLM을 PyTorch nightly에 맞춰 계속 검증해, 깨지는 지점을 릴리스 브랜치 전에 찾습니다. 에이전트가 CI 실패를 분류하고 수정안을 쓰더라도 최종 결정은 사람이 내립니다.

<!-- b:torch-compile-anatomy-3-17 -->
두 세션에서 공통으로 눈에 띈 것은 사람과 에이전트의 역할 분담입니다. 에이전트는 분류와 조사, 수정안 작성 같은 반복 업무를 맡고, **최종 판단은 사람이 합니다.** vLLM도 제한된 CI 자원을 관리하기 위해 새 커밋마다 CI를 자동 실행하지 않습니다. 리뷰어나 승인된 PR의 작성자가 `/ci run` 으로 실행하도록 하고 있습니다.

<!-- b:torch-compile-anatomy-3-18 -->
### 리팩토링: 여러 사람이 기여할 수 있는 구조로

<!-- b:torch-compile-anatomy-3-19 -->
기여자가 늘수록 코드 구조도 중요해집니다. 여러 사람이 같은 부분을 고치면 리뷰가 어려워지고 변경 사항끼리 충돌하기 쉽습니다. vLLM에서는 공통으로 처리할 부분과 백엔드별로 달라지는 부분을 나누는 리팩토링을 소개했습니다.

<!-- b:torch-compile-anatomy-3-20 -->
[A Developer's Guide to Attention in vLLM](https://events.linuxfoundation.org/pytorch-conference-north-america/program/schedule/?id=1254038)이 좋은 예입니다. 어텐션은 종류마다 메타데이터와 **Key-Value(KV)** 캐시 배치가 달라서 백엔드와 커넥터 코드에 분기가 늘고 있었습니다. 그래서 공통 메타데이터(`CommonAttentionMetadata`)를 실행 단계마다 한 번 만들고, 각 백엔드는 필요한 정보만 덧붙이도록 바꿨습니다. KV 캐시의 논리적 차원 순서를 통일하고 실제 메모리 배치는 stride로 표현합니다. 논리 형태와 물리 배치를 분리하면 새 어텐션이나 새 저장 방식을 추가할 때 고칠 곳이 줄어듭니다.

<!-- b:torch-compile-anatomy-3-21 -->
로드맵에서 소개한 Flat Model과 Model Runner V2도 같은 방향의 모델 실행 구조 개편입니다. 공개된 세션 소개 기준으로는 [One Model Definition, Many Accelerators](https://pytorch.org/blog/vllm-sessions-at-pytorch-conference-north-america-2026/)가 모델 로직을 하드웨어 실행 경로에서 분리해, 같은 모델 정의를 Intel Gaudi와 IBM Spyre에서 플랫폼별 코드 없이 돌린다고 합니다.

<!-- b:torch-compile-anatomy-3-22 -->
발표들은 이 작업들을 주로 새 모델과 구조를 쉽게 지원하기 위한 것으로 설명했습니다. 이런 리팩토링은 에이전트의 등장과 무관하게 유지보수에 도움이 됩니다. 저는 여기에 코드를 고치는 비용이 낮아진 영향도 있을 것이라고 생각했습니다. 필요성을 알면서도 비용 때문에 미뤘던 구조 개선을 이제는 에이전트의 도움으로 시도하기 쉬워졌기 때문입니다. 이는 발표자의 설명이 아니라, 여러 세션을 들으며 제가 떠올린 해석입니다.

<!-- b:torch-compile-anatomy-3-23 -->
---

<!-- b:torch-compile-anatomy-3-24 -->
## Part 2. Acceleration: PyTorch와 vLLM은 어디를 빠르게 만들고 있나 {#part2}

![PyTorch와 vLLM 로고를 나란히 배치한 이미지](images/part2-pytorch-vllm.webp)

<!-- b:torch-compile-anatomy-3-25 -->
Part 1이 개발 속도의 이야기였다면, Part 2는 컴파일부터 실제 서빙까지 걸리는 시간의 이야기입니다. 제가 들은 세션에서는 **생성된 코드의 속도** 뿐 아니라 컴파일 비용과 런타임의 대기 시간을 줄이는 작업도 함께 강조되었습니다.

<!-- b:torch-compile-anatomy-3-26 -->
### 컴파일을 빠르게: FakeTensor와 graph break

<!-- b:torch-compile-anatomy-3-27 -->
[Speeding Up torch.compile: A New FakeTensor](https://events.linuxfoundation.org/pytorch-conference-north-america/program/schedule/?id=1257046)부터 보겠습니다. FakeTensor는 실제 데이터 없이 shape, dtype, device 같은 메타데이터만 계산하는 텐서입니다. Dynamo는 그래프를 추적하면서 연산마다 이 계산을 하고, Inductor도 코드를 만드는 과정에서 씁니다. 세션 소개에 따르면 이 전파가 Dynamo 추적 시간의 약 20%를 차지합니다.

<!-- b:torch-compile-anatomy-3-28 -->
해법은 FakeTensor를 C++로 새로 구현하는 것입니다. 파이썬 디스패치와 심볼릭 연산의 부가 비용을 줄인 결과, 118개 연산의 실행 시간 기하평균이 48.2µs에서 2.2µs로 줄었습니다. 발표에서 보고한 가속 폭은 **22.3배** 입니다. 다만 이는 연산별 측정값입니다. torchbench 전체 컴파일 지표의 개선 폭은 설정별로 3.7~11.6%였고, 개별 모델에서는 20~30%까지 개선되었다고 합니다.

구현 경로를 바꾸는 것만으로 이 정도 개선을 얻었다는 점이 인상적이었습니다. 남은 파이썬 메타 커널을 C++로 옮기는 향후 작업에는 "Use Agents!"라는 계획도 적혀 있었습니다. Part 1에서 본 에이전트 활용이 여기서도 이어졌습니다.

<!-- b:torch-compile-anatomy-3-29 -->
graph break 처리도 개선되고 있습니다. 1편에서 graph break가 발생하면 그래프가 짧아져 융합 범위가 좁아진다고 설명했습니다. 함수 호출이 깊게 중첩되면 중복 작업도 늘어납니다. [Nested Graph Breaks](https://pytorch.org/blog/core-pytorch-sessions-at-pytorch-conference-north-america-2026/) 세션 소개에 따르면, 깊이 N인 함수 호출에서 O(N)번 발생하던 중복 graph break를 O(1)로 줄여 더 큰 그래프를 캡처할 수 있게 되었습니다.

<!-- b:torch-compile-anatomy-3-30 -->
[Lightweight FX Tracing in PyTorch](https://events.linuxfoundation.org/pytorch-conference-north-america/program/schedule/?id=1256183)는 전체 그래프를 얻으려는 사용자에게 Dynamo가 너무 무겁다는 피드백에서 출발합니다. 파이썬 부수 효과 없이 텐서 계산으로 표현되는 코드처럼 조건이 맞는 경우를 위해, `make_fx` 기반의 경량 추적 경로를 제안했습니다.

<!-- b:torch-compile-anatomy-3-34 -->
### 실행을 빠르게: 에이전트 워크로드와 vLLM

<!-- b:torch-compile-anatomy-3-35 -->
에이전트는 개발 방식뿐 아니라 추론 워크로드도 바꾸고 있습니다. 긴 문맥을 유지한 채 대화와 도구 호출을 여러 차례 이어 가는 요청이 많아졌습니다. 도구의 응답을 기다리는 동안 해당 요청의 토큰 생성은 멈추지만, 다음 생성에 필요한 KV 상태는 유지하거나 복구할 수 있어야 합니다. vLLM에서는 이런 워크로드에 대응하는 최적화를 소개했습니다.

<!-- b:torch-compile-anatomy-3-36 -->
- **더 적게 기다리기:** vLLM Roadmap은 GPU가 CPU 동기화 때문에 멈추지 않게 하는 작업, 커널 융합과 메가커널(mega-kernel)을 소개했습니다.
- **한 번에 여러 토큰 확인하기:** What's New in Inference in October와 기업용 추론 세션은 추측 디코딩(speculative decoding)을 응답 속도를 높이는 수단으로 다뤘습니다.
- **KV를 오래, 싸게 유지하기:** [Native Tiered KV Cache Offloading in vLLM](https://events.linuxfoundation.org/pytorch-conference-north-america/program/schedule/?id=1254938)은 CPU 메모리를 허브로 삼아 GPU 메모리를 먼저 비우고, 저장소나 다른 노드로의 전송은 비동기로 처리합니다.

<!-- b:torch-compile-anatomy-3-37 -->
이 작업들은 `torch.compile()` 만으로 해결할 수 있는 문제가 아닙니다. 예를 들어 KV 오프로딩은 디코드 커널 자체를 빠르게 만드는 최적화가 아닙니다. 캐시 용량과 재사용을 늘리는 대신 전송 비용이 생기므로, 효과는 워크로드와 메모리 사용량에 따라 달라집니다. TPU 메가커널 데모도 커널 최적화와 함께 프리필·디코드 분리와 캐시 재사용이 필요하다고 설명했습니다. 커널 하나의 속도를 넘어 서빙 전체를 봐야 한다는 메시지를 여러 세션에서 들을 수 있었습니다.

<!-- b:torch-compile-anatomy-3-40 -->
---

<!-- b:torch-compile-anatomy-3-41 -->
## Part 3. Ecosystem: 공통 기반 위에 쌓는 하드웨어 지원 {#part3}

![Huawei 로고와 IBM 로고 아래 Spyre 제품명을 나란히 배치한 이미지](images/part3-huawei-spyre.webp)

<!-- b:torch-compile-anatomy-3-42 -->
2편에서는 각 가속기가 `torch.compile()` 의 어느 단계에 연결되는지 살펴봤습니다. 이번에는 연결한 뒤의 이야기입니다. 새 하드웨어에서 성능을 내고, PyTorch가 바뀌어도 호환성을 유지하려면 무엇이 필요할까요? Huawei와 IBM Spyre의 사례를 차례로 살펴보겠습니다.

<!-- b:torch-compile-anatomy-3-43 -->
### Huawei: 공통 인터페이스에 연결하고 검증하기

<!-- b:torch-compile-anatomy-3-44 -->
Huawei의 [Boosting PyTorch's Heterogeneous Compute Ecosystem](https://events.linuxfoundation.org/pytorch-conference-north-america/program/schedule/?id=1348281) 발표는 GPU 중심의 코드에 NPU를 연결하기 어렵다는 문제에서 출발했습니다. 과제는 **Integrate, Perform, Verify**, 즉 통합·성능·검증 세 가지였습니다. 연산자를 실행하는 데서 그치지 않고, 분산 실행과 컴파일, 테스트까지 지원해야 한다는 뜻입니다.

<!-- b:torch-compile-anatomy-3-45 -->
통합의 출발점은 2편에서 다룬 PrivateUse1입니다. 참고 구현인 OpenReg는 장치 연동 방법을 보여 주고, 장치 공통 API인 `torch.accelerator` 는 CUDA에 종속된 코드를 장치 독립적으로 작성하도록 돕습니다. Huawei는 여기에 분산 학습을 위한 FSDP2, DTensor, 통신 백엔드를 연결했다고 설명했습니다.

<!-- b:torch-compile-anatomy-3-46 -->
통합한 뒤에는 PyTorch의 변화에도 호환성을 유지해야 합니다. 여기서 Part 1의 CI가 다시 등장합니다. **Cross-Repository CI Relay(CRCR)** 는 PyTorch의 PR 이벤트를 외부 저장소에 전달해, 머지 전에 외부 백엔드와의 호환성을 검증할 수 있게 합니다. [공개된 세션 소개](https://pytorch.org/blog/core-pytorch-sessions-at-pytorch-conference-north-america-2026/)에 따르면 Huawei는 CRCR와 장치 독립적 테스트 재사용을 결합했습니다. 58만 개가 넘는 커뮤니티 테스트를 활용하고, upstream 업데이트 후 30일 안에 안정 버전을 내는 것이 그 결과라고 합니다.

<!-- b:torch-compile-anatomy-3-47 -->
발표는 함께 NPU 생태계를 만들어 갈 기여자를 찾는다는 이야기로 끝났습니다. PyTorch가 제공하는 인터페이스를 활용하는 동시에, 다른 장치도 함께 쓸 수 있는 통합·검증 기반에 기여하겠다는 방향이 인상적이었습니다.

<!-- b:torch-compile-anatomy-3-48 -->
### IBM Spyre: Inductor를 재사용하고 하드웨어에 맞게 확장하기

<!-- b:torch-compile-anatomy-3-49 -->
Huawei 사례가 통합과 검증의 기반을 보여 줬다면, IBM Spyre 사례는 공통 컴파일러를 활용해 성능을 만드는 과정을 보여 줬습니다. [Integrating the IBM Spyre Accelerator](https://events.linuxfoundation.org/pytorch-conference-north-america/program/schedule/?id=1256168) 발표와 [IBM의 공식 글](https://pytorch.org/blog/extending-inductor-for-the-ibm-spyre-accelerator/)에서 2편에 소개한 Inductor 확장 방식의 구체적인 모습을 볼 수 있었습니다.

<!-- b:torch-compile-anatomy-3-50 -->
Spyre는 32개 코어가 각각 2MB 스크래치패드를 가진 데이터플로우 가속기입니다. 데이터는 128바이트 단위인 stick으로 이동하고, 코어별 작업 분할도 컴파일 시점에 정해야 합니다. 따라서 GPU를 전제로 한 Inductor의 처리 방식을 그대로 적용하기 어려운 부분이 있었습니다. **텐서 레이아웃, 스크래치패드 관리, 코어별 작업 배정** 입니다. torch-spyre는 이 부분을 스케줄링 이전의 커스텀 패스로 처리하고, 나머지 상당 부분은 Inductor를 재사용합니다.

<!-- b:torch-compile-anatomy-3-51 -->
공통 컴파일러를 재사용하면서 예전 자체 컴파일러 스택의 약 27만 3천 줄은 약 3만 8,600줄로 줄었습니다. **약 7분의 1** 이라는 수치는 실행 속도가 아니라 코드 규모를 뜻합니다. 재사용으로 직접 관리할 코드를 줄이고, 하드웨어에 특화된 작업에 집중한 사례입니다. 타일 중간 표현인 [Kernel Tile IR(KTIR)](https://pytorch.org/blog/your-guide-to-hardware-acceleration-compute-infrastructure-at-pytorch-conference-north-america-2026/)와 [장치별 텐서 레이아웃](https://pytorch.org/blog/core-pytorch-sessions-at-pytorch-conference-north-america-2026/) 제안에서도 하드웨어에 필요한 확장을 공통 기반에 반영하려는 방향을 볼 수 있었습니다.

<!-- b:torch-compile-anatomy-3-52 -->
Spyre도 앞서 설명한 CRCR를 활용합니다. 흥미로운 점은 테스트를 고르는 방식입니다. [공개된 글](https://pytorch.org/blog/from-upstream-changes-to-downstream-confidence-inside-torch-spyres-integration-with-pytorch-crcr/)에 따르면, 수만 개의 PyTorch 테스트 가운데 하드웨어에 의미 있는 항목을 **에이전트 파이프라인으로 선택했습니다.** 선택 이유는 사람이 검토할 수 있도록 설정 파일에 남기고, 실제 하드웨어의 실행 로그를 바탕으로 분류를 다듬습니다. PyTorch 2.13에서 2.14로 올릴 때는 변경된 테스트 약 4,000개를 평가하면 되었다고 합니다.

<!-- b:torch-compile-anatomy-3-53 -->
### 공통점: 재사용하고, 확장하고, 함께 검증하기

<!-- b:torch-compile-anatomy-3-54 -->
두 사례에서 강조한 작업은 다르지만 방향은 같았습니다. 공통 인터페이스와 컴파일러를 재사용하고, 하드웨어에 필요한 부분을 확장하며, upstream의 변화에 맞춰 검증을 이어 가는 것입니다. 각자 만든 확장을 다른 장치도 활용할 수 있도록 공유하려는 움직임도 보였습니다.

<!-- b:torch-compile-anatomy-3-56 -->
이 지점에서 세 키워드가 연결됩니다. 하드웨어의 **Acceleration** 을 구현하는 데 공통 **Ecosystem** 을 활용하고, 그 생태계를 따라가기 위한 검증에는 **Agent** 를 도입합니다. Part 1에서 본 에이전트의 제안과 사람의 판단이라는 역할 분담이 가속기 지원에서도 이어지고 있었습니다.

<!-- b:torch-compile-anatomy-3-57 -->
---

<!-- b:torch-compile-anatomy-3-58 -->
## Conclusion

<!-- b:torch-compile-anatomy-3-59 -->
이번 컨퍼런스에서 **Agent** 는 개발 속도와 함께 검증·유지보수의 중요성을 드러냈습니다. **Acceleration** 은 생성 코드의 성능뿐 아니라 컴파일 비용과 런타임의 대기 시간을 줄이는 문제로 이어졌습니다. **Ecosystem** 에서는 가속기 업체들이 공통 기반을 활용하고, 하드웨어 지원 과정에서 만든 확장을 다시 공유하려는 모습을 볼 수 있었습니다.

<!-- b:torch-compile-anatomy-3-60 -->
칩을 만드는 회사의 개발자로서 느낀 점은 두 가지입니다. 첫째, 필요한 기능을 직접 만들기 전에 PyTorch나 vLLM에 이미 있거나 개발 중인지 살펴봐야 합니다. Spyre가 보여 준 것처럼 공통 기반을 재사용하면 직접 관리해야 할 코드를 줄일 수 있습니다. 저희도 활용할 수 있는 오픈소스 모듈을 적극적으로 검토하면 좋겠다고 생각했습니다.

둘째, 하드웨어에 특화된 부분은 공통 코드와 경계를 분명히 해야 합니다. 에이전트의 도움으로 구조 개선을 시도하기 쉬워진 만큼, 그동안 미뤄 온 모듈화도 돌아볼 필요가 있습니다. 저희 소프트웨어 스택이 오픈소스와 어떻게 자연스럽게 맞물릴 수 있을지 고민하게 된 이틀이었습니다.

<!-- b:torch-compile-anatomy-3-62 -->
## Reference

<!-- b:torch-compile-anatomy-3-63 -->
**컨퍼런스 공식 자료**

<!-- b:torch-compile-anatomy-3-64 -->
- [PyTorch Conference North America 2026 리캡](https://pytorch.org/blog/pytorch-conference-north-america-2026-accelerating-open-intelligence-together/)
- [Core PyTorch Sessions](https://pytorch.org/blog/core-pytorch-sessions-at-pytorch-conference-north-america-2026/)
- [vLLM Sessions](https://pytorch.org/blog/vllm-sessions-at-pytorch-conference-north-america-2026/)
- [Agentic AI and Next-Gen Intelligence Sessions](https://pytorch.org/blog/agentic-ai-and-next-gen-intelligence-sessions-at-pytorch-conference-north-america-2026/)
- [Hardware Acceleration & Compute Infrastructure Guide](https://pytorch.org/blog/your-guide-to-hardware-acceleration-compute-infrastructure-at-pytorch-conference-north-america-2026/)

<!-- b:torch-compile-anatomy-3-67 -->
**문서와 기사**

<!-- b:torch-compile-anatomy-3-68 -->
- [vLLM Contributing Guide](https://docs.vllm.ai/en/v0.28.0/contributing/)
- [Extending Inductor for the IBM Spyre Accelerator](https://pytorch.org/blog/extending-inductor-for-the-ibm-spyre-accelerator/)
- [From Upstream Changes to Downstream Confidence](https://pytorch.org/blog/from-upstream-changes-to-downstream-confidence-inside-torch-spyres-integration-with-pytorch-crcr/)

<!-- b:torch-compile-anatomy-3-71 -->
## 추신: HyperAccel은 채용 중입니다!

<!-- b:torch-compile-anatomy-3-72 -->
![HyperAccel의 LPU 칩 Bertha. 패키지 가운데에 HYPER ACCEL과 Bertha가 새겨진 다이가 자리하고, 주변으로 배선과 패드가 뻗어 있다](images/bertha-chip.jpg)

<!-- b:torch-compile-anatomy-3-73 -->
HyperAccel은 LPU라는 새로운 칩을 만드는 회사이지만, 동시에 소프트웨어의 최신 흐름을 가장 가까이에서 따라가며 개발하는 팀이기도 합니다. 이번 글에서 다룬 것처럼 새로운 하드웨어를 둘러싼 소프트웨어 스택은 지금도 빠르게 바뀌고 있고, 저희는 그 최전방에서 일하고 있습니다.

<!-- b:torch-compile-anatomy-3-74 -->
사용자가 새로운 디바이스를 기존 방식 그대로, 편하게 사용할 수 있도록 만드는 연구와 개발에 함께하고 싶으시다면 [HyperAccel Career](https://hyperaccel.career.greetinghr.com/ko/guide)로 지원해 주세요!
