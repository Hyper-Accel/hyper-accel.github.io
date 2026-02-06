---
date: '2026-02-06T10:38:13+09:00'
draft: false
title: 'Kubernetes 기반 사내 개발 환경 구축기 0편: 왜 Kubernetes인가?'
cover:
  image: "images/kubernetes_logo.png"
  # can also paste direct link from external site
  # ex. https://i.ibb.co/K0HVPBd/paper-mod-profilemode.png
  alt: "Kubernetes Logo"
  caption: "Kubernetes Logo"
  relative: false # To use relative path for cover image, used in hugo Page-bundles
authors: ["Younghoon Jun"] # must match with content/authors
tags: [development-environment, kubernetes, container]
categories: [kubernetes]
series: ["Kubernetes 기반 사내 개발 환경 구축기"]
summary: ['Kubernetes 기반으로 운영되는 HyperAccel SW group의 개발 환경 구축에 대한 여정을 공유합니다.']
comments: true
description: ""
keywords: [
  "Development Environment", "Container", "Kubernetes",
  "Server", "FPGA", "GPU"
]
---

# Kubernetes 기반 사내 개발 환경 구축기 0편: 왜 Kubernetes인가?

안녕하세요! 저는 HyperAccel ML팀에서 DevOps Engineer로 근무하고 있는 전영훈입니다.

이 글을 보시는 분들 중에서 개발자 여러분들은 어떤 환경에서 개발하고 계신가요? Local 환경, 특정 서버에 직접 접속, 클라우드 서비스 활용 등 다양한 환경 위에서 개발을 진행하고 계신다고 생각됩니다.

HyperAccel SW group은 Kubernetes 클러스터를 기반으로 구축된 환경 위에서 개발을 진행하고 있습니다. 개발 진행 시에 필요한 패키지들을 기반으로 제작된 `devcontainer`를 기반으로 Pod을 띄우고, container 내부에 접속해서 작업을 진행하는 구조입니다. 사내 개발자분들의 보다 편리한 사용을 위해서 `devcontainer portal`을 만들어서 제공하고 있습니다.

![Devcontainer Portal](./images/devcontainer_portal_capture.png)

해당 portal을 통해 container 생성 및 삭제, 에러 로그 확인, Kubernetes 클러스터 노드의 잉여 자원 확인 등 개발 container에 관련된 동작을 손쉽게 진행할 수 있습니다.

정말 감사하게도 SW group 개발자분들께서 적극적으로 잘 사용해주시고 계십니다. 하지만, 처음부터 Kubernetes 환경에서 개발을 진행되었던 것은 아닙니다. **Kubernetes 기반 사내 개발 환경 구축기**에서는 사내 개발자들의 불편함을 해소하고 효율적인 개발 프로세스 제공을 위해 어떻게 Kubernetes 기반 개발 환경을 구축하였는지에 대한 여정을 소개하고자 합니다. 해당 시리즈의 첫 번째 글인 이번 포스팅에서는 Kubernetes 도입 이전 기존 개발 환경의 한계점에서부터 Kubernetes를 도입하기까지 과정에 대해 소개합니다.

---

## Container 기반 개발 환경이 도입되기 이전

