---
date: '2025-12-29T10:53:16+09:00'
draft: true
title: 'How GPU Works'
cover:
  image: "images/01-gpu-hopper.png"
  # can also paste direct link from external site
  # ex. https://i.ibb.co/K0HVPBd/paper-mod-profilemode.png
  alt: "Nvidia Hopper GPU image"
  caption: "엔비디아 Hopper GPU 이미지"
  relative: true # To use relative path for cover image, used in hugo Page-bundles
authors: ["Donghyeon Choi"] # must match with content/authors
tags: ["GPU", "NVIDIA", "Hopper", "CUDA", "GPGPU", "Architecture"]
categories: ["AI Hardware", "Architecture"]
summary: "Nvidia GPU의 역사와 Hopper 아키텍처를 통해, 어떻게 GPU가 메모리 레이턴시를 숨기는지 정리한 글입니다."
comments: true
description: "1990년대 그래픽 카드 시절부터 Tesla·CUDA를 거쳐 Hopper에 이르기까지 Nvidia GPU의 진화 과정을 따라가며, GPU가 어떻게 대규모 병렬성과 스케줄링으로 메모리 레이턴시를 숨기는지 정리한 글입니다."
keywords: [
  "GPU", "Nvidia", "Hopper", "CUDA", "GPGPU",
  "AI Hardware", "Parallel Computing", "Tensor Core",
  "Warp", "SM", "H100", "GPU Architecture",
  "메모리 레이턴시", "CUDA 프로그래밍", "AI 가속기"
]
---

# 지피지기면 백전불태 1편: GPU의 역사와 기초

2020년대의 AI 인프라 시장을 이야기할 때 Nvidia GPU를 빼놓고 말하긴 어렵습니다.  
상대를 알고 나를 알면 위태로울 일이 없으니, AI 반도체 설계 회사로서 가장 강력한 경쟁자인 Nvidia에 대해서도 잘 알아봐야겠죠.

이 글은 그 첫 번째 순서로, Nvidia GPU가 어떻게 탄생했고 어떤 설계 철학을 통해 오늘의 위치에 왔는지,
그리고 그 과정에서 드러나는 **강점과 구조적 특성**을 기술적 관점에서 정리하는 것을 목표로 합니다.

![GPU 및 연대기 개념 다이어그램](images/02-rise-of-nvidia.png)

간략하게 Nvidia의 역사를 살펴보자면, Nvidia는 1993년 설립되어 1995년에 NV1을 내놓으면서 그래픽 처리장치 시장에 발을 들입니다.

1997년 RIVA128과 1999년 GeForce 256으로 그래픽 카드 시장에 성공적으로 자리를 잡았지만, GeForce FX 시리즈가 실패하면서 큰 위기를 맞게 됩니다.

하지만 FX의 실패를 딛고 일어나 아키텍처를 갈아 엎으면서 G80 Tesla와 CUDA를 만들어내면서 그래픽 시장뿐만 아니라 HPC, GPGPU 시장까지도 선도하는 기업이 되게 됩니다.

![GPU를 자랑하는 젠슨 황](images/03-jensen-huang-with-gpu.png)
2012년, GPU로 훈련한 AlexNet이 ImageNet Visual Recognition Challenge(ILSVRC)에서 우승하며 GPU는 AI와 떼려야 뗄 수 없는 관계가 되었습니다. 이후 2022년 ChatGPT가 출시되어 AI가 대중화되면서, AI 하드웨어 시장을 사실상 장악한 Nvidia는 세계 시가총액 1위 기업으로 올라섰습니다.

즉, 오늘날의 Nvidia GPU는 단순한 그래픽 가속기가 아니라 AI 인프라 레이어를 사실상 독점한 범용 병렬 컴퓨팅 플랫폼이며,  
우리가 설계하는 하드웨어가 반드시 넘어야 할 기준점(baseline)이기도 합니다.

그렇다면 GPU는 어쩌다 탄생했고, 확산되면서 AI 시장까지도 들어오게 되었을까요?


---

## 그래픽 카드의 탄생

![CLI 화면과 GUI 화면](images/04-cui-gui.png)

