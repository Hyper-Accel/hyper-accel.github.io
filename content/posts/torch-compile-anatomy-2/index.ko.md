---
date: '2026-10-12T18:00:00+09:00'
draft: true
title: 'torch.compile 해부 2편: 왜 세 단계로 나눴을까'
cover:
  image: "images/pytorch.jpg"
  alt: "PyTorch 로고"
  caption: "PyTorch"
  relative: true
authors: [Hyunjun Park]
tags: ["torch.compile", "PyTorch", "TorchDynamo", "TorchInductor", "AOTAutograd", "PrivateUse1", "Compiler"]
series: ["torch.compile 해부"]
series_idx: 2
categories: ["AI", "Compiler"]
summary: 'torch.compile은 왜 Dynamo, AOTAutograd, Inductor 세 단계로 나뉘어 있을까요? PyTorch가 생태계를 키워 온 흐름에서 출발해, 각 단계의 경계를 누가 어떻게 활용하고 어떤 이득을 얻는지 정리합니다.'
description: 'torch.compile을 세 단계로 나눈 이유를 생태계 관점에서 설명합니다. PyTorch가 eager 방식으로 사람을 모은 과정과 2.0 이후의 확장 흐름을 짚고, Dynamo, AOTAutograd, Inductor 각 경계를 TensorRT, OpenVINO, XLA 같은 컴파일러 백엔드, torch.export, GPU와 새로운 AI 칩이 어떻게 활용하는지 정리합니다. Huawei Ascend, Intel Gaudi, IBM Spyre의 사례도 함께 비교합니다.'
comments: true
keywords: [
  "torch.compile", "TorchDynamo", "TorchInductor", "AOTAutograd",
  "PrivateUse1", "torch.accelerator", "custom op", "core ATen IR",
  "torch.export", "TensorRT", "OpenVINO", "PyTorch/XLA", "Triton",
  "OpenReg", "Ascend", "Gaudi", "Spyre", "vLLM"
]
---

### 개요

안녕하세요? HyperAccel CL(Compute Library)팀 박현준입니다. [1편]({{< ref "/posts/torch-compile-anatomy" >}})에서는 `torch.compile()` 을 TorchDynamo, AOTAutograd, TorchInductor(이하 Dynamo, Inductor) 세 요소로 나누어 살펴봤습니다. Dynamo는 파이썬 코드에서 그래프를 꺼내고, AOTAutograd는 그 그래프를 정리하고, Inductor는 정리된 그래프로 커널을 만듭니다.

1편을 마치며 저는 이 세 요소를 **독립적으로 교체할 수 있다** 는 점을 강조했습니다. 이번 편은 여기서 출발합니다. 파이썬 코드를 받아 커널을 내놓는 일은 컴파일러 하나로도 만들 수 있었을 겁니다. 그런데 PyTorch는 왜 굳이 세 단계로 나눴을까요? 그리고 각 단계를 바꿔 끼울 수 있다면, **누가 무엇을 바꾸고, 그래서 어떤 이득을 얻을까요?**

저는 이 질문의 답이 기술보다 생태계에 있다고 생각합니다. 그래서 Part 1에서는 먼저 PyTorch가 어떻게 사람을 모아 생태계를 만들었는지, 그리고 2.0 이후 그 생태계를 어느 방향으로 넓히고 있는지 살펴봅니다. Part 2에서는 세 단계의 경계마다 무엇이 오가는지, 그리고 그 경계를 누가 어떻게 활용하는지 정리합니다. Part 3에서는 이 구조를 가장 넓게 활용하는 사례로, GPU가 아닌 AI 칩을 만드는 회사들을 살펴봅니다.

1편에서는 2부작으로 예고드렸지만, 이야기를 하나 더 이어 가려 합니다. 다음 편에서는 컴파일러 개발자의 관점에서 읽은 PyTorch Conference 2026을 정리해 보겠습니다.

---

## Part 1. 생태계로 자란 PyTorch {#part1}

### 소프트웨어는 결국 생태계 싸움

메신저를 하나 떠올려 보겠습니다. 처음 메신저를 고를 때 우리가 보는 것은 기능보다 **친구들이 어디에 있느냐** 입니다. 기능이 조금 더 좋아도 친구가 없는 메신저는 쓸 이유가 없으니까요.

그런데 사람이 많이 모인 메신저에는 기능도 따라붙습니다. 선물하기, 송금, 예약처럼 사람이 많아야 의미가 있는 기능이 생기고, 그 기능을 보고 또 사람이 모입니다. **사람이 모이면 기능이 생기고, 기능이 생기면 사람이 더 모입니다.** 이 순환이 한 번 돌기 시작하면, 뒤따라오는 메신저가 기능만으로 따라잡기는 매우 어렵습니다.

딥러닝 프레임워크도 마찬가지입니다. 사용자 입장에서는 예제와 질문에 대한 답, 공개된 모델이 많은 프레임워크를 고르는 것이 합리적입니다. 막혔을 때 검색 한 번으로 풀리는 환경은 그 자체로 생산성이니까요. 라이브러리나 도구를 만드는 개발자도 같습니다. 사용자가 많은 프레임워크 위에 만들어야 자기 결과물이 쓰입니다. 양쪽 모두에게 **"많이 쓰는 쪽"을 고르는 것이 가장 합리적인 선택** 입니다.

