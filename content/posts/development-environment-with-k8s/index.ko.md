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

안녕하세요! 저는 HyperAccel ML팀에서 DevOps Engineer로 일하고 있는 전영훈입니다.

이 글을 보시는 여러분들은 어떤 환경에서 개발하고 계신가요? hyperaccel sw group은 현재 Kubernetes 기반 개발 환경 위에서 개발 진행하고 있음. 아래처럼 portal을 통해 container를 손 쉽게 띄웠다 죽였다 할 수 있음. 물론 처음부터 이런 환경 위에서 진행됐던 것은 아님. 이번 시리즈에서는 사내 개발자들의 불편함을 해소하고 효율적인 개발 프로세스를 위해 어떻게 Kubernetes 기반 개발 환경을 구축하였는지 소개하고자 합니다. 이번 포스팅에서는 Kubernetes 도입 이전 기존 개발 환경에서부터 Kubernetes를 도입하기 까지 과정에 대해 소개합니다.

---

## Container 기반 개발 환경이 도입되기 이전

HyperAccel은 연구실 기반으로 창업된 회사. 따라서 회사 초기에는 container 기반도 아니었음. 어떠한 문제점이 있었느냐, 인터뷰.

ML팀 박현준([Author](https://hyper-accel.github.io/authors/hyunjun-park/), [LinkedIn](https://www.linkedin.com/in/hyunjun-park-14b8352a2/))님 인터뷰 참고.

---

## Devcontainer의 도입

ML팀 Lead이신 박민호([Author](https://hyper-accel.github.io/authors/minho-park/), [LinkedIn](https://www.linkedin.com/in/minho-park-804a56142/))님께서 만들어주심. 어떻게 개발되었고, 기존에 어떤 방식을 활용했는지 이야기. 제가 HyperAccel에 합류하기 전에는 딱 여기 단계까지 되어 있었음.

## Devcontainer 개발 환경의 한계점

하지만 devcontainer도 한계점은 있음. 첫번째, 개인별로 서버 계정을 제공해야함. 해당 계정을 통해 사용자는 ssh로 접속해서 사용해야함. 이러면 자원 컨트롤도 안됨.

두번째, 서버 하나가 다운되면 해당 서버를 쓰고 있던 개발자들은 업무 all stop. IDC 출장 가서 해결해야 하므로 사용자 및 관리자 모두 불편함.

세번째, FPGA와 GPU 사용에 제약 발생.

이러한 한계점을 극복하기 위해 Kubernetes를 도입하기로 결정.

---

## Kubernetes 기반 devcontainer 개발 환경 도입

본격적으로 개발 환경 구축에 대해 설명하기 전에, 왜 하필 Kubernetes를 도입하기로 결정했는지 설명하겠음.

### About Kubernetes

기본적으로 어떤건지 설명.

### Kubernetes를 기반으로 개발 환경을 구축했을 때 얻을 수 있는 이점

앞서 언급한 한계점들을 어떻게 하면 해결할 수 있을까? 나아가 ARC, MLflow와 같은 컴포넌트들을 쉽게 올릴 수 있음.

## 정리하자면...

앞에 글에 대한 내용 정리. 다음 편에 어떤 글이 올라올지 홍보. 추가로 ASIC 칩을 지원하기 위해 hyperaccel에서 구현한 k8s 기반 sw stack에 대해서도 글 작성.

---

## 추신: HyperAccel은 채용 중입니다!

ML팀의 DevOps 파트가 하는 일에 대해서 간단하게 소개. 사내 개발자들이 편하게 사용할 수 있도록 노력. 추가로 향후 cloud level로 bertha를 사용하기 위해 여러가지 일을 진행 중임.

HyperAccel은 LLM 가속 ASIC 칩 출시를 위해 HW, SW, AI를 모두 다루는 회사로 전 방면에 걸쳐 뛰어난 인재들이 모여있고, 이런 환경에서 한 분야에 국한된 것이 아닌 폭넓은 지식을, 심지어 깊게 배우며 지식을 공유하고 함께 성장하고 싶으신 분들은 언제든지 저희 HyperAccel에 지원해주세요!

저희가 다루는 기술들을 보시고, 관심이 있으시다면 [HyperAccel Career](https://hyperaccel.career.greetinghr.com/ko/guide)로 지원해 주세요!

HyperAccel에는 정말 훌륭하고 똑똑한 엔지니어분들이 많습니다. 여러분의 지원을 기다립니다.

## Reference

- [What is Kubernetes?](https://www.mirantis.com/cloud-native-concepts/getting-started-with-kubernetes/what-is-kubernetes/)
- [하이퍼엑셀(HyperAccel), Amazon EC2 F2 Instance 기반 LPU로 고효율 LLM 추론 서비스 구축](https://aws.amazon.com/ko/blogs/tech/hyperaccel-fpga-on-aws/)
