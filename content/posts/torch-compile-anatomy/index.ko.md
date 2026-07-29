---
date: '2026-07-29T10:00:00+09:00'
draft: true
title: 'torch.compile 해부 1편: TorchDynamo, AOTAutograd, TorchInductor'
cover:
  image: "images/00-cover.png"
  alt: "파이썬 코드가 TorchDynamo, AOTAutograd, TorchInductor를 거쳐 커널로 내려가는 torch.compile 컴파일 경로"
  caption: "파이썬 한 줄이 커널이 되기까지"
  relative: true
authors: [Hyunjun Park]
tags: ["torch.compile", "PyTorch", "TorchDynamo", "TorchInductor", "AOTAutograd", "FX", "Triton", "vLLM", "Compiler", "Kernel Fusion"]
series: ["torch.compile 해부"]
series_idx: 1
categories: ["AI", "Compiler"]
summary: 'torch.compile을 TorchDynamo, AOTAutograd, TorchInductor 세 요소로 분해해 각각이 무엇을 입력받아 무엇을 내놓는지 살펴보고, vLLM이 이 구조를 어떻게 활용하는지까지 정리합니다.'
description: 'torch.compile의 세 구성 요소인 TorchDynamo, AOTAutograd, TorchInductor가 각각 어떤 원리로 동작하는지 설명합니다. 바이트코드 가로채기와 guard, 디스패처 하단에서의 연산 정규화, define-by-run IR과 코드 생성을 다루고, vLLM의 VllmBackend가 이 구조 위에 무엇을 얹었는지 소개합니다.'
comments: true
keywords: [
  "torch.compile", "TorchDynamo", "TorchInductor", "AOTAutograd",
  "FX graph", "graph break", "guard", "dynamic shape",
  "Triton", "kernel fusion", "PyTorch dispatcher", "ATen",
  "functionalization", "core ATen IR", "define-by-run IR",
  "vLLM", "VllmBackend", "piecewise compilation"
]
---

안녕하세요? HyperAccel CL(Compute Library)팀 박현준입니다.
저희는 **Latency Processing Unit(LPU)** 이라는 **Large Language Model(LLM)** 특화 반도체를 만드는 스타트업입니다.
그리고 GPU가 CUDA라는 언어로 동작하듯이, LPU는 저희 컴파일러팀에서 자체 제작한
embedded Domain Specific Language(eDSL)인 [Legato]({{< ref "/posts/what-is-legato" >}})라는 프로그래밍 언어를 통해 동작하고, CL팀은 LPU라는 architecture에 대한 이해를 기반으로 최적화된 legato kernel을 작성하는 업무를 주로 하고 있습니다.

요즘 `torch.compile()` 이 매우 핫한 주제 중 하나인데요, vLLM도 적극적으로 도입하고 있고
실제 실행이 많이 빨라졌다는 평가도 많습니다.
그러나 이것의 동작 방식을 설명해 보라고 하면, 대부분
"그래프를 캡처해서 커널을 합쳐 준다" 정도에서 멈춥니다.

사실 PyTorch가 많은 사랑을 받게 된 이유 중 하나는 eager 방식으로 한 줄씩 실행할 수 있다는 점이라고 생각합니다.
이러한 방식 덕분에 진입 장벽이 크게 낮아졌으니까요.
하지만 역설적으로, 이 방식을 채택함으로 인해 n번째 줄에 있는 코드는 그 이후에 올 코드를 알지 못하게 됩니다.
그리고 이러한 특성이 fusion을 비롯한 여러 최적화를 가로막아 PyTorch의 성능을 크게 낮추게 됩니다.

그래서 PyTorch는 예전부터 파이썬의 정체성을 유지하면서도 성능을 높일 수 있는 시도를 해왔고,
TorchScript, `torch.jit.trace`, `torch.fx` 등의 시도가 있었습니다.
그리고 꾸준한 시도 끝에 결국 `torch.compile()` 이 탄생하게 됩니다.

