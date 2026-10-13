---
date: '2026-10-12T18:00:00+09:00'
draft: true
title: 'torch.compile 해부 2편: PyTorch가 열어 둔 네 개의 문과 NPU'
cover:
  image: "images/pytorch.jpg"
  alt: "PyTorch 로고"
  caption: "PyTorch"
  relative: true
authors: [Hyunjun Park]
tags: ["torch.compile", "PyTorch", "TorchDynamo", "TorchInductor", "AOTAutograd", "PrivateUse1", "NPU", "Compiler", "Legato"]
series: ["torch.compile 해부"]
series_idx: 2
categories: ["AI", "Compiler"]
summary: 'PyTorch가 CUDA가 아닌 가속기를 위해 열어 둔 네 개의 확장 지점을 정리하고, Huawei Ascend, Intel Gaudi, IBM Spyre, 그리고 HyperAccel이 각각 어느 문으로 들어갔는지 비교합니다.'
description: 'NPU 회사들이 자체 프레임워크 대신 PyTorch 안으로 들어가려는 이유를 생태계 관점에서 설명하고, Dynamo 커스텀 백엔드, AOTAutograd, Inductor 코드 생성기, PrivateUse1이라는 네 개의 확장 지점을 받는 것, 재사용하는 자산, 직접 만들어야 하는 것으로 나누어 비교합니다. Huawei Ascend, Intel Gaudi, IBM Spyre, HyperAccel LPU의 선택도 같은 틀로 정리합니다.'
comments: true
keywords: [
  "torch.compile", "TorchDynamo", "TorchInductor", "AOTAutograd",
  "PrivateUse1", "torch.accelerator", "custom op", "core ATen IR",
  "OpenReg", "NPU", "Ascend", "torch_npu", "Gaudi", "Spyre",
  "Legato", "LPU", "vLLM"
]
---

### 개요

안녕하세요? HyperAccel CL(Compute Library)팀 박현준입니다. [1편]({{< ref "/posts/torch-compile-anatomy" >}})에서는 `torch.compile()` 을 TorchDynamo, AOTAutograd, TorchInductor(이하 Dynamo, Inductor) 세 요소로 나누어 살펴봤습니다. 이번 편에서는 그 구조 위에 **Neural Processing Unit(NPU)** 같은 다른 칩들이 어떻게 올라타는지를 다룹니다.

1편을 마무리하며 저는 `torch.compile()` 의 진짜 면모가 **구조** 에 있다고 말씀드렸습니다. 물론 `torch.compile()` 이 주목받은 일차적인 이유는 속도입니다. 하지만 이것이 PyTorch의 중심 기능으로 자리 잡는 데에는 **각 모듈을 교체할 수 있다는 사실** 도 그에 못지않게 중요했다고 생각합니다. Dynamo가 꺼낸 그래프는 Inductor가 아닌 다른 컴파일러에게도 넘길 수 있습니다. Inductor는 교체 규칙만 바꿔서 Triton과 C++ 코드를 모두 뽑아냈습니다.

그렇다면 자연스럽게 다음 질문이 떠오릅니다. **그 자리에 NVIDIA의 GPU 프로그래밍 플랫폼인 Compute Unified Device Architecture(CUDA)가 아닌 칩을 꽂으면 어떻게 될까요?**

이 질문은 저희에게 남의 이야기가 아닙니다. HyperAccel은 **LLM Processing Unit(LPU)** 이라는 **Large Language Model(LLM)** 특화 칩을 만들고 있습니다. 그리고 사용자가 이미 쓰고 있는 PyTorch 코드를 이 칩에서 그대로 돌리고 싶습니다. 같은 고민을 하는 회사는 저희만이 아닙니다. 여러 NPU 회사들이 각자의 방식으로 PyTorch 안에 자리를 잡고 있습니다.

이번 편은 세 부분으로 구성됩니다. Part 1에서는 NPU 회사들이 왜 PyTorch 안으로 들어가려 하는지를 생태계 관점에서 이야기합니다. Part 2에서는 PyTorch가 바깥 하드웨어를 위해 열어 둔 네 개의 확장 지점을 하나씩 살펴봅니다. 이 글에서는 이 확장 지점을 **"문"** 이라고 부르겠습니다. Part 3에서는 Huawei, Intel, IBM이 각각 어느 문으로 들어갔는지 비교하고, 마지막으로 HyperAccel이 고른 문을 같은 틀로 정리합니다.

1편에서는 2부작으로 예고드렸지만, 이야기를 하나 더 이어 가려 합니다. 다음 편에서는 컴파일러 개발자의 관점에서 읽은 PyTorch Conference 2026을 정리해 보겠습니다.

---

## Part 1. 왜 다들 PyTorch 안으로 들어가려 하는가 {#part1}

### 소프트웨어는 결국 생태계 싸움

메신저를 하나 떠올려 보겠습니다. 처음 메신저를 고를 때 우리가 보는 것은 기능보다 **친구들이 어디에 있느냐** 입니다. 기능이 조금 더 좋아도 친구가 없는 메신저는 쓸 이유가 없으니까요.

그런데 사람이 많이 모인 메신저에는 기능도 따라붙습니다. 선물하기, 송금, 예약처럼 사람이 많아야 의미가 있는 기능이 생기고, 그 기능을 보고 또 사람이 모입니다. **사람이 모이면 기능이 생기고, 기능이 생기면 사람이 더 모입니다.** 이 순환이 한 번 돌기 시작하면, 뒤따라오는 메신저가 기능만으로 따라잡기는 매우 어렵습니다.

