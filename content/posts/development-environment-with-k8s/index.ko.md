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

HyperAccel SW group은 Kubernetes 클러스터를 기반으로 구축된 환경 위에서 개발을 진행하고 있습니다. 개발 진행 시에 필요한 패키지들을 기반으로 제작된 Devcontainer를 기반으로 Pod을 띄우고, container 내부에 접속해서 작업을 진행하는 구조입니다. 사내 개발자분들의 보다 편리한 사용을 위해서 devcontainer portal을 만들어서 제공하고 있습니다.

![Devcontainer Portal](./devcontainer_portal_capture.png)

해당 portal을 통해 Devcontainer 생성 및 삭제, 에러 로그 확인, Kubernetes 클러스터 노드의 잉여 자원 확인 등 개발 container에 관련된 동작을 손쉽게 진행할 수 있습니다.

정말 감사하게도 SW group 개발자분들께서 적극적으로 잘 사용해주시고 계십니다. 하지만, 처음부터 Kubernetes 환경에서 개발을 진행되었던 것은 아닙니다. **Kubernetes 기반 사내 개발 환경 구축기**에서는 사내 개발자들의 불편함을 해소하고 효율적인 개발 프로세스 제공을 위해 어떻게 Kubernetes 기반 개발 환경을 구축하였는지에 대한 여정을 소개하고자 합니다. 해당 시리즈의 첫 번째 글인 이번 포스팅에서는 Kubernetes 도입 이전 기존 개발 환경의 한계점에서부터 Kubernetes를 도입하기 까지 과정에 대해 소개합니다.

---

## Container 기반 개발 환경이 도입되기 이전

HyperAccel은 KAIST [CAST Lab](https://castlab.kaist.ac.kr/) 구성원들이 힘을 합쳐 작은 규모에서부터 시작된 스타트업입니다.

![HyperAccel Starting Members](./hyperaccel_starting_member.jpg)

초기 스타트업의 특성 상 굉장히 빠른 템포로 개발을 진행했었고, 체계적인 개발 환경을 구축하기 어려운 상황이었습니다. 해당 시점에는 제가 HyperAccel에 합류하기 이전이기 때문에, 초창기 멤버이신 ML팀 박현준([Author](https://hyper-accel.github.io/authors/hyunjun-park/), [LinkedIn](https://www.linkedin.com/in/hyunjun-park-14b8352a2/))님과 대화를 통해 당시 개발 환경에 대해 전해들을 수 있었습니다.

> 당시 저희는 10명 정도 규모의 굉장히 작은 조직이었고, 타이트한 기간 내에 목표를 달성하기 위해 개발 환경에는 크게 신경쓰지 못했었습니다. 사내 서버에 각자 계정을 만들고 접속해서 사용했고, 누군가 서버의 자원을 많이 사용하고 있다면 직접 자리로 찾아가서 언제 작업이 끝나는지 독촉하곤 했었죠. (웃음)

공통된 개발 환경이 없는 경우에 발생하는 어려움에 대해서 조금 더 구체적으로 살펴보겠습니다.

### 개인별 계정 관리의 어려움
만약 서버가 10대 있고 개발자가 총 10명 있다면, 모든 개발자가 서버 전체에 접근하기 위해서는 총 **100개**의 계정이 필요합니다. 물론 계정 생성 정도는 자동화 스크립트를 사용한다면 크게 어렵지 않다고 생각하실 수 있습니다. 하지만, 이러한 환경에서 개발을 진행한다면 개발자는 서버마다 본인의 작업물이 같은 상태인지 추적하기 굉장히 어렵습니다. (Github을 활용한다고 해도 매우 불편합니다)

### 패키지 버전 통일의 어려움
여러 명이서 함께 코드를 구현하는 것에 있어서 각자 코드의 통합은 필수 항목입니다. 개인별로 독립된 환경에서 개발을 진행한다면, 향후에 이를 통합할 때 버전 문제가 발생할 수 있습니다. Torch 버전 충돌, Clang 버전 불일치와 같은 문제가 발생할 수 있는 것이죠. 소위 말하는 **It Works on my Machine**을 서로 주장하게 되는 것입니다.

### 자원 사용의 어려움
HyperAccel의 1세대 chip은 FPGA를 기반으로 제작되었습니다. FPGA 서버는 ring topology 형태로 연결되어 있기 때문에 서버 내부에서 완전 격리로 사용하기 위해서는 1대만 사용하거나 혹은 전부 다 사용하는 방식 중 하나로 활용해야만 했습니다. 개발자 여러 명이 동시에 사용하기 어려운 구조입니다. (현재는 Kubernetes 환경 위에서 원활하게 사용되고 있습니다. 해당 내용에 대해서는 향후 작성될 글에서 Kubernetes Device Plugin이라는 주제로 자세히 알아보도록 하겠습니다.)

추가로 GPU 같은 경우에도 점유 여부를 확인하기 위해서는 `nvidia-smi`와 같은 명령어로 확인 혹은 dashboard 참고 등 불편한 사항이 있습니다.

---

## Devcontainer의 도입

앞서 말씀드린 불편함을 해소하기 위해 ML팀 Lead이신 박민호([Author](https://hyper-accel.github.io/authors/minho-park/), [LinkedIn](https://www.linkedin.com/in/minho-park-804a56142/))님께서 Devcontainer라는 컨테이너화 된 개발 환경을 만드셨습니다. 모두 다 동일한 환경에서 개발해야됨. 어떻게 개발되었고, 기존에 어떤 방식을 활용했는지 이야기.

## Devcontainer 기반 개발 환경의 한계점

하지만 devcontainer도 한계점은 있음. 첫번째, 개인별로 서버 계정을 제공해야함. 해당 계정을 통해 사용자는 ssh로 접속해서 사용해야함. 이러면 자원 컨트롤도 안됨.

두번째, 서버 하나가 다운되면 해당 서버를 쓰고 있던 개발자들은 업무 all stop. IDC 출장 가서 해결해야 하므로 사용자 및 관리자 모두 불편함.

세번째, FPGA와 GPU 사용에 제약 발생. 1세대 chip인 FPGA에 대해서도 간략하게 소개.

이러한 한계점을 극복하기 위해 Kubernetes를 도입하기로 결정.

---

## Kubernetes 기반 devcontainer 개발 환경 도입

본격적으로 개발 환경 구축에 대해 설명하기 전에, 왜 하필 Kubernetes를 도입하기로 결정했는지 설명하겠음.

### About Kubernetes

기본적으로 어떤건지 설명.

### Kubernetes 기반 개발 환경의 장점

앞서 언급한 한계점들을 어떻게 하면 해결할 수 있을까? 나아가 ARC, MLflow와 같은 컴포넌트들을 쉽게 올릴 수 있음.

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

- [What is Kubernetes?](https://www.mirantis.com/cloud-native-concepts/getting-started-with-kubernetes/what-is-kubernetes/)
- [하이퍼엑셀(HyperAccel), Amazon EC2 F2 Instance 기반 LPU로 고효율 LLM 추론 서비스 구축](https://aws.amazon.com/ko/blogs/tech/hyperaccel-fpga-on-aws/)
- [Hyperdex Toolchain Software Stack](https://docs.hyperaccel.ai/1.5.2/?_gl=1*pm5cz2*_ga*MTI5NTQ1MTQ2NS4xNzU2NDUwNzUw*_ga_NNX475HLH0*czE3NzAxOTYyNzkkbzMkZzEkdDE3NzAxOTYzMTgkajIxJGwwJGgw)