### 사람을 모은 PyTorch

이 순환을 가장 잘 돌린 프레임워크가 PyTorch입니다. 1편에서 이야기했듯, PyTorch는 한 줄씩 실행되는 eager 방식으로 진입 장벽을 크게 낮췄습니다. 파이썬 코드를 쓰듯 모델을 짜고, 중간에 값을 찍어 보며 디버깅할 수 있었습니다. 그 편함에 연구자들이 먼저 모였습니다.

연구자가 모이자 나머지가 따라왔습니다. 새 논문의 코드가 PyTorch로 공개되고, 그 코드를 바로 쓰려는 개발자가 모였습니다. Hugging Face 같은 모델 허브와 vLLM, SGLang 같은 추론 엔진도 PyTorch 위에 만들어졌습니다. PyTorch 위에서 돌아가는 컴파일러와 하드웨어도 하나둘 늘어났습니다.

### torch.compile이 지켜야 했던 것

2023년 3월, PyTorch 2.0과 함께 `torch.compile()` 이 나왔습니다. eager 방식의 편함은 그대로 두고, 그래프를 얻어 성능을 끌어올리는 기능입니다.

그런데 이 시점의 PyTorch는 이미 거대한 생태계였습니다. 수많은 사용자 코드가 있었고, PyTorch 위에 자기 컴파일러와 하드웨어를 붙여 온 회사들도 있었습니다. 저는 새 컴파일러가 이 생태계를 깨지 않으려면 두 가지를 지켜야 했다고 생각합니다. 사용자는 코드를 거의 고치지 않아야 하고, PyTorch 위에 무언가를 붙여 온 쪽은 계속 붙일 자리가 있어야 합니다. 앞의 것은 1편에서 본 Dynamo가 해결했습니다. 뒤의 것이 이번 편의 주제입니다.

![PyTorch 2.0부터 2.13까지 바깥 하드웨어와 컴파일러를 위한 확장 기능이 추가된 연표. 2.0의 torch.compile 출시와 rename_privateuse1_backend, 2.1의 자동 dynamic shape와 Inductor 디바이스 등록 API, 2.4의 custom_op, 2.5의 디바이스 확장 자동 로드와 Intel GPU 지원, 2.6의 torch.accelerator, 2.9의 OpenReg 재작성과 Accelerator Integration 문서와 Stable ABI, 2.10의 통합 문서 확장, 2.13의 set_default_backend가 표시되어 있다](images/01-release-timeline.png)

출시 당시 Inductor가 만들 수 있는 코드는 GPU용 Triton과 CPU용 C++ 두 가지였습니다. 그런데 그 뒤의 릴리스를 따라가 보면 흥미로운 점이 보입니다. 새로 들어온 기능의 상당수가 **PyTorch 바깥의 컴파일러와 하드웨어가 끼어들 자리** 를 늘리는 것들입니다.

- **2.1(2023.10)**: 입력 크기가 바뀌면 자동으로 dynamic shape로 전환해 다시 컴파일하기 시작했습니다. 같은 버전에 Inductor에 새 디바이스용 코드 생성기를 등록하는 `register_backend_for_device` 가 들어왔습니다. 다만 이 함수는 지금도 내부(private) API입니다.
- **2.4(2024.07)**: `torch.library.custom_op` 으로 파이썬에서 커스텀 연산을 정의할 수 있게 되었습니다.
- **2.5(2024.10)**: 디바이스 확장 패키지를 설치만 해 두면 `import torch` 시점에 자동으로 불러오게 되었습니다. Intel GPU 지원도 프로토타입으로 들어왔는데, `torch.compile()` 은 Inductor가 Intel GPU용 Triton 코드를 만드는 방식으로 동작합니다.
- **2.6(2025.01)**: 디바이스 종류와 무관하게 쓸 수 있는 공용 API인 `torch.accelerator` 가 생겼습니다.
- **2.9(2025.10)**: 가상 가속기 참조 구현인 OpenReg가 C++로 다시 작성되고, "Accelerator Integration" 공식 문서가 생겼습니다. 확장 모듈을 PyTorch 버전마다 다시 빌드하지 않는 것을 목표로 하는 LibTorch Stable **Application Binary Interface(ABI)** 도 프리뷰로 소개되었습니다.
- **2.10(2026.01)**: 통합 문서가 디바이스, guard, hooks, autoload, AMP 같은 항목별 가이드로 확장되었습니다.
- **2.13(2026.07)**: `torch.compiler.set_default_backend` 로 기본 컴파일 백엔드를 바꿀 수 있게 되었습니다. 사용자가 코드에 `backend=...` 를 일일이 적지 않아도 됩니다.

### 방향은 바깥으로

이 목록이 가리키는 방향은 분명합니다. PyTorch는 모든 것을 직접 만드는 대신, **바깥의 컴파일러와 하드웨어가 들어올 자리를 넓히는 쪽** 으로 움직이고 있습니다.

