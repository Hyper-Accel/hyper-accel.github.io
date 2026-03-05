---
date: '2026-03-05T10:00:00+09:00'
draft: false
title: 'Transformer World: LLM의 기본 구조 완전 해부'
cover:
  image: "images/transformer-cover.jpg"
  alt: "Transformer Architecture"
  caption: "Transformer Architecture"
  relative: true
authors: [Hyunjun Park]
tags: ["Transformer", "LLM", "Attention", "GPT", "LLaMA", "KV Cache"]
categories: ["AI", "Deep Learning"]
summary: 'Transformer 기반 LLM의 내부 구조를 하나하나 뜯어보며, 각 모듈이 갖는 의미와 최적화 기법까지 정리합니다.'
comments: true
---

# Transformer World: LLM의 기본 구조 완전 해부

## Part 1: 등장 배경

### 세상을 바꾼 아키텍처, Transformer

AI가 기하급수적으로 발전하면서, AI의 핵심인 **LLM(Large Language Model)** 에 대한 관심도 함께 증가하고 있습니다. 채팅, 번역, 코드 생성, 요약처럼 자연어는 물론이고, 사진, 동영상, 오디오 등 거의 모든 입력을 처리하는 서비스들이 모두 LLM 위에 올라가 있고, 그 중심에 있는 아키텍처가 **Transformer** 입니다.

2017년 Google 연구팀이 발표한 논문 **"Attention Is All You Need"** 는 문장을 **한꺼번에** 행렬로 처리하는 방식을 제안했습니다. "Attention"만으로 시퀀스를 이해하고 예측할 수 있다는 아이디어가 핵심이었고, **GPU·TPU** 등 병렬 연산을 압도적으로 빠르게 수행할 수 있는 디바이스들이 출시되며 현실화되었습니다. 요즘 핫한 **Gemini** , **ChatGPT** 를 비롯해 오늘날 대부분의 LLM이 이 Transformer 구조를 기반으로 합니다.

### LLM이 하는 일: 다음 단어 예측

**Large Language Model(LLM)** 은 "주어진 텍스트에 이어질 다음 단어를 예측하는" 정교한 수학 함수입니다. 단, 한 단어를 확정적으로 고르는 것이 아니라, 가능한 모든 다음 단어에 **확률** 을 부여합니다. 그 확률 분포에서 매번 하나를 샘플링하기 때문에, 같은 질문을 해도 실행할 때마다 다른 답이 나올 수 있습니다. 학습은 엄청난 양의 텍스트를 처리하면서 이 예측을 점점 정확하게 만드는 과정입니다. 비유를 들어보겠습니다. 사람과 AI 어시스턴트가 대화하는 짧은 영화 대본을 상상해 보세요. 대본에는 사용자가 AI에게 하는 질문이 있고, AI의 답변 부분만 찢겨 나가 있습니다. 이때 "어떤 문장이든 넣으면 그다음에 올 단어를 그럴듯하게 예측해 주는 마법의 기계"가 있다면, 우리는 찢긴 부분부터 그 기계에 대본을 넣고, 예측된 단어를 이어 붙이고, 다시 넣는 과정을 반복해 대화를 완성할 수 있습니다. 이 채팅봇과 대화하는 일련의 과정이 바로 LLM이 동작하는 원리입니다.

"LLM을 학습한다"는 것은 "거대한 기계의 다이얼을 미세하게 조정하는 것"으로 생각할 수 있습니다. 모델의 동작은 수많은 **파라미터(parameter)** 혹은 **가중치(weight)** 로 결정됩니다. 이 값들을 바꾸면 주어진 입력에 대한 "다음 단어 확률"이 달라집니다. 사람이 이 값들을 직접 정하는 것이 아니라, 처음에는 무작위로 두고 수많은 문장 예제로 학습시키며 반복적으로 조정합니다. 다음 파트에서는 Transformer 연산이 어떻게 생겼고, 어떻게 혁명적인 발전을 이끌 수 있었는지 자세히 분석하고, 마지막 파트에서는 Transformer 연산의 병목과 이를 해결하기 위한 기초적인 최적화 기법 몇 가지만 간단하게 알아보겠습니다.

