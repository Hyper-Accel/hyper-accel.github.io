---
date: '2026-10-08T16:00:00+09:00'
draft: true
title: 'Verifying an LLM Inference Chip, Part 1: Where Does the Ground Truth Come From?'
cover:
  image: "images/cover.en.webp"
  alt: "A spec document and an AI model, each connected by an arrow to a chip marked with a question mark"
  caption: "Does a chip's ground truth come from the spec document or from the AI model?"
  relative: true
authors: [Yujeon Chang]
tags: ["Verification", "RTL", "Reference Model", "bit-exact", "LLM Inference"]
categories: ["AI Hardware", "Semiconductor"]
series: ["Verifying an LLM Inference Chip"]
series_idx: 1
summary: "When an AI model and the chip's design code (RTL) disagree, who is wrong? This post covers where the ground truth comes from at each level of LLM inference chip verification, and how splitting the comparisons makes it clear who owns a mismatch."
description: "Where does the ground truth come from in LLM inference chip verification? We explain why the block level treats the spec document as ground truth, why the top level uses the AI model's output, and what each comparison in between catches."
comments: true
---

<!-- Translated from index.ko.md. Keep both files in sync. -->

> This post is Part 1 of the **Verifying an LLM Inference Chip** series.
> Part 1 covers where the "ground truth" in verification comes from.
> Part 2 will cover how an emulator gets past the limits of slow simulation, and when you can say verification is done.

## Introduction

Hello, I'm Yujeon Chang from the HyperAccel DV team.
This post is about how we decide what counts as the "right answer" when verifying a **Large Language Model (LLM)** inference chip.
We'll use HyperAccel's actual verification flow as the example.

When an AI model and the chip's design code (RTL) give different answers, who is wrong?

Say we feed the same prompt into two places.
One is the AI model running in PyTorch. The other is the chip we designed.
Dozens of tokens come out identical, and then one position differs.
Is the chip wrong, or is the model?
Or are both right?

If it were a software bug, you would fix it and redeploy.
Chips don't work that way.
Once a chip is manufactured, its circuits cannot be changed.
Fixing a bug means changing the design and manufacturing the chip again.
That costs months and a lot of money.

So before manufacturing, we have to make as sure as we can that the design is correct.
This work is called **verification**.

When people hear "verification," they often think of testbench languages or tools like the **Universal Verification Methodology (UVM)**.
This post skips the tools and asks a more basic question.
What do you compare against before you can say something is "correct"?
In other words, where does a chip's **ground truth** come from?

This post makes two claims.

1. There is no single ground truth. Each verification level gets its ground truth from a different source.
2. Each comparison changes only one thing where possible. That way, just knowing which comparison failed tells you whose problem it is.

## Verification Comes Down to Comparison

First, a few terms used throughout this post.

- **Register Transfer Level (RTL)**: The design code that describes how the chip behaves. It is written in a hardware description language such as Verilog and can be run in a simulator.
- **Block and Top**: A chip is divided into blocks. Block-level verification checks one block in isolation. Top-level verification checks the whole chip with all blocks connected.
- **Reference model**: Software that takes the same input as the RTL and computes the expected output. We check whether the RTL's output matches it.
- **bit-exact**: Two results match down to the last bit. No error is tolerated at all.

Verification comes down to comparison.
You feed the same input into two implementations and compare the outputs.
If they differ, something is wrong somewhere.
But what you compare against determines which problems you can find.

<!-- Diagram source: images/comparison-chain.en.svg (re-export to webp after editing) -->
![At the block level, the block RTL and the reference model, both derived from the spec document, are compared bit-exact. At the top level, five comparisons connect the HF model's CPU and GPU goldens, fsim's torch and rtl modes, the RTL on ZeBu, and the Top RTL in top-level simulation](images/comparison-chain.en.webp)

The table below lists every comparison covered in this post.

