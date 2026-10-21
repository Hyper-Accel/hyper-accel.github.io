---
date: '2026-10-21T10:35:01+09:00'
draft: false
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
summary: "When the same AI model gives different answers on a GPU and on the LPU's RTL, who is wrong? This post covers where the ground truth comes from at each level of LLM inference chip verification, and how splitting the comparisons makes it clear who owns a mismatch."
description: "Where does the ground truth come from in LLM inference chip verification? We explain why the IP level treats the spec document as ground truth, why the top level uses the AI model's output, and what each comparison in between catches."
comments: true
---

> This post is Part 1 of the **Verifying an LLM Inference Chip** series.
> Part 1 covers where the "ground truth" in verification comes from.
> Part 2 will cover how an emulator gets past the limits of slow simulation, and when you can say verification is done.

## Introduction

Hello, I'm Yujeon Chang from the HyperAccel DV team.
Using HyperAccel's actual verification flow as the example, this post looks at how we decide what counts as the "right answer" when verifying a **Large Language Model (LLM)** inference chip.

Let's start with a question.
When the same AI model gives one answer on a GPU and another on the RTL of the **LLM Processing Unit (LPU)**, who is actually wrong?

Say we load the same AI model onto a GPU and onto the LPU's RTL, and feed both the same prompt with the same settings.
If dozens of tokens come out identical and then one position differs, is the LPU wrong, or is the GPU?
It's even possible that both are right.

A software bug can be fixed and redeployed, but chips are a different story.
Once a chip is manufactured its circuits cannot be changed, so fixing a bug means changing the design and manufacturing the chip again, which costs months and a lot of money.
That's why we have to make as sure as we can that the design is correct before manufacturing, and this work is called **verification**.

When people hear "verification," they often think first of testbench languages or tools like the Universal Verification Methodology (UVM).
This post, however, sets the tools aside and asks a more basic question.
What do you have to compare against before you can say something is "correct"? In other words, where does a chip's **ground truth** come from?

This post comes down to two key points.

1. There is no single ground truth; each verification level gets its ground truth from a different source.
2. Because each comparison axis changes only one thing where possible, just knowing which comparison failed tells you whose problem it is.

## Verification Comes Down to Comparison

Before we dive in, here are a few terms used throughout this post.

- **Register Transfer Level (RTL)**: A design level that describes a digital circuit's behavior in terms of data transfers and operations between registers. It is usually written in a hardware description language such as Verilog or SystemVerilog, and its function and behavior are verified with a simulator such as Synopsys VCS. Design code written at this level is called RTL code, and this post simply calls it RTL.
- **IP and Top**: An Intellectual Property (IP) is a circuit design unit responsible for a specific function; in the semiconductor industry, a unit that can be designed independently and reused like this is called an IP. A chip is built by connecting many IPs. IP-level verification checks one IP in isolation, while top-level verification checks the whole chip with all IPs connected.
- **Reference model**: Software that takes the same input as the RTL and computes the expected output, used to check whether the RTL's output matches it.
- **functional simulator (fsim)**: A simulator that models the chip's architecture at the functional level. It is used to quickly verify instruction-level accuracy and to develop the software stack.
- **bit-exact**: Two results match down to the last bit, with no error tolerated at all.
- **tolerance**: A comparison criterion that treats two results as matching as long as their difference stays within a set range. Such differences come not from a wrong implementation but from differences in how the computation is done, such as the order of floating-point additions or numeric precision. A typical example is the same model giving slightly different results on a CPU and a GPU.

Verification comes down to feeding the same input into two implementations and comparing the outputs.
If they differ, something is wrong somewhere, but what you compare against determines which problems you can find.

<!-- Diagram source: images/comparison-chain.en.svg (re-export to webp after editing) -->
![At the IP level, the IP RTL and the reference model, both derived from the spec document, are compared bit-exact. At the top level, five comparisons connect the original model's CPU and GPU goldens, fsim's torch and rtl modes, the RTL on ZeBu, and the Top RTL in top-level simulation](images/comparison-chain.en.webp)