## Part 2: Transformer 기본 구조 쪼개보기

### 전체 구조 개관

모델마다 세부 사항은 다르지만, 이번 글에서는 가장 간단한 모델인 **GPT-2**를 기준으로 작성하겠습니다.
Transformer는 크게 Token Embedding, Decoder Block, LM Head 세 부분으로 나눌 수 있으며, 이때 Decoder Block은 일반적으로 동일한 n개(GPT-2의 경우 24개)의 블록이 쌓여 있습니다. 하나의 **Decoder Block**은 또 다음과 같이 여섯 부분으로 나눌 수 있습니다.

1. **Layer Normalization**
2. **Multi-Head Attention** — Q·K·V 연산 → Score 계산 → Softmax → Value 가중합 → Concatenation · Output Projection
3. **Residual Connection** — 입력과 Attention 출력을 더함
4. **Layer Normalization**
5. **Feed-Forward Network (FFN)**
6. **Residual Connection** — 입력과 FFN 출력을 더함

### Token & Positional Embedding

Transformer의 첫 단계는 각 **토큰(token)** 을 긴 숫자 리스트, 즉 벡터로 바꾸는 것입니다. 이때 일반적으로 인간이 받아드리는 하나의 단어가 하나의 토큰에 1:1 매핑되지는 않습니다만, 이해의 편의를 위해 본 글이서는 하나의 단어가 하나의 토큰에 매핑된다고 가정 후 설명을 이어가겠습니다. 학습은 연속값으로만 이루어지기 때문에, 언어를 숫자로 인코딩해야 하고, 이 리스트들이 해당 단어의 의미를 담게 됩니다. 즉, "각 단어가 긴 숫자 리스트로 변환되고, 이를 벡터라고 부르며, 이 벡터가 대응되는 단어의 의미를 갖는다"고 보시면 됩니다. 추가로 위치 정보도 필요합니다. 같은 단어라도 문장 안에서 어디에 있느냐에 따라 역할이 달라지기 때문입니다. 그래서 **토큰 임베딩** 과 **위치 임베딩** 을 함께 씁니다.

여기서도 역시 **GPT-2** Medium의 예시를 보겠습니다. 이 모델이 인식할 수 있는 토큰의 갯수(**Vocab size**)는 50,287개이고, 각 토큰은 1,024개의 숫자 리스트(**embedding dimension**)로 인코딩 됩니다. 이를 우리는 1024차원이라고도 표현합니다. **Word Token Embedding Table(WTE)** 는 크기 [50287, 1024]로, 토큰 하나하나를 1,024차원 벡터로 매핑합니다. **Word Positional Embedding Table(WPE)** 는 [1024, 1024]처럼 최대 위치 길이 × 1024로, 시퀀스 내 위치를 1,024차원 벡터로 매핑합니다. 토큰 ID 시퀀스를 WTE에 넣어 [seq_len, 1024]를 얻고, 위치 인덱스를 WPE에 넣어 [seq_len, 1024]를 얻은 뒤, 두 행렬을 **element-wise** 로 더합니다. 즉 **Attention Input = TokenEmbedding + PositionalEmbedding** 이고, shape은 [seq_len, 1024]입니다.

### Layer Normalization

**Layer Normalization(LayerNorm)** 은 각 토큰 위치마다, 그 토큰 벡터의 **특징 차원** 방향으로 평균과 분산을 맞춰 주는 정규화입니다. 저희가 중고등학교 수학시간에 배웠던 정규화(Normalization)와 정확히 일치하는 개념입니다. 입력 분포가 레이어마다 크게 달라지면 학습이 불안정해지고, 기울기 폭주나 소실이 생기기 쉽습니다. LayerNorm은 각 위치의 벡터를 "적당한 스케일과 분포"로 맞춰 학습을 안정시키고, 깊은 네트워크에서도 층을 많이 쌓을 수 있게 합니다.

