---
date: '2026-10-23T00:00:00+09:00'
title: "AI Infra Summit 2026: 늘어나는 AI 추론 비용, LPU가 제시하는 새로운 해법"
authors: ["Soyoung Park"]
tags: ["conference", "AI INFRA SUMMIT", "report"]
categories: ["Conference Reports"]
summary: "AI Infra Summit 2026에 골드 스폰서로 참가한 HyperAccel의 현장 기록입니다. CEO 발표, BERTHA 라이브 데모, 글로벌 고객과의 만남과 AI 추론 시장의 트렌드를 정리했습니다."
cover:
  image: "images/pasted-20261028-041537-ed2862.jpg"
  alt: "AI Infra Summit 2026 행사장과 HyperAccel 부스"
  relative: true
comments: true
---

안녕하세요. **HyperAccel Marketing 박소영** 입니다.

AI 모델이 고도화되고 적용 범위가 넓어질수록, 이를 실제로 구동하고 운영하는 AI 추론 인프라(Inference Infrastructure)의 중요성이 그 어느 때보다 커지고 있습니다. 특히 Enterprise 환경에서는 단순한 모델 성능을 넘어 LLM 추론 비용, 전력 소비량, 시스템 전체의 TCO(총소유비용)가 서비스의 성패를 가르는 핵심 지표가 되었습니다.

지난 9월, 미국 실리콘밸리 산타클라라에서 열린 **AI Infra Summit 2026** 현장에서 HyperAccel이 확인한 최신 AI 추론 시장의 트렌드와, LPU BERTHA를 통해 제시한 AI 인프라의 미래를 공유합니다.

**💡 이번 글은 다음과 같은 분들께 추천합니다:**

- AI 반도체와 LLM 추론 시장의 최신 흐름이 궁금한 분
- 글로벌 AI 인프라 기업들의 기술 및 사업 전략을 살펴보고 싶은 분
- 실제 LLM 서비스 적용을 위해 LPU 기반 추론 인프라 도입을 검토 중인 분

---

## AI INFRA SUMMIT 2026 소개

![AI_Infra_Summit_blog.jpg](images/pasted-20261028-041537-ed2862.jpg)

### \[AI INFRA SUMMIT 2026 개요\]

**AI Infra Summit 2026** 은 9월 15일부터 17일까지 미국 캘리포니아주 산타클라라 컨벤션센터에서 개최된 글로벌 AI 인프라 전문 컨퍼런스입니다.

올해로 9회째를 맞이한 이번 행사에는 **약 8,000명의 글로벌 참관객**, **400여 명의 전문 연사**, 그리고 **250여 개 파트너사** 가 한자리에 모였습니다. AI Data Center부터 Compute, Data Movement, Data &amp; Models, Physical AI에 이르기까지 AI 인프라 생태계 전반을 아우르는 최신 기술 트렌드와 전략이 다양하게 논의되었습니다.

메인 스테이지 키노트에는 **NVIDIA, AMD, AWS, Meta, Google, Intel** 등 글로벌 빅테크 기업의 리더들이 연사로 나섰으며, 국내에서는 **HyperAccel** 을 포함해 SK하이닉스, 삼성전자, 리벨리온, 퓨리오사AI, 망고부스트, 모레 등이 스폰서로 참여했습니다.

### \[HyperAccel's Presence\] 골드 스폰서 참여 및 첫 단독 부스 운영

HyperAccel은 이번 행사에 골드 스폰서(Gold Sponsor)로 참여해 글로벌 무대에서 처음으로 자체 단독 부스를 운영했습니다.

부스에서는 HyperAccel의 핵심 LPU(LLM Processing Unit) **'BERTHA'의 실시간 라이브 데모** 를 선보여 현장 참관객들의 큰 호응을 얻었습니다. 또한, 행사 첫날인 9월 15일에는 Compute Track 세션에서 **김주영 대표의 단독 발표** 를 통해 HyperAccel이 정의하는 토큰 효율성 중심의 AI 인프라 비전을 성공적으로 전달했습니다.

