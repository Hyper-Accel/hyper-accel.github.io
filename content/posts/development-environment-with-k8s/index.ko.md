---
date: '2026-02-04T10:38:13+09:00'
draft: false
title: 'Kubernetes 기반 사내 개발 환경 구축기 0편: 왜 kubernetes가 필요한가?'
cover:
  image: "kubernetes_logo.png"
  # can also paste direct link from external site
  # ex. https://i.ibb.co/K0HVPBd/paper-mod-profilemode.png
  alt: "Kubernetes Logo"
  caption: "Kubernetes Logo"
  relative: false # To use relative path for cover image, used in hugo Page-bundles
authors: ["Younghoon Jun"] # must match with content/authors
tags: [development-environment, kubernetes, container]
categories: [kubernetes]
series: ["Kubernetes 기반 사내 개발 환경 구축기"]
summary: ['현재 HyperAccel SW group의 개발 환경 ~~~ 전체 여정을 공유합니다.']
comments: true
description: ""
keywords: [
  "Development Environment", "Container", "Kubernetes",
  "Server", "FPGA", "GPU"
]
---

# Kubernetes 기반 사내 개발 환경 구축기 0편: 왜 kubernetes가 필요한가?

안녕하세요! 저는 HyperAccel ML팀에서 DevOps Engineer로 근무하고 있는 전영훈입니다.

이 글을 보시는 분들 중에서 개발자 여러분들은 어떤 환경에서 개발하고 계신가요? Local 환경, 특정 서버에 직접 접속, 클라우드 서비스 활용 등 다양한 환경 위에서 개발을 진행하고 계신다고 생각됩니다.

HyperAccel SW group은 Kubernetes 클러스터를 기반으로 구축된 환경 위에서 개발을 진행하고 있습니다. 개발 진행 시에 필요한 패키지들을 기반으로 제작된 `devcontainer`를 기반으로 Pod을 띄우고, container 내부에 접속해서 작업을 진행하는 구조입니다. 사내 개발자분들의 보다 편리한 사용을 위해서 `devcontainer portal`을 만들어서 제공하고 있습니다.

![Devcontainer Portal](./devcontainer_portal_capture.png)

해당 portal을 통해 container 생성 및 삭제, 에러 로그 확인, Kubernetes 클러스터 노드의 잉여 자원 확인 등 개발 container에 관련된 동작을 손쉽게 진행할 수 있습니다.

정말 감사하게도 SW group 개발자분들께서 적극적으로 잘 사용해주시고 계십니다. 하지만, 처음부터 Kubernetes 환경에서 개발을 진행되었던 것은 아닙니다. **Kubernetes 기반 사내 개발 환경 구축기**에서는 사내 개발자들의 불편함을 해소하고 효율적인 개발 프로세스 제공을 위해 어떻게 Kubernetes 기반 개발 환경을 구축하였는지에 대한 여정을 소개하고자 합니다. 해당 시리즈의 첫 번째 글인 이번 포스팅에서는 Kubernetes 도입 이전 기존 개발 환경의 한계점에서부터 Kubernetes를 도입하기까지 과정에 대해 소개합니다.

---

## Container 기반 개발 환경이 도입되기 이전