### Self-Attention: Query, Key, Value의 의미

#### Attention이 해결하는 문제: 문맥에 따른 의미 결정 (여기서부터 이어읽기)

임베딩 직후에는 "bank", "mole", "tower" 같은 단어가 문맥과 상관없이 같은 벡터로 들어옵니다. 하지만 "Take a biopsy of the mole", "One mole of carbon dioxide", "American shrew mole"에서 **mole** 은 각각 점(피부), 몰(화학 단위), 두더지를 의미합니다. Transformer의 다음 단계인 **Attention** 블록에서, 주변 토큰들의 임베딩이 해당 토큰의 임베딩에 정보를 전달해 문맥에 맞는 의미로 **갱신** 합니다. 잘 학습된 모델은 임베딩 공간에 "mole의 여러 의미"에 해당하는 방향을 두고, Attention이 문맥을 보고 그중 어떤 방향으로 벡터를 움직일지 정합니다.

비슷한 비유로 **tower** 를 생각해 보겠습니다. 처음엔 "크고 높은 명사" 쪽의 일반적인 방향입니다. 바로 앞에 **Eiffel** 이 오면, 그 벡터가 tower 쪽으로 정보를 보내 "에펠 탑"에 가까운 방향으로 갱신됩니다. 앞에 **miniature** 까지 있으면 "큰 것"과의 연관이 줄어들고 더 구체적인 의미로 바뀝니다. 한 토큰에서 다른 토큰으로의 정보 전달은 단어 하나를 넘어 긴 거리, 풍부한 문맥까지 포함할 수 있습니다. 추리 소설 끝부분 "Therefore the murderer was..."에서 다음 단어를 맞추려면, 마지막 벡터 **was** 가 앞선 전체 문맥의 정보를 흡수해야 합니다. Attention이 바로 그 "어떤 토큰이 어떤 토큰을 얼마나 참조할지"를 계산하는 단계입니다.

#### Q, K, V 생성과 직관적 의미

Attention 입력은 shape [seq_len, N_embed] (예: [seq_len, 1024])입니다. 여기에 서로 다른 **가중치 행렬** W_Q, W_K, W_V를 곱해 **Query(Q)** , **Key(K)** , **Value(V)** 를 만듭니다. 수식으로는 Q = AttentionInput · W_Q + B_Q, K = AttentionInput · W_K + B_K, V = AttentionInput · W_V + B_V 입니다. GPT-2 Medium 기준 헤드 수 N_head=16, 헤드당 차원 head_dim=64이므로, Q·K·V를 [N_position, N_head, head_dim] 형태로 나눠 씁니다.

직관을 위해 "A fluffy blue creature roamed the verdant forest" 같은 문장을 생각해 보겠습니다. 한 가지 가능한 동작은 "형용사가 바로 다음 명사의 의미를 보강하는 것"입니다. 이때 **Query** 는 "나는 지금 무엇을 찾고 있는가?"를 나타내는 벡터입니다. 명사 **creature** 가 "내 앞에 형용사가 있나?"라고 묻는 질문이 Q에 인코딩된다고 보시면 됩니다. **Key** 는 "나는 어떤 종류의 정보를 갖고 있는가?"를 나타냅니다. 형용사 **fluffy** 나 **blue** 가 "나는 형용사다"에 해당하는 방향의 Key를 갖고, creature의 Query와 잘 맞으면(내적이 크면) 그만큼 강하게 반영됩니다. **Value** 는 "실제로 전달할 내용"입니다. fluffy가 creature에 더해 줄 구체적인 정보(예: "털이 많다")가 V에 담기고, Query–Key 유사도로 정해진 가중치로 다른 토큰들의 Value를 섞어 최종 갱신량을 만듭니다. 요약하면 Q는 찾고 싶은 것(질문), K는 내가 가진 태그·특징(색인), V는 실제 내용(답변·정보)입니다.

#### Query · Keyᵀ: 유사도 Score와 마스킹