HyperAccel은 KAIST [CAST Lab](https://castlab.kaist.ac.kr/) 구성원들이 힘을 합쳐 작은 규모에서부터 시작된 스타트업입니다.

![HyperAccel Starting Members](./images/hyperaccel_starting_member.jpg)

초기 스타트업의 특성 상 굉장히 빠른 템포로 개발을 진행했었고, 체계적인 개발 환경을 구축하기 어려운 상황이었습니다. 해당 시점에는 제가 HyperAccel에 합류하기 이전이기 때문에, 초창기 멤버이신 ML팀 박현준([Author](https://hyper-accel.github.io/authors/hyunjun-park/), [LinkedIn](https://www.linkedin.com/in/hyunjun-park-14b8352a2/))님과 대화를 통해 당시 개발 환경에 대해 전해들을 수 있었습니다.

> 당시 저희는 10명 정도 규모의 굉장히 작은 조직이었고, 타이트한 기간 내에 목표를 달성하기 위해 개발 환경에는 크게 신경쓰지 못했었습니다. 사내 서버에 각자 계정을 만들고 접속해서 사용했고, 누군가 서버의 자원을 많이 사용하고 있다면 직접 자리로 찾아가서 언제 작업이 끝나는지 독촉하곤 했었죠. (웃음)

공통된 개발 환경이 없는 경우에 발생하는 어려움에 대해서 조금 더 구체적으로 살펴보겠습니다.

### 서버 관리의 어려움
만약 서버가 10대 있고 개발자가 총 10명 있다면, 모든 개발자가 서버 전체에 접근하기 위해서는 총 **100개**의 계정이 필요합니다. 물론 계정 생성 정도는 자동화 스크립트를 사용한다면 크게 어렵지 않다고 생각하실 수 있습니다. 하지만, 이러한 환경에서 개발을 진행한다면 개발자는 서버마다 본인의 작업물이 같은 상태인지 추적하기 굉장히 어렵습니다. (Github을 활용한다고 해도 매우 불편합니다.)

보안 및 서버 안정성 문제도 함께 고려해야 합니다. 예를 들면, `sudo` 권한 부여에 대해서도 추가로 정책을 정할 필요가 있습니다. 추가로 개발 도중 실수(`sudo rm -rf /`와 같은 폭력적인 예시를 생각해볼 수 있습니다...)로 인해 서버가 망가지게 되면 복구하는데 비용이 들게 됩니다.

### 패키지 버전 통일의 어려움
여러 명이서 함께 코드를 구현하는 것에 있어서 각자 코드의 통합은 필수 항목입니다. 개인별로 독립된 환경에서 개발을 진행한다면, 향후에 이를 통합할 때 버전 문제가 발생할 수 있습니다. Torch 버전 충돌, Clang 버전 불일치와 같은 문제가 발생할 수 있는 것이죠. 소위 말하는 **It Works on my Machine**을 서로 주장하게 되는 것입니다.

![It works on my machine](./images/it_works_on_my_machine.jpg)

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

### Container Orchestration

Kubernetes는 **Container Orchestration Tool**입니다. Container를 쉽고 빠르게 배포 및 확장하고, 관리를 자동화해주는 오픈소스 플랫폼이죠. 단순한 container 플랫폼을 넘어 마이크로서비스 및 클라우드 플랫폼을 지향하고, container로 이루어진 것들을 손쉽게 담고 관리할 수 있는 그릇 역할을 합니다. 이렇게 설명하면 와닿지 않으실 수 있는데, 한 문장으로 정리해보자면 이렇게 표현해볼 수 있겠네요.

> *복잡한 인프라 운영을 코드화 및 자동화하여, 누구나 일관되게 서비스를 배포, 확장, 운영할 수 있게 해주는 도구*

**Container Orchestration**이라는 개념에 대해서 좀 더 설명해보겠습니다. Container를 기반으로 운영되는 환경에서 서비스는 container의 형태로 사용자들에게 제공됩니다. 이때 관리해야 할 container의 개수가 적다면 담당자 한 명이서도 충분히 문제 상황에 대한 대응이 가능하지만, 조직의 규모가 커진다면 담당자 한 명이 이슈에 대응하는 것은 불가능합니다. 규모가 큰 환경에서는 아래와 같은 운영 기법이 필요합니다.

- 모든 서비스가 정상적으로 동작하고 있는지를 계속해서 **모니터링**하는 시스템 제공
- 특정 클러스터나 특정 컨테이너에 작업이 몰리지 않도록 **스케줄링**, **로드 밸런싱**, **스케일링**

수많은 container의 상태를 지속해서 관리하고 운영하는 과정을 조금이나마 쉽게, 자동으로 할 수 있는 기능을 제공해주는 시스템이 바로 **Container Orchestration**입니다.

---

### About Kubernetes

지금까지 Kubernetes와 Container Orchestration이 무엇인지에 대해 살펴보았습니다. 다음으로는 Kubernetes 컴포넌트에 대해서 간단히 알아보도록 하겠습니다. 아래 그림을 통해 Kubernetes 클러스터를 구성하는 필수 컴포넌트들에 대한 개요를 확인하실 수 있습니다.

![Kubernetes Components](./images/kubernetes_components.png)

Kubernetes 클러스터는 Control Plane과 하나 이상의 Worker Node로 구성됩니다.

#### Control Plane 컴포넌트

Kubernetes 클러스터 전체 상태를 관리하는 역할을 합니다.

- `kube-apiserver`

  - Kubernetes HTTP API를 노출하는 핵심 서버 컴포넌트

- `etcd`

  - 모든 API 서버 데이터를 위한 일관성과 고가용성을 갖춘 key-value 저장소

- `kube-scheduler`

  - 노드에 할당되지 않은 pod을 찾아 적절한 노드에 할당

- `kube-controller-manager`

  - 컨트롤러를 실행하여 쿠버네티스 API 동작을 구현

#### Worker Node 컴포넌트

모든 노드에서 실행되며, 실행 중인 pod를 유지하고 Kubernetes runtime 환경을 제공합니다.

- `kubelet`

  - 노드 에이전트, Pod와 그 안의 container가 실행 중임을 보장

- `kube-proxy` (Optional)

  - 노드에서 네트워크 규칙을 유지하여 서비스를 구현

- `container-runtime`

  - Container 실행을 담당하는 소프트웨어

지금까지 Kubernetes와 클러스터 레벨에서 Kubernetes가 어떠한 역할을 하는지에 대해 살펴보았습니다. 그렇다면 사내 개발 환경 구축을 Kubernetes 기반으로 진행했던 이유는 어떤 것일까요? 다음으로는 Kubernetes 클러스터 형태로 개발 환경을 관리하는 것의 장점을 기반으로 선택 이유에 대해 설명하겠습니다.

---

### Kubernetes 기반 개발 환경의 장점

Kubernetes를 기반으로 개발 환경을 제공한다면 어떠한 장점을 얻을 수 있을까요? 앞서 제시한 container 기반 개발 환경의 한계점을 어떻게 극복할 수 있는지에 초점을 맞추어 설명하도록 하겠습니다.

#### 완전한 격리 개발 환경 구축

Kubernetes 클러스터가 도입되며 더 이상 개발자가 서버에 접속할 필요가 없어졌습니다. 개발자분들은 Kubernetes 환경에서 `devcontainer`를 실행하고, container 내부에 접속하여 개발을 진행하기만 하시면 됩니다! 노드 선택, 자원 관리 등 인프라 측면에서 신경써야할 부분은 모두 클러스터 레벨에서 관리되기 때문이죠.

또한, 클러스터 레벨에서 노드 사용 정책을 지정하여 사용자의 접근 권한 및 자원 사용에 대해 지정할 수 있습니다. 클러스터 내부 노드를 용도에 맞게 분리하여 사용자 입장에서 불편함을 느낄 요소가 많이 제거되고, 비정상적인 자원 사용을 통제하여 노드가 다운되는 상황도 막을 수 있습니다.

#### 유연한 개발 환경 운용

더 이상 개발 환경이 특정 노드에 종속되지 않습니다! 일부 노드가 다운되어도 클러스터 내부 다른 노드로 pod을 스케줄링할 수 있기 때문입니다. 개발자 home 같은 경우에도 NAS에 nfs provisioner 형태로 제공하기 때문에 안심하고 다른 노드에 뜬 pod 위에서 개발을 진행할 수 있습니다.

추가로 `portal` 형태로 사용자에게 제공(아래에서 구체적으로 설명드리겠습니다)하기 때문에, 사용자에게 클러스터 접근 권한만 부여한다면 초기 진입장벽 없이 사용 가능합니다.

#### 자원 관리 용이

FPGA, GPU와 같은 custom 자원을 container 단위로 독점적으로 사용할 수 있습니다. Kubernetes는 기본적으로 CPU, Memory 이외의 자원은 custom 자원으로 간주합니다. 이러한 자원들을 Kubernetes 위에서 활용하기 위해서는 `Device Plugin`이 필요합니다.

현재 저희 클러스터에는 `Device Plugin`이 세팅되어 있고, 이를 기반으로 container에 해당 자원들을 할당하여 사용한다면 다른 container의 개입 없이 격리하여 활용할 수 있습니다.

---

### Kubernetes 클러스터 구축 및 개발 환경 도입

> *결과적으로 Kubernetes 클러스터를 구축하고, 이를 기반으로 사내 개발 환경을 도입하였습니다!!*

현재 저희 Kubernetes 클러스터에 적용되어 있는 컴포넌트 중에서 개발 환경의 편의성 증대를 목적으로 하는 일부에 대해 간략하게 소개해보겠습니다.

- 고가용성(High Availability)

  - Kubernetes에서 Control Plane을 하나로 유지한다면 SPOF(Single Point Of Failure)가 생깁니다. 클러스터가 다운되면 개발자분들의 작업이 전부 중단되는 불상사가 발생하게 됩니다. 이를 방지하기 위해 3개 노드를 Control Plane으로 지정하였고, `KeepAlived`와 `HAProxy`를 적용하여 특정 노드가 다운되어도 클러스터가 정상 운영되도록 하였습니다.

    ![KeepAlived and HAProxy](./images/keepalived_haproxy.png)

- 저장소 관리

  - 관리 편의성 증대 및 네트워크 지연 최소화를 위해 `Rook-Ceph`과 `Harbor`를 도입하여 내부 OCI Registry 운영하고 있습니다.
  - 사내 PyPi 서버 환경 제공을 위해 `Nexus` 도입하여 운영하고 있습니다.

- CI/CD 고도화

  - Github 환경에서 CI/CD를 진행할 때 기존에는 컴퓨팅 노드에 Github Action Runner를 직접 띄워 쓰는 방식이었습니다. Kubernetes 클러스터가 구축되며 보다 안정적인 runner 실행을 위해 `ARC(Actions Runner Controller)`를 도입하였습니다.

    ![ARC Overview](./images/arc_overview.png)

  - Secret 관리의 중앙화 및 개발자들의 secret 접근성 증대를 위해 `Vault`을 도입하여 운영하고 있습니다.

- Portal 제공

  - `Devcontainer Portal`을 제공하여 개발자분들에게 제공하고 있습니다. 이를 통해 개발자들이 편하게 개발 환경 인프라를 실행하고, 모니터링을 통해 log 확인이 용이해졌기 때문에 개발에 더욱 집중할 수 있는 환경이 되었습니다.

저는 석사과정 당시 분산학습 환경에서 효율적인 GPU 사용을 위한 스케줄링 연구를 진행했었습니다. 연구 진행을 위해 Kubernetes scheduler를 직접 수정해보며 Kubernetes의 제한적인 기능만을 활용했었는데요, 이번 구축 과정을 통해 클러스터 구축부터 운영까지 전체 과정을 진행해보는 소중한 경험을 했습니다.

개발 환경 제공을 위해 Kubernetes 클러스터를 구축하고 어떻게 하면 사내 개발자 여러분들의 생산성을 높이고 편의성을 증대할 수 있는지 고민하는 과정이 어렵기도 했지만 정말 보람차고 즐거웠습니다.

## 정리하자면...

이번 글에서는 **Kubernetes 기반 개발 환경 구축기** 시리즈 중 첫 번째 내용인 기존 개발 환경의 한계점과 Kubernetes 도입 계기 및 과정에 대해 소개드렸습니다.

공통된 조건을 기반으로 격리된 개발 환경을 제공하기 위해서 container 기반 환경을 제공하고, 이를 관리하기 위해 Kubernetes를 도입하였습니다.
*개발자 입장*에서는 인프라에 대해 신경써야 하는 부분이 최소화되기 때문에 편리하게 개발에만 집중할 수 있고, *관리자 입장*에서는 규모가 커지는 환경에서도 안정적으로 관리 및 이슈를 대응할 수 있게 되어 업무 효율성이 크게 증가하였습니다.

앞으로 전개될 시리즈 글에서는 개발 환경을 고도화하고 생산성을 높이기 위해 Kubernetes 클러스터 위에 어떠한 프레임워크를 추가했는지에 대해 소개하도록 하겠습니다!

나아가 저희 ML팀에서는 HyperAccel에서 출시될 ASIC chip을 Kubernetes 위에서 활용할 수 있도록 지원하는 소프트웨어 스택 개발을 진행하고 있습니다.
Kubernetes는 개발 환경 이외에도 현재 가장 주목받고 있는 기술인 LLM(Large Language Model) Serving의 기반 인프라로써 중요한 역할을 합니다.
해당 내용에 관련해서도 글을 통해 소개해도록 하겠습니다!

향후 업로드되는 글에 대해서도 많은 관심 부탁드리며, 끝까지 읽어주셔서 감사드립니다!

---

## 추신: HyperAccel은 채용 중입니다!

HyperAccel은 LLM 가속 ASIC 칩 출시를 위해 HW, SW, AI를 모두 다루는 회사로 전 방면에 걸쳐 뛰어난 인재들이 모여있고, 이런 환경에서 한 분야에 국한된 것이 아닌 폭넓은 지식을, 심지어 깊게 배우며 지식을 공유하고 빠른 속도로 함께 성장하고 있습니다!

저희 **ML팀의 DevOps 파트**는 사내 개발자들의 생산성 증대를 위한 개발 환경 제공 및 관리, LPU chip을 클라우드 레벨에서의 활용을 효과적으로 지원하기 위한 소프트웨어 스택을 개발하고 있습니다.

HyperAccel에서 다루는 기술들을 보시고, 관심이 있으시다면 [HyperAccel Career](https://hyperaccel.career.greetinghr.com/ko/guide)로 지원해 주세요!

## Reference

- [Kubernetes Docs](https://kubernetes.io/ko/docs/home/)
- [What is Kubernetes?](https://www.mirantis.com/cloud-native-concepts/getting-started-with-kubernetes/what-is-kubernetes/)
- [Why Kubernetes?](https://mlops-for-all.github.io/docs/introduction/why_kubernetes/)
- [하이퍼엑셀(HyperAccel), Amazon EC2 F2 Instance 기반 LPU로 고효율 LLM 추론 서비스 구축](https://aws.amazon.com/ko/blogs/tech/hyperaccel-fpga-on-aws/)
- [Hyperdex Toolchain Software Stack](https://docs.hyperaccel.ai/1.5.2/?_gl=1*pm5cz2*_ga*MTI5NTQ1MTQ2NS4xNzU2NDUwNzUw*_ga_NNX475HLH0*czE3NzAxOTYyNzkkbzMkZzEkdDE3NzAxOTYzMTgkajIxJGwwJGgw)
- [Actions Runner Controller](https://docs.github.com/ko/actions/concepts/runners/actions-runner-controller)