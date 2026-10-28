---
date: '2026-10-23T00:00:00+09:00'
title: "AI Infra Summit 2026: Rising AI Inference Costs and the LPU's Answer"
authors: ["Soyoung Park"]
tags: ["conference", "AI INFRA SUMMIT", "report"]
categories: ["Conference Reports"]
summary: "A field report from HyperAccel at AI Infra Summit 2026, where we took part as a Gold Sponsor. It covers our CEO's talk, the BERTHA live demo, meetings with global customers, and the trends shaping the AI inference market."
cover:
  image: "images/pasted-20261028-041537-ed2862.jpg"
  alt: "The AI Infra Summit 2026 venue and the HyperAccel booth"
  relative: true
comments: true
---

Hello, I'm Soyoung Park from HyperAccel Marketing.

As AI models advance and find more uses, the AI inference infrastructure that runs and operates them matters more than ever. In enterprise environments in particular, the deciding metrics are no longer model performance alone. LLM inference cost, power consumption, and the Total Cost of Ownership(TCO) of the whole system now decide whether a service succeeds.

This post shares what HyperAccel saw at **AI Infra Summit 2026** in Santa Clara, Silicon Valley, last September. It covers the latest trends in the AI inference market and the future of AI infrastructure we presented with our LPU, BERTHA.

**💡 This post is recommended for readers who:**

- Want to follow the latest trends in AI semiconductors and the LLM inference market
- Want to see the technology and business strategies of global AI infrastructure companies
- Are considering LPU-based inference infrastructure for real LLM services

---

## About AI Infra Summit 2026

![The AI Infra Summit 2026 venue](images/pasted-20261028-041537-ed2862.jpg)

### Overview

**AI Infra Summit 2026** is a global conference dedicated to AI infrastructure. It was held from September 15 to 17 at the Santa Clara Convention Center in California.

This was the ninth edition. It brought together about **8,000 attendees from around the world**, more than **400 expert speakers**, and over **250 partner companies**. The program covered the whole AI infrastructure ecosystem, from AI Data Center, Compute, and Data Movement to Data & Models and Physical AI.

Leaders from **NVIDIA, AMD, AWS, Meta, Google, and Intel** spoke in the main stage keynotes. Korean sponsors included **HyperAccel**, SK hynix, Samsung Electronics, Rebellions, FuriosaAI, MangoBoost, and Moreh.

### HyperAccel's Presence: Gold Sponsor and Our First Standalone Booth

HyperAccel took part as a Gold Sponsor and ran its first standalone booth on a global stage.

At the booth, we showed a **live demo of BERTHA**, our LLM Processing Unit(LPU), and it drew strong interest from visitors. On the first day, September 15, CEO Juyoung Kim gave a **solo talk** in the Compute Track. It presented HyperAccel's vision for AI infrastructure built around token efficiency.

The summit let us put HyperAccel's LPU technology and products in front of the global AI market. It also let us explore practical collaboration with big tech companies and infrastructure partners from around the world.

## Key Sessions and the Booth

### 1. CEO Talk: Token Prices Are Falling, So Why Do AI Service Costs Keep Rising?

