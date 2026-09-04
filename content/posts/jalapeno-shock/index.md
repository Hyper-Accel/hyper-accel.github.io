---
date: '2026-09-04T16:00:00+09:00'
draft: false
title: "지피지기 7편: GPU로 만든 모델이 GPU보다 좋은 칩을 만들다"
cover:
  image: "images/cover.webp"
  alt: "불타는 할라피뇨 캐릭터가 NVIDIA와 AMD GPU 위에 서 있는 모습"
  caption: "OpenAI의 LLM 추론 가속기 할라피뇨"
  relative: true
authors: [Jaewon Lim]
tags: ["OpenAI", "Jalapeño", "LLM Inference", "AI Accelerator", "NVIDIA", "Broadcom", "HLS", "XLS"]
series: ["지피지기면 백전불태"]
series_idx: 7
categories: ["AI Hardware", "Accelerator", "Computer Architecture", "Semiconductor"]
summary: "AI로 AI를 돌리는 칩을 만드는 시대가 도래했습니다. AI 회사인 OpenAI의 자체칩 할라피뇨의 공개된 정보들을 바탕으로 이를 알아봅니다."
comments: true
---

> LLM을 처음 시장에 선보였던 OpenAI가 이제는 그 LLM으로 칩을 만들어냈습니다.
>
> 그런데.. 엔비디아보다 좋은 칩을 만들었다고 합니다.
>
> 이번 편에서는 OpenAI가 HotChips 2026에서 선보인 LLM 추론 가속기 할라피뇨에 대해 알아봅니다.

## 할라피뇨 쇼크

지난 8월 26일 새벽, 잠들기 전 링크드인을 눈팅하던 저는 한 게시글을 보고 잠을 이루지 못했습니다.

반도체 리서치 전문 기업인 SemiAnalysis에서 발표한 OpenAI와 브로드컴의 공동 개발 칩 할라피뇨의 성능이 공개되었기 때문입니다.

OpenAI가 칩을 개발하고 있었다는 사실은 알고 있었기에 실제 칩이 언제 나올지 기다리며 여러 가지 상상을 하고 있었습니다. 실제 공개된 내용은 제 상상을 아득히 뛰어넘었습니다.

### GPT 모델 전용이 아닌 LLM 범용 가속기

저의 당초 예상은 OpenAI가 GPU 독점 구조를 벗어난 AIDC 인프라를 구축하기 위해 본인들의 모델 서빙에 최적화된 칩을 만들 것이라는 것이었습니다. LLM 추론용 도메인 전용 가속기를 넘어 특정 모델에 특화된 가속기를 만드는 움직임은 다른 스타트업에서도 있었습니다. 얼마 전 AMD에 인수된 스타트업 **Taalas** 는 메모리 읽기 성능이 뛰어난 ROM(read-only memory)에 Llama 3.1 모델의 가중치를 그야말로 "박아 넣어서" 추론 성능을 극대화하는 것을 보여줬습니다.
![Taalas HC1과 주요 AI 가속기의 사용자당 초당 토큰 처리량 비교](images/taalas_tps.png)

*그림 1. Taalas HC1과 주요 AI 가속기의 사용자당 토큰 처리량 비교. 출처: Taalas*

또한 얼마 전 공개된 MoonshotAI의 Kimi K3 테크 리포트에서도 하드웨어 관련 언급이 있었습니다. Kimi K3가 MoonshotAI에서 실험적으로 만든 Kimi 모델 전용 가속기(통칭 KPU)의 프로토타입 RTL을 완전 자율적으로 검증하고 레이아웃까지 진행했다는 점이었습니다. 프로토타입이 어떻게 생겼는지 찾아보았고, 구조적으로 Kimi K3 모델에서 사용하는 Attention 연산 구조(Kimi delta attention, Multi-head latent attention)에 특화된 모듈이 탑재된 것을 확인할 수 있었습니다.