이번 AI Infra Summit 2026은 HyperAccel의 독보적인 LPU 기술력과 제품을 글로벌 AI 시장에 각인시키고, 현장을 찾은 세계 각국의 빅테크 및 인프라 파트너들과 실질적인 협력 가능성을 타진한 뜻깊은 자리였습니다.

## 주요 세션 및 부스

### 1. CEO 발표: 토큰 가격은 낮아지는데, 왜 AI 서비스 비용은 늘어날까?

![AI_Infra_Summit_collage.jpg](images/pasted-20261028-042419-85a19a.jpg)

▲ HyperAccel 김주영 대표 발표 모습

행사 첫날인 9월 15일, 하이퍼엑셀(HyperAccel) 김주영 대표는 Compute Track 세션에서 "Redefining AI Infrastructure Through Token Efficiency"를 주제로 발표에 나섰습니다.

이날 발표의 핵심은 ‘AI 추론 비용을 바라보는 새로운 시각’이었습니다.

현재 1k 토큰당 단가는 빠르게 낮아지고 있지만, 아이러니하게도 실제 기업들의 AI 서비스 구축·운영 비용은 오히려 급증하고 있습니다. 하나의 복잡한 미션을 완수하기 위해 생성되는 추론 토큰(Reasoning Tokens), 에이전트가 툴을 호출하며 소비하는 에이전틱 토큰(Agentic Tokens), 그리고 점차 길어지는 KV 컨텍스트(Context Window)로 인해 작업 1건당 처리해야 할 전체 토큰 수가 폭발적으로 늘어났기 때문입니다.

결국 단순히 토큰당 단가를 낮추는 단편적인 접근을 넘어, **전체 추론 과정에서 토큰을 얼마나 효율적으로 처리할 수 있는 인프라를 구축하느냐** 가 핵심 과제입니다. 하이퍼엑셀은 이를 위한 3가지 핵심 접근 방식을 제시했습니다.

- **Token Efficiency (토큰 효율성):** LLM 추론에 최적화된 LPU 아키텍처를 소개했습니다. Big Core 연산 엔진과 메모리·연산 공동 설계(Co-design) 기반의 Streamlined Dataflow를 통해 메모리 대역폭 활용률을 극대화했습니다. 그 결과, LLM 추론 시 **평균 83%, 최대 90% 이상** 의 높은 대역폭 활용률을 달성했습니다.
- **Enterprise Performance &amp; Cost (성능 및 비용):** 엔터프라이즈 AI 인프라의 핵심 지표인 처리량(TPS), 전력 효율, TCO(총소유비용) 관점에서 Bertha의 성능을 공유했습니다. 워크로드와 비교 대상에 따라 **와트·달러당 최대 3\~5배 수준의 효율 개선** 이 가능함을 입증했습니다.
- **Disaggregation &amp; Edge (아키텍처 및 에지 확장성):** Prefill과 Decode 단계를 분리하여 추론 성능과 효율을 극대화하는 아키텍처 구성과 더불어, 데이터센터용 'Bertha'부터 온디바이스 AI용 'Bertha-Edge'까지 이어지는 폭넓은 제품 로드맵을 선보였습니다.

발표 직후 많은 참석자들이 하이퍼엑셀 부스를 방문해 Bertha의 실시간 추론 시연을 참관하고 자사 인프라 적용 가능성을 논의했습니다. 발표에서 전달한 기술적 비전이 실제 제품 체험과 현장 논의로 자연스럽게 이어진 순간이었습니다.