딥러닝 프레임워크도 마찬가지입니다. 사용자 입장에서는 예제와 질문에 대한 답, 공개된 모델이 많은 프레임워크를 고르는 것이 합리적입니다. 막혔을 때 검색 한 번으로 풀리는 환경은 그 자체로 생산성이니까요. 라이브러리나 도구를 만드는 개발자도 같습니다. 사용자가 많은 프레임워크 위에 만들어야 자기 결과물이 쓰입니다. 양쪽 모두에게 **"많이 쓰는 쪽"을 고르는 것이 가장 합리적인 선택** 입니다.

그리고 이 자리를 차지한 것이 PyTorch입니다. 1편에서 이야기했듯, PyTorch는 한 줄씩 실행되는 eager 방식으로 진입 장벽을 크게 낮췄습니다. 그 덕분에 연구자들이 먼저 모였고, 그 위에 지금의 생태계가 쌓였습니다.

### GPU 1강 시대의 소프트웨어

이제 시선을 하드웨어로 돌려 보겠습니다. AI 가속기 시장은 NVIDIA GPU가 압도적으로 앞서 있는 1강 구도입니다. 그리고 소프트웨어는 하드웨어가 많이 깔린 곳을 따라 발전합니다. 새로운 최적화 기법도, 새로운 커널 라이브러리도 대부분 GPU에서 먼저 나오고 GPU에서 먼저 검증됩니다.

PyTorch도 이 흐름의 한가운데 있습니다. PyTorch는 CUDA 지원을 가장 먼저 챙겨 온 프레임워크이고, 새로운 GPU 기능도 빠르게 받아들여 왔습니다. GPU를 쓰는 사람이 모이니 새 모델은 PyTorch 코드와 함께 공개되고, vLLM이나 SGLang 같은 추론 엔진도 PyTorch 위에 만들어집니다. 앞에서 본 메신저의 순환이 그대로 돌고 있는 셈입니다.

NPU 회사 입장에서 결론은 분명합니다. 자체 프레임워크를 만들면 하드웨어를 마음껏 표현할 수는 있습니다. 하지만 사용자에게 새 프레임워크를 배우게 해야 하고, 수많은 모델을 다시 옮겨 와야 합니다. 반면 **PyTorch 안에 들어가면** 사용자는 쓰던 코드를 그대로 쓰고, 칩은 이미 돌고 있는 생태계에 올라탈 수 있습니다. 그래서 자체 프레임워크가 있는 회사도 PyTorch 지원은 따로 갖춥니다. Huawei가 MindSpore라는 자체 프레임워크를 운영하면서도 PyTorch용 확장을 함께 내놓는 것이 좋은 예입니다.

### GPU에서 시작해 다른 칩으로 열리기까지

![PyTorch 2.0부터 2.13까지 바깥 가속기를 위한 확장 기능이 추가된 연표. 2.0의 torch.compile 출시와 rename_privateuse1_backend, 2.1의 자동 dynamic shape와 Inductor 디바이스 등록 API, 2.4의 custom_op, 2.5의 디바이스 확장 자동 로드, 2.6의 torch.accelerator, 2.9의 OpenReg 재작성과 Accelerator Integration 문서와 Stable ABI, 2.10의 통합 문서 확장, 2.13의 set_default_backend가 표시되어 있다](images/01-release-timeline.png)

다만 PyTorch가 처음부터 다른 칩에게 친절했던 것은 아닙니다. 2023년 3월 PyTorch 2.0과 함께 `torch.compile()` 이 나왔을 때, Inductor가 만들 수 있는 코드는 GPU용 Triton과 CPU용 C++ 두 가지뿐이었습니다. 당시 공식 안내도 지원 대상으로 CPU와 NVIDIA Volta, Ampere 세대 GPU만 적어 두었습니다. CPU를 빼면 사실상 NVIDIA GPU 전용으로 출발한 셈입니다.

그 뒤 버전이 오를 때마다 바깥 하드웨어를 위한 장치가 하나씩 늘어났습니다. 디바이스에 이름을 붙이는 `rename_privateuse1_backend` 처럼 2.0부터 있던 것도 있지만, 대부분은 그 이후에 들어왔습니다.

- **2.1(2023.10)**: 입력 크기가 바뀌면 자동으로 dynamic shape로 전환해 다시 컴파일하기 시작했습니다. 입력 길이가 매번 바뀌는 LLM에서도 그래프를 재사용할 수 있게 된 것으로, 컴파일러를 붙이려는 모든 칩에게 전제가 되는 기능입니다. 같은 버전에 Inductor에 새 디바이스용 코드 생성기를 등록하는 `register_backend_for_device` 도 들어왔습니다. 다만 이 함수는 지금도 내부(private) API입니다.
- **2.4(2024.07)**: `torch.library.custom_op` 으로 파이썬에서 커스텀 연산을 정의할 수 있게 되었습니다.
- **2.5(2024.10)**: 디바이스 확장 패키지를 설치만 해 두면 `import torch` 시점에 자동으로 불러오게 되었습니다.
- **2.6(2025.01)**: 디바이스 종류와 무관하게 쓸 수 있는 공용 API인 `torch.accelerator` 가 생겼습니다.
- **2.9(2025.10)**: 가상 가속기 참조 구현인 OpenReg가 C++로 다시 작성되고, "Accelerator Integration" 공식 문서가 생겼습니다. 확장 모듈을 PyTorch 버전마다 다시 빌드하지 않는 것을 목표로 하는 LibTorch Stable **Application Binary Interface(ABI)** 도 프리뷰로 소개되었습니다.
- **2.10(2026.01)**: 통합 문서가 디바이스, guard, hooks, autoload, AMP 같은 항목별 가이드로 확장되었습니다.
- **2.13(2026.07)**: `torch.compiler.set_default_backend` 로 기본 컴파일 백엔드를 바꿀 수 있게 되었습니다. 벤더가 사용자 코드에 `backend=...` 를 일일이 요구하지 않아도 됩니다.