실험적인 프로토타입이고 실제 모델 전체를 구동시킬 수 있는 수준은 아니지만 이러한 움직임을 본 저는 OpenAI 또한 본인들의 모델에 특화된 구조의 가속기를 만들 수 있겠다고 생각했습니다. 새로 만든 첫 칩이 프론티어급 모델을 서빙하고 있는 GPU보다 성능이 좋을 리는 없으니, 이전 세대 혹은 상대적으로 낮은 성능의 모델 구조에 특화된 가속기로 서빙할 것이라는게 제 추측이었습니다.

하지만 SemiAnalysis 자료와 같은 날 열린 HotChips 발표에서 할라피뇨의 성능이 공개되었고, 저는 충격을 숨길 수 없었습니다. SemiAnalysis는 리서치뿐만 아니라 엔비디아, AMD 등의 최신 GPU 서빙 성능 벤치마크를 측정하는 기관입니다. 해당 벤치마크에서는 Llama나 중국 모델과 같이 가중치가 공개된 모델을 통해 성능을 측정합니다. SemiAnalysis는 이 벤치마크에서 측정한 성능을 공개했습니다. GPT 내부 모델용으로만 최적화된 것이 아니라, LLM 전체에 범용적으로 사용해도 좋은 가속기를 만들어낸 것입니다.

## GPU보다 좋은 성능

![Jalapeño와 NVIDIA·AMD GPU의 전력당 토큰 처리량 및 사용자당 처리 속도 비교](images/paleto_frontier.webp)

*그림 2. Jalapeño와 주요 GPU의 처리량-응답성 frontier 비교. 출처: SemiAnalysis*

범용성뿐만 아니라 성능 또한 놀랍습니다. 현재 엔비디아의 고객들이 실제로 사용 중인 제품 중 가장 성능이 좋은 GB300보다 지표당 1.5~4배 높은 성능을 보였고, 아직 정식 판매되지도 않은 Vera Rubin보다 전력 대비 성능에서 앞섰습니다. 더 충격적인 점은 벤치마크 측정을 위한 소프트웨어 최적화가 아직 덜 된 상태였다는 점입니다. 그도 그럴 것이, OpenAI의 최초 목적은 본인들이 만든 칩을 시장에 판매하는 것이 아니라 본인들의 인프라에 장착하는 것입니다. 홍보를 위해 벤치마크 성능을 최적화할 이유가 없는 것입니다. 하지만 그럼에도 성능 최적화를 진행한 현세대 최고의 GPU보다 성능이 좋습니다. 이것이 무엇을 의미하는지 조금 더 알아보겠습니다.

### STP(single token prediction) vs MTP(multi-token prediction)

LLM 모델의 가장 큰 단점 중 하나는 응답 토큰을 하나씩 내뱉는다는(STP) 점입니다. 수십만 개의 입력 토큰을 병렬적으로 처리해도 응답 토큰을 하나씩 생성해야 하므로 병목이 발생합니다. 이 때문에 최근에는 응답 토큰 생성의 병렬성을 끌어올리기 위해 상대적으로 작은 모델로 여러 개의 토큰을 한 번에 생성(MTP)하고, 이를 실제 모델에서 병렬적으로 검사하는 speculative decoding 방식이 각광받고 있습니다. 벤치마크 지표에서 주목할 점은 벤치마크 모델에서 MTP를 적용하지 않고도 MTP를 적용한 GB300보다 높은 성능을 보였다는 점입니다. 전력 대비 성능에서는 엔비디아 최신 제품인 Vera Rubin에 MTP를 적용한 것보다 높은 지표를 보여주었습니다.

### Disaggregated System vs Homogeneous System

![NVIDIA Dynamo가 prefill과 decode를 서로 다른 GPU로 분리하는 구성](images/PDD.webp)

*그림 3. Prefill과 decode를 분리하는 NVIDIA Dynamo의 PDD 구성. 출처: NVIDIA*