눈여겨볼 점은 그 자리 자체는 일찍부터 있었다는 것입니다. `torch.compile()` 의 `backend` 자리와 디바이스에 이름을 붙이는 `rename_privateuse1_backend` 는 2.0부터 있었고, Inductor의 코드 생성기를 등록하는 함수도 2.1에 바로 들어왔습니다. 버전이 오르며 바뀐 것은 자리의 개수보다 **공식화된 정도** 입니다. 내부 코드를 뜯어봐야 알 수 있던 방법이 공개 API와 문서, 참조 구현으로 바뀌었습니다.

운영 구조도 같은 방향을 가리킵니다. PyTorch는 2022년 Meta를 떠나 Linux Foundation 산하의 PyTorch Foundation으로 옮겨 갔습니다. 이제는 한 회사가 아니라 여러 하드웨어, 클라우드 회사가 함께 운영하는 프로젝트입니다.

메신저 이야기로 돌아가면 이해가 쉽습니다. 사람이 충분히 모인 플랫폼이 다음으로 할 일은, 바깥 사람들이 기능을 쉽게 붙일 수 있게 자리를 내주는 것입니다. 그리고 `torch.compile()` 에서 그 자리를 만든 것이 바로 세 단계 구조입니다.

---

## Part 2. 왜 세 단계로 나눴을까 {#part2}

### 한 덩어리였다면

반대로 `torch.compile()` 이 파이썬 코드를 받아 Triton 코드를 내놓는 한 덩어리 컴파일러였다고 상상해 보겠습니다.

추론용으로 TensorRT 같은 다른 컴파일러를 쓰고 싶은 팀은, 파이썬 코드에서 그래프를 꺼내는 일부터 직접 해야 합니다. 1편에서 봤듯 이 일은 바이트코드를 해석하고 guard를 세우는 어려운 작업입니다. 새로운 하드웨어를 붙이려는 회사는 그래프 캡처부터 연산 정리, 코드 생성까지 전부 다시 만들어야 합니다. 반대로 PyTorch가 그래프 캡처를 개선해도, 그 혜택은 한 덩어리 안에서만 돌고 바깥으로 나가지 않습니다.

세 단계로 나누면 이야기가 달라집니다. 각 단계의 출력은 **정해진 형식의 데이터** 입니다. 그 형식이 필요한 쪽은 해당 경계에서 받아 가면 되고, 한 단계만 바꾸고 싶은 쪽은 나머지 단계를 그대로 재사용하면 됩니다. 단계 사이의 경계가 일종의 약속이 되는 셈입니다.

![torch.compile의 세 단계와 각 경계를 활용하는 쪽. 파이썬 코드가 TorchDynamo, AOTAutograd, TorchInductor를 거쳐 커널 코드가 된다. Dynamo의 출력인 FX 그래프와 guard는 TensorRT, OpenVINO, XLA 같은 다른 컴파일러 백엔드와 torch.export가 받아 쓴다. AOTAutograd의 출력인 core ATen 그래프는 자체 그래프 컴파일러를 가진 백엔드가 받아 쓴다. Inductor의 출력인 커널 코드는 Triton 백엔드를 통해 NVIDIA, AMD, Intel GPU로 가거나, 코드 생성기를 교체해 새로운 칩으로 간다. 그 아래에는 eager 실행을 맡는 디스패처와 PrivateUse1이 바닥으로 깔려 있다](images/02-three-stages.png)

이제 경계를 하나씩 보면서, 각 경계를 누가 어떻게 쓰는지 살펴보겠습니다.

### 경계 ①: Dynamo의 출력, 그래프가 필요한 모든 이에게

Dynamo가 내놓는 것은 FX 그래프와 guard입니다. 파이썬 코드를 해석해 그래프를 꺼내는 가장 어려운 일을, PyTorch가 한 번 풀어 두고 모두가 나눠 쓰게 한 것입니다.

이 경계를 가장 많이 쓰는 쪽은 다른 컴파일러입니다. `torch.compile()` 의 `backend` 자리에 함수를 넘기면, Dynamo가 꺼낸 그래프가 그 함수로 그대로 전달됩니다. NVIDIA의 TensorRT(`backend="torch_tensorrt"`), Intel의 OpenVINO(`backend="openvino"`), Google의 XLA(`backend="openxla"`)가 모두 이 자리에 붙어 있습니다. 사용자 입장에서는 문자열 하나만 바꾸면 컴파일러가 바뀝니다.

배포 도구도 이 경계를 씁니다. 모델 전체를 하나의 그래프로 뽑아 파이썬 없이 실행할 수 있게 하는 `torch.export` 도 strict 모드에서는 Dynamo로 그래프를 캡처합니다.

직접 확인해 보겠습니다. 선형 계층 뒤에 relu를 적용하고, 결과에 1을 덮어써서 더하는 작은 모델입니다.