*자세한 발표 요약은 [HyperAccel 공식 LinkedIn 발표 요약 게시글](https://www.linkedin.com/feed/update/urn:li:activity:7506366519862300672)에서 확인하실 수 있습니다.*

### 2. BERTHA 라이브 데모: 눈앞에서 직접 증명한 AI 성능

![AI_Infra_Summit_booth_demo_collage (1).jpg](images/pasted-20261028-042836-90ee59.jpg)

▲ HyperAccel LPU Live Demo 시연 현장 

이번 전시에서 가장 주목할 만한 부분은 **HyperAccel LPU BERTHA** 를 활용한 라이브 데모였습니다.

HyperAccel 부스는 전시장 안쪽에 위치했음에도 불구하고, 실제 LLM 추론이 구동되는 실시간 시연을 통해 방문객들의 시선을 사로잡았습니다. 눈앞에서 구동하는 AI를 직접 확인한 방문객들의 관심은 현장에서의 기술 논의 및 비즈니스 상담으로 이어졌습니다.

행사 기간 3일 동안 300명 이상의 AI 인프라 관계자가 부스를 찾았습니다. AI 반도체처럼 깊은 기술적 이해가 필요한 딥테크 제품은 아키텍처나 스펙 시트만 설명해서는 실제 도입 효과를 체감하기 어렵습니다. 하지만 **작동하는 실물과 성능을 눈으로 직접 확인하는 순간** 달라집니다. 방문객들은 기술의 현실성을 즉각 이해하고, 자사 인프라 환경에 적용할 구체적인 방법을 질문하기 시작했습니다.

실제로 데이터센터 사업자, 클라우드 기업, 서버 유통사 등 다양한 분야의 고객들이 부스를 방문해 LPU 도입 타당성을 확인했습니다. 또한, 글로벌 기술 콘텐츠 제작자인 Ian Cutress(TechTechPotato)가 부스를 찾아 BERTHA 라이브 데모를 취재하고 인터뷰를 진행하는 등 현장의 열기가 주요 미디어 채널로 확장되기도 했습니다.

전시 공간의 규모나 위치보다 훨씬 중요한 것은 **‘제품의 가치를 얼마나 직관적으로 경험하게 만드느냐’**, 그리고 그 경험을 ‘실질적인 협력 기회로 이어가느냐’라는 점을 다시 한번 확인한 계기였습니다.

🔗 생생한 현장 스케치는 **\[[*Day 1 현장 기록*](https://www.linkedin.com/feed/update/urn:li:activity:7506005768014561280)\]** 과 **\[[*Day 2 라이브 데모 현장*](https://www.linkedin.com/feed/update/urn:li:activity:7506382400264929280)\]** 에서 확인하실 수 있습니다.  
🎬 현장 취재 영상: [***TechTechPotato HyperAccel BERTHA 라이브 데모 시연 &amp; 현장 취재***](https://www.linkedin.com/feed/update/urn:li:activity:7507628607909830656)

### 3. 글로벌 AI 인프라 시장을 관통하는 4가지 트렌드

![Siemens_stage.jpg](images/pasted-20261028-050543-2fbd73.jpg)

▲ AI Infra Summit 2026 메인 스테이지 현장 전경

### ① 병목은 모델이 아니라 용량, 전력, 그리고 토큰 비용 ($/token)

![Furiosa_trend1_pair.jpg](images/pasted-20261028-050630-10a6e5.jpg)

▲ FuriosaAI 발표 세션: AI 워크로드의 추론 전환과 전력/토큰 비용 병목 제시

- **FuriosaAI** 발표(*Alex Liu, SVP*)에 따르면, 전 세계 AI 워크로드는 학습(Training)에서 추론(Inference) 위주로 빠르게 전환되고 있으며, 1년 만에 토큰 수요가 20배 급증했습니다.
- 이제 AI 인프라의 핵심 질문은 "컴퓨팅 파워를 얼마나 크게 지을 것인가?"가 아니라, "단위 컴퓨트당 얼마나 많은 유용한 AI 작업을 뽑아낼 수 있는가?"입니다. GPU 중심의 퍼스트 인프라가 전력(Power)과 냉각(Cooling) 한계에 부딪히면서, 와트·달러당 토큰 효율성을 극대화하는 LPU 같은 전용 아키텍처의 필요성이 그 어느 때보다 명확해졌습니다.

### ② Sovereign AI의 부상과 '단순 칩'을 넘어선 turnkey 랙 스케일(Rack-Scale) 경쟁

![Rebellions_trend2_pair.jpg](images/pasted-20261028-050718-a83d78.jpg)

*▲ Rebellions 발표 세션: Sovereign AI 및 랙 스케일(RebelRack/RebelPOD) 통합 플랫폼 로드맵*

![c_rack_en.jpg](images/pasted-20261029-011146-e2576e.jpg)

![c_chips (1).jpg](images/pasted-20261029-013543-6b5e0d.jpg)

*▲ \[AI Infra Summit 2026\] 주요 AI 반도체 및 인프라 기업들의 랙 스케일(Rack-Scale) 시스템 현장 스케치*

- 국가 및 기업별 데이터 주권을 보장하는 'Sovereign AI' 인프라 구축과 실제 상용화/양산(Commercialized/Deployed) 단계 진입이 핵심 화두로 제시되었습니다. 단품 칩(Chip)을 넘어 서버(RebelServer), 랙(RebelRack), 데이터센터 POD(RebelPOD) 단위의 통합 AI 인프라 플랫폼을 완성해 데이터센터 ROI와 즉시 배포 가능성(Zero Friction)을 입증하는 것이 시장 진입의 결정적 기준임을 강조했습니다.
- **글로벌 칩 기업들의 다양한 추론 전략:** **AMD**(Helios 랙 스케일 플랫폼)와 **Qualcomm**(Dragonfly 라인업)은 랙 단위 시스템 최적화를 전면에 내세웠습니다. 한편 **Tenstorrent**(Galaxy Blackhole 시스템 실물 시연), **SambaNova**, **Cerebras** 등 도전자 기업들도 각자의 독자적인 아키텍처와 시연을 기반으로 상담 중심 부스를 운영하며 시장에서의 존재감을 피력했습니다.

### ③ 전력 효율 최적화(Power Optimization)와 Extreme Co-design 및 인프라 생태

![NVIDIA_trend3_pair.jpg](images/pasted-20261028-050741-cfd097.jpg)

*▲ NVIDIA Ian Buck 키노트 세션: DSX MaxLPS 기반 데이터센터 전력 최적화 및 Extreme Co-design*

- **NVIDIA** Ian Buck 은 키노트를 통해 DSX AI Factory Platform과 DSX MaxLPS 기술을 공개하며 데이터센터의 버려지는 유휴 전력을 회수해 최대 40% 더 높은 컴퓨트 성능과 처리량(Throughput)을 얻는 기술을 제시했습니다.
- 또한 Vera Rubin / Groq 3 LPX / d-Matrix 등과의 연동 사례에서 보듯, 이제 개별 칩 성능을 넘어 전력 관리, 인터커넥트, 스토리지까지 랙 전체를 하나의 통합 시스템으로 설계(Extreme Co-design)하는 방향으로 진화하고 있습니다.

![c_cloud (2).jpg](images/pasted-20261029-013621-e4176e.jpg)

*▲ \[AI Infra Summit 2026\] AI 클라우드, 에이전트 운영 및 인프라 조달 생태계 부스 현장 스케치 (좌측 상단부터 시계방향: AWS, Red Hat, HCLTech, Lambda, Server Monkey, RackN, Rafay, Crusoe)*

- **AI 클라우드 및 인프라 운영 생태계:** AWS, Lambda, Crusoe 등 AI 클라우드 기업들은 단순 성능 경쟁을 넘어 **보안 인증(SOC 2, ISO 27001), ROI, 비용 통제** 등 기업 고객의 실질적 도입 요건을 앞세웠습니다. 또한 Rafay, Server Monkey, RackN 등 운영·조달 파트너사들도 **'Token Factory'** 및 'GPU 서버 빠른 조달'을 주요 메시지로 내걸며, 토큰 처리 효율과 조달 속도가 인프라 경쟁력의 핵심 축이 되었음을 보여주었습니다.

### ④ Prefill / Decode 분리(Disaggregation)와 저지연(Low Latency)의 표준화

![dMatrix_trend4_pair.jpg](images/pasted-20261028-050815-8da229.jpg)

*▲ d-Matrix 세션: Disaggregated Inference 기반 Ultra Low Latency 아키텍처*

![c_interconnect_booth2.jpg](images/pasted-20261029-014521-5776df.jpg)

*▲* 인터커넥트(Interconnect) 주요 기업 부스 현장 스케치 (좌측 상단부터 시계방향: Broadcom, Lightmatter, ZeroFlap, Samtec)

- **d-Matrix 세션:** 에이전틱(Agentic) 워크로드와 Long-Context 처리가 늘어남에 따라, Prefill 단계를 연산 특화 영역에 배치하고 Decode 단계를 메모리 대역폭 특화 영역에 분리하여 **Ultra Low Latency와 높은 TPS를 동시에 달성하는 아키텍처**가 AI 데이터센터 구축의 필수 표준으로 자리 잡았음을 다루었습니다.
- Data Movement &amp; Interconnect)
  - **Broadcom:** 스케일업/스케일아웃을 위한 통합 패브릭 솔루션 제시
  - **Lightmatter:** 'Passage + Guide' 프라이빗 미팅룸 중심의 B2B 파트너십 전개
  - **ZeroFlap &amp; Samtec:** PCIe Gen6 기반 저전력 연결 및 차세대 구리/광 패브릭 시연

**\[ Outro: AI Infra Summit 2026을 마치며 \]**

이번 **AI Infra Summit 2026** 현장에서 확인한 글로벌 AI 인프라 시장의 거대한 구조적 변화와 시사점은 다음과 같이 명확합니다.

- **'컴퓨팅 파워 확장'에서 '단위 전력당 토큰 처리량 극대화'로의 패러다임 전환**

  1년 만에 토큰 수요가 폭증하면서, 데이터센터의 핵심 병목은 모델 크기가 아닌 전력 한계와 토큰당 비용($/token)으로 이동했습니다. 이제 인프라의 승패는 단순 칩 스펙이 아닌, 와트당·달러당 토큰 효율을 극대화하는 아키텍처에 달려있음을 입증한 자리였습니다.
- **스펙북(Paper Spec) 시대의 종말, '실제 워크로드 벤치마크 검증' 위주의 시장 재편**

  B2B AI 인프라 시장에서는 더 이상 이론적 Peak FLOPS나 수식 위주의 스펙 시트가 통하지 않습니다. 실제 LLM 워크로드 기반의 **실시간 추론 서버 구동 데모, Streamlined Dataflow 메모리 설계, 그리고 Prefill/Decode 분리 아키텍처** 만이 글로벌 고객의 도입 불확실성을 깨는 유일한 기준입니다.

HyperAccel은 앞으로도 독보적인 LPU 기술력을 바탕으로, 글로벌 AI 인프라 시장에서 가장 효율적인 AI 추론 솔루션을 제시해 나가겠습니다.

*BERTHA의 기술 사양이나 LPU 기반 추론 인프라 구축에 관해 궁금한 점은 언제든 [HyperAccel 공식 채널](https://hyperaccel.ai/contact/)로 문의해 주시기 바랍니다.*  

✉️ **Contact:** [contact@hyperaccel.ai](mailto:contact@hyperaccel.ai)  
🔗 **LinkedIn:** [HyperAccel Official LinkedIn](https://www.linkedin.com/company/hyperaccel)  
🌐 **Website:** [www.hyperaccel.ai](http://www.hyperaccel.ai)

---

## 추신

### HyperAccel 채용 안내

HyperAccel은 LLM 추론을 위한 AI 반도체 LPU와 이를 기반으로 한 서버 BERTHA를 개발하고 있습니다. 글로벌 무대에서 만난 고객과 파트너의 관심을 실제 제품과 사업으로 이어갈 팀원을 기다리고 있습니다. 관심이 있으시다면 언제든 지원해 주세요.

**채용 사이트**: [https://hyperaccel.career.greetinghr.com/ko/guide](https://hyperaccel.career.greetinghr.com/ko/guide)