이 연표에서 눈여겨볼 점이 있습니다. Part 2에서 볼 네 개의 문 가운데 셋은 2.0에 이미 있었고, 나머지 하나도 2.1에 바로 들어왔습니다. 1편에서 본 세 요소의 경계가 그대로 확장 지점이 되기 때문입니다. 즉 여러 단위로 꽂을 수 있는 구조는 일찍부터 갖춰져 있었습니다. 버전이 오르며 바뀐 것은 문의 개수보다 **문이 공식화된 정도** 입니다. 내부 코드를 뜯어봐야 알 수 있던 방법이 공개 API와 문서, 참조 구현으로 바뀌었고, 그만큼 다른 칩의 진입 장벽이 낮아지고 있습니다.

---

## Part 2. PyTorch가 열어 둔 네 개의 문 {#part2}

### 꽂는 깊이가 다른 네 자리

![torch.compile 스택의 각 단계와 네 개의 확장 지점. 파이썬 코드가 TorchDynamo, AOTAutograd, TorchInductor, 디스패처를 거쳐 하드웨어 커널이 되고, 각 단계 옆에 문 1 Dynamo 커스텀 백엔드(torch 수준 FX 그래프), 문 2 AOTAutograd 아래(core ATen 그래프), 문 3 Inductor 코드 생성기(융합이 끝난 루프 수준 IR), 문 4 PrivateUse1(연산 하나)이 붙어 있다. 위쪽이 굵은 단위, 아래쪽이 가는 단위다](images/02-four-doors.png)

1편에서 `torch.compile()` 은 Dynamo, AOTAutograd, Inductor 세 단계를 거친다고 했습니다. 그리고 그 아래에는 연산 하나하나를 디바이스에 맞는 커널로 보내 주는 디스패처가 있습니다. 바깥 하드웨어가 끼어들 수 있는 자리는 바로 이 단계들의 경계입니다. 굵은 단위에서 가는 단위 순으로 정리하면 네 자리가 나옵니다.

- **문 1**: Dynamo 바로 뒤에서 그래프를 통째로 받습니다.
- **문 2**: AOTAutograd가 정리한 core ATen 그래프를 받습니다.
- **문 3**: Inductor 안에서 코드 생성기만 바꿉니다.
- **문 4**: 디스패처에서 연산 하나 단위로 받습니다.

문 1에서 문 3으로 내려갈수록 PyTorch가 대신 해 주는 일이 많아지고, 벤더가 직접 만들 것은 줄어듭니다. 대신 PyTorch가 정해 둔 방식에 더 많이 맞춰야 합니다. 문 4는 단위로 보면 가장 가는 끝에 있지만, 역할은 조금 다릅니다. 컴파일과 상관없이 칩을 PyTorch에 연결하는 층이라서, 문 1~3 모두가 이 위에서 동작합니다.

이번 Part에서는 각 문을 세 가지 질문으로 보겠습니다. **무엇을 받는가, 어떤 자산을 재사용하는가, 무엇을 직접 만들어야 하는가.** 답은 Part 마지막에 표로 모아 두었습니다.

### 문 1·2: 그래프를 통째로 받아 가는 자리

**문 1, Dynamo 커스텀 백엔드** 는 가장 바깥의 문입니다. `torch.compile()` 의 `backend` 자리에 함수를 하나 넘기면, Dynamo가 꺼낸 FX 그래프와 예시 입력이 그 함수로 그대로 전달됩니다. 함수 대신, 패키지가 미리 등록해 둔 이름을 `backend="이름"` 처럼 문자열로 넘길 수도 있습니다.

**문 2, AOTAutograd 아래** 는 문 1의 함수 안에서 AOTAutograd를 한 번 거친 뒤 받는 자리입니다. PyTorch는 이를 위해 `aot_autograd` 라는 도우미를 제공합니다. 벤더는 정리된 그래프를 받을 컴파일 함수와, 연산을 어떻게 쪼갤지 정한 decomposition 표를 함께 넘기면 됩니다.

두 문이 받는 그래프를 직접 비교해 보겠습니다. 선형 계층 뒤에 relu를 적용하고, 결과에 1을 덮어써서 더하는 작은 모델입니다.

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


def door1_backend(gm, example_inputs):
    print(gm.code)  # 문 1: Dynamo가 꺼낸 그래프 그대로
    return gm.forward


def door2_compiler(gm, example_inputs):
    print(gm.code)  # 문 2: AOTAutograd가 정리한 그래프
    return gm.forward


door2_backend = aot_autograd(
    fw_compiler=door2_compiler,
    decompositions=core_aten_decompositions(),  # core ATen으로 낮추는 규칙
)