```python
import torch
from torch._dynamo.backends.common import aot_autograd
from torch._decomp import core_aten_decompositions


class M(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.fc = torch.nn.Linear(16, 16)

    def forward(self, x):
        return torch.relu(self.fc(x)).add_(1)


def show_dynamo_graph(gm, example_inputs):
    print(gm.code)  # 경계 ①: Dynamo가 꺼낸 그래프
    return gm.forward


def show_aten_graph(gm, example_inputs):
    print(gm.code)  # 경계 ②: AOTAutograd가 정리한 그래프
    return gm.forward


aten_backend = aot_autograd(
    fw_compiler=show_aten_graph,
    decompositions=core_aten_decompositions(),  # core ATen으로 낮추는 규칙
)

x = torch.randn(2, 16)
with torch.no_grad():  # 추론 예시라 역전파 그래프는 만들지 않습니다
    torch.compile(M(), backend=show_dynamo_graph)(x)
    torch.compile(M(), backend=aten_backend)(x)
```

PyTorch 2.10에서 실행하면 두 백엔드가 받은 그래프가 각각 출력됩니다. 핵심 줄만 옮기면 다음과 같습니다.

```text
# 경계 ①에서 받는 그래프
linear = torch._C._nn.linear(l_x_, weight, bias)
relu = torch.relu(linear)
add_ = relu.add_(1)

# 경계 ②에서 받는 그래프
permute = torch.ops.aten.permute.default(arg0_1, [1, 0])
addmm = torch.ops.aten.addmm.default(arg1_1, arg2_1, permute)
relu = torch.ops.aten.relu.default(addmm)
add = torch.ops.aten.add.Tensor(relu, 1)
```

경계 ①의 그래프에는 사용자가 쓴 형태가 그대로 남아 있습니다. `linear` 라는 묶음 연산이 있고, `add_` 처럼 메모리를 덮어쓰는 연산도 있습니다. 이 그래프를 받는 쪽은 이런 표현을 모두 직접 다뤄야 합니다. 대신 무엇을 하든 자유입니다.

### 경계 ②: AOTAutograd의 출력, 정리된 그래프와 역전파

같은 모델이 AOTAutograd를 거치면 PyTorch의 연산 라이브러리인 **ATen** 의 이름으로 통일됩니다. `linear` 는 전치(`permute`)와 행렬 곱 덧셈(`addmm`)으로 풀렸고, 덮어쓰기 `add_` 는 새 텐서를 만드는 `add` 로 바뀌었습니다. 1편에서 본 functionalization과 decomposition이 그대로 적용된 결과입니다.

이 경계의 가치는 숫자로 보면 분명합니다. 현재 최신인 PyTorch 2.14 기준으로 ATen 연산은 오버로드까지 세면 2,500개가 넘습니다. 그중 core ATen으로 분류된 것은 약 190개입니다. 이 경계에서 그래프를 받는 쪽은 우선 이 190여 개만 처리하면 됩니다. 학습을 지원하려면 역전파 그래프가 필요한데, 이것도 AOTAutograd가 함께 만들어 줍니다.

그래서 자체 그래프 컴파일러를 가진 쪽은 보통 이 경계를 택합니다. `backend` 자리에 넘기는 함수를 앞의 예시처럼 `aot_autograd` 로 감싸기만 하면 됩니다. Inductor는 쓰지 않지만, 그래프 캡처와 정리, 역전파는 PyTorch의 것을 그대로 가져다 씁니다. 바꾸는 것은 기껏해야 어떤 연산을 더 잘게 쪼갤지 정하는 decomposition 표 정도입니다.

### 경계 ③: Inductor의 출력, 코드 생성기만 바꾸기

마지막 경계는 Inductor 안쪽에 있습니다. 1편의 마지막 장면을 떠올려 보겠습니다. Inductor는 `y[i] = floor(x[i])` 같은 원소 단위 계산식을 들고 있었습니다. 그리고 각 기본 동작을 **문자열을 반환하는 함수로 갈아끼워** 실행하면 커널 소스가 완성되었습니다. Triton 규칙을 끼우면 Triton 코드가, C++ 규칙을 끼우면 C++ 코드가 나왔습니다.

이 경계를 가장 자연스럽게 쓰는 쪽은 GPU입니다. Inductor가 내놓는 Triton 코드는 Triton 컴파일러가 다시 받아 실제 GPU 코드로 바꿉니다. 그래서 Triton이 지원하는 GPU라면 Inductor를 거의 고치지 않고도 `torch.compile()` 의 혜택을 받습니다. AMD GPU가 이렇게 Triton을 통해 Inductor를 쓰고, 2.5에서 들어온 Intel GPU 지원도 같은 방식입니다.

Triton이 맞지 않는 하드웨어는 교체 규칙 자체를 바꿉니다. 이렇게 하면 Inductor가 하던 일 대부분을 그대로 받습니다. 그래프는 Inductor의 루프 수준 **중간 표현(Intermediate Representation, IR)** 으로 낮춰진 상태로 넘어옵니다. 어떤 연산을 하나의 커널로 묶을지 정하는 스케줄링과 융합도 끝나 있습니다. 버퍼를 언제 재사용할지 같은 메모리 계획도 마찬가지입니다. 등록할 것은 크게 세 가지입니다.