초창기 대중화된 컴퓨터는 Command Line Interface(CLI) 방식의 운영체제를 사용하였습니다. 화면에 표시할 건 초록색 글자와 검은색 배경밖에 없었죠. 이때에는 그래픽 관련한 연산이 극히 적었기 때문에 CPU가 다른 작업을 처리하면서 화면까지 같이 표시할 수 있었습니다. 하지만 CLI는 사용자가 커맨드를 알고 있어야 하기에 어느 정도의 진입장벽이 존재하여 대중성/시장성이 부족했습니다.

이에 Xerox의 Alto, Apple의 Lisa 등으로 마우스와 아이콘, 윈도우 창을 통해 조작하는 Graphic User Interface(GUI) 도입이 시작되었고 이러한 변화는 CPU의 성능 부담으로 다가왔습니다. 이러한 시장 변화에 발맞추어 IBM 등의 컴퓨터 회사는 메인보드에 탑재되던 그래픽 처리용 회로의 연산 능력을 점점 향상시켰고 VGA에 이르러서는 PC 구성 요소 중 굉장히 중요한 요소가 되었습니다.

한편 90년대부터 3D 그래픽 게임에 대한 수요가 늘어나면서 그래픽 연산 능력에 대한 수요가 폭증합니다.

![3D 그래픽 게임 변천사](images/05-3d-games.png)

1993년도에 출시한 DOOM은 3D 그래픽 게임에 혁신을 가져왔는데 플레이 시 초당 약 1000만 번의 연산이 필요했습니다. 비디오게임에 필요한 연산은 초당 프레임 수 × 해상도 × 물리 시뮬레이션 × 텍스처 효과로 여러 방면 기술이 혼합되어 있고, 각 분야가 발전하면서 기하급수적으로 늘어났습니다. DOOM 이후 3년 뒤에 출시한 Super Mario 64는 초당 1억(100M) 번의 연산이 필요했고 그로부터 2년 뒤인 Half life 1(1998)은 5억 번, World of Warcraft(2004)는 22억 번, Minecraft(2011) 1000억 번(100G)의 연산이 필요해졌고, 최신 게임인 Call of Duty: Modern Warfare III(2023)의 경우 초당 30~40조에 이르는 연산이 필요해졌습니다.

![그래픽 연산 파이프라인](images/06-graphics-pipeline.png)

여기서 말하는 그래픽 연산은 CPU가 던져준 점을 Vertex Shader 연산을 통해 좌표상에 위치시키고 Primitive Generation 및 Rasterization을 통해 픽셀에 매핑하고 각 픽셀마다 Fragment Shader 등을 통해 알맞은 색을 입히는 과정을 통해 화면에 표시하기 위한 Framebuffer에 저장되는 방식으로 진행됩니다. 여기에 그래픽이 발전하면서 anti-aliasing, Blending, Transparency, Shadow Mapping 등 추가적인 연산이 추가되었습니다.

![Nvidia FX Architecture 다이어그램](images/07-fx-arch.png)

Nvidia FX 그래픽 카드의 예시를 보면 초기 GPU는 이 그래픽 파이프라인을 하드웨어로 그대로 옮겨놓았습니다. Vertex shading 단계를 위한 Vertex shader 회로가 따로 있고, Fragment Shader를 위한 회로가 따로 있는, 그야말로 그래픽을 위해 고정된 가속장치라고 볼 수 있겠습니다. 일방향성 파이프라인의 성격을 띤 이러한 구조의 GPU는 중간 단계가 오래 걸리면 그 앞단계는 stall이 걸려 아무런 동작도 되지 않는 상태가 되는 병목 현상이 나타나게 되는데 이러한 문제는 그래픽 발전을 따라가기 위한 Programmable Shader의 등장으로 두드러지게 됩니다. Custom된 shader 함수는 연산에 더 오랜 시간이 걸리는 경우가 많았고 이는 곧 전체 하드웨어 유틸리티를 저해하는 결과로 이어졌습니다. 또한 그래픽 파이프라인의 스테이지가 길어지면서 전체 작업에서 병목이 어디인지를 파악하기 힘들어졌습니다.

![Nvidia Tesla Architecture (G80) 다이어그램](images/08-tesla-arch.png)

