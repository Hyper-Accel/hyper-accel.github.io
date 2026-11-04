---
date: '2026-11-02T18:00:00+09:00'
title: '[Exploring torch.compile() - Part 03] Two Keywords from PyTorch Conference 2026: Agent and Acceleration'
cover:
  image: "images/pytorch.jpg"
  alt: "PyTorch logo"
  caption: "PyTorch"
  relative: true
authors: [Hyunjun Park]
tags: ["torch.compile", "PyTorch", "PyTorch Conference", "vLLM", "TorchInductor", "AI Agent", "NPU", "CI"]
series: ['Exploring torch.compile()']
series_idx: 3
categories: ["Compilers and Kernels"]
summary: 'Where the industry is heading, as seen at PyTorch Conference 2026, through two keywords: Agent and Acceleration. We look at how agents are changing development, what PyTorch and vLLM are speeding up, and how NPU companies are joining the ecosystem.'
description: 'A PyTorch Conference 2026 report. It covers the CI and refactoring work that absorbs the growing volume of PRs in the age of agents, torch.compile improvements such as the C++ FakeTensor and unbacked shapes, inference optimization in vLLM, and how NPU companies including Huawei Ascend and IBM Spyre build tools to join the PyTorch ecosystem.'
comments: true
keywords: [
  "PyTorch Conference 2026", "torch.compile", "AI agent", "CI",
  "FakeTensor", "graph break", "unbacked dynamic shape", "vLLM",
  "Spyre", "Ascend", "PrivateUse1", "OpenReg", "CRCR", "KTIR"
]
---

<!-- b:torch-compile-anatomy-3-1 -->
### Overview

<!-- b:torch-compile-anatomy-3-2 -->
Hello, this is Hyunjun Park from the CL (Compute Library) team at HyperAccel. In [Part 1]({{< ref "/posts/torch-compile-anatomy" >}}) we looked at how `torch.compile()` works, and in [Part 2]({{< ref "/posts/torch-compile-anatomy-2" >}}) at why it is split into three stages and who benefits from that structure. As promised, this part comes from attending PyTorch Conference 2026, held October 20–21 in San Jose. I want to lay out where the industry is heading on top of this structure.

<!-- b:torch-compile-anatomy-3-3 -->
Over two days I attended 17 sessions, and the two keywords I took away are **Agent** and **Acceleration**. One disclaimer first. By the official categories, training had the most sessions, but I chose compiler, inference, and accelerator talks. So this post is not a summary of the whole conference. It is **my interpretation of the sessions I picked**. Where I did not attend a session, I rely on its public description and say so.

<!-- b:torch-compile-anatomy-3-4 -->
The post has three parts:

<!-- b:torch-compile-anatomy-3-5 -->
1. As agents speed up development, how are projects changing their **Continuous Integration (CI)** and code structure?
2. What are PyTorch and vLLM making faster?
3. What tools are **Neural Processing Unit (NPU)** companies building to join the PyTorch ecosystem?

<!-- b:torch-compile-anatomy-3-6 -->
---

<!-- b:torch-compile-anatomy-3-7 -->
## Part 1. Agent: keeping up with faster development {#part1}

<!-- b:torch-compile-anatomy-3-8 -->
### The bottleneck moves to review

<!-- b:torch-compile-anatomy-3-9 -->
In the vLLM Roadmap session I attended, what struck me as much as the new features was **project management**. Commits and contributors have grown so much that the release and maintenance process is being overhauled. To see how much, I counted the **pull requests (PRs)** opened on GitHub each October.

<!-- b:torch-compile-anatomy-3-10 -->
| Repository | Oct 2024 | Oct 2025 | Oct 2026 |
| --- | ---: | ---: | ---: |
| vllm-project/vllm | 453 | 1,323 | 4,577 |
| pytorch/pytorch | 1,711 | 1,900 | 2,887 |

<!-- b:torch-compile-anatomy-3-11 -->
*Based on GitHub search; includes PRs opened by bots.*