- **스케줄링 클래스**(`BaseScheduling` 을 상속): 하나로 묶인 연산들을 받아 커널 하나의 코드를 만듭니다.
- **래퍼 코드 생성 클래스**(`PythonWrapperCodegen` 을 상속): 만들어진 커널들을 순서대로 호출하는 호스트 코드를 만듭니다.
- **연산 교체 규칙**(`OpOverrides` 계열): `load`, `floor`, `add` 같은 기본 동작마다 자기 언어의 문자열을 돌려줍니다.

앞의 두 클래스를 `register_backend_for_device` 로 디바이스 이름에 연결하면, 그 디바이스의 텐서가 들어왔을 때 Inductor가 Triton 대신 등록된 코드 생성기를 부릅니다.

다만 Inductor의 IR과 스케줄러는 GPU와 CPU를 염두에 두고 만들어졌습니다. 실행 방식이 이 가정과 비슷한 하드웨어일수록, 또는 Inductor의 융합 결정을 받아들여도 괜찮은 하드웨어일수록 이 경계는 강력합니다. 반대로 연산을 묶는 단위부터 하드웨어에 맞게 정해야 한다면, 경계 ②에서 받아 직접 컴파일하는 편이 낫습니다. 또 이 등록 API는 아직 private API라서, PyTorch 버전이 오를 때마다 따라가는 비용도 감수해야 합니다.

### 세 단계 아래: 디스패처와 PrivateUse1

세 경계 모두 `torch.compile()` 안의 이야기입니다. 그런데 컴파일되지 않는 부분도 있습니다. graph break로 끊긴 구간이나 컴파일러가 지원하지 않는 연산은 eager로 실행됩니다. 그래서 새 하드웨어는 컴파일과 별개로 **eager 방식으로 텐서가 돌아가는 바닥** 도 갖춰야 합니다.

1편에서 디스패처를 소개했습니다. `a + b` 를 쓰면 디스패처가 텐서의 위치를 보고 CPU 커널이나 GPU 커널로 보내 준다고 했습니다. 디스패처가 이 판단에 쓰는 표식을 **디스패치 키(dispatch key)** 라고 합니다. CPU나 CUDA 같은 키는 PyTorch 본체에 들어 있습니다. 그리고 PyTorch는 본체 밖의 디바이스를 위해 **PrivateUse1** 이라는 키를 하나 비워 두었습니다.

이 키에는 디바이스 이름을 붙일 수 있습니다. `torch.utils.rename_privateuse1_backend("npu")` 를 호출하면 PrivateUse1이 `npu` 라는 이름으로 보이고, 사용자는 `tensor.to("npu")` 처럼 쓸 수 있습니다. 그다음 ATen 연산마다 이 키로 커널을 등록하고, 메모리 할당자와 스트림 같은 런타임 기능을 연결합니다. 이렇게 연결해 두면 `torch.accelerator` 같은 공용 API와 autograd 같은 PyTorch의 기존 기능을 그 디바이스에서도 그대로 쓸 수 있습니다.

**커스텀 연산** 도 이 층에 속합니다. ATen에 없는 연산, 예를 들어 하드웨어에 맞게 통째로 최적화한 어텐션은 `torch.library.custom_op` 으로 새로 정의합니다. 이때 실제 계산 없이 출력의 모양과 타입만 알려 주는 fake 구현을 함께 등록하면, Dynamo는 이 연산을 쪼개지 않고 **하나의 노드로 그래프에 담을 수 있습니다.** eager에서도, 컴파일에서도 쓸 수 있는 연산이 되는 셈입니다.

### 한눈에 보기

| 경계 | 넘겨주는 것 | 이 경계를 쓰는 쪽 | 얻는 것 |
| --- | --- | --- | --- |
| **① Dynamo의 출력** | FX 그래프 + guard | TensorRT, OpenVINO, XLA 같은 컴파일러 백엔드, `torch.export` | 파이썬을 직접 해석하지 않고 그래프를 얻음 |
| **② AOTAutograd의 출력** | core ATen 그래프(+역전파 그래프) | 자체 그래프 컴파일러를 가진 백엔드 | 처리할 연산이 약 190개로 줄고, 학습 지원이 따라옴 |
| **③ Inductor의 출력** | 커널 코드 | Triton을 지원하는 GPU, 코드 생성기를 교체하는 새 하드웨어 | 융합, 스케줄링, 메모리 계획을 재사용 |
| **바닥: 디스패처** | 연산 하나(eager 호출) | 모든 디바이스 | eager 실행, autograd와 공용 API |

세 단계로 나눈 덕분에, 각자 필요한 경계에서 들어와 나머지를 재사용할 수 있습니다. 그리고 사용자는 그 모든 것을 `torch.compile()` 한 줄로 씁니다.

---

## Part 3. GPU가 아닌 칩은 이 구조를 어떻게 쓰는가 {#part3}

Part 2에서 본 것처럼 이 구조의 수혜자는 다양합니다. 그중 이 구조를 가장 넓게 쓰는 쪽은 GPU가 아닌 AI 칩, 흔히 **Neural Processing Unit(NPU)** 이라고 부르는 칩을 만드는 회사들입니다. Triton이 그대로 맞지 않는 경우가 많아 경계 ②나 ③에서 직접 들어와야 하고, 바닥의 디바이스 층도 스스로 갖춰야 하기 때문입니다. 세 회사의 사례를 보겠습니다.

