---
date: '2026-11-02T18:00:00+09:00'
title: '[torch.compile() 알아보기 - Part 03] PyTorch Conference 2026에서 본 두 키워드: Agent와 Acceleration'
cover:
  image: "images/pytorch.jpg"
  alt: "PyTorch 로고"
  caption: "PyTorch"
  relative: true
authors: [Hyunjun Park]
tags: ["torch.compile", "PyTorch", "PyTorch Conference", "vLLM", "TorchInductor", "AI Agent", "NPU", "CI"]
series: ['torch.compile() 알아보기']
series_idx: 3
categories: ["Compilers and Kernels"]
summary: 'PyTorch Conference 2026에서 본 업계의 방향을 Agent와 Acceleration 두 키워드로 정리합니다. 에이전트가 바꾼 개발 방식, PyTorch와 vLLM의 가속 연구, NPU 회사들이 생태계에 들어오는 방식을 살펴봅니다.'
description: 'PyTorch Conference 2026 참관기입니다. 에이전트로 늘어난 PR을 감당하기 위한 CI와 리팩토링, C++ FakeTensor와 unbacked shape 같은 torch.compile 개선, vLLM의 추론 최적화, 그리고 Huawei Ascend와 IBM Spyre 등 NPU 회사들이 도구를 만들어 PyTorch 생태계에 합류하는 과정을 정리합니다.'
comments: true
keywords: [
  "PyTorch Conference 2026", "torch.compile", "AI agent", "CI",
  "FakeTensor", "graph break", "unbacked dynamic shape", "vLLM",
  "Spyre", "Ascend", "PrivateUse1", "OpenReg", "CRCR", "KTIR"
]
---

<!-- b:torch-compile-anatomy-3-1 -->
### 개요

<!-- b:torch-compile-anatomy-3-2 -->
안녕하세요? HyperAccel CL(Compute Library)팀 박현준입니다. [1편]({{< ref "/posts/torch-compile-anatomy" >}})에서는 `torch.compile()` 이 어떻게 동작하는지, [2편]({{< ref "/posts/torch-compile-anatomy-2" >}})에서는 왜 세 단계로 나뉘어 있고 누가 그 구조를 활용하는지 살펴봤습니다. 사실 1,2편은 3편을 위한 밑그림이었습니다. 3편에서는 10월 20\~21일 미국 산호세에서 열린 PyTorch Conference 2026을 다녀와서, PyTorch의 최신 연구 동향을 정리해 보고자 합니다.

<!-- b:torch-compile-anatomy-3-3 -->
컨퍼런스를 다녀온 뒤 에이전트에게 이번 PyTorch Conference의 주요 연구 동향을 물어보니 학습, 추론, PyTorch Core Module, Kernel Optimizaion 등을 꼽았습니다. 저는 이 가운데 추론과 PyTorch Compiler, 그리고 NPU 세션을 위주로 들었습니다. 그래서 이 글은 컨퍼런스 전체를 대변하는 글이 아니라, **주요 흐름의 일부를 제 관점에서 해석한 글** 임을 밝힙니다. 

제가 들은 여러 세션에서, 제가 공통점으로 느꼈던 점을 3개의 키워드로 요약해보면 **Agent**, **Acceleration, 그리고 Eco-System** 입니다. 이 세 가지 키워드에 맞춰 본문도 세 부분으로 구성했습니다.

<!-- b:torch-compile-anatomy-3-4 -->


<!-- b:torch-compile-anatomy-3-5 -->
1. 에이전트로 개발 속도가 빨라지면서, 프로젝트들이 **Continuous Integration(CI)** 과 구조를 어떻게 바꾸고 있는가
2. PyTorch와 vLLM은 무엇을 더 빠르게 만들고 있는가
3. **Neural Processing Unit(NPU)** 회사들은 어떤 도구를 만들어 PyTorch 생태계에 들어오고 있는가

<!-- b:torch-compile-anatomy-3-6 -->
---

<!-- b:torch-compile-anatomy-3-7 -->
## Part 1. Agent: 빨라진 개발 속도를 감당하기 {#part1}

