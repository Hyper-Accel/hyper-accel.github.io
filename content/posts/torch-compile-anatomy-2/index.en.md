---
date: '2026-10-12T18:00:00+09:00'
title: '[Exploring torch.compile() - Part 02] Why Split It into Three Stages?'
cover:
  image: "images/pytorch.jpg"
  alt: "PyTorch logo"
  caption: "PyTorch"
  relative: true
authors: [Hyunjun Park]
tags: ["torch.compile", "PyTorch", "TorchDynamo", "TorchInductor", "AOTAutograd", "PrivateUse1", "Compiler"]
series: ['Exploring torch.compile()']
series_idx: 2
categories: ["Compilers and Kernels"]
summary: 'Why is torch.compile split into Dynamo, AOTAutograd, and Inductor? Starting from how PyTorch grew its ecosystem, we look at who uses the output of each stage, how, and what they gain from it.'
description: 'An ecosystem view of why torch.compile is split into three stages. We trace how PyTorch drew people in by being as easy to use as plain Python and how it has opened up since 2.0, then look at how compiler backends like TensorRT, OpenVINO, and XLA, torch.export, GPUs, and new AI chips each use the outputs of the Dynamo, AOTAutograd, and Inductor stages. Huawei Ascend, Intel Gaudi, and IBM Spyre are compared along the way.'
comments: true
keywords: [
  "torch.compile", "TorchDynamo", "TorchInductor", "AOTAutograd",
  "PrivateUse1", "torch.accelerator", "custom op", "core ATen IR",
  "torch.export", "TensorRT", "OpenVINO", "PyTorch/XLA", "Triton",
  "OpenReg", "Ascend", "Gaudi", "Spyre"
]
---

### Introduction

Hello! I'm Hyunjun Park from the CL (Compute Library) team at HyperAccel. In [Part 1]({{< ref "/posts/torch-compile-anatomy" >}}) we took `torch.compile()` apart into three components: TorchDynamo, AOTAutograd, and TorchInductor (Dynamo and Inductor from here on). Dynamo pulls a graph out of Python code, AOTAutograd tidies that graph up, and Inductor turns the tidied graph into kernels. (Part 1 covers what a graph is, if you need a refresher.)

Part 1 explained the three components that make up `torch.compile()`. This post starts from a question: why did PyTorch bother splitting it into three stages? What do you gain from that split, and who is it for?

I think the answer has less to do with technology than with ecosystems. So we'll first look at how PyTorch drew people in and built its ecosystem, and which direction it has been widening that ecosystem since 2.0. Then we'll go through what each of the three stages produces and who uses those results, and how, and close with the cases that use this structure most broadly.

Note that this post mixes what PyTorch has officially stated with my own subjective interpretation. I've marked the interpretive parts with phrases like "I think" or "my reading is," so please keep that in mind as you read.

This series runs to three parts. I'll be attending PyTorch Conference 2026 in October 2026, and the third part will cover the latest trends I learn there and what I take away from it.

---

## Part 1. PyTorch, grown by its ecosystem {#part1}

### Software is an ecosystem game

Think about how you pick a messenger app. What you look at first isn't the feature list; it's **where your friends are**. Even when a new messenger with better features comes out, we end up staying on the one where more people already are.

And a messenger with lots of people also gathers features. Gifting, payments, reservations: features that only make sense with lots of users show up, and those features pull in more people. People bring features, and features bring more people. Once that loop gets going, it gets harder and harder for other messengers to win.

Deep learning frameworks work the same way. For users, the rational choice is the framework with the most examples, answered questions, and published models. An environment where one search gets you unstuck is productivity in itself. The same goes for people building libraries and tools: build on the framework with the most users, and your work gets used. For both sides, **choosing what most people already use is the most rational choice.**

![An illustration of the PyTorch ecosystem as a central hub. Developers line up to enter the PyTorch building through its easy-to-use execution mode, surrounded by buildings for Hugging Face models, research, vLLM, and torch.compile (Inductor), with paths leading out to accelerators](images/00-pytorch-ecosystem.webp)