| # | Comparison | Criterion | What it catches |
|---|---|---|---|
| ① | Block RTL ↔ reference model | bit-exact | Implementation that deviates from the spec |
| ② | Top RTL ↔ fsim (rtl) | bit-exact | Integration errors between blocks, differing spec interpretations |
| ③ | fsim (torch) ↔ HF golden (CPU) | tolerance | Spec and algorithm errors, compiler errors |
| ④ | fsim (rtl) ↔ HF golden (GPU) | tolerance | Errors in rtl mode, spec and algorithm errors |
| ⑤ | RTL (ZeBu) ↔ fsim (rtl) | bit-exact | Differences between rtl mode and the RTL, errors in the RTL itself |

There is one important principle here.
**Each comparison changes only one thing where possible.**

If you are a software engineer, think of `git bisect`.
`git bisect` halves a range of commits until it finds the one that introduced a bug.
Comparisons work in a similar way.
If two implementations differ in only one thing, the cause of a mismatch narrows down to that one thing.
So just knowing which comparison broke tells you whose problem it is.

In practice, though, some comparisons can't keep to this principle.
We will see an example when we run a real model.

## Block Level (①): The Spec Document Is the Ground Truth

At the block level, the ground truth is the **spec document**.
More precisely, it is a reference model that a verifier builds separately, using only the spec document.

At HyperAccel, RTL design and verification are handled by separate, independent teams.
Block-level reference models are built by verifiers.
They are based on the RTL spec document.
Verifiers do not look at the RTL code to build the reference model.

Why go to this trouble?
If the same person implements something twice with the same thinking, they tend to repeat the same mistakes.
When two implementations share a mistake, their results match perfectly.
And the bug passes without any warning.
A reference model is only meaningful if it is built independently of the RTL.

At the block level, the RTL and the reference model are compared bit-exact.
They are two implementations of the same spec, so they should match down to the last bit.

We do not compare the block reference model against PyTorch.
At the block level, the spec is the only ground truth.
Comparing against the AI model is the job of the top level.

### When Independence Breaks Even With Separate Teams

Separate teams don't automatically mean independence.
In general, in the following three cases, separate teams still end up sharing the same errors.

1. **Using the designer's model as-is**: The verification team adopts a model built by the designer as its reference.
2. **Asking the designer about an ambiguous spec**: The verifier asks the designer about an unclear part of the spec and builds the testbench from that answer.
3. **Deriving expected values from the RTL**: The verifier reads the RTL code instead of the spec to compute expected values.

In all three cases, the designer's interpretation leaks into verification.
At that point, the two implementations are no longer independent.

HyperAccel's structure avoids the first and third cases.
Verifiers build the reference model themselves, and it is based on the spec document, not the RTL.

The second case is hard to avoid entirely.
That's because designers write the spec document.
While verifying, verifiers find ambiguous parts and ask the designer.
The designer interprets them and updates the spec document.

The key point is that the answer ends up in the **spec document**.
Verifiers don't just apply the answer to their testbench.
The updated document becomes the reference for both design and verification again.
The ground truth stays in a single document.

Still, the interpretation itself belongs to the designer.
If that interpretation is wrong, the RTL and the reference model are wrong together.
Let's look at this limitation next.

### The Limit: If the Spec Is Wrong, Both Are Wrong the Same Way

The block-level structure has a clear limitation.
Designers and verifiers both read the **same spec document**.
And designers write that document.

What if the spec document itself is wrong?
The designer builds the RTL according to the wrong spec.
The verifier builds the reference model according to the same wrong spec.
Both results are wrong in the same way, so they match perfectly.

What block-level verification proves is that "the RTL was built according to the spec."
It cannot prove that "the spec is correct."

To check whether the spec is correct, you need a ground truth that does not go through the spec document.
That ground truth lives at the top level.

## Top Level: The AI Model's Output Is the Ground Truth

At the top level, the ground truth is not the spec document but **the actual AI model's output**.

This ground truth has a different source than the spec document.
The AI model was not built by reading the spec document.
That is why errors in the spec itself, which the block level misses, show up here.

[Transformer World](/en/posts/what-is-the-transformers/) introduced the attention operation.
The top level is where we check that this operation produces the same values on the chip.

### The HF Golden, fsim, and the Compiler