The table below lists every comparison covered in this post.

| # | Comparison | Criterion | What it catches |
|---|---|---|---|
| ① | IP RTL ↔ reference model | bit-exact | Implementation that deviates from the spec |
| ② | Top RTL ↔ fsim (rtl) | bit-exact | Integration errors between IPs, differing spec interpretations |
| ③ | fsim (torch) ↔ golden (CPU) | tolerance | Spec and algorithm errors, compiler errors |
| ④ | fsim (rtl) ↔ golden (GPU) | tolerance | Errors in rtl mode, spec and algorithm errors |
| ⑤ | RTL (ZeBu) ↔ fsim (rtl) | bit-exact | Differences between rtl mode and the RTL, errors in the RTL itself |

There is one important principle here.
**Each comparison axis changes only one thing where possible.**

If you are a software engineer, think of `git bisect`, which halves a range of commits until it finds the one that introduced a bug.
Comparisons work in a similar way: if two implementations differ in only one thing, the cause of a mismatch narrows down to that one thing.
So just knowing which comparison broke tells you whose problem it is.

In practice, though, some comparisons can't keep to this principle, and we will see an example when we run a real model.

## IP Level (①): The Spec Document Is the Ground Truth

At the IP level, the ground truth is the **spec document**, or more precisely, a reference model that a verifier builds separately using only the spec document.

At HyperAccel, RTL design and verification are handled by separate, independent teams.
Verifiers build the IP-level reference models from the RTL spec document, not by looking at the RTL.

Why go to this trouble?
If the same person implements something twice with the same thinking, they tend to repeat the same mistakes, and when two implementations share a mistake, their results match perfectly.
The bug then passes without any warning, which is why a reference model is only meaningful if it is built independently of the RTL.

At the IP level, the RTL and the reference model are compared bit-exact.
They are two implementations of the same spec, so they should match down to the last bit.

We do not compare the IP reference model against PyTorch.
At the IP level, the spec is the only ground truth, and comparing against the AI model is the job of the top level.

### When Independence Breaks Even With Separate Teams

Separate teams don't automatically mean independence.
In general, in the following three cases, separate teams still end up sharing the same errors.

1. **Using the designer's model as-is**: The verification team adopts a model built by the designer as its reference.
2. **Asking the designer about an ambiguous spec**: The verifier asks the designer about an unclear part of the spec and builds the testbench from that answer.
3. **Deriving expected values from the RTL**: The verifier reads the RTL instead of the spec to compute expected values.

In all three cases, the designer's interpretation leaks into verification, so the two implementations are no longer independent.

HyperAccel's structure avoids the first and third cases.
Verifiers build the reference model themselves, and it is based on the spec document, not the RTL.

The second case is hard to avoid entirely, because designers write the spec document.
While verifying, verifiers find ambiguous parts and ask the designer, who interprets them and updates the spec document.

The key point is that the answer ends up in the **spec document**.
Verifiers don't just apply the answer to their testbench; the updated document becomes the reference for both design and verification again.
In effect, the ground truth stays in a single document.

Still, the interpretation itself belongs to the designer, so if it is wrong, the RTL and the reference model are wrong together.
Let's look at this limitation next.

### The Limit: If the Spec Is Wrong, Both Are Wrong the Same Way

The IP-level structure has a clear limitation.
Designers and verifiers both read the **same spec document**, and designers are the ones who write it.

What if the spec document itself is wrong?
The designer builds the RTL according to the wrong spec, and the verifier builds the reference model according to the same wrong spec.
Both results are wrong in the same way, so they actually match perfectly.

What IP-level verification proves is that "the RTL was built according to the spec," not that "the spec is correct."
To check whether the spec is correct, you need a ground truth that does not go through the spec document, and that ground truth lives at the top level.

## Top Level: The AI Model's Output Is the Ground Truth

At the top level, we verify the whole chip with all IPs connected, and the ground truth is not the spec document but **the actual AI model's output**.