이러한 상황에서 Nvidia는 혁신적인 한 수를 둡니다. 바로 Unified Shader를 도입하여 모든 쉐이더 연산을 하나의 코어에서 처리할 수 있도록 하는 새로운 아키텍처를 제안한 것이죠. Nvidia의 G80 GPU로 출시된 Tesla 아키텍처는 태생부터 병렬 처리에 목적을 두고 설계되었습니다. 기존 몇 픽셀씩 벡터로 묶어서 처리되던 연산 방식에서 개별 픽셀에 대한 쉐이더 연산을 진행하는 방식으로 분해하고, 여러 픽셀에 대한 연산을 묶어서 스케줄링하는 방식으로 패러다임을 전환했습니다. 이러한 아키텍처 전환을 통해 특정 쉐이더 연산이 오래 걸린다고 해도 코어 내의 다른 쉐이더 연산기에서는 작업을 시행할 수 있었기 때문에 기존의 일방향 파이프라인에서 발생하던 병목현상이 혁신적으로 개선되었습니다.

이러한 아키텍처의 변화는 또 다른 인식의 전환으로 이어졌는데, 바로 High Performance Computing(HPC)를 위한 General Purpose GPU(GPGPU)입니다.

---

## GPGPU와 CUDA의 등장

![초기 GPGPU 사용 방식 다이어그램](images/09-pre-gpgpu.png)

그래픽 처리 장치로서 발전을 거듭해 나아간 GPU는 연구자들의 눈에 띄게 됩니다. 2003년 두 연구팀이 각자 독자적으로 실행한 연구에서 GPU를 사용한 일반 선형대수학 문제 해결이 기존 CPU보다 빠르게 처리될 수 있음이 밝혀지면서 본격적으로 GPGPU 바람이 불게 됩니다. 

> *<u>GPU는 초당 연산량이 높다. 그럼 다른 데 쓰면 어떨까?</u>*

컨택스트를 살펴보자면, 그래픽 발전을 지원하기 위해 DirectX 8(2000)은 Programmable Shader 개념을 도입하여 사용자가 셰이더 동작을 직접 프로그래밍할 수 있도록 했고, DirectX 9(2002)에서는 셰이더 언어 `HLSL`을 개발하여 이를 본격적으로 지원했습니다.

이러한 상황에서 '다수 픽셀에 대한 동일 그래픽 작업'이라는 GPU의 특성은 '다중 데이터에 대한 동일 연산 실행'이라는 행렬 곱 등 일반 선형 대수학 문제의 특성과 유사했습니다. 이 점에 착안하여 입력 정점(input vertex)을 함수 입력으로, 프레임 버퍼(frame buffer)를 함수 출력으로 해석하는 방식의 General Purpose GPU(GPGPU) 개념이 정립되었습니다.

다만 당시의 그래픽 하드웨어는 그래픽 처리에 특화된 파이프라인을 가지고 있었기 때문에, GPGPU는 일종의 '해킹'과 같은 방식이었습니다. 선형 대수학 문제를 그래픽 문제로 재해석하고, 기존 `C` 코드를 `HLSL`, `GLSL` 같은 셰이더 언어로 다시 작성해야 하는 번거로움이 있었습니다.

![셰이더 언어와 CUDA 접근 방식 비교](images/10-SL-CUDA.png)

이 문제는 2006년에 나온 Tesla 아키텍처와 2007년에 뒤이어 나온 CUDA 프로그램을 통해 완벽히 해결되게 됩니다. CUDA는 그래픽이 아닌 병렬 연산에 초점을 맞추어 설계되었고, Unified Shader 구조에 맞추어 하나의 데이터 포인트에 대한 작업을  `Thread`로 정의하고 한 하드웨어 `SM`에 배정되는 thread 묶음을 `Block`, 함수 실행 시 생성되는 전체 thread를 `Grid`로 정의하여 `C`의 개념체계를 그대로 사용하여 커널 함수를 구현할 수 있도록 하였습니다. Tesla 아키텍처와 CUDA 프로그래밍 모델을 통해 GPU는 진정한 GPGPU의 세계로 들어갈 수 있었습니다.

이제 현대 GPU인 Hopper 아키텍처를 기준으로 과연 GPU는 어떤 식으로 만들어졌는지 살펴봅시다.

---