The top-level ground truth is the output of the original model published on **Hugging Face (HF)**, run in PyTorch.
It goes through neither the hardware nor the compiler, making it the outermost ground truth.
In verification, a reference result like this is called a **golden**.

However, we do not compare the HF golden directly against the RTL.
RTL simulation is too slow to run an entire LLM, and before the chip exists there is nowhere to try out the compiler.
So we use fsim, a software model that mimics the chip's behavior.
fsim also splits the large gap between the HF golden and the RTL into two steps, which helps narrow down the cause when results diverge.

fsim is built by the simulator team.
That is a third team, separate from both design and verification.
Like the verification team, the simulator team builds fsim from the spec document.
In effect, there is one more independent implementation that starts from the same spec.

fsim is also completely separate from the block reference models.
It is not built by stitching block reference models together.
So even if a block reference model has a mistake, that mistake does not carry over into top-level comparisons.

fsim has two modes: torch mode and rtl mode.
torch mode is used for fast debugging and functional verification.
rtl mode is a C model (cmodel) that follows the chip's behavior exactly, aiming to produce results identical to the RTL down to the bit.

To run an AI model on the chip, a compiler has to turn the model into a program the chip can execute.
HyperAccel is moving this work to its own compiler, [Legato](/en/posts/what-is-legato/).
Before Legato, we used RefAsm (reference assembly), assembly written by hand.
In this post, we refer to both as "the compiler."
fsim and the RTL on ZeBu both run the program produced by this compiler.

### Top-Level Simulation (②): Do the Values Match fsim?

Before running an AI model, the verification team first checks the connections between blocks with fast top-level tests built in UVM.
Part 2 covers those tests in detail; here we look at the tests that compare values.

Integration errors that don't appear when looking at one block at a time show up as value differences once the blocks are connected.

The top-level scenarios used here are also built by the verification team, and their expected values come from fsim in rtl mode.
The Top RTL and rtl-mode fsim are compared bit-exact (② in the table).

What this comparison catches and misses is clear.
The Top RTL and fsim were built by different teams from the same spec document.
So when they disagree, it reveals a place where the same spec was interpreted differently.
Conversely, if the spec itself is wrong, both are wrong the same way and pass this comparison.
To catch spec errors, you have to compare against the HF golden, which does not go through the spec.

## Three Steps With a Real Model

Verification with a real AI model is built up in three steps.
The simulator team and the compiler team first develop fsim and the compiler separately, then run them together in one environment.

### Step 1 (③): torch Mode and the CPU Golden, Function First

torch-mode fsim runs the compiler's output.
That result is compared with the golden from running the HF model on a CPU.
A small error is tolerated, roughly the size of the difference you get when running the same computation on a CPU versus a GPU.
This step quickly checks that the functionality is right.

### Step 2 (④): rtl Mode and the GPU Golden, Closer to the Chip

Next, rtl-mode fsim runs the compiler's output.
That result is compared with the golden from running the HF model on a GPU.
A GPU's precision and arithmetic are closer to the chip's than a CPU's are.
That allows more precise debugging, and it validates rtl mode itself at the same time.
This comparison also tolerates a small error.

### Step 3 (⑤): The RTL on ZeBu and rtl Mode, Down to the Bit

Finally, the same compiler output runs on the actual RTL.
The RTL runs on **ZeBu**, an emulator from Synopsys.
An emulator loads the RTL onto dedicated hardware and runs it far faster than a simulator.
Part 2 will cover emulators in more detail.

In this step, rtl-mode fsim and ZeBu are compared bit-exact.
We compare not only the output tokens but also the data left in DRAM (a DRAM dump).
This checks that rtl-mode fsim and the actual RTL produce exactly the same results, and that the RTL itself has no problems.

### The Ground Truth Is Passed Down Step by Step

Looking at the three steps through the "change only one thing" principle is interesting.

Step 3 (⑤) is where the principle holds best.
Both sides run the same compiler output; only the executor changes from fsim to the RTL.
So when there is a mismatch, the cause narrows down to rtl-mode fsim versus the RTL.