Because the AI model was not built by reading the spec document, this ground truth has a different source.
That is why errors in the spec itself, which the IP level misses, show up here.

[Transformer World](/en/posts/what-is-the-transformers/) introduced the attention operation, and the top level is where we check that this operation produces the same values on the chip.

### The Golden, fsim, and the Compiler

The top-level ground truth is the output of the original model published on Hugging Face, run in PyTorch.
It goes through neither the hardware nor the compiler, making it the outermost ground truth, and in verification a reference result like this is called a **golden**.

However, we do not compare the golden directly against the RTL.
RTL simulation is too slow to run an entire LLM, and before the chip exists there is nowhere to try out the compiler.
So we use fsim, a software model that mimics the chip's behavior, which also splits the large gap between the golden and the RTL into two steps and helps narrow down the cause when results diverge.

fsim is built by the simulator team, another team separate from both design and verification.
Like the verification team, the simulator team builds fsim from the spec document, so in effect there is one more independent implementation that starts from the same spec.

fsim is not built by stitching IP reference models together; it is a completely separate model.
So even if an IP reference model has a mistake, that mistake does not carry over into top-level comparisons.

fsim has two modes: torch mode and rtl mode.
torch mode is used for fast debugging and functional verification, while rtl mode is a C model (cmodel) that follows the chip's behavior exactly, aiming to produce results identical to the RTL down to the bit.

To run an AI model on the chip, a compiler has to turn the model into a program the chip can execute.
At HyperAccel, this is the job of our own compiler, [Legato](/en/posts/what-is-legato/), and both fsim and the RTL on ZeBu run the program it produces.

### Top-Level Simulation (②): Do the Values Match fsim?

Before running an AI model, the verification team first checks the connections between IPs with fast top-level tests built in UVM.
Part 2 covers those tests in detail; here we look at the tests that compare values.

Integration errors that don't appear when looking at one IP at a time show up as value differences once the IPs are connected.
The top-level scenarios used here are also built by the verification team, and their expected values come from fsim in rtl mode.
The Top RTL and rtl-mode fsim are compared bit-exact (② in the table).

What this comparison catches and misses is clear.
The Top RTL and fsim were built by different teams from the same spec document, so when they disagree, it reveals a place where the same spec was interpreted differently.
Conversely, if the spec itself is wrong, both are wrong the same way and pass this comparison, so catching spec errors requires comparing against the golden, which does not go through the spec.

## Three Steps With a Real Model

Verification with a real AI model is built up in three steps.
The simulator team and the compiler team first develop fsim and the compiler separately, then run them together in one environment.

### Step 1 (③): torch Mode and the CPU Golden, Function First

First, torch-mode fsim runs the compiler's output, and the result is compared with the golden from running the original model on a CPU.
A small error is tolerated, roughly the size of the difference you get when running the same computation on a CPU versus a GPU.
This step quickly checks that the functionality is right.

### Step 2 (④): rtl Mode and the GPU Golden, Closer to the Chip

Next, rtl-mode fsim runs the compiler's output, and the result is compared with the golden from running the original model on a GPU.
Because a GPU's precision and arithmetic are closer to the chip's than a CPU's are, this allows more precise debugging and validates rtl mode itself at the same time.
This comparison also tolerates a small error.

### Step 3 (⑤): The RTL on ZeBu and rtl Mode, Down to the Bit

Finally, the same compiler output runs on the actual RTL, which runs on ZeBu, an emulator from Synopsys.
An emulator loads the RTL onto dedicated hardware and runs it far faster than a simulator; Part 2 will cover emulators in more detail.

In this step, rtl-mode fsim and ZeBu are compared bit-exact, not only on the output tokens but also on the data left in DRAM (a DRAM dump).
This checks that rtl-mode fsim and the actual RTL produce exactly the same results, and that the RTL itself has no problems.

### The Ground Truth Is Passed Down Step by Step

Looking at the three steps through the "change only one thing" principle reveals something interesting.