## 현대 GPU 구조

![Hopper GH100 Full Architecture 다이어그램](images/11-hopper-full.png)

#### - GPU (Device)

* GPC, 메모리 컨트롤러(HBM/GDDR), L2 캐시, PCIe/NVLink 인터페이스 등을 포함하는 전체 칩(Chip)입니다.
* GigaThread Engine: GPU 최상단에서 커널 실행 요청을 받아, 수천 개의 스레드 블록을 각 GPC와 SM으로 분배하는 전역 스케줄러 역할을 수행합니다.

#### - GPC (Graphics Processing Cluster)

* 여러 개의 SM을 묶어 관리하는 상위 하드웨어 단위입니다.
* 래스터화 엔진(Raster Engine) 등 그래픽 처리를 위한 공통 자원을 공유하며, Hopper 아키텍처에서는 스레드 블록 클러스터(Cluster)가 실행되는 경계가 됩니다. GPC 내부에는 SM 간의 초고속 연결망이 있어 Distributed Shared Memory(DSMEM) 접근이 가능합니다.

![Hopper GH100 단일 SM 아키텍처 그림](images/12-hopper-sm.png)

#### - SM (Streaming Multiprocessor)

* GPU의 핵심 연산 블록(Building Block)이자, 스레드 블록(Block)이 실행되는 물리적 공간입니다. CPU의 코어(Core)와 유사한 개념이지만 훨씬 더 많은 스레드를 동시에 처리합니다.
* 하나의 SM은 동시에 수십 개의 워프(Warp)를 활성화 상태로 유지하며(Active Warps), 메모리 대기 시간이 발생하면 즉시 다른 워프로 전환하여 파이프라인을 꽉 채웁니다(Latency Hiding).
* 주요 구성 요소:

    * 4개의 SM Sub-partition: 연산 유닛들의 집합.
    * Unified Shared Memory / L1 Cache: 데이터 공유와 캐싱을 위한 고속 메모리. (Hopper 기준 256KB)
    * TMA (Tensor Memory Accelerator): Hopper 아키텍처에서 도입된 연속된 메모리(주로 텐서) 복사를 전담하는 비동기 복사 엔진.

#### - SM Sub-partition (Processing Block / SMSP)

* SM 내부를 4개로 쪼갠 구획입니다. (현대 NVIDIA GPU의 표준 구조)
* 각 파티션은 자체적인 Warp Scheduler (1개), Dispatch Unit, Register File (64KB), 그리고 할당된 CUDA Cores 및 Tensor Cores 세트를 가집니다.
* SM 하나를 통째로 관리하는 복잡도를 줄이고, 4개의 파티션이 독립적으로 워프를 스케줄링하여 병렬성을 극대화합니다.

그럼 이 하드웨어 위에서 작업은 어떻게 구조화될까요? CUDA 프로그래밍 모델을 조금 더 살펴봅시다.

---

## CUDA 프로그래밍 모델의 구조
![CUDA 프로그래밍 모델의 Thread 제어 단계](images/13-cuda-pm.png)

이러한 하드웨어 아키텍처 상에서 GPU는 병렬 작업을 총 5단계로 Thread를 묶어서 관리합니다.

#### - 스레드 (Thread) - 병렬 처리의 최소 단위

CUDA 연산의 가장 작은 논리적 단위입니다. 개발자가 작성한 커널(Kernel) 코드는 SPMD (Single Program Multiple Data) 방식에 따라 모든 스레드에 복제되어 실행됩니다. 하지만 각 스레드는 고유한 Thread ID를 부여받으므로, 이를 이용해 서로 다른 메모리 주소에 접근하거나 각기 다른 제어 흐름을 가질 수 있습니다. 물리적으로는 CUDA Core(ALU) 파이프라인을 점유하며 실행됩니다.

#### - 워프 (Warp) - 하드웨어 실행의 최소 단위