최근 LLM 추론 서빙 최적화에서 가장 큰 트렌드 중 하나는 prefill-decode disaggregation(PDD)입니다. LLM에서 토큰을 뱉는 과정은 크게 처음 입력된 프롬프트를 처리하는 prefill 과정과 첫 토큰을 뱉은 이후 이를 다시 입력해 다음 토큰들을 하나씩 뱉어내는 decode 과정으로 나뉩니다. 두 가지 연산은 그 특징이 다르기 때문에 LLM 서빙 시 prefill에 특화되어 설계된 가속기 클러스터와 decode에 특화된 클러스터를 나누어 효율을 끌어올리는 것이 PDD의 목적입니다.

![Rubin GPU의 attention 연산과 Groq LPU의 FFN 연산을 분리한 AFD 구성](images/AFD.png)

*그림 4. GPU와 LPU에 attention과 FFN을 나누는 AFD 구성. 출처: NVIDIA*

엔비디아는 지난번 소개한 Groq의 LPU를 사용한 LPX 클러스터를 활용하여 prefill과 decode 단계조차 쪼개고, attention 연산은 GPU rack에서 진행하며 고정된 weight를 사용하는 FFN 연산은 LPX 클러스터에서 진행하는 attention-FFN disaggregation(AFD)도 추진할 계획임을 밝혔습니다.

다만 이러한 disaggregated 방식에는 몇 가지 치명적인 문제가 발생합니다.

하나는 서로 다른 rack에서 연산을 나누어 진행하면 노드 간 통신 비용이 발생한다는 점입니다. 특히 용량을 많이 차지하는 KV cache가 문제입니다. PDD를 통해 이를 설명해 보겠습니다. prefill에서 생성된 KV cache는 decode 단계에서도 사용되어야 합니다. 입력 토큰 길이가 길어지면 KV cache 용량이 늘어나고 운반 비용도 증가합니다.

또 다른 문제는 prefill과 decode에 최적화되도록 클러스터가 고정되어 버린다는 점입니다. 클러스터 구성 시 워크로드를 기반으로 최적의 클러스터 구성을 파악하여 설계하게 될 테지만, 항상 예상된 워크로드만 진행한다는 보장은 없습니다. 예상하지 못한 워크로드로 인해 최적이라고 생각했던 클러스터 구성이 그렇지 않게 될 수 있다는 점입니다.

> OpenAI: ? disaggregation 그거 굳이 왜 함? 그냥 prefill이든 decode든 효율 최대로 올리면 되는 거 아님?

![역할이 고정된 heterogeneous system과 자원을 유연하게 배분하는 homogeneous system 비교](images/hetero_vs_homo.webp)

*그림 5. Heterogeneous system과 homogeneous system의 데이터 이동 및 자원 배분 비교*

OpenAI는 이러한 단점을 극복하기 위해 기존의 관행을 정면으로 반박합니다. 성능을 최대한으로 활용할 수 있다면 굳이 disaggregation을 할 필요가 없다는 것입니다. 투입되는 워크로드에 따라 최적의 방향으로 자원을 분배하면 homogeneous system을 사용하더라도 효율을 극대화할 수 있다는 주장입니다.

## AI로 만든 AI 칩

성능을 보았으니 이제는 개발 과정에 대해 좀 더 살펴보겠습니다. 빅테크 팹리스 기업들은 칩 개발에 수백\~수천 명의 인력을 투입하지만, OpenAI의 초기 칩 개발팀 규모는 20명 정도로 추산됩니다. 인류 최고의 인재들로 팀을 구성했겠지만, 이 정도 규모의 인원으로 회사의 첫 칩을 이 기간 내에 만들어 냈다는 것은 놀라운 성과입니다. 하드웨어 개발 기간은 9개월이며, 칩 수령 후 Codex와 ChatGPT를 이 칩에서 구동하기까지는 3개월이 채 걸리지 않았다고 합니다. 당연하겠지만 OpenAI의 가장 강력한 도구인 AI가 큰 역할을 했다고 합니다. 이에 대해 조금 더 알아보겠습니다.

### 하드웨어 최적화