HyperAccel은 KAIST [CAST Lab](https://castlab.kaist.ac.kr/) 구성원들이 힘을 합쳐 작은 규모에서부터 시작된 스타트업입니다.

![HyperAccel Starting Members](./hyperaccel_starting_member.jpg)

초기 스타트업의 특성 상 굉장히 빠른 템포로 개발을 진행했었고, 체계적인 개발 환경을 구축하기 어려운 상황이었습니다. 해당 시점에는 제가 HyperAccel에 합류하기 이전이기 때문에, 초창기 멤버이신 ML팀 박현준([Author](https://hyper-accel.github.io/authors/hyunjun-park/), [LinkedIn](https://www.linkedin.com/in/hyunjun-park-14b8352a2/))님과 대화를 통해 당시 개발 환경에 대해 전해들을 수 있었습니다.

> 당시 저희는 10명 정도 규모의 굉장히 작은 조직이었고, 타이트한 기간 내에 목표를 달성하기 위해 개발 환경에는 크게 신경쓰지 못했었습니다. 사내 서버에 각자 계정을 만들고 접속해서 사용했고, 누군가 서버의 자원을 많이 사용하고 있다면 직접 자리로 찾아가서 언제 작업이 끝나는지 독촉하곤 했었죠. (웃음)

공통된 개발 환경이 없는 경우에 발생하는 어려움에 대해서 조금 더 구체적으로 살펴보겠습니다.

### 서버 관리의 어려움
만약 서버가 10대 있고 개발자가 총 10명 있다면, 모든 개발자가 서버 전체에 접근하기 위해서는 총 **100개**의 계정이 필요합니다. 물론 계정 생성 정도는 자동화 스크립트를 사용한다면 크게 어렵지 않다고 생각하실 수 있습니다. 하지만, 이러한 환경에서 개발을 진행한다면 개발자는 서버마다 본인의 작업물이 같은 상태인지 추적하기 굉장히 어렵습니다. (Github을 활용한다고 해도 매우 불편합니다.)

보안 및 서버 안정성 문제도 함께 고려해야 합니다. 예를 들면, `sudo` 권한 부여에 대해서도 추가로 정책을 정할 필요가 있습니다. 추가로 개발 도중 실수(`sudo rm -rf /`와 같은 폭력적인 예시를 생각해볼 수 있습니다...)로 인해 서버가 망가지게 되면 복구하는데 비용이 들게 됩니다.

### 패키지 버전 통일의 어려움
여러 명이서 함께 코드를 구현하는 것에 있어서 각자 코드의 통합은 필수 항목입니다. 개인별로 독립된 환경에서 개발을 진행한다면, 향후에 이를 통합할 때 버전 문제가 발생할 수 있습니다. Torch 버전 충돌, Clang 버전 불일치와 같은 문제가 발생할 수 있는 것이죠. 소위 말하는 **It Works on my Machine**을 서로 주장하게 되는 것입니다.

### 자원 사용의 어려움
HyperAccel의 [1세대 chip](https://aws.amazon.com/ko/blogs/tech/hyperaccel-fpga-on-aws/)은 FPGA를 기반으로 제작되었습니다. FPGA 서버는 ring topology 형태로 연결되어 있기 때문에 서버 내부에서 완전 격리로 사용하기 위해서는 1대만 사용하거나 혹은 전부 다 사용하는 방식 중 하나로 활용해야만 했습니다. 개발자 여러 명이 동시에 사용하기 어려운 구조입니다. (현재는 Kubernetes 환경 위에서 원활하게 사용되고 있습니다. 해당 내용에 대해서는 향후 작성될 글에서 Kubernetes Device Plugin이라는 주제로 자세히 알아보도록 하겠습니다.)

추가로 GPU 같은 경우에도 점유 여부를 확인하기 위해서는 `nvidia-smi`와 같은 명령어를 통해 실행 중인 프로세스를 확인하거나, dashboard를 직접 참고해야하는 불편한 점이 있습니다.

---

## Devcontainer의 도입

회사의 규모가 커지고 개발자의 수가 늘어남에 따라서 체계적인 개발 환경 구축이 필요한 상황이 되었습니다. 이를 위해 ML팀 Lead이신 박민호([Author](https://hyper-accel.github.io/authors/minho-park/), [LinkedIn](https://www.linkedin.com/in/minho-park-804a56142/))님께서 `HyperAccel-Devcontainer`라는 컨테이너화 된 개발 환경(편의상 이번 글에서는 `devcontainer`라고 지칭하겠습니다)을 구축하셨습니다.

`devcontainer`는 2가지 버전을 제공합니다. 첫 번째는 HyperAccel의 1세대 chip의 개발 및 관리를 위한 container이고, 두 번째는 HyperAccel의 2세대 ASIC chip 개발을 위한 container입니다. 두 가지 버전의 container는 모두 `base-image`를 기반으로 빌드됩니다. `base-image`에는 두 버전의 container가 동일하게 필요로 하는 패키지 및 환경이 제공됩니다. 이를 기반으로 각 버전마다 필요한 패키지와 환경을 기반으로 container 환경이 세팅됩니다.

이렇듯 container 기반으로 개발 환경을 제공하는 경우에는 **개발 인원 모두가 같은 환경 위에서 개발을 진행**할 수 있다는 장점이 있습니다. **It Works on my Machine**을 피할 수 있는 것이죠. 또한 격리된 환경에서 개발을 진행하기 때문에 개인의 실수로 인해 서버가 망가지는 상황을 최대한 피할 수 있습니다.

하지만, 이러한 container 개발 환경에도 명확한 한계점이 있습니다.

### 개인별 서버 접속 계정의 필요성

개인별로 서버에 접속할 수 있는 계정은 여전히 제공해야 합니다. 개발자의 입장에서는 개발을 위해서는 서버 계정의 존재 여부에 의존해야 하고, 관리자의 입장에서는 개발 팀의 인원이 변동될 때마다 계정 관리를 해주어야 하는 업무 지점이 하나 늘어나게 됩니다. 추가로, 개인에게 서버 접속을 허용해주기 때문에 위에서 말씀드린 실수로 인한 서버 고장의 가능성도 여전히 존재합니다.

### 개발 환경에 대한 유연성 부족

우선, 개발자는 서버마다 자신의 디렉토리를 관리해야 하기 때문에 여전히 서버 환경에 종속되어 있습니다. 만약 특정 서버가 다운된다면, 해당 서버를 쓰고 있던 개발자들은 (백업이 없다면) 자신의 결과물에 대한 추적이 어려운 경우 업무에 지장을 받을 수 있습니다. 현재 저희 회사에서는 외부 IDC의 서버도 함께 사용하기 때문에 관리자가 출장을 가서 서버를 고쳐야하는 상황이 된다면 업무가 더 오랜 시간 지연될 수 있습니다.

추가로 개발자 입장에서 container 환경 사용에 대해 익히기까지 시간과 노력이 필요합니다. Container에 대한 기본 지식부터 실행 과정 및 주의사항까지 DevOps에 친숙하지 않은 개발자의 입장에서는 어려운 지점이 될 수 있습니다.

### 해결하지 못한 자원 사용의 어려움

FPGA와 GPU 사용에는 여전히 제약이 발생합니다. 앞서 설명드린 문제점이 container 환경에서도 동일하게 발생할 수 있습니다.

이러한 한계점을 극복하고 보다 쾌적한 개발 환경 제공을 위해 Kubernetes를 도입하기로 결정하게 되었습니다.

---

## Kubernetes 기반 devcontainer 개발 환경 도입

여기까지 글을 읽으셨을 때 독자분들께서는 이러한 의문점이 생기실 수 있습니다.

> *"Kubernetes는 도대체 어떤 tool이고, 왜 사용해야 하는거지?"*

본격적으로 Kubernetes를 기반으로 한 개발 환경에 대해 설명드리기 전에, Kubernetes란 어떠한 tool이고 이를 기반으로 개발 환경을 구축했을 때 어떠한 이점을 얻을 수 있는지에 대해 소개하도록 하겠습니다.

### About Kubernetes

Kubernetes는 **Container Orchestration Tool**입니다. Container를 쉽고 빠르게 배포 및 확장하고, 관리를 자동화해주는 오픈소스 플랫폼이죠. 단순한 container 플랫폼을 넘어 마이크로서비스 및 클라우드 플랫폼을 지향하고, container로 이루어진 것들을 손쉽게 담고 관리할 수 있는 그릇 역할을 합니다. 이렇게 설명하면 와닿지 않으실 수 있는데, 한 문장으로 정리해보자면 이렇게 표현해볼 수 있겠네요.

> *복잡한 인프라 운영을 코드화 및 자동화하여, 누구나 일관되게 서비스를 배포, 확장, 운영할 수 있게 해주는 도구*

Container Orchestration이라는 개념에 대해서 좀 더 설명해보겠습니다.

간단하게 Kubernetes에 대해서 소개.

![Kubernetes Components](./kubernetes_components.png)

### Kubernetes 기반 개발 환경의 장점

내용

#### 완전한 격리 개발 환경 구축

내용

#### 유연한 개발 환경 운용

내용

#### 자원 관리 용이

내용

나아가 ARC, MLflow와 같은 컴포넌트들을 쉽게 올릴 수 있음.

### Kubernetes 클러스터 구축 및 개발 환경 도입

ML팀에서 k8s 클러스터 구축. 현재 클러스터에는 어떠한 스택들이 올라가 있는지 간략하게 오버뷰 느낌으로 작성. 

## 정리하자면...

앞에 글에 대한 내용 정리. 다음 편에 어떤 글이 올라올지 홍보(Nexus, ARC, ...). 추가로 ASIC 칩을 지원하기 위해 hyperaccel에서 구현한 k8s 기반 sw stack에 대해서도 글 작성.

---

## 추신: HyperAccel은 채용 중입니다!

ML팀의 DevOps 파트가 하는 일에 대해서 간단하게 소개. 사내 개발자들이 편하게 사용할 수 있도록 노력. 추가로 향후 cloud level로 bertha를 사용하기 위해 여러가지 일을 진행 중임.

HyperAccel은 LLM 가속 ASIC 칩 출시를 위해 HW, SW, AI를 모두 다루는 회사로 전 방면에 걸쳐 뛰어난 인재들이 모여있고, 이런 환경에서 한 분야에 국한된 것이 아닌 폭넓은 지식을, 심지어 깊게 배우며 지식을 공유하고 함께 성장하고 싶으신 분들은 언제든지 저희 HyperAccel에 지원해주세요!

저희가 다루는 기술들을 보시고, 관심이 있으시다면 [HyperAccel Career](https://hyperaccel.career.greetinghr.com/ko/guide)로 지원해 주세요!

## Reference

- [Kubernetes Docs](https://kubernetes.io/ko/docs/home/)
- [What is Kubernetes?](https://www.mirantis.com/cloud-native-concepts/getting-started-with-kubernetes/what-is-kubernetes/)
- [하이퍼엑셀(HyperAccel), Amazon EC2 F2 Instance 기반 LPU로 고효율 LLM 추론 서비스 구축](https://aws.amazon.com/ko/blogs/tech/hyperaccel-fpga-on-aws/)
- [Hyperdex Toolchain Software Stack](https://docs.hyperaccel.ai/1.5.2/?_gl=1*pm5cz2*_ga*MTI5NTQ1MTQ2NS4xNzU2NDUwNzUw*_ga_NNX475HLH0*czE3NzAxOTYyNzkkbzMkZzEkdDE3NzAxOTYzMTgkajIxJGwwJGgw)