각 **head** 안에서 Q는 [N_position, head_dim], K는 [N_position, head_dim]입니다. K를 전치해 Kᵀ [head_dim, N_position]로 두고 **Score = Q · Kᵀ** 를 계산하면 [N_position, N_position] 행렬이 나옵니다. 행은 "현재 Query를 가진 토큰", 열은 "참조 가능한 모든 위치"이고, (i, j) 원소는 i번째 토큰이 j번째 토큰을 얼마나 중요하게 보는지에 대한 스코어입니다. Query와 Key 벡터가 가까울수록(정렬될수록) 내적이 커집니다.

Decoder에서는 **미래 토큰이 과거를 알 수 없도록** 해야 합니다. 학습 시 "creature" 다음에 올 단어를 예측할 때 "roamed" 이후 정보를 쓰면 답을 그대로 보는 꼴이 됩니다. 그래서 **마스킹** 을 씁니다. "나보다 뒤에 있는 위치"의 Score를 Softmax 전에 −∞로 두면, Softmax 후에는 0이 되어, 뒤쪽 토큰은 앞쪽 토큰에 영향을 주지 않습니다. 즉 "뒤 토큰이 앞 토큰을 바꾸는 것"을 막는 것입니다.

#### Softmax & Value 가중합

Score 행렬의 각 **행** (각 Query 위치)에 **Softmax** 를 적용합니다. Softmax(x_i) = exp(x_i) / Σ_j exp(x_j) 이므로, 한 행의 합이 1이 되는 **Attention Weight** 가 됩니다. 이제 각 토큰이 "다른 토큰들을 얼마나 비중 두고 볼지"에 대한 확률 분포를 갖습니다. 예를 들어 "헬스 2, 테니스 1, 침대 0.1" 같은 원시 점수를 "헬스 0.7, 테니스 0.2, 침대 0.1"처럼 0~1, 합 1인 분포로 바꾸는 것과 같습니다.

**Attention Output = Attention Weight · V** 입니다. 각 Query 위치에서, 모든 위치의 Value 벡터에 위에서 구한 가중치를 곱해 **가중합** 하면, 그 위치에 더해 줄 갱신 벡터(ΔE)가 나옵니다. 이 ΔE를 원래 임베딩에 더하면 문맥이 반영된 새 임베딩 E'가 됩니다. 한 head에서 나온 출력은 [N_position, head_dim]이고, 수치 안정성을 위해 Score를 head_dim의 제곱근으로 나누는 스케일링을 쓰는 경우가 많습니다.

#### Multi-Head Attention과 Output Projection

한 head는 "형용사–명사" 같은 한 종류의 관계에 특화될 수 있지만, 문맥이 바뀌는 방식은 다양합니다. "they crashed the" 다음의 **car** 는 형태·구조가 달라지고, **Harry** 는 문맥에 "wizard"가 있으면 해리 포터, "Queen", "Sussex", "William"이 있으면 왕자 쪽으로 갱신되길 원할 수 있습니다. 그래서 **Multi-Head Attention** 은 서로 다른 Q·K·V 행렬을 가진 여러 head를 병렬로 돌립니다. 각 head는 서로 다른 서브스페이스에서 패턴(문법, 주어–동사, 장거리 의존 등)을 보고, head별로 [N_position, head_dim] 출력을 만든 뒤, 이들을 **concatenate** 해 [N_position, N_embed]로 만듭니다. 마지막으로 **Output Projection**(FC): ConcatenatedAttention · W_O + b_O 로 [N_embed, N_embed] 가중치를 적용해, 여러 head에서 나온 정보를 하나의 표현 공간으로 다시 묶습니다. 이것이 한 블록의 **Multi-Head Attention** 최종 출력입니다.

### Residual Connection

Self-Attention 출력과 원래 입력을 **더하는** 연결을 **Residual Connection(skip connection)** 이라고 합니다. y = x + AttentionOutput 형태입니다. 원래 정보 x를 유지한 채, Attention이 포착한 **변화분** 만 더하는 구조라서, 깊은 네트워크에서도 기울기가 잘 전달되고 학습이 안정적입니다. FFN 블록에서도 마찬가지로 FFN 출력과 FFN 입력을 더합니다.