### Huawei Ascend: 경계마다 길을 열어 두기

Huawei의 Ascend는 가장 많은 경계를 동시에 쓰는 사례입니다.

바닥은 `torch_npu` 라는 확장 패키지가 맡습니다. PrivateUse1에 `npu` 라는 이름을 붙이고, 2.5에 들어온 자동 로드 장치도 구현해 두었습니다. 그래서 최근 버전에서는 `import torch_npu` 없이도 `npu` 디바이스를 쓸 수 있습니다.

컴파일 쪽에서는 두 갈래를 함께 운영합니다. 첫째는 경계 ②에서 받는 **TorchAir** 입니다. `torch.compile(model, backend=torchair.get_npu_backend())` 형태로 쓰고, 안에서 NPU용 decomposition 표와 함께 AOTAutograd를 거칩니다. 이렇게 정리된 그래프를 Ascend IR로 바꿔 Ascend의 **Graph Engine(GE)** 에 넘깁니다. 둘째는 경계 ③입니다. `torch_npu` 는 Inductor에 `npu` 디바이스를 등록해, Inductor의 lowering과 스케줄링은 그대로 쓰고 코드 생성 부분만 Ascend용으로 바꿉니다. 코드 생성 백엔드도 Triton-Ascend를 비롯한 여러 개 중에서 고를 수 있습니다.

사용자가 어떤 방식으로 오든 그 자리에 Ascend가 있게 만드는 전략입니다. 길이 많을수록 사용자는 편하지만, 그만큼 여러 경로를 PyTorch 버전에 맞춰 함께 유지해야 합니다.

### Intel Gaudi: 경계 ②에서 받아 자체 컴파일러로

Intel Gaudi는 경계 ②를 택했습니다. Gaudi의 `hpu_backend` 는 `backend` 자리에 등록되어 있고, 안에서 곧바로 `aot_autograd` 를 호출합니다. 그래서 받는 것은 Gaudi용 decomposition까지 거친 ATen 수준 그래프입니다. Gaudi는 이 그래프를 나누고 변환해 자체 그래프 컴파일러에 넘기고, 컴파일 결과는 캐시해 두었다가 다시 씁니다.

Inductor는 거치지 않습니다. Gaudi 문서는 `backend="inductor"` 를 지원하지 않는다고 명시합니다. 연산을 묶고 메모리를 배치하는 결정을 Inductor에 맡기지 않고, Gaudi 하드웨어를 가장 잘 아는 자체 컴파일러가 내리겠다는 선택입니다.

바닥 쪽은 조금 특별합니다. Gaudi의 디바이스 이름인 `hpu` 는 PrivateUse1에 붙인 이름이 아니라, PyTorch 본체에 정식으로 들어 있는 디바이스 타입입니다. 이 디바이스 타입은 PyTorch 1.10부터 본체에 있었고, PrivateUse1에 이름을 붙이는 기능은 2.0에 들어왔습니다. 실행 방식도 바뀌어 왔습니다. 예전에는 연산을 모아 두었다가 한꺼번에 실행하는 lazy 모드가 기본이었지만, Gaudi 소프트웨어 1.21부터는 eager와 `torch.compile()` 조합이 기본이 되었습니다.

### IBM Spyre: 경계 ③에서 코드 생성기만 교체

IBM의 Spyre 가속기는 경계 ③을 정면으로 택한 사례입니다. 오픈소스 저장소 `torch-spyre` 는 PrivateUse1에 `spyre` 라는 이름을 붙이고, Inductor에 `spyre` 디바이스용 스케줄링 클래스와 래퍼 코드 생성 클래스를 등록합니다. 여기에 Spyre 전용 lowering과 decomposition을 더했습니다. PyTorch 본체를 고치지 않고 **Inductor를 밖에서 확장** 하는 방식입니다.

이때 Inductor가 내놓는 것은 Triton 코드가 아니라 Spyre용 중간 표현인 SuperDSC입니다. 최종 바이너리는 IBM의 자체 컴파일러가 만듭니다. 융합과 스케줄링까지는 Inductor에 맡기고, 칩 고유의 세부 최적화는 그 뒤의 자체 컴파일러가 담당하도록 경계를 그은 것입니다.