32개의 연속된 스레드를 묶은 집합이자, 실질적인 명령어 실행(Instruction Issue) 단위입니다. 워프 내 32개 스레드는 하나의 명령어를 공유하며 물리적으로 동시에 실행됩니다. Warp마다 Instruction Cache 내의 명령줄을 가리키는 pointer인 Program Counter(PC)를 가지고 있으며 Issue되면 이 PC에 해당하는 명령줄이 Dispatch Unit으로 전송되고, 해당 명령에 대한 동작이 종료되면 Release되면서 PC가 증가됩니다. 만약 워프 내 스레드들이 if-else문 등으로 서로 다른 실행 경로로 갈라진다면(Branch Divergence), 하드웨어는 모든 경로를 순차적으로 처리(Serialization)한 뒤 다시 합류시킵니다. 따라서 동일 워프 내 스레드들의 실행 경로를 일치시키는 것이 성능의 핵심입니다. SM 내부의 Warp Scheduler는 실행 가능한 상태의 워프를 매우 빠르게 교체(Context Switching)하며 메모리 대기 시간(Latency)을 숨깁니다.

![이미지: CUDA 프로그래밍 모델의 Thread Block 할당 방식 그림](images/14-thdblk-alloc.png)

#### - 스레드 블록 (Thread Block / CTA) - 협력과 공유의 단위

서로 긴밀하게 협력할 수 있는 스레드들의 그룹(최대 1024 스레드) 입니다. 같은 블록 내의 스레드들은 Shared Memory를 공유하고, `__syncthreads()` 배리어(Barrier)를 통해 실행 단계를 동기화할 수 있습니다. 이러한 자원 공유를 위해 하나의 블록은 물리적으로 반드시 하나의 SM (Streaming Multiprocessor)에 할당되어 생애주기를 마칩니다. SM의 자원(Register, Shared Memory 용량) 한계가 곧 블록 크기의 제약이 됩니다. 1차원~3차원(`Block(x,y,z)`)으로 구성 가능하여, 이미지나 볼륨 데이터 같은 다차원 문제를 직관적으로 맵핑할 수 있습니다.

#### - 스레드 블록 클러스터 (Thread Block Cluster)

Hopper 아키텍처에서 도입된 상위 계층으로, 여러 개의 스레드 블록을 묶은 단위입니다. 기존에는 블록 간 통신이 매우 제한적(Global Memory 경유)이었습니다. 이를 해결하기 위해 하드웨어적으로 인접한 블록끼리 더 빠르게 소통할 수 있는 계층이 필요해졌습니다. 클러스터는 물리적으로 GPC (Graphics Processing Cluster)에 매핑됩니다. 클러스터 내의 블록들은 Distributed Shared Memory (DSMEM) 기술을 통해, L2 캐시를 거치지 않고 서로의 Shared Memory에 직접 접근(P2P)할 수 있습니다.

#### - 그리드 (Grid) - 커널 실행의 전체 단위

커널이 호출(Launch)될 때 생성되는 모든 스레드 블록의 집합입니다. 커널 호출 한 번이 곧 하나의 그리드입니다. 그리드 내의 블록들은 서로 독립적입니다. 실행 순서가 보장되지 않으며, 서로 다른 SM에서 병렬로 실행될 수도, 하나의 SM에서 순차적으로 실행될 수도 있습니다. 이 독립성 덕분에 동일한 코드가 SM이 10개인 보급형 GPU에서도, SM이 144개인 H100에서도 수정 없이 동작하는 확장성(Scalability)이 보장됩니다.

---

## GPU는 어떻게 동작하는가?

그렇다면 코드를 넣었을 때 GPU는 도대체 어떻게 동작하는 것일까요? Scheduling 예시를 통해 차근차근 알아보겠습니다. 

![예시 코드와 동작 설명 다이어그램](images/15-code-ex.png)

먼저 예시로 가져온 코드를 살펴봅시다. 예시 코드는 간단한 `fp32 add` 연산으로, 그리드를 한 개의 블록으로, 각 블록은 96개의 스레드로 구성하여 커널을 호출하고 있습니다. 이 코드를 컴파일하면 바이너리로 변환되겠지만 편의를 위해 어셈블리 단계로 살펴보겠습니다.

예시 커널 코드는 총 4단계의 명령어로 구성됩니다. 먼저 오퍼랜드 `A`와 `B`를 메모리에서 레지스터 파일(`RF`)로 불러오는 두 번의 `LD`(load) 동작, 레지스터에 있는 오퍼랜드로 `FADD`(float add) 연산을 수행하여 결과를 레지스터에 저장하는 동작, 그리고 마지막으로 계산 결과를 다시 메모리에 저장하는 `ST`(store) 연산입니다.