이번 글에서는 다루고 싶은 내용이 많기에 2부작으로 구성하고자 하는데요,
이번 편에서는 `torch.compile()` 의 구성 요소를 낱낱이 분해해서 살펴보고,
다음 편에서는 저희를 포함한 다양한 NPU 회사에서는 어떤 식으로 `torch.compile()` 의 생태계에 탑승하려고 하는지 알아보고자 합니다.

## 이 글의 구성

**[Part 1. torch.compile의 3대 요소](#part1)**

**[Part 2. TorchDynamo: 파이썬 코드를 fx.Graph(이하 그래프) 타입으로 바꿔주는 모듈](#part2)**

**[Part 3. AOTAutograd: 생성된 그래프를 다듬는 모듈](#part3)**

**[Part 4. TorchInductor: 다듬은 그래프를 커널로 만드는 모듈](#part4)**

**[Part 5. VllmBackend: vLLM은 torch.compile()을 어떻게 활용하는가](#part5)**

**[Conclusion](#conclusion)**: `torch.compile()` 이 남긴 것, 그리고 PyTorch가 NPU 시장까지 노리는 이유.

---

## Part 1. torch.compile의 3대 요소 {#part1}

`torch.compile()` 은 크게 TorchDynamo,  AOTAutograd, TorchInductor로 나누어서 생각해볼 수 있습니다.

```text
파이썬 함수
   │
   ├─ TorchDynamo      : 파이썬에서 그래프를 꺼낸다
   │
   ├─ AOTAutograd      : 그래프를 다듬어 정규화한다
   │
   └─ TorchInductor    : 그래프를 실제 커널 코드로 만든다
```

**그래프를 꺼내는 일** 은 파이썬 인터프리터를 해석하는 일입니다.
동적 타입, 데이터 의존 분기, 외부 라이브러리 호출 같은 것들을 고려하며 그래프 형태로 추출해야 합니다.

**그래프를 다듬는 일** 은 의미를 보존하면서 표현을 단순하게 만드는 일입니다.
같은 연산을 부르는 여러 방법을 하나로 통일하고, 부작용을 걷어내고, 연산의 종류를 줄입니다.

**커널을 만드는 일** 은 하드웨어를 상대하는 일입니다.
어떤 연산들을 묶을지, 메모리를 어떻게 쓸지, 어떤 언어로 코드를 뽑을지를 정합니다.

각 요소가 무엇을 주고받는지 정리하면 이렇습니다.


| 요소                | 입력            | 출력                            |
| ----------------- | ------------- | ----------------------------- |
| **TorchDynamo**   | 파이썬 함수 | FX 그래프 + guard + 잔여 바이트코드     |
| **AOTAutograd**   | FX 그래프        | 정규화된 ATen 그래프                  |
| **TorchInductor** | ATen 그래프      | Triton(GPU) 또는 C++(CPU) 커널 소스 |


여기서 **FX 그래프** 라는 단어는 연산들을 노드로, 데이터 흐름을 간선으로 표현한 방향 비순환 그래프라는 뜻입니다.
`torch.fx` 자체는 사실 예전에 만들어졌지만 지금은 `torch.compile()` 의 기반이 되었습니다.

그리고 이 세 요소는 **독립적으로 교체할 수 있습니다.**
`torch.compile(backend=...)` 으로 Inductor 대신 다른 컴파일러를 꽂을 수 있고,
실제로 저희도 Legato Backend를 붙여서 사용하고 있습니다. 이 부분은 다음 글에서 다루겠습니다.

---

## Part 2. TorchDynamo: 파이썬 코드를 fx.graph(이하 그래프)타입으로 바꿔주는 모듈 {#part2}

TorchDynamo는 **파이썬 코드에서 그래프를 추출하는 작업** 을 수행합니다.
실제로 계산하지는 않고 값이 어떻게 흘러가는지만 따라가다가, 텐서 연산을 만나면 그래프에 기록합니다.
Dynamo가 만들어 내는 그래프의 형식이 `fx.Graph` 입니다.
AOTAutograd가 다듬는 것도, Inductor가 받아 커널로 만드는 것도 이 그래프입니다.

구조는 단순합니다. 연산 하나가 **노드(node)** 하나이고,
노드들이 데이터 흐름을 따라 이어진 방향 비순환 그래프(DAG)입니다.
각 노드는 자신이 어떤 종류의 연산인지를 `op` 필드로 갖습니다.

노드는 자신이 의존하는 노드 목록도 함께 들고 있고, 이것이 그래프의 간선이 됩니다.
덕분에 **어떤 연산의 결과가 어디로 흘러가는지** 를 그래프만 보고 알 수 있습니다.
파이썬 코드로는 알 수 없었던 바로 그 정보이고,
뒤에서 Inductor가 연산을 묶어 융합할 수 있는 근거가 됩니다.

### graph break: 그래프에 담기지 못하는 것들

모든 파이썬 코드가 그래프가 되지는 않습니다.
Dynamo가 다룰 수 없는 것을 만나면 어떻게 할까요?
TorchScript는 에러를 냈고, `torch.jit.trace` 는 조용히 틀린 답을 냈습니다.
Dynamo는 세 번째 길을 택합니다.

**그 자리에서 그래프를 끊습니다.** 이것을 **graph break** 라고 합니다.

동작 순서는 이렇습니다. 거기까지 모은 그래프를 컴파일해서 실행하고,
문제가 된 부분은 제어를 파이썬에 돌려주어 원래대로 실행하고,
그다음부터 다시 새 그래프를 추출합니다.
그래서 함수 하나가 여러 개의 그래프로 쪼개질 수 있습니다.

흔한 원인은 두 가지입니다.

- **텐서 값에 의존하는 제어 흐름** — `if x.sum() > 0:` 처럼 실제 값을 알아야 판정되는 분기
- **그래프로 표현할 수 없는 파이썬 동작** — `print`, 파일 입출력, 네트워크 호출 등

다만 끊을 때마다 컴파일된 코드와 파이썬 인터프리터 사이를 오가는 문맥 전환이 생기고,
**그래프가 짧아지면 융합할 수 있는 범위도 좁아집니다.**
그래프를 나누는 순간, 그 경계를 넘는 최적화 기회는 사라지기 때문입니다.
그래서 실제 최적화 작업의 상당 부분은 graph break를 줄이는 일이 됩니다.

---

## Part 3. AOTAutograd: 생성된 그래프를 다듬는 모듈 {#part3}

Dynamo가 꺼낸 그래프를 그대로 커널로 만들기에는 **표현이 너무 사용자 친화적** 이라는 문제가 있습니다.

Dynamo의 그래프에는 우리가 코드에 쓴 형태가 그대로 남아 있습니다.
그런데 PyTorch에서 같은 연산을 부르는 방법은 여러 가지입니다.
메서드로도 부를 수 있고, 함수로도 부를 수 있고, 연산자로도 부를 수 있습니다.
백엔드를 만드는 사람 입장에서는 같은 것을 여러 번 구현해야 하는 셈입니다.

그래서 커널을 만들기 전에 그래프를 한 번 **정규화** 하는 단계가 필요합니다.
그 일을 맡은 것이 AOTAutograd입니다.
이름은 autograd를 **A**head-**o**f-**T**ime으로 처리한다는 데서 왔습니다.

### 디스패처 아래에서 연산을 잡는다

PyTorch에서 연산이 실행되는 과정을 잠깐 볼 필요가 있습니다.

우리가 `torch.add(a, b)` 를 부르면 곧바로 커널이 실행되지 않습니다.
**디스패처(dispatcher)** 가 먼저 개입해서,
자동 혼합 정밀도를 적용해야 하는지, 어떤 디바이스의 커널로 보내야 하는지 등을
차례로 판단합니다. 그리고 그 끝에서야 실제 계산 커널이 불립니다.

AOTAutograd는 이 **디스패처의 맨 아래** 에서 연산을 가로챕니다.
최종 커널이 실행되기 직전에 발동하는 훅을 쓰는 것입니다.

이것이 이전 방식과의 차이입니다.
`torch.fx` 의 방식은 파이썬 레벨 **위** 에서 가로챘기 때문에 `torch.relu` 라는 이름을 보았습니다.
AOTAutograd는 **아래** 에서 가로채기 때문에 `aten::relu` 라는 실제 연산을 봅니다.
그래서 AOTAutograd가 내놓는 그래프는 표현이 전부 통일되어 있습니다.

### 그래프를 다듬는 두 가지 작업

잡아낸 그래프에 두 가지 정리가 들어갑니다.

**functionalization** 은 **기존 메모리를 덮어쓰는 연산** 을 없애는 작업입니다.
`x.add_(1)` 은 새 텐서를 만드는 대신 `x` 자체를 고치고, `view` 로 만든 텐서는 원본과 메모리를 공유합니다.
이러면 컴파일러가 연산을 옮기거나 합칠 때마다 "지금 이 `x` 가 언제 시점의 값인지"를 일일이 따져야 합니다.
그래서 **한 번 만들어진 값은 변하지 않도록** 그래프를 고쳐 둡니다.

**decomposition** 은 수천 개의 연산을 **core ATen IR** 이라는 수백 개짜리 부분집합으로 낮추는 작업입니다.
백엔드를 만드는 사람 입장에서 이건 결정적입니다.
구현해야 할 연산의 개수가 한 자릿수 배 줄어듭니다.
새로운 하드웨어를 PyTorch에 붙일 때 이 성질이 왜 중요한지는 2편에서 다시 이야기하겠습니다.

이 두 작업을 거치고 나면, 그래프에 남는 것은
**부작용이 없고, 종류가 제한된 연산들** 뿐입니다.
이제 이것을 실제 커널로 옮기는 일만 남았습니다.

---

## Part 4. TorchInductor: 다듬은 그래프를 커널로 만드는 모듈 {#part4}

마지막 요소입니다. Inductor는 다듬어진 그래프를 받아 **실제 커널 소스 코드** 를 생성합니다.
GPU에서는 [Triton](https://triton-lang.org/), CPU에서는 C++/OpenMP를 뱉습니다.

Inductor에서 진행하는 동작은 크게 세 단계입니다.
**lowering**(그래프를 Inductor 자체 IR로 낮추기),
**scheduling**(어떤 연산들을 묶을지 정하기),
**codegen**(실제 코드 생성).

### IR은 "출력 원소 하나를 구하는 식"이다

Inductor에서 가장 독특한 점은 IR의 형태입니다.
텐서 연산을 통째로 표현하지 않고,
**"출력 텐서의 원소 하나를 어떻게 구하는가"** 를 적은 계산식으로 표현합니다.

예를 들어 텐서 전체에 적용되는 `y = floor(x)` 를, 원소 하나 기준인 `y[i] = floor(x[i])` 로 적어 두는 것입니다.
반복문으로 치면 **가장 안쪽 한 줄만 적어 둔 셈** 이고,
그 줄을 몇 번 돌릴지, 어떻게 병렬화할지는 아직 정하지 않은 상태입니다.

이 식은 **기본 동작** 들의 조합입니다.
방금 예에서는 `x[i]` 를 읽는 동작과, 거기에 내림을 적용하는 동작 두 개죠.
그리고 이 동작들은 아직 실제 코드가 아닙니다.
"여기서 읽는다", "여기서 내림을 적용한다"고 표시만 해 둔 상태입니다.

### 융합은 계산식을 이어 붙이는 일

이 표현이 왜 좋은지는 **융합(fusion)** 에서 드러납니다.

개요에서 이야기했듯이, eager 방식의 근본적인 손해는
연산마다 커널을 따로 띄우면서 중간 결과를 메모리에 썼다가 다시 읽는 데서 옵니다.
정규화 하나가 연산 대여섯 개로 쪼개지면, 그 사이사이마다 메모리 왕복이 끼어듭니다.
융합은 이 연산들을 **커널 하나로 합쳐서** 읽기 한 번, 쓰기 한 번으로 끝내는 최적화입니다.

IR을 이렇게 표현하면 융합이 놀랄 만큼 단순해집니다.
연산 두 개를 융합한다는 것이 **두 계산식을 이어 붙이는 일** 이 되기 때문입니다.
`y[i] = floor(x[i])` 다음에 `z[i] = y[i] + 1` 이 온다면, 그냥 `z[i] = floor(x[i]) + 1` 로 이어 쓰면 됩니다.
중간 결과 `y` 는 메모리에 나갈 일이 없어집니다.
그래프 노드를 옮기고 다시 연결하는 복잡한 변환도 필요 없습니다.

### 계산하는 대신 문자열을 뱉게 하기

그럼 이 계산식에서 어떻게 Triton 코드가 나올까요?

앞서 말한 **기본 동작들** 을, 실제 값을 계산하는 대신
**코드 문자열을 반환하는 함수로 갈아끼웁니다.**

읽는 동작 자리에는 `tl.load(...)` 라는 문자열을 만들어 반환하는 함수를,
내림 동작 자리에는 `libdevice.floor(...)` 를 만들어 반환하는 함수를 꽂아 두는 것입니다.

이 상태에서 `y[i] = floor(x[i])` 라는 식을 그냥 평범하게 실행하면
각 자리에서 문자열이 만들어져 차례로 이어지고 그 결과 **Triton 커널 소스 코드가 완성됩니다.**

그리고 같은 식을 C++용 교체 규칙으로 실행하면 C++ 코드가 나옵니다.
**동일한 IR에 대해 교체 규칙을 갈아끼면 다른 언어가 나오는 생성** 됩니다.

**그리고 이 "교체 규칙만 바꾸면 다른 코드가 나온다"는 성질이 2편의 출발점입니다.**

---

## Part 5. VllmBackend: vLLM은 torch.compile()을 어떻게 활용하는가 {#part5}

지금까지 본 세 요소는 범용 설계입니다.
그런데 LLM 서빙이라는 특수한 상황에서는 이 기본값이 잘 맞지 않는 부분이 있습니다.
vLLM은 그 지점들을 자기 방식으로 바꿔서 쓰고 있고,
그 결과물이 `VllmBackend` 라는 자체 Dynamo 백엔드입니다.

Part 1에서 세 요소가 독립적으로 교체 가능하다고 했는데,
vLLM은 **Dynamo 백엔드 자리** 에 자기 것을 꽂은 사례입니다.

서빙에서 달라지는 점과 vLLM의 대응을 간단히 정리하면 이렇습니다.

**shape이 매 스텝 흔들립니다.** 요청이 실시간으로 들어오고 나가니
배치에 담기는 시퀀스 수와 토큰 수가 계속 변합니다.
Part 2에서 본 guard 검사가 매 스텝 반복되는 고정 비용이 되는 상황이죠.
vLLM은 토큰 수 축만 직접 동적으로 지정해 두고, 나머지 guard 검사를 걷어내는 선택을 합니다.
자기 스케줄러가 어떤 shape을 만들어 낼지 알고 있으니 가능한 일입니다.

**컴파일하면 안 되는 연산이 그래프 한복판에 있습니다.**
PagedAttention은 KV 캐시를 제자리에서 갱신하는, 고도로 최적화된 커스텀 커널입니다.
Inductor가 이것을 건드려서 좋을 게 없습니다.
그래서 vLLM은 attention을 **컴파일러가 안을 들여다볼 수 없는 불투명한 연산** 으로 등록합니다.
컴파일러 입장에서는 하나의 블랙박스 노드가 되고, 융합 대상에서 빠집니다.

**그래프를 조각내서 컴파일합니다.**
위처럼 attention을 불투명하게 만들어 두면, 그것을 경계로 그래프를 자를 수 있습니다.
이렇게 나눈 조각들만 따로 컴파일하고 최적화하는 방식을 **piecewise 컴파일** 이라고 합니다.
attention을 그래프 밖에 두면 나머지 조각들은 CUDA Graph로 안전하게 캡처할 수 있게 됩니다.

**컴파일 결과를 디스크에 캐싱합니다.**
서버를 띄울 때마다 몇 분씩 컴파일을 기다릴 수는 없으니까요.

여기서 눈여겨볼 점이 하나 있습니다.
`VllmBackend` 는 "그래프를 자르고, 캐싱하고, 그래프 캡처를 씌우는" **오케스트레이션** 을 담당하고,
"잘린 조각 하나를 실제로 컴파일하는 일"은 **별도의 얇은 인터페이스로 분리** 되어 있습니다.
기본값으로는 그 자리에 Inductor가 꽂혀 있습니다.

즉 vLLM은 `torch.compile()` 이 보여 준 역할 분리를 **한 번 더 반복** 한 셈입니다.
그리고 이 구조 덕분에, 저 자리에 Inductor가 아닌 다른 컴파일러를 꽂는 일이 가능해집니다.

---

## Conclusion

`torch.compile()` 은 파이썬의 유연함을 포기하지 않으면서 그래프를 얻는다는,
PyTorch의 오랜 숙제에 대한 답이었습니다.

성과는 분명합니다. eager 방식이 구조적으로 포기했던 fusion을 되찾았고,
사람이 손으로 짜던 융합 커널을 컴파일러가 대신 쓰게 되었습니다.
vLLM 같은 서빙 엔진이 이 위에 자기 컴파일러를 얹어 GPU 추론 성능을 크게 끌어올린 것도
이 구조가 있었기에 가능했습니다.

그런데 저는 `torch.compile()` 이 남긴 진짜 성과가 속도가 아니라
**구조** 라고 생각합니다. 세 요소가 독립적으로 교체 가능하다는 사실 말입니다.

Part 4에서 본 것을 다시 떠올려 보시죠.
Inductor는 교체 규칙 하나만 바꿔서 Triton과 C++을 모두 만들어 냈습니다.
그렇다면 **저 자리에 완전히 다른 하드웨어를 위한 코드 생성기를 꽂으면 어떻게 될까요?**
Dynamo 백엔드 자리에 Inductor 대신 다른 컴파일러를 넣으면요?
Part 3에서 본 decomposition이 구현해야 할 연산 수를 크게 줄여 준다는 사실은,
새 하드웨어를 붙이려는 입장에서 어떤 의미일까요?

이건 우연이 아닙니다. PyTorch는 이 확장성을 의도적으로 설계하고 있습니다.
CUDA가 아닌 가속기 — NPU들이 PyTorch 생태계 안으로 들어올 수 있는 문을 열어 두고,
그럼으로써 AI 하드웨어 시장 전체의 표준 프레임워크 자리를 지키려는 것이죠.

다음 편에서는 그 문이 구체적으로 어떻게 생겼는지 살펴보겠습니다.
PyTorch가 서드파티 가속기를 위해 열어 둔 확장점들, 그리고 같은 문제 앞에서
여러 NPU 회사들이 어떻게 **서로 다른 답** 을 골랐는지 비교해 보려고 합니다.

그리고 마지막으로, 저희 HyperAccel의 [Legato]({{< ref "/posts/what-is-legato" >}})가
이 생태계의 어느 자리에 꽂히려 하는지, 그리고 왜 그 자리인지를 이야기하겠습니다.

## Reference

**PyTorch 공식 문서**

- [torch.compile programming model](https://docs.pytorch.org/docs/2.9/compile/programming_model.html) — Dynamo 핵심 개념, graph break, guard, dynamic shape
- [Custom Backends](https://docs.pytorch.org/docs/main/user_guide/torch_compiler/torch.compiler_custom_backends.html)
- [torch.fx](https://docs.pytorch.org/docs/stable/fx.html) — FX 그래프의 구조

**vLLM 설계 문서**

- [torch.compile integration](https://docs.vllm.ai/en/latest/design/torch_compile/)
- [CUDA Graphs](https://docs.vllm.ai/en/latest/design/cuda_graphs/)

**도구**

- [Triton](https://triton-lang.org/) — Inductor가 GPU 커널을 생성할 때 쓰는 언어

## 추신: HyperAccel은 채용 중입니다!

LPU 소프트웨어 스택과 컴파일러를 함께 만들어 갈 동료를 찾고 있습니다.
저희가 다루는 기술에 관심이 있으시다면
[HyperAccel Career](https://hyperaccel.career.greetinghr.com/ko/guide)로 지원해 주세요!