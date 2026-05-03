---
date: '2026-04-29T02:00:00+09:00'
draft: false
title: 'Memory in the AI Era, Part 2: Where Does HBF Actually Fit?'
cover:
  image: "01-cover.jpg"
  alt: "HBF workload cover image"
  caption: "Finding HBF's place"
  relative: true
authors: [Jaewon Lim]
tags: ["HBF", "High Bandwidth Flash", "memory", "LLM", "Inference", "CAG", "RAG", "SK Hynix", "H3"]
series: ["Memory in the AI Era"]
series_idx: 2
categories: ["AI hardware", "Semiconductor"]
summary: "Which workloads turn HBF's weaknesses into non-issues? We unpack SK hynix's H³ architecture, then probe beyond it — and ask whether the frontier is even moving in HBF's direction."
description: "A skeptical look at HBF's applicable territory: read-only workloads where latency/endurance/power weaknesses are neutralized, the H³ hybrid architecture's pairing with CAG, the frontier directions (sparse attention, native multimodal) that work against HBF, and the realistic niches where it can still win."
comments: true
keywords: [
  "HBF", "High Bandwidth Flash", "LLM Inference", "CAG", "Cache-Augmented Generation",
  "RAG", "SK Hynix", "H3", "memory hierarchy", "AI memory", "AI accelerator", "MoE", "Speculative Decoding"
]
---