<!-- b:torch-compile-anatomy-3-12 -->
vLLM grew about tenfold in two years. Agents don't explain all of that. The numbers also reflect the project's own growth, and this count can't tell which PRs agents wrote. The maintainers' concern was clear, though. The description of PyTorch's [Fighting Agents with Agents](https://pytorch.org/blog/core-pytorch-sessions-at-pytorch-conference-north-america-2026/) session opens by saying that maintainers are reviewing a growing number of PRs written by AI agents.

<!-- b:torch-compile-anatomy-3-13 -->
When writing code gets cheaper, **the expensive part becomes reading, trusting, and maintaining it**. The first response from projects was rules. The [vLLM contributing guide](https://docs.vllm.ai/en/v0.28.0/contributing/) says not to submit "pure agent" PRs, and makes the human submitter responsible for reviewing all changed lines and validating behavior end to end.

<!-- b:torch-compile-anatomy-3-14 -->
### CI: fighting agents with agents

<!-- b:torch-compile-anatomy-3-15 -->
Rules alone can't hold back the volume, so CI and review are changing too. I did not attend the sessions in this section, so this is based on their public descriptions.

<!-- b:torch-compile-anatomy-3-16 -->
- **Fighting Agents with Agents: Bringing Claude to PyTorch CI, triage, and PR review:** PyTorch added automatic issue triage, PR review skills, and CI and autorevert investigation to its infrastructure. The stated goal is to support maintainers, not replace them.
- **Shipping PyTorch and Its Ecosystem: A Modern Release Story:** Triton and vLLM are continuously validated against PyTorch nightlies, so breakage surfaces before the release branch is cut. Agents triage CI failures and draft fixes, but people make the final call.

<!-- b:torch-compile-anatomy-3-17 -->
What stood out in both is where they keep the human. Agents take on triage, investigation, and drafts, while **people make the decisions**. vLLM also has limited CI resources, so a new commit doesn't start CI automatically. Reviewers, or the author of an approved PR, run it with `/ci run`.

<!-- b:torch-compile-anatomy-3-18 -->
### Refactoring: a structure more people can contribute to

<!-- b:torch-compile-anatomy-3-19 -->
More contributors also put pressure on code structure. As special cases pile up in code everyone touches, review gets harder and conflicts multiply.

<!-- b:torch-compile-anatomy-3-20 -->
[A Developer's Guide to Attention in vLLM](https://events.linuxfoundation.org/pytorch-conference-north-america/program/schedule/?id=1254038) is a good example. Each kind of attention has different metadata and a different **key-value (KV)** cache layout, so branches kept growing in the backend and connector code. vLLM now builds common metadata (`CommonAttentionMetadata`) once per step, and each backend adds only what it needs. KV logical dimensions are unified as `L, B, H, N, C`, and the actual memory layout is expressed through strides. Separating logical shape from physical layout means fewer places to change when adding a new attention type or storage scheme.

<!-- b:torch-compile-anatomy-3-21 -->
Flat Model and Model Runner V2 from the roadmap are model-execution reworks in the same direction. Going by its public description, [One Model Definition, Many Accelerators](https://pytorch.org/blog/vllm-sessions-at-pytorch-conference-north-america-2026/) separates model logic from hardware execution paths, so the same definition runs on Intel Gaudi and IBM Spyre without platform-specific code.

<!-- b:torch-compile-anatomy-3-22 -->
The talks mostly explained this work as making new models and architectures easier to support. I see another meaning in it. A structure with clear boundaries is **easier to contribute to, for people and agents alike**, because a narrower change is also easier to verify.

<!-- b:torch-compile-anatomy-3-23 -->
---

<!-- b:torch-compile-anatomy-3-24 -->
## Part 2. Acceleration: what PyTorch and vLLM are speeding up {#part2}

<!-- b:torch-compile-anatomy-3-25 -->
If Part 1 was about development speed, Part 2 is about execution speed. The notable shift is that the target of optimization has widened from **the speed of generated code** to compile cost and the whole runtime.

<!-- b:torch-compile-anatomy-3-26 -->
### Faster compilation: FakeTensor and graph breaks

<!-- b:torch-compile-anatomy-3-27 -->
Let's start with [Speeding Up torch.compile: A New FakeTensor](https://events.linuxfoundation.org/pytorch-conference-north-america/program/schedule/?id=1257046). FakeTensor is a tensor with no real data that computes only metadata such as shape, dtype, and device. Dynamo does this for every op while tracing, and Inductor uses it during code generation too. According to the session description, this propagation accounts for about 20% of Dynamo tracing time.

<!-- b:torch-compile-anatomy-3-28 -->
The fix is a new C++ implementation of FakeTensor. By cutting the overhead of Python dispatch and symbolic operations, the geometric mean across 118 ops went from 48.2 µs to 2.2 µs, a **22.3x** speedup. Note that this is a per-op measurement. End-to-end torchbench compile time improved by 3.7–11.6% depending on the configuration, with individual models gaining up to 20–30%. What impressed me is that this came from changing the implementation path, not from a new algorithm. The next step is porting the remaining Python meta kernels to C++, and the plan on the slide reads "Use Agents!" Part 1's theme shows up again here.

<!-- b:torch-compile-anatomy-3-29 -->
Graph breaks are moving too. In Part 1 of this series I said a graph break shortens the graph and narrows the room for fusion, and the problem grows with call depth. According to the description of [Nested Graph Breaks](https://pytorch.org/blog/core-pytorch-sessions-at-pytorch-conference-north-america-2026/), O(N) duplicate graph breaks in a call O(N) levels deep are reduced to O(1), so larger graphs can be captured.

<!-- b:torch-compile-anatomy-3-30 -->
There is also a new path for cases that don't need Dynamo. [Lightweight FX Tracing in PyTorch](https://events.linuxfoundation.org/pytorch-conference-north-america/program/schedule/?id=1256183) starts from feedback that Dynamo is too heavy for users who need a full graph, and proposes a lightweight tracing path based on `make_fx`. It isn't a replacement for Dynamo. It targets cases that fit its conditions, such as workloads that can be replayed as CUDA Graphs.

<!-- b:torch-compile-anatomy-3-31 -->
### Dynamic shapes: where guards have to go

<!-- b:torch-compile-anatomy-3-32 -->
I did not attend the next two sessions, so these are based on their descriptions. Part 1 of the series introduced guards as part of Dynamo's output. A guard checks that assumptions made at capture time, such as shapes, still hold, and when they break, recompilation follows. In serving, however, input length changes all the time, and you can't recompile every time it does.

<!-- b:torch-compile-anatomy-3-33 -->
[From Backed to Unbacked](https://pytorch.org/blog/core-pytorch-sessions-at-pytorch-conference-north-america-2026/) covers **unbacked shapes** for such environments. Backed shapes use example-input values as hints, which can lead to implicit guards and recompilation. Unbacked shapes disallow implicit guards on dynamic shapes, and the challenge is closing the performance gap with the backed approach. [Parametrized Dynamic Shape CUDA Graphs](https://pytorch.org/blog/core-pytorch-sessions-at-pytorch-conference-north-america-2026/) uses torch.compile's symbolic tracing and guard infrastructure to reuse one CUDA Graph across shapes, and reports lower cold-start times for serving. Both carry information from the graph down to the runtime, which is an extension of the structure from Part 1.

<!-- b:torch-compile-anatomy-3-34 -->
### Faster execution: agent workloads and vLLM

<!-- b:torch-compile-anatomy-3-35 -->
Agents are changing workloads as well as development. Agent requests have long context and many turns of conversation and tool calls. While a tool runs, the GPU sits idle but the KV state is still needed. These traits were shaping research on the vLLM side.

<!-- b:torch-compile-anatomy-3-36 -->
- **Waiting less:** vLLM Roadmap covered removing the CPU synchronization that stalls the GPU, along with kernel fusion and mega-kernels.
- **Checking several tokens at once:** What's New in Inference in October and the enterprise inference session covered speculative decoding as a way to improve responsiveness.
- **Keeping KV longer and cheaper:** [Native Tiered KV Cache Offloading in vLLM](https://events.linuxfoundation.org/pytorch-conference-north-america/program/schedule/?id=1254938) uses CPU memory as a hub. It frees GPU memory first and handles transfers to storage or other nodes asynchronously.

<!-- b:torch-compile-anatomy-3-37 -->
torch.compile doesn't solve these alone. KV offloading, for example, grows the prompt cache but doesn't by itself raise decode throughput. The TPU mega-kernel demo also said kernel optimization is only one piece, and needs prefill/decode disaggregation and cache reuse alongside it. I heard the same message in several sessions: measuring a single kernel is not enough.

<!-- b:torch-compile-anatomy-3-38 -->
### Where the two keywords meet

<!-- b:torch-compile-anatomy-3-39 -->
Agent and Acceleration meet directly in kernel optimization. I did not attend these sessions, and the numbers are the ones reported in the [session descriptions](https://pytorch.org/blog/agentic-ai-and-next-gen-intelligence-sessions-at-pytorch-conference-north-america-2026/). **KernelAgent** uses multiple agents that read GPU hardware-performance signals to improve Triton kernels, reporting an average 1.56x speedup over default torch.compile. The Helion autotuning session reports up to 10x faster tuning by adding LLM-suggested candidates to the search. In this direction, agents refine through repeated experiments what the compiler used to decide alone. Even so, kernel generation success rate has to be kept separate from real performance and numerical accuracy.

<!-- b:torch-compile-anatomy-3-40 -->
---

<!-- b:torch-compile-anatomy-3-41 -->
## Part 3. How NPU companies are joining the ecosystem {#part3}

<!-- b:torch-compile-anatomy-3-42 -->
Part 2 of this series compared **which of the three stages** each company enters through. My impression from this conference is that the competition has moved one step further. Let's look at what they are building after connecting, using the framework from a Huawei talk.

<!-- b:torch-compile-anatomy-3-43 -->
[Boosting PyTorch's Heterogeneous Compute Ecosystem](https://events.linuxfoundation.org/pytorch-conference-north-america/program/schedule/?id=1348281) starts from the problem that most code is GPU-centric, which makes it hard for NPUs to get in. It then divides the work into **Integrate, Perform, and Verify**. Hardware support doesn't end at running operators. It includes distributed execution, compilation, and testing. I also remember the speakers saying they were looking for people to build the NPU ecosystem with them.

<!-- b:torch-compile-anatomy-3-44 -->
### Integrate: connecting to common interfaces

<!-- b:torch-compile-anatomy-3-45 -->
The foundation is PrivateUse1, which we covered in Part 2. On top of it, the reference implementation OpenReg and the device-agnostic `torch.accelerator` API are paving an official path for vendors to follow. `torch.accelerator` replaces branches written for CUDA with device-independent code. On this base, Huawei connects FSDP2, DTensor, and communication backends to support distributed training.

<!-- b:torch-compile-anatomy-3-46 -->
### Perform: IBM Spyre extends Inductor

<!-- b:torch-compile-anatomy-3-47 -->
On performance, the IBM Spyre case was the most concrete. Part 2 said Spyre uses Inductor's code generation stage, and the talk [Integrating the IBM Spyre Accelerator](https://events.linuxfoundation.org/pytorch-conference-north-america/program/schedule/?id=1256168) and [IBM's official post](https://pytorch.org/blog/extending-inductor-for-the-ibm-spyre-accelerator/) show what that looks like in practice.

<!-- b:torch-compile-anatomy-3-48 -->
Spyre is a dataflow accelerator with 32 cores, each with its own 2 MB scratchpad. Data moves in 128-byte units called sticks, and work division across cores has to be decided at compile time. So Inductor's GPU-shaped assumptions failed in three places: tensor layout, scratchpad management, and core assignment. torch-spyre solves these with custom passes before scheduling and reuses the rest of Inductor as is.

<!-- b:torch-compile-anatomy-3-49 -->
As a result, the roughly 273,000 lines of the old compiler stack became roughly 38,600 lines, **about one-seventh**. That is code size, not a 7x speedup. IBM is also clear that this wasn't a drop-in swap and took substantial extensions. The core passes are still wired in through a monkey-patch, and discussion with upstream on turning that into a formal extension point is ongoing. The open-source tile IR [KTIR](https://pytorch.org/blog/your-guide-to-hardware-acceleration-compute-infrastructure-at-pytorch-conference-north-america-2026/) and the [device-aware tensor layouts](https://pytorch.org/blog/core-pytorch-sessions-at-pytorch-conference-north-america-2026/) proposal follow the same pattern. A vendor solves its own problem, then brings the extension back upstream.

<!-- b:torch-compile-anatomy-3-50 -->
Not everyone takes the same road. The comparison below is based on public session descriptions and articles.

<!-- b:torch-compile-anatomy-3-51 -->
| | Connection | Where it touches torch.compile | Key tools |
| --- | --- | --- | --- |
| **Huawei Ascend** | PrivateUse1 | Inductor and Triton code generation | Precision verification tooling, CRCR |
| **IBM Spyre** | PrivateUse1 + OpenReg | Inductor extensions + MLIR backend | KTIR, Dataflow Scheduler |
| **AWS Trainium** | PrivateUse1 | Sub-module compilation | TorchNeuron |
| **Google TPU** | Dispatcher integration | ATen-to-StableHLO lowering | TorchTPU |

<!-- b:torch-compile-anatomy-3-52 -->
Google's TorchTPU presented an ATen-to-StableHLO lowering path. It also acknowledged that changing the device name doesn't deliver peak performance, and that GPU assumptions left in shapes, sharding, and ops have to be fixed. From Korea, Rebellions held a sponsored session. According to its public description, it covered device-persistent tensors that reduce host-device transfers in serving.

<!-- b:torch-compile-anatomy-3-53 -->
### Verify: checking accuracy and keeping up with upstream

<!-- b:torch-compile-anatomy-3-54 -->
Verification was stressed as much as integration and performance. First, numerical verification. Huawei's [Advancing torch.compile for Verifiable Precision & Dynamic Shapes](https://events.linuxfoundation.org/pytorch-conference-north-america/program/schedule/?id=1253426) asks how well compiled results preserve eager numerical behavior. Accumulation order, arithmetic rewrites, and type promotion can all change the result of the same formula. The Scheduler Anchored Kernel Verifier records FX semantics during scheduling, feeds the same input to the reference graph and the generated kernel, and compares them. On a mismatch, it leaves reproduction data.

<!-- b:torch-compile-anatomy-3-55 -->
Next is keeping up with upstream, where the CI from Part 1 comes back. The **Cross-Repository CI Relay (CRCR)** forwards PyTorch PR events to external repositories so compatibility with out-of-tree backends can be checked before merge. According to the session description, it reduced breakage detection from days to minutes for Ascend and RISC-V backends. Huawei adds device-agnostic test reuse, draws on more than 580K community test cases, and reports stable releases within 30 days of each upstream update.

<!-- b:torch-compile-anatomy-3-56 -->
The most interesting case for me is where this meets Agent. Spyre reached L2 of CRCR's four levels, and according to [its public post](https://pytorch.org/blog/from-upstream-changes-to-downstream-confidence-inside-torch-spyres-integration-with-pytorch-crcr/), **an agentic pipeline picked which of PyTorch's tens of thousands of tests matter on its hardware**. The reason for each choice is recorded in a config file that people can review, and tests are re-bucketed using logs from real hardware. Moving from PyTorch 2.13 to 2.14 meant evaluating only about 4,000 changed tests. The pattern from Part 1, where agents propose and people decide, is the same one helping an NPU company join the ecosystem.

<!-- b:torch-compile-anatomy-3-57 -->
---

<!-- b:torch-compile-anatomy-3-58 -->
## Conclusion

<!-- b:torch-compile-anatomy-3-59 -->
Let me sum up the conference with the two keywords. **Agent** lowered the cost of producing code, which made verification and structure matter more. **Acceleration** widened from generated code to compile cost and the whole runtime. NPU companies are coming into the common foundation where these two trends build up, and giving what they solve back upstream. The "road opened to the outside" from Part 2 is now being widened by many more companies.

<!-- b:torch-compile-anatomy-3-60 -->
As a developer at a chip company, I took away two things. First, what you need may already exist or be in progress in PyTorch or vLLM, so look in the common foundation before building anything. Second, hardware-specific judgment doesn't go away even on a common foundation. As Spyre shows, the time saved by reuse moves to the hard problems unique to your hardware. As I said in Part 2, our LPU takes the normalized graph and generates kernels with [Legato]({{< ref "/posts/what-is-legato" >}}). These two days left me thinking harder about what to leave to the common foundation and what to build ourselves.

<!-- b:torch-compile-anatomy-3-61 -->
That wraps up this three-part series on `torch.compile()`. This field moves so fast that half of this post may be old news by this time next year. Thanks for reading this long post.

<!-- b:torch-compile-anatomy-3-62 -->
## Reference

<!-- b:torch-compile-anatomy-3-63 -->
**Official conference material**

<!-- b:torch-compile-anatomy-3-64 -->
- [PyTorch Conference North America 2026 recap](https://www.pytorch.org/blog/pytorch-conference-north-america-2026-accelerating-open-intelligence-together)
- [Core PyTorch Sessions](https://pytorch.org/blog/core-pytorch-sessions-at-pytorch-conference-north-america-2026/)
- [vLLM Sessions](https://pytorch.org/blog/vllm-sessions-at-pytorch-conference-north-america-2026/)
- [Agentic AI and Next-Gen Intelligence Sessions](https://pytorch.org/blog/agentic-ai-and-next-gen-intelligence-sessions-at-pytorch-conference-north-america-2026/)
- [Hardware Acceleration & Compute Infrastructure Guide](https://pytorch.org/blog/your-guide-to-hardware-acceleration-compute-infrastructure-at-pytorch-conference-north-america-2026/)

<!-- b:torch-compile-anatomy-3-65 -->
**Session slides**

<!-- b:torch-compile-anatomy-3-66 -->
- [A Developer's Guide to Attention in vLLM (PDF)](https://sessionize.com/download/inrafsed~NeBAc63TLXzTxrF9c3MmwR.pdf~a-developers-guide-to-attention-in-vllm.pdf)
- [Speeding Up torch.compile: A New FakeTensor (PDF)](https://sessionize.com/download/icpakbex~fQvBrdWRtMhCbgNzRwhrvg.pdf~cpp-faketensor-pytorch-conference-na-26.pdf)
- [Lightweight FX Tracing in PyTorch (PDF)](https://sessionize.com/download/kyadqeo~fgCQhdDpNxNr1EzEpC3Xdj.pdf~light-weight-fx-tracing-in-pytorch-ptc-26.pdf)
- [Integrating the IBM Spyre Accelerator (PDF)](https://sessionize.com/download/ickazseq~HyY4icEtmAdSeRgNSBjyYB.pdf~integratingibmspyre.pdf)

<!-- b:torch-compile-anatomy-3-67 -->
**Docs and articles**

<!-- b:torch-compile-anatomy-3-68 -->
- [vLLM Contributing Guide](https://docs.vllm.ai/en/v0.28.0/contributing/)
- [Extending Inductor for the IBM Spyre Accelerator](https://pytorch.org/blog/extending-inductor-for-the-ibm-spyre-accelerator/)
- [From Upstream Changes to Downstream Confidence](https://pytorch.org/blog/from-upstream-changes-to-downstream-confidence-inside-torch-spyres-integration-with-pytorch-crcr/) — Spyre's CRCR integration
- [Google and Meta open-source TorchTPU (InfoQ)](https://infoq.com/news/2026/10/google-meta-torchtpu)

<!-- b:torch-compile-anatomy-3-69 -->
**HyperAccel**

<!-- b:torch-compile-anatomy-3-70 -->
- [Legato documentation](https://legato-docs.hyperaccel.net/latest/)
- [PyTorch Conference 2025 report]({{< ref "/posts/pytorchcon2025-report" >}})

<!-- b:torch-compile-anatomy-3-71 -->
## P.S. HyperAccel is hiring!

<!-- b:torch-compile-anatomy-3-72 -->
![Bertha, HyperAccel's LPU chip. A die engraved with HYPER ACCEL and Bertha sits at the center of the package, with wiring and pads extending around it](images/bertha-chip.jpg)

<!-- b:torch-compile-anatomy-3-73 -->
HyperAccel builds a new kind of chip, the LPU, and we are also a team that develops right alongside the latest in software. As this post shows, the software stack around new hardware is still changing fast, and we work at its leading edge.

<!-- b:torch-compile-anatomy-3-74 -->
If you'd like to join the research and development that lets users work with new devices the way they already work, apply at [HyperAccel Career](https://hyperaccel.career.greetinghr.com/ko/guide)!