이때 `LD`와 `ST`는 비동기적으로 동작하므로, 코어의 `LD/ST` 유닛은 메모리 주소를 계산하여 메모리 컨트롤러에 요청을 보내는 역할만 수행합니다.

![Thread 묶음 예시](images/16-thread-group.png)

만들어진 총 96개의 스레드는 3개의 `warp`로 나뉘고, 1개의 `block`에 배정되어 있으므로 1개의 `SM`에 할당됩니다. 이때 scheduling 예시 편의를 위해 모두 같은 `SMSP`에 할당된다고 가정합시다.

### Hopper에서의 Warp 스케줄링 하드웨어

본격적인 스케줄링 예시로 들어가기 전에, Hopper 기준으로 **Warp Scheduler와 Dispatch Unit이 어떤 역할을 하는지**를 먼저 짚고 가겠습니다.

Warp Scheduler는 scoreboard를 이용해 각 warp의 의존성 상태를 추적하면서, **지금 당장 실행 가능한(eligible) warp**를 고르는 역할을 합니다.  
이때 Dispatch Unit의 처리 능력, 예를 들어 Hopper에서 대략 1 warp(32 threads)/clk 수준의 issue 폭을 고려해,  
해당 사이클에 자원이 부족한 warp는 나중에 issue하도록 뒤로 미룹니다.

Dispatch Unit은 이렇게 선택된 warp의 명령을 실제 실행 파이프라인에 태우는 모듈입니다.  
Warp Scheduler는 warp 단위로 issue하지만, Dispatch Unit은 32개의 스레드를 여러 사이클에 나누어 보내거나,  
LD/ST·INT·FP 같은 서로 다른 타입의 파이프라인에 적절히 섞어서(co-issue) 보내 GPU의 자원을 최대한 채우려고 합니다.

이제 이 하드웨어 위에서, 첫 번째 warp인 Warp A가 어떻게 스케줄되는지를 단계별로 살펴보겠습니다.

![Scheduling Warp A](images/17-schd-single.png)

### Single Warp Scheduling

먼저 Warp A는 Warp scheduler(WS)에서 issue되면서 PC값에 따라 첫 번째 Instruction인 `LD R1, [A+tid]`를 Dispatch unit으로 가져옵니다. Dispatch unit은 현재 SMSP상에 가용 가능한 자원을 스캔하여 8개의 LD/ST unit이 사용 가능한 것을 확인한 후 issue된 32개의 thread를 8개씩 4cycle에 걸쳐 LD/ST unit에 할당합니다. 각 유닛은 할당받은 명령어를 기반으로 메모리 관리 장치에 메모리 주소를 호출하며, 이 load 명령은 비동기적으로 처리됩니다. 마지막 5번째 사이클에 LD/ST 유닛 동작이 끝날 때 WS는 Warp A를 Release하면서 Warp A의 PC값을 4 증가시킵니다 (32bit OP code이기 때문). 그다음 사이클에 WS는 release된 Warp A를 다시 issue하고 같은 방식으로 두 번째 LD 명령을 수행합니다.

LD가 모두 끝난 후에 Warp A는 바로 실행되지 못하고 비동기 메모리 로드가 완료되는 것을 기다려야 합니다. 명령어를 보면 `FADD R3, R1, R2`로 되어있는데, 이때 `R1`과 `R2`는 앞선 LD 동작을 통해 비동기적으로 RF에 쓰이고 있는 중입니다. 즉, 연산을 수행하기 위해서는 두 데이터가 모두 패치되기를 기다려야 합니다. 따라서 이 기다리는 시간 동안 Stall이 발생하여 연산기들은 유휴 상태가 됩니다. 메모리 로드 시간은 대략적으로 L1 cache 20 cycle, L2 cache 100 cycle, HBM 300~800 cycle로 추산됩니다.

메모리 로드가 끝난 후 Dependency가 해결된 Warp A는 다시 eligible 상태가 되어 WS에 의해 다시 배정됩니다. FADD 연산은 FP 32 Pipeline을 통해 동작하는데, 이때 Hopper GPU에는 총 32개의 FP 32 유닛이 존재하므로 한번에 패치되게 됩니다. 연산이 모두 끝난 후 마찬가지로 release됩니다. 다음 연산인 ST연산은 LD와 마찬가지로 방식으로 동작합니다.