### How PyTorch drew people in

The framework that built this kind of ecosystem best is PyTorch. Around 2017, when PyTorch was first released, the leading framework was TensorFlow. In TensorFlow 1.x, writing code didn't compute anything right away. Code like `y = x * 2 + 1` didn't compute anything; it built a graph that said "compute this later," and the actual computation happened only when you opened a session and ran it. So `print(y)` showed graph info instead of a value, you had to learn graph-specific syntax instead of Python's `if`, and when an error occurred it was hard to tell which line caused it. In PyTorch, the same code computes right away.

```python
# PyTorch
x = torch.tensor(3.0)
y = x * 2 + 1
print(y)    # tensor(7.)
```

PyTorch could simply be used like Python. Each line ran and computed immediately, so you could check intermediate values with `print` and fix the offending line as soon as an error appeared. Researchers, who need to try new ideas quickly, moved to PyTorch first, and TensorFlow itself made the same approach the default starting with 2.0 (2019).

Developers came first, drawn by that convenience, and once they arrived the rest followed. Model hubs like Hugging Face and inference engines like vLLM and SGLang were built on top of PyTorch, and it became harder and harder for developers to find an alternative to PyTorch.

### What torch.compile had to protect

In March 2023, `torch.compile()` arrived with PyTorch 2.0. It keeps the convenience of writing plain Python while boosting performance.

By then, though, PyTorch was already a huge ecosystem. It wasn't just a lot of user code. Tools that take PyTorch models and optimize them their own way were already established. NVIDIA's TensorRT turned PyTorch models into fast inference engines, and Google's PyTorch/XLA was the path for running PyTorch code on TPUs.

I think a new compiler had to protect two things to avoid breaking that ecosystem. First, users should barely have to change their code. Second, tools like these should be able to come inside `torch.compile()`. Had `torch.compile()` been a closed design that only used PyTorch's own compiler and Triton, users would have had to pick between `torch.compile()` and the tools they already relied on, and the ecosystem would have split.

![Timeline of extension features for outside hardware and compilers from PyTorch 2.0 to 2.13: torch.compile and rename_privateuse1_backend in 2.0, automatic dynamic shapes and the Inductor device registration API in 2.1, custom_op in 2.4, device extension autoloading and Intel GPU support in 2.5, torch.accelerator in 2.6, the OpenReg rewrite, Accelerator Integration docs, and Stable ABI in 2.9, expanded integration docs in 2.10, and set_default_backend in 2.13](images/01-release-timeline-en.png)

### Pointing outward

At launch, Inductor could generate two kinds of code: Triton for GPUs and C++ for CPUs. But look at the releases since, and a large share of the new features **open paths for compilers and hardware from outside PyTorch to plug in**: device code generator registration (2.1), Python custom ops (2.4), device extension autoloading and Intel GPU support (2.5), the device-agnostic `torch.accelerator` API (2.6), and official accelerator integration docs (2.9).

In short, instead of building everything itself, PyTorch has been moving toward **adding more paths for outside compilers and hardware to come in**. With each release, there are more public APIs and documents for connecting outside modules. And these paths are possible inside `torch.compile()` because `torch.compile()` was split into three stages in the first place. Part 2 looks at why.

---

## Part 2. Why three stages? {#part2}

### If it were one piece

Let's imagine the opposite: `torch.compile()` as a single monolithic compiler that takes Python code and emits Triton code. A team that wants another compiler like TensorRT would have to do graph capture themselves, interpreting bytecode and setting up guards. A company bringing up new hardware would have to rebuild everything from graph capture to code generation. And when PyTorch improved graph capture, outside users wouldn't get the benefit.

Split it into three stages and connect them with **data in a defined format**, though, and the story changes. Whoever needs a given format can pick up that stage's output, and whoever wants to replace just one stage can keep using the rest as is. You use `torch.compile()` as far as you need, then branch off at the stage you want and attach your own tool.