<!-- b:torch-compile-anatomy-3-8 -->
### 병목이 리뷰로 옮겨 가다

<!-- b:torch-compile-anatomy-3-9 -->
제가 들은 vLLM Roadmap 세션에서 새 기능만큼 인상적이었던 화두는 **프로젝트 관리** 였습니다. 최근 커밋과 기여자가 기하급수적으로 늘며 릴리스와 관리 방식을 전면 개편하고 있다는 이야기였습니다. 발표자는 얼마나 늘었는지 GitHub에서 10월 한 달 동안 만들어진 **Pull Request(PR)** 수를 공유하였습니다.

<!-- b:torch-compile-anatomy-3-10 -->
| 저장소 | 2024년 10월 | 2025년 10월 | 2026년 10월 |
| --- | ---: | ---: | ---: |
| vllm-project/vllm | 453 | 1,323 | 4,577 |
| pytorch/pytorch | 1,711 | 1,900 | 2,887 |

<!-- b:torch-compile-anatomy-3-11 -->


<!-- b:torch-compile-anatomy-3-12 -->
vLLM은 2년 만에 약 10배가 되었습니다. 물론 이 수치가 전부 에이전트 덕분인건 아니고 프로젝트 자체의 성장도 함께 반영된 값입니다. 하지만 유지보수의 입장에서 더이상 감당하기 힘들어진 사실은 분명했고, PyTorch의 [Fighting Agents with Agents](https://pytorch.org/blog/core-pytorch-sessions-at-pytorch-conference-north-america-2026/) 세션 소개는 메인테이너가 리뷰할 에이전트 작성 PR이 계속 늘고 있다는 말로 시작했습니다.

<!-- b:torch-compile-anatomy-3-13 -->
코드를 쓰는 비용이 내려가며 **그 코드를 읽고 믿고 유지하는 일** 이 병목이 되었다고 말합니다. 프로젝트들의 첫 대응은 규칙을 정의하는 것이었습니다. [vLLM 기여 가이드](https://docs.vllm.ai/en/v0.28.0/contributing/)는 "pure agent" PR을 제출하지 말라고 하고, 변경된 모든 줄을 검토하고 동작을 끝까지 검증할 책임이 제출한 사람에게 있다고 명시합니다.

<!-- b:torch-compile-anatomy-3-14 -->
### CI: 에이전트로 에이전트를 상대하다

<!-- b:torch-compile-anatomy-3-15 -->
하지만 규칙만으로는 늘어나는 양을 막을 수 없으니 CI와 리뷰 과정도 바뀌고 있습니다. 이 절의 세션들은 제가 직접 듣지 못해 공개된 소개를 기준으로 정리했습니다.

<!-- b:torch-compile-anatomy-3-16 -->
- **Fighting Agents with Agents: Bringing Claude to PyTorch CI, triage, and PR review:** PyTorch 인프라에 이슈 자동 분류, PR 리뷰 스킬, CI 실패와 자동 되돌림(autorevert) 조사를 넣었습니다. 목표는 메인테이너를 대체하는 것이 아니라 돕는 것이라고 합니다.
- **Shipping PyTorch and Its Ecosystem: A Modern Release Story:** Triton과 vLLM을 PyTorch nightly에 맞춰 계속 검증해, 깨지는 지점을 릴리스 브랜치 전에 찾습니다. 에이전트가 CI 실패를 분류하고 수정안을 쓰더라도 최종 결정은 사람이 내립니다.

<!-- b:torch-compile-anatomy-3-17 -->
두 세션에서 공통으로 눈에 띈 것은 사람의 역할을 남겨 두는 위치입니다. 에이전트는 판단을 제외한 분류와 조사, 초안 등 최대한 많은 반복 업무를 수행하고, **판단 및 결정은 사람이 합니다.** vLLM은 제한된 자원 때문에 새 커밋마다 전체 CI를 돌리지 않고, 리뷰어나 승인된 PR의 작성자가 `/ci run` 으로 실행하게 해 두었습니다.

<!-- b:torch-compile-anatomy-3-18 -->
### 리팩토링: 여러 사람이 기여할 수 있는 구조로

<!-- b:torch-compile-anatomy-3-19 -->
여러 사람이 같은 곳을 수정하면 리뷰도 어렵고 머지도 어려워집니다. 따라서 구조를 더 모듈화하는 방식으로 리팩토링을 진행하고 있다고도 밝힙니다.

<!-- b:torch-compile-anatomy-3-20 -->
[A Developer's Guide to Attention in vLLM](https://events.linuxfoundation.org/pytorch-conference-north-america/program/schedule/?id=1254038)이 좋은 예입니다. 어텐션은 종류마다 메타데이터와 **Key-Value(KV)** 캐시 배치가 달라서 백엔드와 커넥터 코드에 분기가 늘고 있었습니다. 그래서 공통 메타데이터(`CommonAttentionMetadata`)를 실행 단계마다 한 번 만들고, 각 백엔드는 필요한 정보만 덧붙이도록 바꿨습니다. KV의 논리적 차원은 `L, B, H, N, C` 로 통일하고 실제 메모리 배치는 stride로 표현합니다. 논리 형태와 물리 배치를 분리하면 새 어텐션이나 새 저장 방식을 추가할 때 고칠 곳이 줄어듭니다.

<!-- b:torch-compile-anatomy-3-21 -->
로드맵에서 소개한 Flat Model과 Model Runner V2도 같은 방향의 모델 실행 구조 개편입니다. 공개된 세션 소개 기준으로는 [One Model Definition, Many Accelerators](https://pytorch.org/blog/vllm-sessions-at-pytorch-conference-north-america-2026/)가 모델 로직을 하드웨어 실행 경로에서 분리해, 같은 모델 정의를 Intel Gaudi와 IBM Spyre에서 플랫폼별 코드 없이 돌린다고 합니다.

<!-- b:torch-compile-anatomy-3-22 -->
발표들은 이 작업들을 주로 새 모델과 새 구조를 쉽게 지원하기 위한 것으로 설명했습니다. 사실 이런 리팩토링은 에이전트가 아니어도 유지보수 비용을 줄이는 데 늘 도움이 되는 일입니다. 그런데 왜 지금 활발해졌을까요? 저는 코드를 고치는 비용이 내려갔기 때문이라고 생각합니다. 예전에는 필요한 줄 알면서도 비용이 커서 미뤄 두던 일을 이제는 에이전트가 빠르게 해낼 수 있게 되었고, 결과적으로 그만큼 관리자의 관심이 기능 추가에서 유지보수로 옮겨 온 것이라는 생각이 들었습니다.

<!-- b:torch-compile-anatomy-3-23 -->
---

<!-- b:torch-compile-anatomy-3-24 -->
## Part 2. Acceleration: PyTorch와 vLLM은 어디를 빠르게 만들고 있나 {#part2}

<!-- b:torch-compile-anatomy-3-25 -->
Part 1이 개발 속도의 이야기였다면, Part 2는 실행 속도의 이야기입니다. 눈에 띈 변화는 최적화의 대상이 **생성된 코드의 속도** 에서 컴파일 비용과 런타임 전체로 넓어졌다는 점입니다.

<!-- b:torch-compile-anatomy-3-26 -->
### 컴파일을 빠르게: FakeTensor와 graph break

<!-- b:torch-compile-anatomy-3-27 -->
[Speeding Up torch.compile: A New FakeTensor](https://events.linuxfoundation.org/pytorch-conference-north-america/program/schedule/?id=1257046)부터 보겠습니다. FakeTensor는 실제 데이터 없이 shape, dtype, device 같은 메타데이터만 계산하는 텐서입니다. Dynamo는 그래프를 추적하면서 연산마다 이 계산을 하고, Inductor도 코드를 만드는 과정에서 씁니다. 세션 소개에 따르면 이 전파가 Dynamo 추적 시간의 약 20%를 차지합니다.

<!-- b:torch-compile-anatomy-3-28 -->
해법은 FakeTensor를 C로 새로 구현하는 것입니다. 파이썬 디스패치와 심볼릭 연산에서 생기는 부가 비용을 줄인 결과, 연산 118개의 기하평균이 48.2µs에서 2.2µs로 **22.3배** 빨라졌고, torchbench 전체 컴파일 시간 기준의 개선 폭은 설정별로 30%까지 좋아진다고 발표했습니다. 새로운 알고리즘이 아니라 구현 경로를 바꾼 것만으로 이 정도 개선이 나왔다는 점이 인상적이었습니다. 특히 발표 슬라이드 구현 방법을 "Use Agents!"이라고 적어주었는데, 굳이 숨기지 않고 유쾌하게 풀어낸 점도 재미있었습니다.

<!-- b:torch-compile-anatomy-3-29 -->
graph break 쪽도 움직이고 있습니다. 1편에서 graph break가 나면 그래프가 짧아져 융합 범위가 좁아진다고 말씀드렸는데, 호출 깊이가 깊을수록 문제가 커집니다. [Nested Graph Breaks](https://pytorch.org/blog/core-pytorch-sessions-at-pytorch-conference-north-america-2026/) 세션에서는, 깊이 N인 함수 호출에서 O(N)번 생기던 중복 graph break를 O(1)로 줄여 더 큰 그래프를 캡처할 수 있게 구현하였다고 밝힙니다.

<!-- b:torch-compile-anatomy-3-30 -->
[Lightweight FX Tracing in PyTorch](https://events.linuxfoundation.org/pytorch-conference-north-america/program/schedule/?id=1256183)는 전체 그래프를 얻으려는 사용자에게 Dynamo가 너무 무겁다는 피드백에서 출발합니다. 그래서 `make_fx` 기반의 경량 추적 경로를 제안하기도 하였습니다.

<!-- b:torch-compile-anatomy-3-31 -->


<!-- b:torch-compile-anatomy-3-32 -->


<!-- b:torch-compile-anatomy-3-33 -->


<!-- b:torch-compile-anatomy-3-34 -->
### 실행을 빠르게: 에이전트 워크로드와 vLLM

<!-- b:torch-compile-anatomy-3-35 -->
에이전트는 개발 방식만이 아니라 워크로드도 바꾸고 있습니다. 에이전트 요청은 문맥이 길고, 대화와 도구 호출이 여러 번 이어지며, 도구를 기다리는 동안 GPU 연산이 멈춰도 KV 상태는 계속 필요합니다. 이 특성이 vLLM 쪽 연구의 방향을 만들고 있었습니다.

<!-- b:torch-compile-anatomy-3-36 -->
- **더 적게 기다리기:** vLLM Roadmap은 GPU가 CPU 동기화 때문에 멈추지 않게 하는 작업, 커널 융합과 메가커널(mega-kernel)을 소개했습니다.
- **한 번에 여러 토큰 확인하기:** What's New in Inference in October와 기업용 추론 세션은 추측 디코딩(speculative decoding)을 응답 속도를 높이는 수단으로 다뤘습니다.
- **KV를 오래, 싸게 유지하기:** [Native Tiered KV Cache Offloading in vLLM](https://events.linuxfoundation.org/pytorch-conference-north-america/program/schedule/?id=1254938)은 CPU 메모리를 허브로 삼아 GPU 메모리를 먼저 비우고, 저장소나 다른 노드로의 전송은 비동기로 처리합니다.

<!-- b:torch-compile-anatomy-3-37 -->
이 항목들은 torch.compile 혼자서 해결하는 문제가 아닙니다. 예를 들어 KV 오프로딩은 프롬프트 캐시를 늘려 줄 뿐 그 자체로 디코드 처리량을 높이지는 않습니다. TPU 메가커널 데모도 커널 최적화는 전체의 일부이며, 프리필과 디코드 분리, 캐시 재사용이 함께 필요하다고 설명했습니다. 커널 하나의 속도만 재서는 부족하다는 메시지를 여러 세션에서 반복해 들었습니다.

<!-- b:torch-compile-anatomy-3-38 -->


<!-- b:torch-compile-anatomy-3-39 -->


<!-- b:torch-compile-anatomy-3-40 -->
---

<!-- b:torch-compile-anatomy-3-41 -->
## Part 3. NPU 회사들은 어떻게 생태계 안으로 들어오는가 {#part3}

<!-- b:torch-compile-anatomy-3-42 -->


<!-- b:torch-compile-anatomy-3-43 -->
[Boosting PyTorch's Heterogeneous Compute Ecosystem](https://events.linuxfoundation.org/pytorch-conference-north-america/program/schedule/?id=1348281) 발표는 대부분의 코드가 GPU 중심이라 NPU가 들어오기 어렵다는 문제에서 출발합니다. 그리고 과제를 **Integrate, Perform, Verify** 세 가지로 나눕니다. 하드웨어 지원이란 연산자가 실행되는 것으로 끝나지 않고, 분산 실행과 컴파일, 테스트까지 포함한다는 뜻입니다. PyTorch에서 경로를 열어주기만을 막연하게 기다리는 것이 아니라, 적극적으로 PyTorch 생태계에 기여하며 함께 NPU 생태계를 만들어 갈 사람을 찾고 있다고 하며 발표를 마무리 하였습니다.

<!-- b:torch-compile-anatomy-3-44 -->
### Integrate: 공통 인터페이스에 연결하기

<!-- b:torch-compile-anatomy-3-45 -->
연결의 기본은 2편에서 다룬 PrivateUse1입니다. 여기에 참고 구현인 OpenReg와 장치 공통 API인 `torch.accelerator` 가 더해지면서, 벤더가 따라갈 길이 공식 경로로 다져지고 있습니다. `torch.accelerator` 는 CUDA 전용으로 작성된 분기 코드를 장치 독립적인 코드로 바꾸기 위한 것입니다. Huawei는 이 위에 FSDP2, DTensor, 통신 백엔드를 연결해 분산 학습까지 지원한다고 밝혔습니다.

<!-- b:torch-compile-anatomy-3-46 -->
### Perform: Inductor를 넓히는 Spyre

<!-- b:torch-compile-anatomy-3-47 -->
성능 쪽에서는 IBM Spyre 사례가 가장 구체적이었습니다. 2편에서 Spyre가 Inductor의 코드 생성 단계를 활용한다고 소개했는데, [Integrating the IBM Spyre Accelerator](https://events.linuxfoundation.org/pytorch-conference-north-america/program/schedule/?id=1256168) 발표와 [IBM의 공식 글](https://pytorch.org/blog/extending-inductor-for-the-ibm-spyre-accelerator/)에서 그 실체를 볼 수 있었습니다.

<!-- b:torch-compile-anatomy-3-48 -->
Spyre는 코어 32개가 각자 2MB 스크래치패드를 가진 데이터플로우 가속기입니다. 데이터는 128바이트 단위의 stick으로 움직이고, 코어별 작업 분할도 컴파일 시점에 정해야 합니다. 그래서 Inductor의 GPU 중심 가정이 Spyre 하드웨어 구조와 맞지 않았습니다. torch-spyre는 이 세 문제를 스케줄링 이전의 커스텀 패스로 풀고, 나머지는 Inductor를 그대로 재사용합니다.

<!-- b:torch-compile-anatomy-3-49 -->
torch.compile()에 있던 모듈을 최대한 재사용한 결과, 예전 자체 컴파일러 스택의 약 27만 3천 줄이 약 3만 8,600줄로 **약 7분의 1** 이 되었고 유지보수 비용이 크게 줄었다고 밝힙니다. 오픈소스로 공개한 타일 IR인 [KTIR](https://pytorch.org/blog/your-guide-to-hardware-acceleration-compute-infrastructure-at-pytorch-conference-north-america-2026/)과 [장치별 텐서 레이아웃](https://pytorch.org/blog/core-pytorch-sessions-at-pytorch-conference-north-america-2026/) 제안도 같은 흐름입니다. 벤더가 자기 문제를 풀면서 만든 확장을 upstream으로 올리고자 노력하고 있었습니다.

<!-- b:torch-compile-anatomy-3-50 -->


<!-- b:torch-compile-anatomy-3-51 -->


<!-- b:torch-compile-anatomy-3-52 -->


<!-- b:torch-compile-anatomy-3-53 -->
### Verify: 정확성을 확인하고 upstream을 따라가기

<!-- b:torch-compile-anatomy-3-54 -->
연결과 성능 못지않게 강조된 것이 검증입니다. Part 1의 CI가 여기서 다시 등장합니다. **Cross-Repository CI Relay(CRCR)** 는 PyTorch의 PR 이벤트를 외부 저장소로 전달해, 머지 전에 외부 백엔드와의 호환성을 확인하는 장치입니다. 세션 소개에 따르면 Ascend와 RISC-V 백엔드에서 깨짐을 발견하는 시간이 며칠에서 몇 분으로 줄었습니다. Huawei는 여기에 장치 독립적 테스트 재사용을 더해, 58만 개가 넘는 커뮤니티 테스트를 활용하고 upstream 업데이트 후 30일 안에 안정된 버전을 낸다고 합니다.

<!-- b:torch-compile-anatomy-3-55 -->


<!-- b:torch-compile-anatomy-3-56 -->
Spyre는 CRCR의 네 단계 중 L2에 도달했는데, [공개된 글](https://pytorch.org/blog/from-upstream-changes-to-downstream-confidence-inside-torch-spyres-integration-with-pytorch-crcr/)에 따르면 수만 개의 PyTorch 테스트 중 자기 하드웨어에 의미 있는 것을 **에이전트 파이프라인으로 골랐습니다.** 선택 이유는 사람이 리뷰할 수 있도록 설정 파일에 남기고, 실제 하드웨어에서 돌린 로그로 다시 분류합니다. PyTorch 2.13에서 2.14로 올릴 때는 바뀐 테스트 약 4,000개만 평가하면 되었다고 합니다. Part 1에서 본 "에이전트가 제안하고 사람이 판단하는 구조"가 NPU 회사의 생태계 합류에도 그대로 쓰이고 있는 것입니다.

<!-- b:torch-compile-anatomy-3-57 -->
---

<!-- b:torch-compile-anatomy-3-58 -->
## Conclusion

<!-- b:torch-compile-anatomy-3-59 -->
**Agent** 는 코드를 만드는 비용을 낮췄고, 그 결과 검증과 구조가 더 중요해졌습니다. **Acceleration** 관점에서는 학습/추론 성능을 넘어 컴파일/런타임 비용으로 범위를 넓혔습니다. 그리고 NPU 회사들은 이 두 흐름이 쌓이는 공통 기반 안으로 들어와, 자기 문제를 푼 결과를 다시 upstream에 올리며 **Eco-System**을 만들어가고 있었습니다.

<!-- b:torch-compile-anatomy-3-60 -->
칩을 만드는 회사의 개발자로서 느낀 점은 두 가지입니다. 첫째, 우리가 필요한 기능은 이미 PyTorch나 vLLM에 있거나 개발 중일 가능성이 높습니다. 타 NPU 회사도 오픈소스에 있던 코드를 사용하며 유지보수 비용을 크게 줄였다고 밝히고 있기에 사용 가능한 오픈소스 모듈을 도입하면 좋겠다고 생각하였습니다. 둘째, 에이전트를 이용하여 hardware-specific한 부분에 대한 모듈화에 많은 노력을 기울이면 좋겠습니다. 저희는 이미 LPU에 최적화된 Legato라는 eDSL이 있으며, 이 구조에서 오픈소스와 어떻게해야 이쁘게 맞물릴지를 고민하는 이틀이었습니다.

칩을 만드는 회사의 개발자로서 느낀 점은 두 가지입니다. 첫째, 저희에게 필요한 기능은 이미 PyTorch나 vLLM에 있거나 개발 중일 가능성이 높습니다. Spyre가 자체 컴파일러 대신 Inductor를 재사용해 코드를 7분의 1로 줄였듯이, 다른 NPU 회사들도 오픈소스를 적극적으로 가져다 쓰며 PyTorch 생태계에 진입함과 동시에 유지보수 비용을 낮추고 있습니다. 저희도 쓸 수 있는 오픈소스 모듈을 적극적으로 도입하는 편이 좋겠다고 생각했습니다. 둘째, 하드웨어에 특화된 부분은 오히려 더 잘 나누어 두어야 합니다. Part 1에서 본 것처럼 에이전트 덕분에 코드를 고치는 비용이 내려간 만큼, 그동안 미뤄 온 모듈화에 신경써야 합니다. 저희 내부 SW stack을 전반적으로 돌아보고 오픈소스와 어떻게 자연스럽게 맞물릴 수 있을지를 고민하게 된 이틀이었습니다.

<!-- b:torch-compile-anatomy-3-61 -->


<!-- b:torch-compile-anatomy-3-62 -->
## Reference

<!-- b:torch-compile-anatomy-3-63 -->
**컨퍼런스 공식 자료**

<!-- b:torch-compile-anatomy-3-64 -->
- [PyTorch Conference North America 2026 리캡](https://www.pytorch.org/blog/pytorch-conference-north-america-2026-accelerating-open-intelligence-together)
- [Core PyTorch Sessions](https://pytorch.org/blog/core-pytorch-sessions-at-pytorch-conference-north-america-2026/)
- [vLLM Sessions](https://pytorch.org/blog/vllm-sessions-at-pytorch-conference-north-america-2026/)
- [Agentic AI and Next-Gen Intelligence Sessions](https://pytorch.org/blog/agentic-ai-and-next-gen-intelligence-sessions-at-pytorch-conference-north-america-2026/)
- [Hardware Acceleration & Compute Infrastructure Guide](https://pytorch.org/blog/your-guide-to-hardware-acceleration-compute-infrastructure-at-pytorch-conference-north-america-2026/)

<!-- b:torch-compile-anatomy-3-65 -->


<!-- b:torch-compile-anatomy-3-66 -->


<!-- b:torch-compile-anatomy-3-67 -->
**문서와 기사**

<!-- b:torch-compile-anatomy-3-68 -->
- [vLLM Contributing Guide](https://docs.vllm.ai/en/v0.28.0/contributing/)
- [Extending Inductor for the IBM Spyre Accelerator](https://pytorch.org/blog/extending-inductor-for-the-ibm-spyre-accelerator/)
- [From Upstream Changes to Downstream Confidence](https://pytorch.org/blog/from-upstream-changes-to-downstream-confidence-inside-torch-spyres-integration-with-pytorch-crcr/)
- [Google and Meta open-source TorchTPU (InfoQ)](https://infoq.com/news/2026/10/google-meta-torchtpu)

<!-- b:torch-compile-anatomy-3-69 -->


<!-- b:torch-compile-anatomy-3-70 -->


<!-- b:torch-compile-anatomy-3-71 -->
## 추신: HyperAccel은 채용 중입니다!

<!-- b:torch-compile-anatomy-3-72 -->
![HyperAccel의 LPU 칩 Bertha. 패키지 가운데에 HYPER ACCEL과 Bertha가 새겨진 다이가 자리하고, 주변으로 배선과 패드가 뻗어 있다](images/bertha-chip.jpg)

<!-- b:torch-compile-anatomy-3-73 -->
HyperAccel은 LPU라는 새로운 칩을 만드는 회사이지만, 동시에 소프트웨어의 최신 흐름을 가장 가까이에서 따라가며 개발하는 팀이기도 합니다. 이번 글에서 다룬 것처럼 새로운 하드웨어를 둘러싼 소프트웨어 스택은 지금도 빠르게 바뀌고 있고, 저희는 그 최전방에서 일하고 있습니다.

<!-- b:torch-compile-anatomy-3-74 -->
사용자가 새로운 디바이스를 기존 방식 그대로, 편하게 사용할 수 있도록 만드는 연구와 개발에 함께하고 싶으시다면 [HyperAccel Career](https://hyperaccel.career.greetinghr.com/ko/guide)로 지원해 주세요!