### Feed-Forward Network (FFN)

Attention 블록 다음에는 **Feed-Forward Network(FFN)** 가 옵니다. 두 개의 **Linear** (또는 Conv1D) 레이어와 그 사이의 **비선형 활성화** 로 구성됩니다. 입력 [N_position, N_embed]에 첫 번째 Linear(가중치 [N_embed, 4*N_embed])를 적용해 [N_position, 4*N_embed]로 **확장** 하고, 활성화(예: GeLU)를 거친 뒤, 두 번째 Linear([4*N_embed, N_embed])로 다시 **축소** 해 [N_position, N_embed]를 만듭니다. 3Blue1Brown 비유대로 "언어에 대해 학습한 더 많은 패턴을 저장하는 추가 용량"을 주는 단계입니다. 각 위치마다 독립적으로 같은 MLP가 적용된다고 보시면 되고(**position-wise FFN**), Attention에서 모인 정보를 비선형 변환으로 더 복잡한 특징 공간에 매핑하는 역할을 합니다.

### LM Head: 다음 토큰 예측

마지막 Decoder layer의 출력에 LayerNorm을 적용한 뒤, **LM Head** 로 다음 토큰을 예측합니다. 보통 **Token Embedding Table(WTE)** 의 전치를 사용해 **logit** 을 계산합니다. [N_position, N_embed] × [N_embed, vocab_size] → [N_position, vocab_size]. 이 logit에 **Softmax** 를 적용하면 각 위치에서 vocab 전체에 대한 확률 분포가 나옵니다. **Argmax** 로 가장 확률이 높은 토큰을 고르거나, **sampling** 으로 확률에 따라 하나를 뽑아 다음 토큰 ID로 씁니다. 시퀀스 생성 시에는 보통 마지막 위치의 예측만 사용합니다.

## Part 3: 최적화 기법

### KV Cache와 메모리·대역폭 이슈

Attention 패턴(Score 행렬)의 크기는 **context size의 제곱** 입니다. 토큰이 N개면 N×N 행렬이므로, 문맥이 길어질수록 연산량과 메모리가 빠르게 늘어납니다. 추론 시에는 이전 스텝에서 계산한 **Key** 와 **Value** 를 다시 쓰기 위해 **KV cache** 에 저장합니다. 문맥이 길수록 이 캐시가 커져서, Transformer 기반 LLM은 문맥 길이 제한·메모리·대역폭이 큰 기술적 과제가 됩니다.

예를 들어 **LLaMA-3-70B** 를 **bfloat16(bf16)** 기준으로 100만 토큰 문맥으로 돌린다고 하겠습니다. 모델 파라미터 70B × 2 byte ≈ 140GB입니다. KV cache는 2(K,V) × 배치 1 × 레이어 80 × KV head 8 × head 차원 128 × 시퀀스 1M × 2 byte 식으로 잡으면 약 328GB 수준이 될 수 있습니다. 한 토큰을 생성할 때 읽어야 할 메모리가 모델 + KV cache로 약 468GB이고, 초당 20 토큰을 만들려면 이론상 10TB/s급 메모리 대역폭이 필요하다는 식으로 이해하시면 됩니다.

### KV Cache Architecture 비교 (MHA, MQA, GQA, MLA)

KV를 어떻게 저장·공유하느냐에 따라 여러 방식이 있습니다. 핵심 trade-off는 **정확도(표현력)** 와 **KV cache 크기(메모리·대역폭)** 사이의 균형입니다.

#### Multi-Head Attention (MHA)

원래 Transformer 논문에서 제안된 구조입니다. Query head마다 자기 전용 K, V head가 있어 **1 Query : 1 KV** 관계입니다. **GPT-3**, **LLaMA 1/2** 등이 이 방식을 씁니다.

