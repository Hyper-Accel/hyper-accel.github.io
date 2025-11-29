---
date: '2025-11-16T15:10:28+09:00'
draft: false
title: 'Crafting Compilers'
cover:
  image: "486.jpeg"
  # can also paste direct link from external site
  # ex. https://i.ibb.co/K0HVPBd/paper-mod-profilemode.png
  alt: "<alt text>"
  caption: "<text>"
  relative: false # To use relative path for cover image, used in hugo Page-bundles
authors: [jaewoo kim] # must match with content/authors
tags: [compiler]
categories: [compiler]
summary: [Introduction to series of posts that would guide people to journey learning about how compiler works, and how they can build their own.]
comments: true
---

# Crafting Compilers

## Compilers

This will be a series of posts describing what **compilers** are, how they are crafted, and how to build your own compiler. Compilers are complicated (sort of) programs that translate high-level programs (written in English mostly) into binary formats that computers can understand. Engineering compilers means designing the way that programs are translated.

Let's first think about what "programs" are, and how they look. I would define a program as a sequence of instructions for hardware to execute. So at the base level, programs are just sets of instructions composed of "1"s and "0"s. One of the original forms of programs was the **assembly language** used for computers such as the IBM 360. Programmers in the old days wrote hardware instructions directly to make computers run mission-critical programs such as calculating the trajectory of space rockets or managing bank accounts. These directly expressed what the computer should do at each step, and programmers had to be aware of all the hardware details the computer had. They had to manually calculate register usage, memory state, and every hardware detail, or their program would malfunction and blow up their spaceships.

However, as people started to rely more on computers, the complexity and range of tasks grew rapidly. The size of programs became massive, making it almost impossible to write them in assembly. Now, computers run almost everything we use today—from the elevator you take to work to AI applications that even surpass human abilities.

Since programs became too complicated, we could no longer give manual instructions to hardware directly. It is simply infeasible for most modern applications. Instead, computer scientists developed **programming languages** that humans can easily understand by providing necessary abstractions. A programming language can be thought of as a **user interface (UI)** that helps humans write programs by providing abstractions. They are designed to be closer to human language and aligned with how people usually think. As a result, today's programmers can focus on writing programs themselves rather than thinking about the precise internal state of computers, such as register usage, memory usage, and so on. Modern programming languages tend to become languages for humans.

Compilers are the bridge that connects human-written programs to machine-level programs (series of instructions). Good compilers translate a programmer's intention without errors or side effects, and make the program execute on computers as fast and efficiently as possible. As I mentioned before, the programming languages we use every day (such as C/C++, Java, Python, etc.) are **abstracted**. They hide hardware details that they don't want to expose to programmers. In other words, compilers must take care of them. Abstracted expressions include things like register allocation, memory allocation, and instruction selection. These are decisions made by compilers without asking humans—similar to an English–Japanese translator who chooses the correct Japanese words that best express English expressions.

So these are what compilers do. What I am going to tell you from now on is how compilers actually perform these tasks in a step-by-step manner—from English-written programs to executable binaries! I am going to explain some theoretical stuff, but I'll lean toward real-world implementation. I'm going to use popular compiler infrastructures such as LLVM and the MLIR compiler stack, and show you how to build a decent programming language from scratch!

## Table of Contents

### Chapter 1. Programming Language

- Syntax and semantics
- Functional programming vs. imperative programming
- Designing a toy functional language

### Chapter 2. Parsers

- Abstract syntax tree
    - What is an abstract syntax tree
    - Optimizing ASTs
- Lexers, parsers
    - Parsing algorithms
        - Recursive-descent parsing
        - Pratt parsing
        - LR parsing

### Chapter 3. Intermediate Representations

- What is an intermediate representation, and why it matters
- SSA (Single Static Assignment)
- Blocks and control flow

### Chapter 4. Optimizations

- Scalar optimizations
- Control-flow optimizations
- Vectorization
- Loop analysis

### Chapter 5. Instruction Selection

- Choosing the right instruction
- Register allocation

### Chapter 6. Compilers for Accelerators

- GPU compilers
- Special compilers for AI accelerators