![The three stages of torch.compile and who uses each stage's output. Python code passes through TorchDynamo, AOTAutograd, and TorchInductor to become kernel code. Dynamo's output, an FX graph plus guards, is consumed by other compiler backends such as TensorRT, OpenVINO, and XLA, and by torch.export. AOTAutograd's output, a core ATen graph, is consumed by backends with their own graph compiler. Inductor's output, kernel code, goes to NVIDIA, AMD, and Intel GPUs through Triton backends, or to new chips through a swapped code generator. Underneath, the dispatcher and PrivateUse1 run the ops that aren't compiled (fallback) directly](images/02-three-stages-en.png)

### Stage 1, Dynamo's output: for anyone who needs a graph

Dynamo produces an FX graph and guards. Extracting a graph from Python code is tricky, but Dynamo does it for you, so other tools only need to take its result.

The main users of Dynamo's output are **other compilers**: separate compilers such as NVIDIA's TensorRT (`backend="torch_tensorrt"`), Intel's OpenVINO (`backend="openvino"`), and Google's XLA (`backend="openxla"`) that take a graph and handle everything from optimization to kernel generation. Pass the name to `backend`, and that compiler does what AOTAutograd and Inductor would do, in its own way. Because it decides even how to group ops, it differs from stage 3, which only changes how the code gets written.

They're used instead of Inductor because they existed before `torch.compile()` and are independent tools tuned for years for their hardware: TensorRT for inference on NVIDIA GPUs, OpenVINO for Intel CPUs and GPUs, and XLA for TPUs, where Triton doesn't run. Handing them the graph is more natural than rebuilding them, and users only change one string.

Let's see it directly by passing `backend` a function that just prints the graph it receives.

```python
import torch
import torch.nn.functional as F


def show_graph(gm, example_inputs):
    print(gm.code)      # print the graph the backend received
    return gm.forward   # run it unchanged


def f(x, w, b):
    return F.relu(F.linear(x, w, b))


x, w, b = torch.randn(2, 16), torch.randn(16, 16), torch.randn(16)
torch.compile(f, backend=show_graph)(x, w, b)
```

Here are the key lines of the output (PyTorch 2.10).

```text
linear = torch._C._nn.linear(l_x_, l_w_, l_b_)
relu = torch.nn.functional.relu(linear)
```

The `F.linear` and `F.relu` the user wrote come through as a graph, as written. The receiver doesn't have to interpret Python; it just processes these ops.

### Stage 2, AOTAutograd's output: fewer ops

Now let's receive the same function after AOTAutograd. Just wrap the `show_graph` from above in `aot_autograd`.

```python
from torch._dynamo.backends.common import aot_autograd
from torch._decomp import core_aten_decompositions

aten_backend = aot_autograd(fw_compiler=show_graph, decompositions=core_aten_decompositions())
torch.compile(f, backend=aten_backend)(x, w, b)
```

```text
permute = torch.ops.aten.permute.default(arg1_1, [1, 0])
addmm = torch.ops.aten.addmm.default(arg2_1, arg0_1, permute)
relu = torch.ops.aten.relu.default(addmm)
```

`linear` has been broken into a transpose (`permute`) and a fused matrix multiply-add (`addmm`), and every op now carries a name from **core ATen**, PyTorch's set of basic ops. This is the decomposition we saw in Part 1.

The value of the graph after this stage is clear from the numbers. PyTorch has more than 2,500 ops counting overloads (as of 2.14), but core ATen has about 190. Take this graph and you **only have to handle about 190 ops instead of 2,500-plus.** That's why backends with their own graph compiler usually take the graph here.

### Stage 3, Inductor's output: swapping only the code generator

The last one sits inside Inductor. Say we compile `y = x * 2 + 1`. Inductor first rewrites the computation as a per-element expression, `y[i] = x[i] * 2 + 1`. Grouping the multiply and the add into one kernel, that is, fusion, is also done at this point. **Which language to write that expression in** is decided at the very end.

Written for a GPU, it becomes Triton code (key lines only).

```python
tmp0 = tl.load(in_ptr0 + x0)      # read x[i]
tmp2 = tmp0 * 2.0                 # * 2
tmp4 = tmp2 + 1.0                 # + 1
tl.store(out_ptr0 + x0, tmp4)     # write y[i]
```

Written for a CPU, the same expression becomes C++. Here is a trimmed version of what PyTorch 2.10 actually generated on a CPU.

```cpp
auto tmp0 = Vectorized<float>::loadu(in_ptr0 + x0);  // read x[i]
auto tmp3 = tmp0 * Vectorized<float>(2.0);           // * 2
auto tmp6 = tmp3 + Vectorized<float>(1.0);           // + 1
tmp6.store(out_ptr0 + x0);                           // write y[i]
```

The two snippets are the same computation written in different languages. The order of reading, multiplying, adding, and writing was already decided by Inductor. Whoever uses this stage replaces only this **"writing" part** with their own.

GPU vendors barely need to change even that. The Triton compiler turns the Triton code above into machine code for each GPU, so AMD and Intel GPUs that Triton supports use the same code as is. A new chip that Triton doesn't fit builds a third way of writing it and registers it with `register_backend_for_device`. Then the same `y[i] = x[i] * 2 + 1` comes out in that chip's language.

That said, the way Inductor groups ops was designed around GPUs and CPUs, and this registration API is still private. If the grouping itself has to be decided around the chip, it's better to take stage 2's output and compile it yourself.

### What doesn't get compiled: fallback and PrivateUse1

`torch.compile()` can't compile everything. Regions split off by graph breaks and ops the compiler doesn't support aren't compiled; they run the original way instead, one line at a time. This is called **fallback**. For new hardware to be really usable, that fallback has to run on the hardware too.

PrivateUse1 solves the fallback. The dispatcher we saw in Part 1 picks a kernel based on which device a tensor lives on, and PyTorch reserves a dispatch key called **PrivateUse1** for devices outside the core. Name it with `torch.utils.rename_privateuse1_backend("npu")` and register a kernel for each ATen op, and fallback ops run on that device too. `tensor.to("npu")`, `torch.accelerator`, and autograd come along with it.

Ops that aren't in ATen are defined with `torch.library.custom_op`. If you also register a fake implementation that only reports the output's shape and dtype, Dynamo can **keep the op as a single node in the graph**, so it works both when code runs line by line and when it is compiled.

### At a glance

| Stage | What it hands over | Who uses it | What they gain |
| --- | --- | --- | --- |
| **Stage 1: Dynamo's output** | A graph of the ops exactly as the user wrote them | Compiler backends like TensorRT, OpenVINO, XLA, plus `torch.export` | No need to interpret Python code |
| **Stage 2: AOTAutograd's output** | A graph with only core ATen ops left | Backends with their own graph compiler | Ops to handle drop from 2,500+ to about 190 |
| **Stage 3: Inductor's output** | A per-element expression with grouping already done | GPUs supported by Triton, new chips with a swapped code generator | Only the "writing" part needs to be built |
| **Fallback: the dispatcher** | One op that wasn't compiled (run directly) | Every device | Non-compiled parts still run on that device |

---

## Part 3. How chips that aren't GPUs use this structure {#part3}

The companies that use this structure most broadly are the ones building AI chips that aren't GPUs, commonly called **Neural Processing Units (NPUs)**. Triton often doesn't fit them as is, so they have to come in directly at stage 2 or 3, and they have to handle fallback themselves too. Part 3 takes a quick look at three companies that actively use `torch.compile()`.

### Huawei Ascend: both stage 2 and 3

Huawei's Ascend uses **both stage 2 and stage 3**. At stage 2, a backend called TorchAir takes the tidied graph and hands it to Ascend's own graph engine. At stage 3, it registers an Ascend code generator with Inductor. The device is connected by naming PrivateUse1 `npu`.

### Intel Gaudi: stage 2

Intel Gaudi uses **stage 2's output**. A backend called `hpu_backend` takes the tidied graph and hands it to Gaudi's own graph compiler, without going through Inductor. The `hpu` device isn't PrivateUse1 but a device type built into PyTorch core.

### IBM Spyre: stage 3

IBM's Spyre uses **stage 3**. It registers a Spyre code generator with Inductor, so the computation Inductor grouped is written out as Spyre code, and IBM's own compiler handles the final step. The device is connected by naming PrivateUse1 `spyre`. Spyre used to bypass Inductor, and according to a [talk abstract](https://pytorchconferenceeu2026.sched.com/event/2Hiqa), moving to stage 3 let them cut a large part of their own compiler code.

### Side by side

| | Stage used | How it connects | Device |
| --- | --- | --- | --- |
| **Huawei Ascend** | ② + ③ | ②: TorchAir → its own graph engine / ③: code generator registered with Inductor | PrivateUse1 `npu` |
| **Intel Gaudi** | ② | `hpu_backend` → its own graph compiler | Built-in `hpu` |
| **IBM Spyre** | ③ | Code generator registered with Inductor → its own compiler | PrivateUse1 `spyre` |

All three reuse stage 1 Dynamo's graph capture as is and handle fallback on their own devices. Where they differ is whether they take the graph at stage 2 or stage 3, that is, **"how many hardware decisions to leave to Inductor."** The more you leave to it, the less you build; the less you leave, the more you decide for your hardware yourself.

For reference, HyperAccel's LPU takes stage 2's output like Gaudi does, and builds kernels with our own language, [Legato]({{< ref "/posts/what-is-legato" >}}). See the [Legato documentation](https://legato-docs.hyperaccel.net/latest/) for details.

---

## Conclusion

Back to the opening question: why is `torch.compile()` split into three stages? I see two reasons.

The first is technical. Extracting a graph from Python code (Dynamo), cleaning that graph up into standard ops (AOTAutograd), and generating code for hardware (Inductor) are very different jobs. Keeping them separate lets each evolve on its own and makes it easy for other tools to pick up the intermediate results.

The second is about the ecosystem. PyTorch drew in researchers and developers by being as easy to use as plain Python, models and tools piled up on top of it, and it became the de facto standard. When it built `torch.compile()` to tackle the next challenge, speed, PyTorch designed each stage's output so outside compilers and hardware could pick it up. The official PyTorch 2.0 introduction states the goal of simplifying the backend (compiler) integration experience, and explains that the reduced op set is there to help vendors simplify their integrations. So other compilers like TensorRT take stage 1's output, those with their own graph compiler take stage 2's output, new hardware comes in at stage 3, and whatever isn't compiled is caught by PrivateUse1.

And vendors are in fact flocking to these paths. As we saw in Part 3, companies building accelerators beyond GPUs, NPUs in particular, are coming in at whichever stage suits them, and PyTorch keeps paving those paths with official APIs and documentation release after release. I can't claim this was a strategy PyTorch planned from day one. But in messenger terms, my reading is that a platform with plenty of people opened paths to the outside, new participants are flocking in through them, and the ecosystem is growing beyond GPUs.

Next time, I'll widen the view a little and share what I took away from PyTorch Conference 2026, held October 20–21 in San Jose. Thanks for reading this long post.

## Reference

**PyTorch documentation and blog**

- [PyTorch 2.0 release blog](https://pytorch.org/blog/pytorch-2.0-release/) — the launch of `torch.compile()`
- [Get Started with PyTorch 2.0](https://docs.pytorch.org/get-started/pytorch-2.0/) — the stated goal of simplifying backend integration
- [Custom Backends](https://docs.pytorch.org/docs/main/user_guide/torch_compiler/torch.compiler_custom_backends.html) — attaching a backend to the output of stages 1 and 2
- [torch.compiler](https://docs.pytorch.org/docs/2.10/user_guide/torch_compiler/torch.compiler.html) — list of available backends
- [torch.export](https://docs.pytorch.org/docs/2.14/user_guide/torch_compiler/export.html) — deployment export built on Dynamo graph capture
- [IRs (Core ATen IR)](https://docs.pytorch.org/docs/stable/user_guide/torch_compiler/torch.compiler_ir.html) — the list of core ATen ops
- [Accelerator Integration](https://docs.pytorch.org/docs/2.9/accelerator/index.html) — guide to PrivateUse1-based accelerator integration
- [Python Custom Operators](https://docs.pytorch.org/tutorials/advanced/python_custom_ops.html) — `torch.library.custom_op`
- [Autoloading Out-of-Tree Extension](https://docs.pytorch.org/tutorials/unstable/python_extension_autoload.html) — device extension autoloading
- [Intel GPU Support Now Available in PyTorch 2.5](https://pytorch.org/blog/intel-gpu-support-pytorch-2-5/)
- [OpenReg: A Self-Contained PyTorch Accelerator Simulator](https://pytorch.org/blog/openreg/)
- [PyTorch 2.9 Release Blog](https://pytorch.org/blog/pytorch-2-9/) — LibTorch Stable ABI
- [PyTorch v2.13.0 Release Notes](https://github.com/pytorch/pytorch/releases/tag/v2.13.0) — `torch.compiler.set_default_backend`

**Compilers and hardware using each stage**

- [TensorRT Backend for torch.compile](https://docs.pytorch.org/TensorRT/user_guide/compilation/torch_compile.html), [PyTorch/XLA TorchDynamo Integration](https://docs.pytorch.org/xla/master/perf/dynamo.html)
- [Accelerate PyTorch Models using torch.compile on AMD GPUs with ROCm](https://rocm.blogs.amd.com/artificial-intelligence/torch_compile/README.html)
- [Ascend Extension for PyTorch (torch_npu)](https://github.com/Ascend/pytorch), [TorchAir](https://github.com/Ascend/torchair), [Triton-Ascend](https://github.com/Ascend/triton-ascend)
- [Intel Gaudi PyTorch Theory of Operations](https://docs.habana.ai/en/latest/PyTorch/PyTorch_Gaudi_Theory_of_Operations.html), [Gaudi PyTorch Support Matrix](https://docs.habana.ai/en/latest/PyTorch/Reference/PyTorch_Support_Matrix.html), [Gaudi PyTorch Bridge](https://github.com/HabanaAI/gaudi-pytorch-bridge)
- [torch-spyre](https://github.com/torch-spyre/torch-spyre), [torch-spyre compiler architecture](https://torch-spyre.readthedocs.io/en/latest/compiler/architecture.html), [IBM Research: PyTorch support for IBM Spyre](https://research.ibm.com/blog/pytorch-support-ibm-spyre), [PyTorch Conference Europe 2026 talk](https://pytorchconferenceeu2026.sched.com/event/2Hiqa)

**HyperAccel**

- [Legato documentation](https://legato-docs.hyperaccel.net/latest/)
- [Legato, A Programming Language for HyperAccel LPU]({{< ref "/posts/what-is-legato" >}})

## P.S. HyperAccel is hiring!

![Bertha, HyperAccel's LPU chip. A die engraved with HYPER ACCEL and Bertha sits at the center of the package, with wiring and pads fanning out around it](images/bertha-chip.jpg)

HyperAccel builds a new chip called the LPU, but we're also a team that follows the latest software trends up close and builds right at the front line. As with the `torch.compile()` ecosystem in this post, the software stack around new hardware is still changing fast, and that's where we work.

If you'd like to join the research and development that lets users run new devices comfortably, with the tools they already know, apply through [HyperAccel Career](https://hyperaccel.career.greetinghr.com/en/guide)!