- **장점**: head마다 독립적인 K, V를 가지므로 표현력이 가장 높고, 다양한 패턴을 동시에 포착할 수 있습니다. 정확도 면에서 가장 유리합니다.
- **단점**: KV cache를 head 수만큼 전부 저장해야 하므로, 문맥이 길어지면 메모리 사용량과 대역폭 요구가 급격히 커집니다.

#### Multi-Query Attention (MQA)

모든 Query head가 **하나의** K, V head를 공유합니다. **N Query : 1 KV**. **PaLM**, **Falcon**, **StarCoder** 등에서 사용합니다.

- **장점**: KV cache 크기가 MHA의 **1/N_head** 수준으로 줄어들어, 추론 시 메모리·대역폭 부담이 크게 감소합니다. 배치 크기를 늘리거나 긴 문맥을 처리하기 훨씬 유리합니다.
- **단점**: 모든 head가 같은 K, V를 보기 때문에, head별로 서로 다른 관계를 포착하는 능력이 떨어집니다. MHA 대비 정확도가 다소 하락하는 trade-off가 있습니다.

#### Grouped-Query Attention (GQA)

Query head를 여러 **그룹** 으로 나누고, 그룹마다 하나의 KV 쌍을 공유합니다. MHA(1:1)와 MQA(N:1)의 중간으로, **N Query : M KV** 관계입니다. 예를 들어 Query head 32개, KV head 8개면 Query 4개가 KV 1개를 공유합니다. **LLaMA-2-70B**, **LLaMA-3**, **Mistral** 등이 GQA를 씁니다.

- **장점**: MQA보다 KV head가 많아 표현력이 높으면서, MHA보다 KV cache가 작습니다. 정확도와 효율 사이에서 실전적으로 가장 균형 잡힌 선택지로 평가받고 있습니다.
- **단점**: MHA에 비하면 여전히 head 간 KV를 공유하므로 표현력이 제한되고, MQA만큼 메모리를 줄이지는 못합니다.

#### Multi-Head Latent Attention (MLA)

K, V를 저차원 **latent** 벡터로 압축(projection)한 뒤, 그 latent 공간에서 Attention을 수행합니다. KV cache에는 원래 K, V 대신 이 작은 latent 벡터만 저장하면 됩니다. **DeepSeek-V2/V3** 등에서 사용합니다.

- **장점**: KV cache를 원래 차원보다 훨씬 작은 latent 차원으로 압축하므로, GQA보다도 메모리 효율이 좋습니다. 동시에 head마다 독립적인 Q를 유지해 표현력을 크게 희생하지 않습니다.
- **단점**: latent projection을 위한 추가 연산(압축·복원 행렬곱)이 필요하고, 구현 복잡도가 높습니다. 압축 과정에서 정보 손실이 발생할 수 있어, 압축 비율을 잘 조절해야 합니다.

### 정리

이 글에서는 LLM의 동작 원리부터 LLM을 구성하는 각 연산의 의미를 적절한 비유와 함께 살펴보았습니다. 다시 한번 요약하자면, Transformer architecture는 크게 Token Embedding, Decoder Block, LM Head 세 부분으로 구성되어 있고, Decoder Block은 다시 LayerNorm, Attention, Residual, LayerNorm, FFN, Residual로 쪼개서 살펴볼 수 있습니다. 이어서 문맥 길이에 따른 O(N²) 비용과 KV cache 메모리·대역폭 이슈, 그리고 이를 해결하기 위한 MHA·MQA·GQA·MLA 같은 KV Cache 관련 기본적인 구조 변형을 비교해보았습니다. 

## Reference
(추가해줘)

## HyperAccel은 채용 중 입니다!

저희는 요즘 핫이슈인 LLM의 최전선에서 고분군투하며 성장하고있는 NPU 스타트업입니다.

저희가 다루는 기술들을 보시고, 관심이 있으시다면 [HyperAccel Career](https://hyperaccel.career.greetinghr.com/ko/guide)로 지원해주세요!

HyperAccel에는 정말 훌륭하고 똑똑한 엔지니어분들이 많습니다. 여러분의 지원을 기다립니다.
