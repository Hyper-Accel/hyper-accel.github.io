---
date: '2025-11-16T15:10:31+09:00'
draft: false
title: 'Crafting Compilers'
cover:
  image: "486.jpeg"
  # can also paste direct link from external site
  # ex. https://i.ibb.co/K0HVPBd/paper-mod-profilemode.png
  alt: "<alt text>"
  caption: "<text>"
  relative: false # To use relative path for cover image, used in hugo Page-bundles
authors: [Jaewoo Kim] # must match with content/authors
tags: [compiler]
categories: [compiler]
summary: [컴파일러의 작동 방식과, 컴파일러를 제작하는 전반적인 과정에 관한 포스팅 시리즈를 시작하기 위한 소개 글입니다]
comments: true
---

# Crafting compilers

## Compilers

이 포스팅 및 앞으로 쓰게 될 시리즈는 compiler가 무엇인지, 어떻게 만들어지는지, 그리고 직접 compiler를 만드는 방법을 설명하는 시리즈가 될 것입니다. Compiler는 (어느 정도는) 복잡한 프로그램으로, 사람이 작성한 high-level 프로그램(주로 English 형태로 존재하는)을 컴퓨터가 이해할 수 있는 binary 형식으로 변환합니다. Compiler engineering은 이러한 변환 과정을 어떻게 설계할 것인지 결정하는 일입니다.

우선 "프로그램"이 무엇인지, 그리고 어떻게 생겼는지부터 생각해보겠습니다. 저는 프로그램을 하드웨어가 실행해야 하는 명령어들의 순서라고 정의할 수 있다고 생각합니다. 가장 낮은 수준에서는 프로그램은 단순히 '1'과 '0'으로 이루어진 명령어들의 시퀀스입니다. 프로그램이 표현되던 초기 형태 중 하나는 IBM 360 같은 컴퓨터에서 사용되던 assembly language였습니다. 과거의 프로그래머들은 하드웨어 명령어를 직접 작성하여, 우주 로켓의 궤적 계산이나 은행 계좌 관리 같은 아주 중요한 프로그램들을 만들었습니다. 이러한 명령어들은 컴퓨터가 각 단계에서 무엇을 해야 하는지를 직접 표현했으며, 프로그래머는 컴퓨터가 가진 모든 하드웨어 디테일을 이해해야 했습니다. Register usage, memory state, 기타 모든 하드웨어 세부 사항을 직접 계산해야 했고, 잘못 계산하면 프로그램이 오작동하거나 심각한 문제가 발생할 수 있었습니다.

하지만 사람들이 컴퓨터에 더 많이 의존하게 되면서, 처리해야 할 작업의 복잡도와 범위는 급격히 증가했습니다. 프로그램의 크기도 커졌고, 이로 인해 전체를 assembly로 작성하는 것은 사실상 불가능해졌습니다. 이제 컴퓨터는 우리가 사용하는 거의 모든 것을 실행합니다. 출근길에 타는 엘리베이터부터 인간 능력을 뛰어넘는 AI 응용까지 모두 포함됩니다.

프로그램이 너무 복잡해지자, 더 이상 하드웨어에 직접 명령어를 넣어 프로그래밍 하기는 매우 어려워졌습니다. 현대적인 응용 프로그램에서는 현실적으로 불가능합니다. 대신 컴퓨터 과학자들은 사람이 이해하기 쉬운 프로그래밍 언어를 만들었습니다. 이러한 프로그래밍 언어들은 필요한 추상화를 제공하여 사람이 프로그램을 작성할 수 있도록 돕는 일종의 __유저 인터페이스(UI)__ 라고 볼 수 있습니다. 이 언어들은 사람이 사용하는 자연어에 더 가깝게 설계되었고, 인간이 사고하는 방식에 맞춰져 있습니다. 그 결과, 오늘날의 프로그래머는 레지스터 사용이나 메모리 상태 같은 컴퓨터 내부의 정확한 상태를 신경 쓰지 않고도 프로그램 작성에 집중할 수 있게 되었습니다. 현대 프로그래밍 언어는 점점 "인간 친화적인 언어"가 되어 가고 있습니다.

컴파일러는 사람이 작성한 프로그램과 기계어 사이를 연결하는 다리입니다. 좋은 컴파일러는 프로그래머의 의도를 오류나 부작용 없이 정확히 전달하며, 프로그램이 가능한 한 빠르고 효율적으로 실행되도록 만듭니다. 앞서 말씀드렸듯이, 우리가 매일 사용하는 C/C++, Java, Python 같은 programming language는 모두 __추상화(abstraction)__ 되어 있습니다. 이 언어들은 프로그래머에게 보여주고 싶지 않은 하드웨어 세부 사항을 숨깁니다. 즉, 컴파일러가 대신 처리해야 합니다. Register allocation, memory allocation, instruction selection 같은 작업이 이러한 추상화에 포함됩니다. 이것은 마치 영어–한국어 통역사가 원문의 표현을 가장 잘 전달할 수 있는 한국어 단어를 스스로 선택하는 것과 같습니다.

지금까지 설명한 내용이 컴파일러가 하는 일입니다. 이제부터는 컴파일러가 실제로 이런 작업들을 어떻게 단계별로 수행하는지, 즉 사람이 작성한 프로그램을 어떻게 실행 가능한 기계어까지 변환하는지를 설명하겠습니다. 다소 이론적인 내용도 다루겠지만, 가능한 한 실제 구현 중심으로 설명하려 합니다. LLVM과 MLIR 같은 대표적인 컴파일러 인프라를 활용하여, 처음부터 "제대로 된" 프로그래밍 언어를 만들어보는 과정을 보여드리겠습니다.

## 목차 (Table of contents)

### Chapter 1. Programming Language

#### 1.1 프로그래밍 언어 만들기 (Building a Programming Language)

- 프로그래밍 언어란 무엇인가?
- 컴파일러(Compiled) vs 인터프리터(Interpreter)
- Managed vs. Unmanaged
- 함수형 프로그래밍 (Functional Programming)
- Hoya Language 소개

### Chapter 2. Parsers

- Abstract Syntax Tree (AST)
    - AST란 무엇인가
    - AST 최적화
- Lexers, Parsers
    - Parsing 알고리즘
        - Recursive-descent parsing
        - Pratt parsing
        - LR parsing

### Chapter 3. Intermediate Representations

- Intermediate Representation(IR)이란 무엇이며 왜 중요한가
- SSA (Single Static Assignment)
- Block과 control flow

### Chapter 4. Optimizations

- Scalar optimizations
- Control-flow optimizations
- Vectorization
- Loop analysis

### Chapter 5. Instruction Selection

- 올바른 instruction 고르기
- Register allocation

### Chapter 6. Compilers for Accelerators

- GPU compiler 구조
- AI accelerator 전용 compiler

이번 글에서는 컴파일러의 전체적인 개념과 흐름을 먼저 살펴보았습니다.
다음 글부터는 본격적으로 프로그래밍 언어의 개념부터, 설계 및 구현하는 방법을 다루고자 합니다.