x = torch.randn(2, 16)
with torch.no_grad():  # 추론 예시라 역전파 그래프는 만들지 않습니다
    torch.compile(M(), backend=door1_backend)(x)
    torch.compile(M(), backend=door2_backend)(x)
```

PyTorch 2.10에서 실행하면 두 백엔드가 받은 그래프가 각각 출력됩니다. 핵심 줄만 옮기면 다음과 같습니다.

```text
# 문 1이 받는 그래프
linear = torch._C._nn.linear(l_x_, weight, bias)
relu = torch.relu(linear)
add_ = relu.add_(1)

# 문 2가 받는 그래프
permute = torch.ops.aten.permute.default(arg0_1, [1, 0])
addmm = torch.ops.aten.addmm.default(arg1_1, arg2_1, permute)
relu = torch.ops.aten.relu.default(addmm)
add = torch.ops.aten.add.Tensor(relu, 1)
```

문 1의 그래프에는 사용자가 쓴 형태가 그대로 남아 있습니다. `linear` 라는 묶음 연산이 있고, `add_` 처럼 메모리를 덮어쓰는 연산도 있습니다. 반면 문 2의 그래프는 PyTorch의 연산 라이브러리인 **ATen** 의 이름으로 통일되어 있습니다. `linear` 는 전치(`permute`)와 행렬 곱 덧셈(`addmm`)으로 풀렸고, 덮어쓰기 `add_` 는 새 텐서를 만드는 `add` 로 바뀌었습니다. 1편에서 본 functionalization과 decomposition이 그대로 적용된 결과입니다.

이 차이가 두 문의 성격을 가릅니다. 문 1은 가장 자유롭습니다. 그래프를 받은 뒤 무엇을 하든 벤더 마음입니다. 대신 같은 연산의 여러 표현과 덮어쓰기 연산을 모두 직접 처리해야 합니다. 학습까지 지원하려면 역전파 그래프도 스스로 만들어야 합니다.

문 2는 이 정리 작업을 PyTorch에 맡깁니다. 무엇보다 구현해야 할 연산 수가 크게 줄어듭니다. 현재 최신인 PyTorch 2.14 기준으로 ATen 연산은 오버로드까지 세면 2,500개가 넘습니다. 그중 core ATen으로 분류된 것은 약 190개입니다. 벤더는 우선 이 190여 개를 자기 칩에서 돌게 만드는 데 집중할 수 있습니다. 다만 decomposition 규칙이 없는 연산이나 벤더가 일부러 쪼개지 않은 연산은 그래프에 남습니다. 이런 연산은 뒤에서 볼 문 4의 커스텀 연산이나 eager 실행으로 받아 줘야 합니다.

그리고 두 문 모두, 연산을 어떻게 묶고 메모리를 어떻게 배치하고 어떤 코드를 뽑을지는 여전히 전부 직접 해야 합니다.

### 문 3: Inductor의 코드 생성기를 갈아끼우기

1편의 마지막 장면을 떠올려 보겠습니다. Inductor는 `y[i] = floor(x[i])` 같은 원소 단위 계산식을 들고 있었습니다. 그리고 각 기본 동작을 **문자열을 반환하는 함수로 갈아끼워** 실행하면 커널 소스가 완성되었습니다. Triton 규칙을 끼우면 Triton 코드가, C++ 규칙을 끼우면 C++ 코드가 나왔습니다. **문 3은 바로 이 교체 규칙 자리에 자기 칩의 규칙을 끼우는 문** 입니다.

이 문으로 들어오면 Inductor가 하던 일 대부분을 그대로 받습니다. 먼저 그래프는 Inductor의 루프 수준 **중간 표현(Intermediate Representation, IR)** 으로 낮춰진 상태로 넘어옵니다. 어떤 연산을 하나의 커널로 묶을지 정하는 스케줄링과 융합도 끝나 있습니다. 버퍼를 언제 재사용할지 같은 메모리 계획도 마찬가지입니다. 벤더는 그 결과를 **어떤 문자열로 출력할지** 만 바꾸면 됩니다.

등록해야 할 것은 크게 세 가지입니다.

- **스케줄링 클래스**(`BaseScheduling` 을 상속): 하나로 묶인 연산들을 받아 커널 하나의 코드를 만듭니다.
- **래퍼 코드 생성 클래스**(`PythonWrapperCodegen` 을 상속): 만들어진 커널들을 순서대로 호출하는 호스트 코드를 만듭니다.
- **연산 교체 규칙**(`OpOverrides` 계열): `load`, `floor`, `add` 같은 기본 동작마다 자기 언어의 문자열을 돌려줍니다.

앞의 두 클래스를 `register_backend_for_device` 로 디바이스 이름에 연결하면, 그 디바이스의 텐서가 들어왔을 때 Inductor가 Triton 대신 벤더의 코드 생성기를 부릅니다.

공짜로 얻는 것이 많은 만큼 대가도 있습니다. Inductor의 IR과 스케줄러는 GPU와 CPU를 염두에 두고 만들어졌습니다. 칩의 실행 방식이 이 가정과 비슷할수록, 또는 Inductor의 융합 결정을 받아들여도 괜찮은 칩일수록 문 3은 강력합니다. 반대로 연산을 묶는 단위부터 칩에 맞게 정해야 한다면, Inductor가 내린 융합 결정이 오히려 걸림돌이 될 수 있습니다. 또 앞에서 말했듯 이 등록 API는 아직 private API라서, PyTorch 버전이 오를 때마다 따라가는 비용도 감수해야 합니다.

### 문 4: PrivateUse1, 모든 문의 바닥

위의 세 문이 컴파일에 관한 문이라면, 문 4는 그보다 아래에 있습니다. 컴파일 이전에 **eager 방식으로 텐서가 칩 위에서 돌아가게 만드는 층** 입니다.

1편에서 디스패처를 소개했습니다. `a + b` 를 쓰면 디스패처가 텐서의 위치를 보고 CPU 커널이나 GPU 커널로 보내 준다고 했습니다. 디스패처가 이 판단에 쓰는 표식을 **디스패치 키(dispatch key)** 라고 합니다. CPU나 CUDA 같은 키는 PyTorch 본체에 들어 있습니다. 그리고 PyTorch는 본체 밖의 디바이스를 위해 **PrivateUse1** 이라는 키를 하나 비워 두었습니다.

벤더는 이 키에 자기 디바이스 이름을 붙입니다. `torch.utils.rename_privateuse1_backend("npu")` 를 호출하면 PrivateUse1이 `npu` 라는 이름으로 보이고, 사용자는 `tensor.to("npu")` 처럼 쓸 수 있습니다.

이름을 붙였으면 연산을 채웁니다. ATen 연산마다 이 키로 커널을 등록하면, 디스패처가 해당 디바이스의 텐서를 벤더의 커널로 보내 줍니다. 메모리 할당자, 스트림, 디바이스 전환 같은 런타임 기능도 이 층에서 연결합니다. 이렇게 연결해 두면 `torch.accelerator` 같은 공용 API와 autograd 같은 PyTorch의 기존 기능을 벤더 디바이스에서도 그대로 쓸 수 있습니다.

**커스텀 연산** 은 이 층의 또 다른 축입니다. ATen에 없는 연산, 예를 들어 칩에 맞게 통째로 최적화한 어텐션은 `torch.library.custom_op` 으로 새로 정의합니다. 이때 실제 계산 없이 출력의 모양과 타입만 알려 주는 fake 구현을 함께 등록하면, Dynamo는 이 연산을 쪼개지 않고 **하나의 노드로 그래프에 담을 수 있습니다.** eager에서도, 컴파일에서도 쓸 수 있는 연산이 되는 셈입니다.

위의 세 문이 이 층을 전제로 하는 이유는 간단합니다. 문 1~3은 그래프에 담긴 부분만 책임집니다. graph break로 끊긴 구간이나 컴파일러가 아직 지원하지 않는 연산은 결국 eager로 실행되는데, 그때 연산을 칩 위에서 받아 줄 곳이 이 층입니다. 이 층이 없으면 그런 연산은 CPU로 돌아가야 하고, 그때마다 데이터가 칩과 호스트 사이를 오가야 합니다.

### 네 문을 한 표로

| | 받는 것 | 재사용하는 자산 | 직접 만들어야 하는 것 |
| --- | --- | --- | --- |
| **문 1** Dynamo 커스텀 백엔드 | torch 수준 FX 그래프 | Dynamo의 그래프 캡처와 guard | 연산 정규화부터 코드 생성까지 전부 |
| **문 2** AOTAutograd 아래 | core ATen 그래프 | 문 1 + functionalization, decomposition, 역전파 그래프 | 약 190개 연산의 구현, 융합, 메모리 배치, 코드 생성 |
| **문 3** Inductor 코드 생성기 | 융합이 끝난 루프 수준 IR | 문 2 + lowering, 스케줄링과 융합, 메모리 계획 | 커널과 호스트 코드를 출력하는 코드 생성기 |
| **문 4** PrivateUse1 | 연산 하나(eager 호출) | 디스패처, autograd, `torch.accelerator` 등 공용 API | 연산별 커널, 커스텀 연산, 런타임 |

---

## Part 3. 문을 열고 들어간 NPU 회사들 {#part3}

### Huawei Ascend: 생태계에 최대한 얹기

Huawei의 Ascend NPU는 가장 많은 문을 동시에 쓰는 사례입니다.

바닥은 `torch_npu` 라는 확장 패키지가 맡습니다. PrivateUse1에 `npu` 라는 이름을 붙이고, 2.5에 들어온 자동 로드 장치도 구현해 두었습니다. 그래서 최근 버전에서는 `import torch_npu` 없이도 `npu` 디바이스를 쓸 수 있습니다. 문 4를 교과서대로 쓰는 셈입니다.

컴파일 쪽에서는 두 갈래를 함께 운영합니다. 첫째는 **TorchAir** 입니다. `torch.compile(model, backend=torchair.get_npu_backend())` 형태로 쓰는 백엔드로, 안에서 NPU용 decomposition 표와 함께 AOTAutograd를 거칩니다(문 1 → 2). 이렇게 정리된 그래프를 Ascend IR로 바꿔 Ascend의 **Graph Engine(GE)** 에 넘깁니다.

둘째는 Inductor 경로입니다. `torch_npu` 는 Inductor에 `npu` 디바이스를 등록합니다(문 3). 이 경로에서는 Inductor의 lowering과 스케줄링을 그대로 쓰고, 코드 생성 부분만 Ascend용으로 바꿉니다. 코드 생성 백엔드도 Triton-Ascend를 비롯한 여러 개 중에서 고를 수 있습니다.

Ascend의 전략은 "PyTorch가 열어 둔 문이라면 가능한 한 모두 들어간다"에 가깝습니다. 사용자가 어떤 방식으로 오든 그 자리에 Ascend가 있게 만드는 것입니다. 문이 많을수록 사용자는 편하지만, 벤더는 그만큼 여러 경로를 PyTorch 버전에 맞춰 함께 유지해야 합니다.

### Intel Gaudi: 그래프만 받아 자체 컴파일러로

Intel Gaudi는 문 1 → 2 경로 하나에 집중한 사례입니다. Gaudi의 `hpu_backend` 는 Dynamo 백엔드로 등록되어 있지만, 안에서 곧바로 `aot_autograd` 를 호출합니다. 그래서 실제로 받는 것은 Gaudi용 decomposition까지 거친 ATen 수준 그래프입니다. Gaudi는 이 그래프를 나누고 변환해 자체 그래프 컴파일러에 넘기고, 컴파일 결과는 캐시해 두었다가 다시 씁니다.

Inductor는 거치지 않습니다. Gaudi 문서는 `backend="inductor"` 를 지원하지 않는다고 명시합니다. 연산을 묶고 메모리를 배치하는 결정을 Inductor에 맡기지 않고, Gaudi 하드웨어를 가장 잘 아는 자체 컴파일러가 내리겠다는 선택입니다.

디바이스 층은 조금 특별합니다. Gaudi의 디바이스 이름인 `hpu` 는 PrivateUse1에 붙인 이름이 아니라, PyTorch 본체에 정식으로 들어 있는 디바이스 타입입니다. 이 디바이스 타입은 PyTorch 1.10부터 본체에 있었고, PrivateUse1에 이름을 붙이는 기능은 2.0에 들어왔습니다.

실행 방식도 바뀌어 왔습니다. 예전에는 연산을 모아 두었다가 한꺼번에 실행하는 lazy 모드가 기본이었습니다. 하지만 Gaudi 소프트웨어 1.21부터는 eager와 `torch.compile` 조합이 기본이 되었고, lazy 모드는 legacy로 분류됩니다.

### IBM Spyre: Inductor를 밖에서 확장하기

IBM의 Spyre 가속기는 문 3을 정면으로 택한 사례입니다. 오픈소스 저장소 `torch-spyre` 는 PrivateUse1에 `spyre` 라는 이름을 붙이고(문 4), Inductor에 `spyre` 디바이스용 스케줄링 클래스와 래퍼 코드 생성 클래스를 등록합니다(문 3). 여기에 Spyre 전용 lowering과 decomposition을 더했습니다. PyTorch 본체를 고치지 않고 **Inductor를 밖에서 확장** 하는 방식입니다.

이때 Inductor가 내놓는 것은 Triton 코드가 아니라 Spyre용 중간 표현인 SuperDSC입니다. 최종 바이너리는 IBM의 자체 컴파일러가 만듭니다. 융합과 스케줄링까지는 Inductor에 맡기고, 칩 고유의 세부 최적화는 그 뒤의 자체 컴파일러가 담당하도록 경계를 그은 것입니다. Spyre에게 문 3이 맞았던 이유도 여기에 있습니다. Inductor의 융합 결정을 받아들이되, 그 결과를 칩에 맞게 다듬을 단계를 뒤에 따로 두었습니다.

흥미로운 점은 Spyre가 처음부터 이 문을 쓰지는 않았다는 것입니다. 이전에는 vLLM 플러그인이 `sendnn` 이라는 문 1 방식의 백엔드를 썼습니다. 그러다 Inductor 기반으로 옮겨 왔습니다. [PyTorch Conference Europe 2026 발표 소개](https://pytorchconferenceeu2026.sched.com/event/2Hiqa)에 따르면, 이 과정에서 자체 컴파일러 코드의 상당 부분을 걷어낼 수 있었다고 합니다. 어느 문으로 들어가느냐가 직접 유지해야 할 코드의 양을 바꾼 사례입니다.

### 한눈에 비교하기

| | 꽂은 문 | 재사용한 자산 | 직접 만든 것 | 얻은 것 / 잃은 것 |
| --- | --- | --- | --- | --- |
| **Huawei Ascend** | 4 + 1 → 2(TorchAir) + 3(Inductor) | 디바이스 등록과 자동 로드, Dynamo, AOTAutograd, Inductor 스케줄링 | GE 연동, Triton-Ascend 등 코드 생성 백엔드 | 어떤 경로로 와도 대응 / 여러 경로를 함께 유지해야 함 |
| **Intel Gaudi** | 1 → 2, 디바이스는 본체 내장 `hpu` | Dynamo, AOTAutograd, decomposition | 그래프 컴파일러, 컴파일 결과 캐시 | 최적화 결정을 직접 내림 / Inductor의 융합 자산은 쓰지 않음 |
| **IBM Spyre** | 4 + 3 | Dynamo, AOTAutograd, Inductor 스케줄링과 융합 | 스케줄링·래퍼 코드 생성 클래스, 전용 lowering, 최종 컴파일러 | 자체 컴파일러 코드 축소 / Inductor IR과 private API에 맞춰야 함 |

세 회사의 선택은 하나의 질문으로 요약됩니다. **"우리 칩에 맞는 결정을 어디까지 PyTorch에 맡길 수 있는가."** 많이 맡길수록 만들 것이 줄고, 적게 맡길수록 칩에 맞는 결정을 직접 내릴 수 있습니다.

### HyperAccel은 어느 문으로 들어가는가

이제 같은 질문을 저희에게 던져 보겠습니다. 위 비교표에 LPU 한 줄을 더하면 다음과 같습니다.

| | 꽂은 문 | 재사용한 자산 | 직접 만든 것 | 얻은 것 / 잃은 것 |
| --- | --- | --- | --- | --- |
| **HyperAccel LPU** | 1 → 2, 그리고 4 | Dynamo 캡처와 dynamic shape 처리, FX 그래프, core ATen 연산 집합 | 연산별 Legato primitive, 그래프 분할과 eager 폴백, Legato 커널 생성 | LPU의 메모리와 코어 배치를 직접 결정 / Inductor의 융합 자산은 쓰지 않음 |

HyperAccel은 Gaudi와 가까운 자리를 골랐습니다. 사용자는 `torch.compile(model, backend="legato")` 로 LPU용 백엔드를 고르고(문 1), 이 백엔드는 core ATen 수준의 연산으로 이루어진 FX 그래프를 받아 일합니다(문 2). 디바이스 층에서는 `torch_ha` 패키지가 `lpu` 라는 디바이스와 `torch.ops.lpu.*` 연산을 등록해, 텐서를 `lpu:0` 에 올려 쓸 수 있게 합니다(문 4).

GPU에서 Inductor와 Triton이 맡던 자리는 [Legato]({{< ref "/posts/what-is-legato" >}})가 맡습니다. Legato는 LPU 커널을 작성하기 위한 파이썬 기반 **embedded Domain Specific Language(eDSL)** 이자 컴파일러입니다. 백엔드는 그래프의 ATen 연산마다 등록된 Legato primitive를 찾아 연결하고, 이어서 컴파일할 수 있는 구간을 하나의 Legato 커널로 만듭니다. 아직 primitive가 없는 연산은 그 자리에서 eager로 실행되고, 컴파일된 구간과 번갈아 돌아갑니다. Part 2에서 문 4가 왜 필요한지 이야기한 장면이 그대로 나타나는 구조입니다.

문 3이 아니라 문 2를 고른 이유는 LPU의 프로그래밍 모델에 있습니다. Legato에서는 텐서를 어느 메모리에 둘지, 데이터를 언제 어디로 옮길지, 어느 코어에서 실행할지를 프로그램에 명시합니다. Spyre처럼 Inductor 뒤에 자체 컴파일러를 두는 방법도 있지만, 그 경우에도 연산을 어떻게 묶을지는 Inductor가 먼저 정합니다. LPU에서는 연산을 묶는 단위가 메모리와 코어 배치와 맞물려 있습니다. 그래서 저희는 core ATen 그래프를 받아 이 결정까지 Legato가 직접 내리는 쪽이 LPU에 맞다고 판단했습니다. 자세한 프로그래밍 모델은 [Legato 문서](https://legato-docs.hyperaccel.net/latest/)에서 확인하실 수 있습니다.

그리고 저희는 이 생태계를 쓰기만 하지 않고, upstream에도 기여하고 있습니다. 문을 지나 들어가는 것에서 그치지 않고, 문을 넓히는 일에도 함께하려 합니다.

---

## Conclusion

이번 편에서는 PyTorch가 바깥 하드웨어를 위해 열어 둔 네 개의 문을 살펴봤습니다. 문 1과 문 2는 그래프를 통째로 받아 가는 자리이고, 문 3은 Inductor의 코드 생성기만 바꾸는 자리이며, 문 4는 그 모든 것을 받치는 디바이스 층입니다. Ascend는 거의 모든 문으로, Gaudi는 문 2로, Spyre는 문 3으로 들어갔고, HyperAccel은 문 2를 골랐습니다. 어느 문이 정답이라기보다, 각자 칩에 맞는 결정을 어디까지 PyTorch에 맡길지를 다르게 판단한 결과입니다.

메신저 이야기로 돌아가 보겠습니다. 사람이 모인 메신저에는 기능이 붙어 더 강해지고, 기능을 붙이려는 쪽은 사람이 많은 곳을 찾아갑니다. PyTorch와 NPU 회사의 관계도 같습니다. PyTorch는 다른 칩에게 문을 열어 줄수록 "어떤 하드웨어든 PyTorch로 돌린다"는 위치를 굳힙니다. NPU 회사는 그 문으로 들어가면 사용자를 처음부터 다시 모을 필요가 없습니다. **문을 여는 쪽과 들어가는 쪽의 이해가 정확히 맞아떨어지는 것** 입니다. 2.0 이후의 연표에서 문이 해마다 조금씩 넓어진 것도 그래서라고 생각합니다.

앞으로 눈여겨볼 곳은 그 위층인 vLLM입니다. vLLM은 지금도 `CustomOp` 이라는 장치로 rms_norm 같은 연산을 하드웨어별로 갈아끼울 수 있게 해 두었습니다. 2026년 1월에는 이를 한 단계 발전시킨 **vLLM IR** 제안이 올라왔습니다. rms_norm, 양자화, 활성화 함수 같은 연산을 FX 위의 상위 연산으로 정의하고, 벤더가 연산별 구현을 등록하게 하자는 내용입니다. 4월에 나온 [v0.20.0](https://github.com/vllm-project/vllm/releases/tag/v0.20.0)부터는 `vllm.ir` 모듈이 실제로 들어오기 시작했습니다.

이 흐름을 Part 2의 틀로 보면 의미가 분명해집니다. 지금까지 NPU가 받던 가장 정돈된 단위는 core ATen 그래프였습니다. 이 흐름이 자리를 잡는다면, 앞으로는 **rms_norm처럼 모델 개발자가 보는 단위 그대로** 받을 수 있게 됩니다. 연산을 잘게 쪼갰다가 다시 합치는 수고가 줄어드니, 큰 단위로 최적화된 커널을 가진 NPU에게는 반가운 변화입니다. 다만 vLLM 안에서도 하드웨어별로 모델 코드를 따로 두자는 제안과, 하드웨어와 무관한 모델 정의를 지키자는 제안이 함께 올라와 있어 방향은 아직 논의 중입니다.

다음 편에서는 시야를 조금 넓혀, 10월 20~21일 미국 새너제이에서 열리는 PyTorch Conference 2026을 컴파일러 개발자의 관점에서 읽어 보겠습니다. 이번 편에서 정리한 네 개의 문이 실제 발표들 속에서 어떻게 움직이고 있는지 확인해 보려 합니다.

## Reference

**PyTorch 공식 문서와 블로그**

- [PyTorch 2.0 소개](https://docs.pytorch.org/get-started/pytorch-2.0/) — 2.0 출시 당시의 지원 하드웨어 범위
- [Custom Backends](https://docs.pytorch.org/docs/main/user_guide/torch_compiler/torch.compiler_custom_backends.html) — 문 1, 문 2의 등록 방법
- [IRs (Core ATen IR)](https://docs.pytorch.org/docs/stable/user_guide/torch_compiler/torch.compiler_ir.html) — core ATen 연산 목록
- [Accelerator Integration](https://docs.pytorch.org/docs/2.9/accelerator/index.html) — PrivateUse1 기반 가속기 통합 가이드
- [Python Custom Operators](https://docs.pytorch.org/tutorials/advanced/python_custom_ops.html) — `torch.library.custom_op`
- [Autoloading Out-of-Tree Extension](https://docs.pytorch.org/tutorials/unstable/python_extension_autoload.html) — 디바이스 확장 자동 로드
- [OpenReg: A Self-Contained PyTorch Accelerator Simulator](https://pytorch.org/blog/openreg/)
- [PyTorch 2.9 Release Blog](https://pytorch.org/blog/pytorch-2-9/) — LibTorch Stable ABI
- [PyTorch v2.13.0 Release Notes](https://github.com/pytorch/pytorch/releases/tag/v2.13.0) — `torch.compiler.set_default_backend`

**NPU 회사들의 PyTorch 연동**

- [Ascend Extension for PyTorch (torch_npu)](https://github.com/Ascend/pytorch), [TorchAir](https://github.com/Ascend/torchair), [Triton-Ascend](https://github.com/Ascend/triton-ascend)
- [Intel Gaudi PyTorch Theory of Operations](https://docs.habana.ai/en/latest/PyTorch/PyTorch_Gaudi_Theory_of_Operations.html), [Gaudi PyTorch Support Matrix](https://docs.habana.ai/en/latest/PyTorch/Reference/PyTorch_Support_Matrix.html), [Gaudi PyTorch Bridge](https://github.com/HabanaAI/gaudi-pytorch-bridge)
- [torch-spyre](https://github.com/torch-spyre/torch-spyre), [torch-spyre 컴파일러 아키텍처](https://torch-spyre.readthedocs.io/en/latest/compiler/architecture.html), [IBM Research: PyTorch support for IBM Spyre](https://research.ibm.com/blog/pytorch-support-ibm-spyre), [PyTorch Conference Europe 2026 발표](https://pytorchconferenceeu2026.sched.com/event/2Hiqa)

**vLLM**

- [vLLM Plugin System](https://docs.vllm.ai/en/latest/design/plugin_system.html)
- [RFC: vLLM IR (#32358)](https://github.com/vllm-project/vllm/issues/32358), [vLLM IR 설계 문서](https://docs.vllm.ai/en/stable/design/vllm_ir/)
- [RFC #42770](https://github.com/vllm-project/vllm/issues/42770), [RFC #44219](https://github.com/vllm-project/vllm/issues/44219) — 하드웨어별 모델 코드 분리와 하드웨어 무관 모델 정의에 대한 논의

**HyperAccel**

- [Legato 문서](https://legato-docs.hyperaccel.net/latest/) — [PyTorch Integration](https://legato-docs.hyperaccel.net/latest/Integration/PyTorch/), [Compile PyTorch Model with Legato](https://legato-docs.hyperaccel.net/latest/Integration/TorchCompile/)
- [Legato: HyperAccel LPU를 위한 프로그래밍 언어]({{< ref "/posts/what-is-legato" >}})

## 추신: HyperAccel은 채용 중입니다!

![HyperAccel의 LPU 칩 Bertha. 패키지 가운데에 HYPER ACCEL과 Bertha가 새겨진 다이가 자리하고, 주변으로 배선과 패드가 뻗어 있다](images/bertha-chip.jpg)

HyperAccel은 LPU라는 새로운 아키텍처로 AI 인프라 시장에 도전장을 내밀고 있습니다. 그리고 소프트웨어팀은 이 하드웨어의 성능을 끝까지 끌어내면서, 동시에 사용자가 LPU를 **가장 직관적이고 아름다운 방식으로** 활용할 수 있도록 다양한 연구와 구현을 진행하고 있습니다.

저희와 멋진 여정을 함께하고 싶으시다면, [HyperAccel Career](https://hyperaccel.career.greetinghr.com/ko/guide)로 지원해 주세요!