흥미로운 점은 Spyre가 처음부터 이 경계를 쓰지는 않았다는 것입니다. 이전에는 vLLM 플러그인이 `sendnn` 이라는 백엔드로 Inductor를 거치지 않고 그래프를 받았습니다. 그러다 Inductor 기반으로 옮겨 왔습니다. [PyTorch Conference Europe 2026 발표 소개](https://pytorchconferenceeu2026.sched.com/event/2Hiqa)에 따르면, 이 과정에서 자체 컴파일러 코드의 상당 부분을 걷어낼 수 있었다고 합니다. 어느 경계에서 들어오느냐가 직접 유지해야 할 코드의 양을 바꾼 사례입니다.

### 한눈에 비교하기

| | 받는 경계 | 바닥(디바이스) | 직접 만든 것 | 얻은 것 / 잃은 것 |
| --- | --- | --- | --- | --- |
| **Huawei Ascend** | ②(TorchAir) + ③(Inductor) | PrivateUse1 `npu` | GE 연동, Triton-Ascend 등 코드 생성 백엔드 | 어떤 경로로 와도 대응 / 여러 경로를 함께 유지해야 함 |
| **Intel Gaudi** | ② | 본체 내장 `hpu` | 그래프 컴파일러, 컴파일 결과 캐시 | 최적화 결정을 직접 내림 / Inductor의 융합 자산은 쓰지 않음 |
| **IBM Spyre** | ③ | PrivateUse1 `spyre` | 스케줄링·래퍼 코드 생성 클래스, 전용 lowering, 최종 컴파일러 | 자체 컴파일러 코드 축소 / Inductor IR과 private API에 맞춰야 함 |

세 회사 모두 경계 ①의 그래프 캡처는 그대로 쓰고, 바닥도 갖췄습니다. 갈린 곳은 경계 ②와 ③ 사이, 즉 **"하드웨어에 맞는 결정을 어디까지 Inductor에 맡길 것인가"** 입니다. 많이 맡길수록 만들 것이 줄고, 적게 맡길수록 하드웨어에 맞는 결정을 직접 내릴 수 있습니다.

참고로 저희 HyperAccel의 LPU는 Gaudi처럼 경계 ②에서 그래프를 받아, 자체 언어인 [Legato]({{< ref "/posts/what-is-legato" >}})로 커널을 만듭니다. 그리고 이 생태계를 쓰기만 하지 않고 upstream에도 기여하고 있습니다. 자세한 내용은 [Legato 문서](https://legato-docs.hyperaccel.net/latest/)에서 확인하실 수 있습니다.

---

## Conclusion

처음 질문으로 돌아가 보겠습니다. `torch.compile()` 은 왜 세 단계로 나뉘어 있을까요?

저는 각 경계가 서로 다른 참여자를 위한 입구이기 때문이라고 생각합니다. 경계 ①에서는 그래프가 필요한 컴파일러와 배포 도구가, 경계 ②에서는 자체 그래프 컴파일러를 가진 쪽이, 경계 ③에서는 새로운 하드웨어가 들어옵니다. 그 아래에는 eager 실행을 받쳐 주는 디스패처가 있습니다. 누구든 필요한 경계에서 들어와 나머지를 재사용할 수 있고, 사용자는 코드를 거의 고치지 않고 그 결과를 누립니다.

메신저 이야기로 돌아가면, 이것은 사람이 모인 플랫폼이 기능을 붙일 자리를 내준 것입니다. 자리가 생기면 기능이 붙고, 기능이 붙으면 사람이 더 모입니다. PyTorch는 들어올 자리를 넓힐수록 "어떤 컴파일러, 어떤 하드웨어든 PyTorch로 쓴다"는 위치를 굳힙니다. 들어오는 쪽은 사용자를 처음부터 다시 모을 필요가 없습니다. 2.0 이후의 연표에서 이 자리가 해마다 조금씩 넓어진 것도 그래서라고 생각합니다.

같은 흐름은 한 층 위에서도 보입니다. vLLM은 지금도 `CustomOp` 이라는 장치로 rms_norm 같은 연산을 하드웨어별로 갈아끼울 수 있게 해 두었습니다. 2026년 1월에는 이를 한 단계 발전시킨 **vLLM IR** 제안이 올라왔습니다. rms_norm, 양자화, 활성화 함수 같은 연산을 FX 위의 상위 연산으로 정의하고, 하드웨어마다 연산별 구현을 등록하게 하자는 내용입니다. 4월에 나온 [v0.20.0](https://github.com/vllm-project/vllm/releases/tag/v0.20.0)부터는 `vllm.ir` 모듈이 실제로 들어오기 시작했습니다.

Part 2의 틀로 보면, 이것은 경계를 하나 더 위에 만드는 일입니다. 지금까지 가장 정돈된 경계는 core ATen 그래프였습니다. 이 흐름이 자리를 잡는다면 앞으로는 **rms_norm처럼 모델 개발자가 보는 단위 그대로** 받는 경계가 생깁니다. 연산을 잘게 쪼갰다가 다시 합치는 수고가 줄어드니, 큰 단위로 최적화된 커널을 가진 하드웨어에게는 반가운 변화입니다. 다만 vLLM 안에서도 하드웨어별로 모델 코드를 따로 두자는 제안과, 하드웨어와 무관한 모델 정의를 지키자는 제안이 함께 올라와 있어 방향은 아직 논의 중입니다.

다음 편에서는 시야를 조금 넓혀, 10월 20~21일 미국 새너제이에서 열리는 PyTorch Conference 2026을 컴파일러 개발자의 관점에서 읽어 보겠습니다. 이번 편에서 정리한 경계들이 실제 발표들 속에서 어떻게 움직이고 있는지 확인해 보려 합니다.

## Reference

**PyTorch 공식 문서와 블로그**

- [PyTorch 2.0 release blog](https://pytorch.org/blog/pytorch-2.0-release/) — `torch.compile()` 출시
- [Custom Backends](https://docs.pytorch.org/docs/main/user_guide/torch_compiler/torch.compiler_custom_backends.html) — 경계 ①, ②에서 백엔드를 붙이는 방법
- [torch.compiler](https://docs.pytorch.org/docs/2.10/user_guide/torch_compiler/torch.compiler.html) — 사용할 수 있는 백엔드 목록
- [torch.export](https://docs.pytorch.org/docs/2.14/user_guide/torch_compiler/export.html) — Dynamo 기반 그래프 캡처를 쓰는 배포용 export
- [IRs (Core ATen IR)](https://docs.pytorch.org/docs/stable/user_guide/torch_compiler/torch.compiler_ir.html) — core ATen 연산 목록
- [Accelerator Integration](https://docs.pytorch.org/docs/2.9/accelerator/index.html) — PrivateUse1 기반 가속기 통합 가이드
- [Python Custom Operators](https://docs.pytorch.org/tutorials/advanced/python_custom_ops.html) — `torch.library.custom_op`
- [Autoloading Out-of-Tree Extension](https://docs.pytorch.org/tutorials/unstable/python_extension_autoload.html) — 디바이스 확장 자동 로드
- [Intel GPU Support Now Available in PyTorch 2.5](https://pytorch.org/blog/intel-gpu-support-pytorch-2-5/)
- [OpenReg: A Self-Contained PyTorch Accelerator Simulator](https://pytorch.org/blog/openreg/)
- [PyTorch 2.9 Release Blog](https://pytorch.org/blog/pytorch-2-9/) — LibTorch Stable ABI
- [PyTorch v2.13.0 Release Notes](https://github.com/pytorch/pytorch/releases/tag/v2.13.0) — `torch.compiler.set_default_backend`
- [Meta Transitions PyTorch to the Linux Foundation](https://www.linuxfoundation.org/press/press-release/meta-transitions-pytorch-to-the-linux-foundation) — PyTorch Foundation 출범(2022.09)

**경계를 활용하는 컴파일러와 하드웨어**

- [TensorRT Backend for torch.compile](https://docs.pytorch.org/TensorRT/user_guide/compilation/torch_compile.html), [PyTorch/XLA TorchDynamo Integration](https://docs.pytorch.org/xla/master/perf/dynamo.html)
- [Accelerate PyTorch Models using torch.compile on AMD GPUs with ROCm](https://rocm.blogs.amd.com/artificial-intelligence/torch_compile/README.html)
- [Ascend Extension for PyTorch (torch_npu)](https://github.com/Ascend/pytorch), [TorchAir](https://github.com/Ascend/torchair), [Triton-Ascend](https://github.com/Ascend/triton-ascend)
- [Intel Gaudi PyTorch Theory of Operations](https://docs.habana.ai/en/latest/PyTorch/PyTorch_Gaudi_Theory_of_Operations.html), [Gaudi PyTorch Support Matrix](https://docs.habana.ai/en/latest/PyTorch/Reference/PyTorch_Support_Matrix.html), [Gaudi PyTorch Bridge](https://github.com/HabanaAI/gaudi-pytorch-bridge)
- [torch-spyre](https://github.com/torch-spyre/torch-spyre), [torch-spyre 컴파일러 아키텍처](https://torch-spyre.readthedocs.io/en/latest/compiler/architecture.html), [IBM Research: PyTorch support for IBM Spyre](https://research.ibm.com/blog/pytorch-support-ibm-spyre), [PyTorch Conference Europe 2026 발표](https://pytorchconferenceeu2026.sched.com/event/2Hiqa)

**vLLM**

- [vLLM Plugin System](https://docs.vllm.ai/en/latest/design/plugin_system.html)
- [RFC: vLLM IR (#32358)](https://github.com/vllm-project/vllm/issues/32358), [vLLM IR 설계 문서](https://docs.vllm.ai/en/stable/design/vllm_ir/)
- [RFC #42770](https://github.com/vllm-project/vllm/issues/42770), [RFC #44219](https://github.com/vllm-project/vllm/issues/44219) — 하드웨어별 모델 코드 분리와 하드웨어 무관 모델 정의에 대한 논의

**HyperAccel**

- [Legato 문서](https://legato-docs.hyperaccel.net/latest/)
- [Legato: HyperAccel LPU를 위한 프로그래밍 언어]({{< ref "/posts/what-is-legato" >}})

## 추신: HyperAccel은 채용 중입니다!

![HyperAccel의 LPU 칩 Bertha. 패키지 가운데에 HYPER ACCEL과 Bertha가 새겨진 다이가 자리하고, 주변으로 배선과 패드가 뻗어 있다](images/bertha-chip.jpg)

HyperAccel은 LPU라는 새로운 아키텍처로 AI 인프라 시장에 도전장을 내밀고 있습니다. 그리고 소프트웨어팀은 이 하드웨어의 성능을 끝까지 끌어내면서, 동시에 사용자가 LPU를 **가장 직관적이고 아름다운 방식으로** 활용할 수 있도록 다양한 연구와 구현을 진행하고 있습니다.

저희와 멋진 여정을 함께하고 싶으시다면, [HyperAccel Career](https://hyperaccel.career.greetinghr.com/ko/guide)로 지원해 주세요!