Steps 1 and 2 (③, ④), on the other hand, break the principle.
Compared with the HF golden, two things differ at once: the compiler and fsim.
When there is a mismatch, this comparison alone can't tell you which one is wrong.

So in these steps, we analyze against the HF golden to decide which side is wrong.
We don't stop at the final output; we match intermediate results layer by layer against the golden.
Finding the first layer where the results diverge narrows down the cause.
A comparison that breaks the principle comes with this analysis cost.
In a way, it shows why the principle of splitting comparisons matters.

In short, the ground truth is passed down one step at a time.
The HF golden is the ground truth for fsim, and rtl-mode fsim in turn is the ground truth for the RTL.

This division of roles is similar to CPU verification.
In general, CPU verifiers check that each instruction behaves according to the spec.
The results of programs built from those instructions are the responsibility of the compiler and software.
Chip verification works the same way.
Whether the chip behaves according to the spec is the job of the bit-exact comparisons between the RTL and fsim.
Whether the model runs correctly is the job of the comparisons against the HF golden, through the compiler.

## Tolerance Hides Small Bugs

Look at the criterion column in the comparison table again.
Every comparison that directly involves the RTL is bit-exact.
The only places that tolerate error are the two comparisons between fsim and the HF golden (③, ④).
That's because fsim and the HF golden can both be correct and still differ in the last bits.
Even PyTorch gives slightly different results on a CPU and a GPU.
Floating-point results depend on the order of addition, and CPUs and GPUs differ in the order and method of their arithmetic.

Tolerating error makes the comparison possible.
But it comes at a cost.
**Tolerance hides small bugs.**

Here is a hypothetical example.
Suppose the compiler picks the wrong rounding mode for one particular operation.
This error changes only the last few bits of the result.
If the difference is about the size of a CPU-versus-GPU difference, it falls within the tolerance and passes ③ and ④.
⑤ is bit-exact, but it doesn't catch this error either.
That's because both sides run the same compiler output.

That is why tolerance is allowed only in comparisons against the HF golden.
Every comparison involving the RTL is bit-exact.
Where there is no tolerance, even a single-bit difference has nowhere to hide.

The two kinds of comparisons cover each other's blind spots.
A bit-exact comparison doesn't miss even a small difference between two implementations.
But it can't catch errors that both sides share.
Errors that come from the same spec, or that are baked into the same compiler output, are examples.
Comparisons against the HF golden catch spec errors, but they can miss small errors that fall within the tolerance.

## Conclusion: When Results Diverge, What Do You Suspect?

Let's go back to the opening question.
When an AI model and the RTL give different answers, who is wrong?

The answer depends on which comparison the mismatch appeared in.

- If the block RTL and the reference model differ, the implementation deviates from the spec.
- If the Top RTL and fsim differ in top-level simulation, suspect integration between blocks or spec interpretation.
- If fsim and the HF golden differ, suspect the spec or algorithm, the compiler, or fsim, and narrow it down layer by layer.
- If the RTL on ZeBu and rtl-mode fsim differ, suspect the RTL or rtl-mode fsim.

This kind of judgment is possible for two reasons.
We separated the source of the ground truth at each level, and we kept each comparison down to one difference where possible.
This structure is the backbone of verification that keeps us from having to manufacture the chip again.

This principle isn't limited to chip verification.
The same question comes up when you port a model to another framework, quantize it, or move it to new hardware.
Decide first what the ground truth is, then change only one thing at a time when you compare, and when results diverge you'll know where to look.

But top-level simulation is slow.
Running a long LLM workload to completion takes far too long.
Part 2 looks at how an emulator gets past this limit.
It will also discuss when you can say that "verification is done."

## P.S.: HyperAccel Is Hiring!

To avoid manufacturing a chip twice, someone has to keep asking, "Is this really right?" all the way to the end.
At HyperAccel, the design, verification, simulator, and compiler teams each bring their own ground truth to look at the same chip.
If you're interested in tracing where the ground truth comes from and designing the chain of comparisons, please apply anytime!

**Careers**: https://hyperaccel.career.greetinghr.com/en/guide