![Scheduling Warp A and B](images/18-schd-double.png)

### Double Warp Scheduling

이제 Warp B까지 포함해서 스케줄링을 해봅시다.

이전 Warp A 스케줄링 중 첫 번째 LD 동작이 릴리즈될 때, 릴리즈되는 사이클에는 Warp A의 PC가 아직 완전히 이동하지 않은 상태이므로 바로 A를 다시 issue할 수 없어 한 사이클의 유휴 상태가 있었습니다. 하지만 이번에는 Warp B가 있죠. Warp B의 첫 번째 명령은 같은 명령인 LD명령입니다. Warp A 수행 중에는 모든 LD/ST 유닛이 점거되고 있어 Warp B를 수행할 수 없고, Warp A의 동작이 모두 dispatch되면 B가 이슈되어 LD/ST를 수행하게 됩니다. 이렇게 번갈아가며 두 번씩 총 네 번의 LD 명령을 수행한 이후, 다음 연산인 FADD의 dependency 해결을 기다려야 합니다. 이때 single warp일 때와 다른 점은 Warp A의 두 번째 LD 이후 B의 LD 수행이 잇따라 오기 때문에, Warp A 비동기 메모리 로드 시간이 overlap되어 stall 시간이 줄었다는 것입니다.

먼저 수행한 Warp A의 메모리 로드가 끝나면 끝난 즉시 FADD가 issue 및 dispatch됩니다. 예시에서는 B의 의존성도 바로 해결되면서 바로 다음 사이클에 FADD가 연달아 수행되는데요, 이때 연산기가 파이프라인 구조로 되어 있기 때문에 각 스테이지별 유휴 상태가 따로 관리되면서 레이턴시를 많이 감출 수 있습니다.


![Scheduling Warp A, B and C](images/19-schd-triple.png)

### Multiple Warp Scheduling

이제 마지막으로 Warp C까지 포함한 scheduling 결과를 봅시다. 메모리 로드 동작을 통해 Stall이 사라진 것을 확인할 수 있습니다.

결론적으로, CUDA 프로그래밍은 SMSP상에 있는 다양한 Execution pipeline을 활용하여 다양한 작업을 빼곡하게 issue하여 async memory communication time을 잘 overlapping 하는 방식으로 동작하게 됩니다.
 
---
 
## 정리하자면…

이 글에서는  

① 그래픽 카드에서 출발한 Nvidia의 역사,  
② Tesla·CUDA를 거치며 GPGPU 플랫폼으로 확장된 과정,  
③ Hopper 세대 기준의 하드웨어 구조와 스케줄링 예시를 살펴보며,

궁극적으로  

>*"GPU는 느린 메모리를, 많은 워프 간의 빠른 컨텍스트 전환과 여러 연산의 동시 실행으로 가리는 장치"*  

라는 결론에 도달했습니다.  
결국 메모리 계층, 스케줄러 정책, 실행 파이프라인까지 GPU의 모든 설계 요소가 이 목표를 중심으로 짜여 있다는 점이 핵심입니다.



다음 글에서는 최근 무섭게 AI 하드웨어 시장을 뺏어가고 있는 Google의 TPU에 대해서 살펴보겠습니다.
TPU의 역사와 최신 TPU 아키텍처인 Ironwood에 대한 분석을 진행할 예정이니 많은 관심 부탁드립니다.

그럼 **지피지기면 백전불태 2편: TPU의 역사와 기초**에서 다시 뵙겠습니다.

---

## 추신: HyperAccel은 채용 중입니다!

지피지기면 백전불태라지만 백전백승을 위해서는 훌륭한 인재가 많이 필요합니다!

저희가 다루는 기술들을 보시고, 관심이 있으시다면 [HyperAccel Career](https://hyperaccel.career.greetinghr.com/ko/guide)로 지원해 주세요!

HyperAccel에는 정말 훌륭하고 똑똑한 엔지니어분들이 많습니다. 여러분의 지원을 기다립니다.