Step 3 (⑤) is where the principle holds best.
Both sides run the same compiler output and only the executor changes from fsim to the RTL, so when there is a mismatch, the cause narrows down to rtl-mode fsim versus the RTL.

Steps 1 and 2 (③, ④), on the other hand, break the principle.
Compared with the golden, two things differ at once, the compiler and fsim, so this comparison alone can't tell you which one is wrong when there is a mismatch.

So in these steps, we analyze against the golden to decide which side is wrong.
We don't stop at the final output; we match intermediate results layer by layer against the golden and narrow down the cause by finding the first layer where they diverge.
A comparison that breaks the principle comes with this analysis cost, which in a way shows why the principle of splitting comparisons matters.

In short, the ground truth is passed down one step at a time.
The golden is the ground truth for fsim, and rtl-mode fsim in turn is the ground truth for the RTL.

This division of roles is similar to CPU verification.
In general, CPU verifiers check that each instruction behaves according to the spec, while the results of programs built from those instructions are the responsibility of the compiler and software.
Chip verification works the same way: whether the chip behaves according to the spec is the job of the bit-exact comparisons between the RTL and fsim, and whether the model runs correctly is the job of the comparisons against the golden, through the compiler.

## Tolerance Only Where It's Needed

Looking at the criterion column in the comparison table again, every comparison that directly involves the RTL is bit-exact.
The only places that tolerate error are the two comparisons between fsim and the golden (③, ④), because fsim and the golden can both be correct and still differ in the last bits.
As we saw in the glossary, even PyTorch gives slightly different results on a CPU and a GPU.

Tolerating error makes the comparison possible, but it comes at a cost.
Tolerance can hide small bugs.

As a hypothetical example, suppose the compiler picks the wrong rounding mode for one particular operation.
This error changes only the last few bits of the result, so if the difference is about the size of a CPU-versus-GPU difference, it can fall within the tolerance and pass ③ and ④.

That is why tolerance is kept only where it is truly needed, and each comparison's criterion is set to match its role.
Comparisons against the golden check results against a ground truth that never went through the spec, so they catch errors in the spec itself, and they can do this job even while allowing the small errors that come from differences in how the computation is done.
The comparisons involving the RTL, on the other hand, are there to catch differences between two implementations given the same input, so they are all bit-exact.
Where there is no tolerance, even a single-bit difference has nowhere to hide.

## Conclusion: When Results Diverge, What Do You Suspect?

Let's go back to the opening question.
When the same AI model gives different answers on a GPU and on the LPU's RTL, who is wrong?

The answer depends on which comparison the mismatch appeared in.

- If the IP RTL and the reference model differ, the implementation deviates from the spec.
- If the Top RTL and fsim differ in top-level simulation, suspect integration between IPs or spec interpretation.
- If fsim and the golden differ, suspect the spec or algorithm, the compiler, or fsim, and narrow it down layer by layer.
- If the RTL on ZeBu and rtl-mode fsim differ, suspect the RTL or rtl-mode fsim.

This kind of judgment is possible because we separated the source of the ground truth at each level and kept each comparison down to one difference where possible.
This structure is the backbone of verification that keeps us from having to manufacture the chip again.

This principle isn't limited to chip verification.
The same question comes up when you port a model to another framework, quantize it, or move it to new hardware.
Decide first what the ground truth is and change only one thing at a time when you compare, and when results diverge you'll know where to look.

Top-level simulation, however, is slow, and running a long LLM workload to completion takes far too long.
Part 2 looks at how an emulator gets past this limit, and when you can say that "verification is done."

## P.S.: HyperAccel Is Hiring!

To avoid manufacturing a chip twice, someone has to keep asking, "Is this really right?" all the way to the end.
At HyperAccel, the design, verification, simulator, and compiler teams each bring their own ground truth to look at the same chip.
If you're interested in tracing where the ground truth comes from and designing the comparison axes, please apply anytime!

**Careers**: https://hyperaccel.career.greetinghr.com/en/guide