AI 가속기와 같은 디지털 회로가 만들어지는 과정은 하드웨어 아키텍처 고안 -&gt; RTL 설계 -&gt; physical layout의 3단계로 간략히 나눌 수 있습니다. 레지스터 레벨의 구성을 기술하는 RTL 코드가 실제 칩의 physical layout 구조를 결정하기 때문에 성능(**P**erformance), 전력(**P**ower), 그리고 칩 면적(**A**rea) 등의 지표(**PPA**)는 대부분 RTL 수준에서 결정됩니다. 따라서 아키텍처가 결정된 상태에서는 PPA 최적화를 위해 RTL 코드를 최적화해야 하며, 이것이 하드웨어 엔지니어의 가장 큰 역량 중 하나입니다. RTL 코드는 Verilog나 SystemVerilog와 같은 언어로 작성합니다. 현재 AI도 이 언어를 충분히 잘 학습하여 AI를 활용한 RTL 최적화가 많이 진행되고 있지만, 할라피뇨 팀은 조금 다른 방식을 사용하였습니다.

### HLS(high-level synthesis)

![XLS 하드웨어 합성 도구 로고](images/xls_logo.svg)

*그림 6. XLS 로고*

HLS, 그중에서도 XLS(Accelerated HW Synthesis)는 SystemVerilog 언어를 바로 작성하는 것이 아니라, RTL 보다 한단계 더 추상화된 Rust나 C코드로 하드웨어를 기술한 뒤 이를 통해 RTL 코드를 "생성"하는 방식입니다.

> ???: 그냥 RTL 코드를 바로 최적화하면 되지, 왜 C 코드를 거치는 거죠?

저도 들었던 의문입니다. 사람이 설계하는 입장에서는 Rust나 C 코드를 통해 만들면 편하겠지만, AI와 함께 설계한다면 RTL 코드를 그대로 입력으로 넣을 수 있기 때문에 한 단계를 거치지 않고 최적화할 수 있을 것입니다. 다만 OpenAI는 발표에서 "인간이 이해하기 쉬운 개념은 AI도 이해하기 쉽다"고 이야기하며, 그만큼 최적화도 쉽게 진행할 수 있다고 주장했습니다. XLS가 실제 하드웨어 설계에 적합하게 만들어진 언어라는 점도 한몫했겠지만, AI가 이해하기 쉬운 것이 최적화하기도 쉽다는 점이 인상적이었습니다.

### 소프트웨어 최적화

소프트웨어에서도 AI를 통한 완전 자동화된 최적화를 진행했다고 합니다. 새로운 칩에는 그 칩에 맞는 소프트웨어 스택이 필요하고, 이를 기반으로 LLM 모델을 칩에서 구동하기 위한 커널들을 작성해야 합니다. DeepSeek R1 벤치마크 측정 시에는 인간 개입을 통한 최적화가 이루어져 있지 않아 AI에 이 과정을 완전히 자율적으로 맡겼고, 대부분의 최적화 과정을 AI가 홀로 수행하는 데 성공했다고 합니다.

### 자가개선 루프

두 개의 최적화 과정에서 볼 수 있던 공통점이 있었습니다. 최적화 과정을 하나의 루프로 만들고 AI가 그 루프를 거치면서 반복적으로 최적화를 수행하도록 하는 것입니다. 이는 안드레 카파시가 블로그에서 주장한 *검증 가능성*을 칩 성능 최적화에 적용한 사례로 보입니다.

> 어떤 작업이나 업무가 검증 가능하다면, 이는 직접적으로 또는 강화학습을 통해 최적화할 수 있으며, 신경망을 학습시켜 이를 극도로 잘 수행하도록 만들 수 있습니다.
>
> - 안드레 카파시 블로그, *Verifiability*

최적화 과정을 검증 가능한 루프로 만들고 AI가 그 루프를 통해 반복적으로 최적화를 수행하도록 하는 것입니다. OpenAI는 이를 통해 하드웨어와 소프트웨어 수준의 최적화 모두 인간 전문가보다 뛰어난 수준의 성능 향상을 이끌어냈다고 주장했습니다.

### 다음은 Anthropic?