> This post is Part 2 of the **Memory in the AI Era** series.  
> [Part 1: Understanding HBF](https://hyper-accel.github.io/posts/what-is-hbf/) covered what HBF is and where it sits in the memory hierarchy.  
> This part asks the next question — **given those weaknesses, where can HBF actually shine?** — and walks through SK hynix's **H³** architecture and the candidate workloads beyond it.

<!-- 그림 필요: 커버 이미지 (01-cover.jpg) -->

## Setting the stage

Hi, I'm Jaewon Lim, a hardware verification engineer on HyperAccel's DV team.

Did you read Seungbin Shin's tour of **High Bandwidth Flash (HBF)** in Part 1? If we collapse it to one line:

> **HBF is fast and huge — but too slow.**

More precisely: HBF matches **High Bandwidth Memory (HBM)** on bandwidth and offers 8–16× the capacity — but its latency sits at conventional SSD levels, roughly 100× HBM's. **Bandwidth and capacity rival HBM (and capacity even beats it), while latency lands at SSD scale** — a spec ambiguous enough that "where does this fit?" becomes the actual open question. Finding the workloads that genuinely suit HBF becomes its own exercise.

If Part 1 answered "what is HBF," Part 2 picks up the next question:

**"How would you actually use it?"**

HBF is still pre-volume-production. For the market and accelerator companies to commit, the picture beyond the spec sheet — which workloads will use it, and why — has to come into focus first. So that's our starting point.

Here's the interesting bit. **Pick the workload right, and HBF's weaknesses can be hidden.** This post walks through the **H³** architecture that SK hynix published at *IEEE Computer Architecture Letters 2026*, and then explores what else might fit beyond it.

---

## HBF's weaknesses, revisited

The three weaknesses Part 1 laid out:

**First, latency.** HBF is NAND flash with packaging applied to it. The cell-level read mechanism is fundamentally slower than DRAM, so while HBM reads at tens of nanoseconds, HBF needs about 10–20 μs. Roughly 100× slower. No amount of packaging cleverness can erase that — it's a cell-level limit.

**Second, write endurance.** NAND flash cells have physical limits on erase/write cycles. Workloads that hammer the same locations wear cells out fast. So training or frequently-updated data isn't a fit.

**Third, power.** Per-bit power is higher than HBM because of the NAND substrate. By SK hynix's assumption, HBF's per-cube **Thermal Design Power (TDP)** is roughly 4× HBM's (HBM3e at 40 W vs. HBF at 160 W). Pulling HBF in just for the capacity can leave you worse off in throughput-per-watt.

---

## Workload conditions that sidestep the weaknesses

To neutralize all three weaknesses simultaneously, the workload has to satisfy:

- **Load once, read many times** — neutralizes write endurance.
- **Deterministic access patterns** — knowable in advance, so latency can be hidden by prefetch.
- **Large enough batch** — the extra power gets paid back in throughput.

The fastest way to see where these conditions land is to compare **training** and **inference** — the two LLM phases sit at opposite ends of the memory-access spectrum.

**Training** updates weights every step. The backward pass computes gradients and the optimizer state writes alongside, so writes happen continuously across memory. For HBF — limited by write endurance — this is the worst-case workload. It fails the first condition (read-only) immediately.

**Inference** is a different story. Once training is done, the weights never change during inference. Run Llama 3.1 405B in FP8 and you're holding ~405 GB of weights that get read end-to-end every batch — and only read. Clearly huge + read-only.

<!-- 그림 필요: 학습 vs 추론 메모리 패턴 비교 — 학습은 weight write 빈번, 추론은 read-only weight + (선택적) 공유 KV cache -->

But inference has another piece that can grow as large as the weights — **the KV cache**. With 1M, 10M context, KV cache balloons from hundreds of gigabytes to several terabytes. Putting that on HBF would dramatically expand HBF's reach. Catch: an ordinary KV cache is exactly the access pattern HBF hates. How to bring it onto HBF anyway is the next section's problem.

---

## How CAG differs from RAG

The KV cache is hard for HBF for two reasons:

- **It's written every token.** During decode, every output token appends new entries across all layers' KV. Write rate is high.
- **It differs per request.** User queries change every time, so even with the same model, the KV cache contents are recomputed from scratch. A cache built for one request isn't reused by another.

Both properties hit HBF exactly where it's weak. Frequent writes burn endurance, and non-shareable data has no claim on HBF's huge capacity. Put differently: only when the KV cache shifts to a **single-write, multi-read** shape does HBF actually pull its weight.

The most common technique for lifting LLM response quality is **Retrieval-Augmented Generation (RAG)**: pull query-relevant documents from an external knowledge base (typically a vector DB), splice them into the prompt, and generate. Every request triggers a fresh retrieve, and a fresh KV cache is built from the fetched context. So far the cache is still per-request and one-shot — both of those weaknesses intact.

But what if the knowledge the model needs to consult **doesn't change much across requests** — the same manual, the same codebase, the same internal docs? Re-retrieving and recomputing it every time is plain waste.

A late-2024 paper (Chan et al., "Don't Do RAG", arxiv:2412.15605) called out this waste directly and proposed a new pattern: **Cache-Augmented Generation (CAG)**.

<!-- 그림 필요: RAG vs CAG 흐름 비교 — RAG는 매 요청마다 retrieve+compute, CAG는 사전 KV cache 1회 생성 후 재사용 -->

CAG is mechanically simple:

1. Run the shareable, massive knowledge base **once** through the model and build a KV cache.
2. When a user query arrives, treat that pre-built KV cache as a prefix and generate from there. No recomputation of the same material.
3. When many requests come in, **share** that same KV cache and generate per-request answers on top.

A one-line contrast:

- **RAG**: retrieve + recompute every time.
- **CAG**: compute once, read many times.

The memory profile contrast is even starker. RAG's KV cache is short and one-shot per request, but CAG's KV cache is **huge, read-only, and accessed repeatedly across requests.** Hundreds of GB at 1M context, several TB at 10M.

Lay this profile next to the "HBF-friendly conditions" we defined earlier:

- huge + read-only → endurance issue neutralized ✓
- load once, read many → amortizes versus per-request recompute ✓
- layer-by-layer deterministic → latency hideable by prefetch ✓

An exact match — at least so long as the layer-by-layer assumption holds. We'll come back to that caveat in the next post. That's why SK hynix picked CAG as the central use case to justify H³.

---

## SK hynix's H³: dividing roles between HBM and HBF

The H³ paper (Minho Ha, Euiseok Kim, Hoshik Kim — *IEEE CAL 2026*) reduces to one idea:

> **Don't replace HBM with HBF. Bolt HBF on next to HBM as a dedicated slot for huge read-only data.**

<!-- 그림 필요: H³ 구조도 — GPU 옆 HBM, HBM 뒤 HBF daisy-chain, HBM base die 안에 LHB (직접 그릴 것!) -->

### Physical layout: daisy-chaining HBF behind HBM

In a typical GPU, HBM stacks sit next to the GPU on the interposer and consume all of the available shoreline. H³ leaves that alone. **HBM is still wired directly to the GPU shoreline.**

The change is what comes after. Each HBM stack's base die gains a **Die-to-Die (D2D)** interface, and an HBF stack hangs off the back of HBM through it — the HBM and HBF are daisy-chained.

From the GPU's perspective, both HBM and HBF appear as main memory inside a **unified address space**. An address decoder and router on the HBM base die decide whether a request goes to HBM core or makes the extra hop to HBF.

The win is that you get tens of times more capacity without spending any more GPU shoreline. By SK hynix's assumption, on top of 192 GB / 8 TB/s of HBM3e per GPU, an HBF stack adds roughly 3 TB / 8 TB/s per GPU — about a 16× capacity bump.

### Data placement: who lives where

H³'s operating principle is to split data between the two memories by character.

- **In HBF**: model weights, the pre-computed shared CAG KV cache — both huge and read-only at inference time.
- **In HBM**: the KV cache being generated, activations, anything else that gets updated frequently.

This split sidesteps HBF's weaknesses cleanly. Huge read-only data never raises endurance. And in batch-heavy inference, HBF's extra power is paid back in throughput.

### Latency Hiding Buffer

One problem remains: NAND's tens-of-microseconds latency. A GPU compute pipeline tuned around nanosecond-scale memory will stall hard if it suddenly has to wait microseconds.

SK hynix's answer is the **Latency Hiding Buffer (LHB)** — a prefetch SRAM integrated into the HBM base die.

It leans on a key property of LLM inference: **layer-by-layer access is deterministic.** You can know in advance which weights and KV blocks the next layer needs. The deep-learning framework hands those prefetch hints down, and the LHB pulls the next layer's data ahead of time, hiding the HBF latency behind the current layer's compute.

LHB sizing is a simple formula:

```text
Capacity_LHB = 2 × BW_HBF × Latency_HBF
```

This assumes double buffering. Plugging in SK hynix's example numbers (BW 1 TB/s, latency 20 μs), you land on about **40 MB**. At 3 nm SRAM that works out to roughly 8 mm² — about 6.7% of the HBM base die's ~121 mm² area. A modest overhead that fits comfortably into existing base-die slack.

In other words, H³ solves the latency problem with a fairly humble change: a bit of SRAM in HBM's spare base-die area.

### Simulation results

Good idea. But how much actually changes?

The team simulated H³ on **Llama 3.1 405B** (~405 GB of FP8 weights), with NVIDIA **B200** GPUs — 8 of them for 1M context, 32 for 10M context. HBM3e is 192 GB / 8 TB/s per GPU; HBF adds another ~24 TB / 8 TB/s per GPU. Input and output lengths are fixed at 1K each, with the rest of the capacity going to the pre-computed shared KV cache (~35% at 1M, ~84% at 10M).

<!-- 그림 필요: HBM-only vs H³ batch size & throughput 비교 차트 (직접 그릴 것!) -->

Before diving into the numbers, a quick **roofline** detour. LLM-inference decode is fundamentally memory-bandwidth-bound. At small batch, GPU compute idles while memory bandwidth saturates.

Bigger batch lets a single weight read fan out across more tokens, raising arithmetic intensity. Past some point, you cross into the compute-bound regime, and GPU compute finally gets used.

But growing batch needs capacity to hold the KV cache. **HBF lifting the batch ceiling means you can put more of the GPU's compute to work.** This is why H³'s throughput gains aren't just a capacity flex — they're meaningful on the roofline curve.

The ratios (H³ vs HBM-only):

- **Max batch size**: ~**2.6×** at 1M context, ~**18.8×** at 10M.
- **Throughput** (Tokens Per Second / request): ~**1.25×** at 1M, ~**6.14×** at 10M.
- **Throughput per power**: up to ~**2.69×**, even after fully accounting for HBF's higher power.

The longer the context, the steeper H³'s gains. Makes sense — bigger pre-computed KV cache means more of HBF's huge capacity doing real work.

There's another striking finding: **1M context inference fits on a single GPU, and 10M fits on two.** The HBM-only equivalents would need 8 and 32 GPUs respectively. That's a non-trivial cost story.

A more conservative check: assume HBF's actual production bandwidth comes in at half of HBM's. Even then, throughput-per-power at 10M context still sits around **2.09×**. H³'s win isn't fragile to HBF spec wobble.

H³ isn't magic, of course. These results assume a workload where deterministic prefetch is possible and the read-only share is large enough. Short-context, low-batch services would just spend extra power on capacity they can't use. Workload fit is H³'s fit.

---

## Beyond H³: other workloads HBF might fit

From here on the editorial perspective gets stronger. H³ showed one combination — HBF + LLM inference (CAG specifically). But "huge + read-only + deterministic-prefetchable" workloads aren't only inside LLM inference. Here are three candidates the market most often raises as HBF prospects.

### Candidate 1. Mixture of Experts (MoE) inference

<!-- 그림 필요: MoE expert routing + HBF placement 다이어그램 (선택) -->

A lot of frontier LLMs now use **Mixture of Experts (MoE)**. The model holds tens to hundreds of expert **Feed-Forward Networks (FFNs)**, with only a few (typically 2–8) activated per token. The unactivated experts still have to live in memory, so total weight grows fast.

- **HBF**: low-frequency expert weights (read-only).
- **HBM**: hot experts and attention layers (frequently used).

The catch: routing is stochastic per token, so the deterministic-prefetch assumption LHB depends on doesn't hold. Predicting which experts will fire becomes a research problem of its own. Of these three candidates, MoE has the lowest prefetch affinity.

### Candidate 2. Multimodal model encoder weights

Multimodal models stack an image/video/speech encoder on top of an LLM. The encoder itself can be huge (e.g., ViT-G, video encoders), and its weights aren't updated during inference. Add the LLM proper and you blow past single-GPU memory.

- **HBF**: encoder weights (read on input, otherwise static).
- **HBM**: the LLM hot path and KV cache.

The catch: encoder weights are exercised only when an input arrives, so read frequency is lower than for LLM weights. That said, the encoder's internal layer progression is just as deterministic as the LLM's, which makes it prefetch-friendly. The play is more about HBF's capacity than its bandwidth.

### Candidate 3. Embedding tables in recommendation and search

User and item embedding tables in recommenders (e.g., **Deep Learning Recommendation Models (DLRMs)**) and two-tower search systems can hit billion-scale. Capacity runs from hundreds of GB to several TB, and they're nearly read-only at inference time.

- **HBF**: huge embedding tables.
- **HBM**: the model proper plus a hot embedding subset.

The catch: per-query embedding lookups are random-access. Random access weakens prefetch, so meaningful performance requires going hand-in-hand with sharding/caching strategies.

---

Line all three up on a prefetch-affinity axis and the picture is sterner than it first looks. They all satisfy **"huge + read-only,"** but **deterministic prefetch** is only natural for the multimodal encoder; MoE and embedding tables both rely on extra mechanisms (routing prediction, sharding). The reason H³ works so cleanly for LLM inference is the layer-by-layer pattern is exceptionally well-defined, and that trick doesn't carry over verbatim to other workloads.

And one step further down, an even less comfortable question follows. **Does that layer-by-layer assumption actually hold up where the frontier is heading?** That question, and the bigger homework HBF has to clear before it can go universal, is what the next post tackles head-on.

---

## Conclusion

The arc of the post in one pass:

① HBF gives huge capacity and HBM-like bandwidth, but carries three weaknesses: latency, endurance, power.  
② Those weaknesses neutralize when the workload is "huge + read-only + deterministic + large-batch."  
③ CAG is a new inference pattern that fits those conditions exactly, with a memory profile that opens HBF's niche.  
④ SK hynix's H³ daisy-chains HBF behind HBM and hides latency with the LHB, and simulations show up to ~2.69× throughput-per-power at long context.  
⑤ Beyond H³, candidates like MoE, multimodal encoders, and embedding tables follow the same conditions — but their deterministic-prefetch affinity varies widely.

The one-line takeaway from this part: **"pick the workload right and HBF's weaknesses go away."** There's a quiet caveat attached, though — how far the frontier's direction will preserve the assumptions behind those "well-picked" workloads is a separate question. That question, and the homework HBF has to clear before becoming universal memory, is the subject of the next post.

---

## P.S. HyperAccel is hiring!

The more memory hierarchies diversify, the more interesting the problems accelerator designers get to work on.

I work on hardware verification of LLM-acceleration ASICs at HyperAccel's DV team. Beyond verifying single chips, the role lets me work on memory hierarchy, system integration, and workload matching — fresh problems show up every day.

HyperAccel works across hardware, software, and AI. If you'd like to learn deeply across that range while growing alongside the team, please apply through the [careers site](https://hyperaccel.career.greetinghr.com/ko/guide).

---

## References

- M. Ha, E. Kim, H. Kim, "H³: Hybrid Architecture using High Bandwidth Memory and High Bandwidth Flash for Cost-Efficient LLM Inference," *IEEE Computer Architecture Letters*, 2026. DOI: [10.1109/LCA.2026.3660969](https://doi.org/10.1109/LCA.2026.3660969)
- B. J. Chan, C.-T. Chen, J.-H. Cheng, H.-H. Huang, "Don't Do RAG: When Cache-Augmented Generation is All You Need for Knowledge Tasks," *Proc. The ACM Web Conference (WWW) 2025*, 2025. [arxiv:2412.15605](https://arxiv.org/abs/2412.15605)
- [SanDisk, "Memory-Centric AI: Sandisk's High Bandwidth Flash Will Redefine AI Infrastructure"](https://www.sandisk.com/company/newsroom/blogs/2025/memory-centric-ai-sandisks-high-bandwidth-flash-will-redefine-ai-infrastructure)
- [Part 1: Memory in the AI Era, Part 1: Understanding HBF](https://hyper-accel.github.io/posts/what-is-hbf/)
- [Llama 3 Herd of Models — Meta](https://arxiv.org/abs/2407.21783)
- [NVIDIA Blackwell Architecture Technical Brief](https://resources.nvidia.com/en-us-blackwell-architecture)