![A collage of CEO Juyoung Kim's talk](images/pasted-20261028-042419-85a19a.jpg)

▲ HyperAccel CEO Juyoung Kim presenting

On September 15, the first day, CEO Juyoung Kim gave a talk titled "Redefining AI Infrastructure Through Token Efficiency" in the Compute Track.

The core of the talk was a new way to look at AI inference cost.

The price per 1k tokens is falling fast. Ironically, the cost of building and running AI services is rising sharply for real companies. Completing one complex mission now needs far more tokens in total. Reasoning tokens are generated while a model thinks through the task. Agentic tokens are consumed when agents call tools. The KV context(context window) also keeps growing.

Lowering the price per token is therefore not enough. The real challenge is **building infrastructure that processes tokens efficiently across the whole inference process**. HyperAccel presented three approaches for this.

- **Token Efficiency:** We introduced an LPU architecture optimized for LLM inference. A Big Core compute engine and a Streamlined Dataflow, based on memory-compute co-design, maximize memory bandwidth utilization. As a result, the LPU reaches high bandwidth utilization in LLM inference: **83% on average and over 90% at peak**.
- **Enterprise Performance & Cost:** We shared BERTHA's results on the metrics that matter for enterprise AI infrastructure: throughput(TPS), power efficiency, and TCO. Depending on the workload and the comparison target, we showed **efficiency gains of up to 3 to 5 times per watt and per dollar**.
- **Disaggregation & Edge:** We showed an architecture that separates the Prefill and Decode stages to maximize inference performance and efficiency. We also showed a broad product roadmap that runs from BERTHA for data centers to BERTHA-Edge for on-device AI.

Right after the talk, many attendees visited our booth. They watched BERTHA run inference in real time and discussed whether it could fit their own infrastructure. The technical vision from the talk led naturally to hands-on experience and on-site discussions.

*For a detailed summary of the talk, see the [HyperAccel LinkedIn post](https://www.linkedin.com/feed/update/urn:li:activity:7506366519862300672).*

### 2. BERTHA Live Demo: Proving AI Performance Right in Front of Visitors

![A collage of the HyperAccel LPU live demo at the booth](images/pasted-20261028-042836-90ee59.jpg)

▲ The HyperAccel LPU live demo at the booth

The most notable part of the exhibition was the live demo of **HyperAccel LPU BERTHA**.

Our booth was tucked away inside the exhibition hall. Even so, the real-time demo, running actual LLM inference, caught visitors' eyes. Visitors who saw the AI running in front of them moved on to technical discussions and business talks on the spot.

More than 300 AI infrastructure professionals visited the booth over the three days. A deep-tech product like an AI chip is hard to sell by explaining its architecture or spec sheet alone. That changes **the moment people see working hardware and its performance with their own eyes**. Visitors grasped how realistic the technology is and began asking how to apply it in their own environments.

Data center operators, cloud companies, and server distributors visited the booth to check whether adopting the LPU made sense for them. Ian Cutress(TechTechPotato), a global tech content creator, also visited. He covered the BERTHA live demo and interviewed us, so the excitement at the booth reached major media channels.

The experience confirmed once more that what matters far more than booth size or location is **how intuitively you let people experience the product's value**, and whether that experience turns into real collaboration.

🔗 For live sketches from the floor, see **\[[*Day 1 on the floor*](https://www.linkedin.com/feed/update/urn:li:activity:7506005768014561280)\]** and **\[[*Day 2 live demo*](https://www.linkedin.com/feed/update/urn:li:activity:7506382400264929280)\]**.  
🎬 On-site coverage video: [***TechTechPotato: HyperAccel BERTHA live demo and on-site interview***](https://www.linkedin.com/feed/update/urn:li:activity:7507628607909830656)

### 3. Four Trends Running Through the Global AI Infrastructure Market

![The main stage at AI Infra Summit 2026](images/pasted-20261028-050543-2fbd73.jpg)

▲ The main stage at AI Infra Summit 2026

#### ① The bottleneck is capacity, power, and token cost ($/token), not the model

![FuriosaAI's session slide on the shift to inference and the power and token cost bottleneck](images/pasted-20261028-050630-10a6e5.jpg)

▲ FuriosaAI session: the shift of AI workloads to inference, and the power and token cost bottleneck

- According to **FuriosaAI**'s talk(*Alex Liu, SVP*), AI workloads worldwide are shifting quickly from training to inference. Token demand grew 20 times in a single year.
- The key question for AI infrastructure is no longer "How big a compute farm can we build?" It is "How much useful AI work can we get from each unit of compute?" GPU-centric infrastructure is hitting limits in power and cooling. That makes the need for dedicated architectures like the LPU, which maximize token efficiency per watt and per dollar, clearer than ever.

#### ② The rise of Sovereign AI and the turnkey rack-scale race beyond "just chips"

![Rebellions' session slide on Sovereign AI and rack-scale platforms](images/pasted-20261028-050718-a83d78.jpg)

- In **Rebellions**' talk(*Marshall Choy, CBO*), the main topics were building 'Sovereign AI' infrastructure that guarantees data sovereignty for countries and companies, and moving into commercialized, deployed products.
- The talk showed that it is no longer enough to sell a chip. To enter the market, a vendor needs an integrated AI infrastructure platform, from servers(RebelServer) and racks(RebelRack) to data center PODs(RebelPOD). It must prove data center ROI and zero-friction deployment.

#### ③ Power optimization and Extreme Co-design

![NVIDIA's keynote slide on DSX MaxLPS power optimization and Extreme Co-design](images/pasted-20261028-050741-cfd097.jpg)

*▲ NVIDIA keynote: data center power optimization with DSX MaxLPS, and Extreme Co-design*

- In its keynote, **NVIDIA** unveiled the DSX AI Factory Platform and DSX MaxLPS. The technology recovers idle power that data centers would otherwise waste, and it can deliver up to 40% higher compute performance and throughput.
- Integrations with Vera Rubin, Groq 3 LPX, and d-Matrix point the same way. The focus is moving beyond single-chip performance to designing the whole rack as one integrated system, including power management, interconnect, and storage (Extreme Co-design).

#### ④ Prefill/Decode disaggregation and low latency become standard

![d-Matrix's session slide on an ultra low latency architecture based on disaggregated inference](images/pasted-20261028-050815-8da229.jpg)

*▲ d-Matrix session: an ultra low latency architecture based on Disaggregated Inference*

- Disaggregated Inference was a common topic in sessions such as **d-Matrix**'s.
- Agentic workloads and long-context processing keep growing. In response, one architecture has become a standard requirement for AI data centers. It places the Prefill stage on compute-specialized hardware and the Decode stage on memory-bandwidth-specialized hardware. This delivers ultra low latency and high TPS at the same time.

### Outro: Closing AI Infra Summit 2026

The structural shifts and implications we saw in the global AI infrastructure market at **AI Infra Summit 2026** are clear.

- **A paradigm shift from "scaling compute" to "maximizing tokens per unit of power"**

  Token demand surged in a single year. The main bottleneck in data centers has moved from model size to power limits and cost per token($/token). The summit showed that infrastructure will win or lose on architectures that maximize token efficiency per watt and per dollar, not on raw chip specs.
- **The end of the paper spec era: the market is reorganizing around real workload benchmarks**

  In the B2B AI infrastructure market, theoretical peak FLOPS and formula-heavy spec sheets no longer work. What breaks a global customer's doubts about adoption is a **live inference server demo on real LLM workloads, a Streamlined Dataflow memory design, and a Prefill/Decode disaggregated architecture**.

HyperAccel will keep building on its LPU technology. Our goal is to offer the most token-efficient and power-friendly AI inference solution in the global AI infrastructure market.

*For questions about BERTHA's technical specifications or building LPU-based inference infrastructure, please contact us through the [HyperAccel official channel](https://hyperaccel.ai/contact/).*  
  
✉️ **Contact:** [contact@hyperaccel.ai](mailto:contact@hyperaccel.ai)  
🔗 **LinkedIn:** [HyperAccel Official LinkedIn](https://www.linkedin.com/company/hyperaccel)  
🌐 **Website:** [www.hyperaccel.ai](http://www.hyperaccel.ai)

---

## P.S.

### Join HyperAccel

HyperAccel develops the LPU, an AI chip for LLM inference, and BERTHA, a server built on it. We are looking for teammates who can turn the interest we met on the global stage into real products and business. If you are interested, please apply anytime.

**Career Site**: [https://hyperaccel.career.greetinghr.com/en/guide](https://hyperaccel.career.greetinghr.com/en/guide)