자료 탐색 과정에서 발견한 것은 앤트로픽에서도 칩 개발을 시작했다는 소식입니다. 이미 수개월 전 할라피뇨 프로젝트에 참여했던 핵심 멤버가 앤트로픽으로 이적했다는 소식이 전해졌고, TPU 개발에 참여했던 인력들이 앤트로픽에 합류했다는 소식도 전해졌습니다. AI 기업들이 자체 칩과 자체 인프라를 구축하려는 움직임이 본격적으로 시작되고 있습니다. 중국 프론티어 AI 기업 또한 비슷한 움직임을 보일 것으로 예상됩니다.

## 결론

GPU는 CUDA라는 해자를 통해 AI 반도체 시장을 독점했습니다. 하지만 이제 그 해자가 조금씩 무너지는 듯합니다. 아니.. 어쩌면 또 다른 해자가 구축되고 있는 듯합니다. 바로 **"지능"** 입니다.

프론티어 AI 기업들은 최고 성능의 모델을 시장에 곧바로 공개하지 않습니다. 안전성 등을 위해 내부에서 테스트 과정을 거치거나 Anthropic의 Fable 5처럼 일부 기업에만 제공하고, 일반 소비자들에게는 일부 기능이 통제된 채로 모델을 내놓기도 합니다. 그렇다면 프론티어 AI 랩은 **"진보된 지능"을 "정제 없이" 세상에서 가장 "빠르게" 사용할 수 있는 "독점적 지위"를 갖고 있는 셈입니다.** 이미 AI는 거의 모든 분야에서 인간의 능력을 능가했습니다. 이러한 상황에서 지능의 선제적 독점은 지식이 필요한 모든 산업 분야에서 이미 보이지 않는 해자의 구축을 의미한다고 생각합니다. 오늘도 잠들기는 쉽지 않을 것 같습니다. 오늘 글은 제 링크드인에 올린 구절로 마치겠습니다. 오늘도 읽어주셔서 감사합니다.

> AI가 번역가들을 덮쳤을 때,\
> 나는 침묵했다.\
> 나는 번역가가 아니었기 때문이다.\
>
> 그다음에 그들이 예술가들을 덮쳤을 때,\
> 나는 침묵했다.\
> 나는 예술가가 아니었기 때문이다.\
>
> 그다음에 그들이 개발자들을 덮쳤을 때,\
> 나는 침묵했다.\
> 나는 개발자가 아니었기 때문이다.\
>
> 그들이 나에게 닥쳤을 때는,\
> 나를 위해 말해 줄 이들이\
> 아무도 남아 있지 않았다.
>
> - 마르틴 니묄러의 금언 중 '처음 그들이 왔을 때'를 변용

### 출처

- [SemiAnalysis - OpenAI Jalapeño: Better Than Nvidia Blackwell](https://newsletter.semianalysis.com/p/openai-jalapeno-better-than-nvidia)
- OpenAI - You Can Just Build ~~Things~~ … Chips (Hot Chips 2026)
- [Taalas - HC1 Technology Demonstrator](https://taalas.com/products/)
- [Moonshot AI - Kimi K3: Open Frontier Intelligence](https://arxiv.org/pdf/2607.24653)
- [NVIDIA 테크 블로그 - NVIDIA Accelerates OpenAI gpt-oss Models Delivering 1.5 M TPS Inference on NVIDIA GB200 NVL72](https://developer.nvidia.com/blog/delivering-1-5-m-tps-inference-on-nvidia-gb200-nvl72-nvidia-accelerates-openai-gpt-oss-models-from-cloud-to-edge/)
- [NVIDIA 테크 블로그 - Inside NVIDIA Groq 3 LPX](https://developer.nvidia.com/blog/inside-nvidia-groq-3-lpx-the-low-latency-inference-accelerator-for-the-nvidia-vera-rubin-platform)
- [Google XLS - XLS: Accelerated HW Synthesis](https://google.github.io/xls/)
- [Andrej Karpathy - Verifiability](https://karpathy.bearblog.dev/verifiability/)
