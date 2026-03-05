# Reader Testing 질문 목록 (Transformer 블로그)

예상 독자(IT 계열, 연산 세부는 모름) 관점에서 문서만 보고 답할 수 있는지 검증용 질문이다.

1. **LLM이 실제로 하는 일이 뭔가요?**  
   → 문서: "다음 단어 예측", 찢어진 대본 비유로 설명됨.

2. **RNN/LSTM을 왜 쓰지 않고 Transformer를 쓰나요?**  
   → 문서: 직렬 vs 병렬, "Attention Is All You Need" 섹션에서 설명됨.

3. **Query, Key, Value는 각각 무슨 의미인가요?**  
   → 문서: Q=질문/찾고 싶은 것, K=색인/태그, V=실제 내용, fluffy blue creature 비유로 설명됨.

4. **Decoder에서 마스킹은 왜 하나요?**  
   → 문서: 미래 토큰이 과거를 알 수 없도록, 학습 시 답 유출 방지로 설명됨.

5. **Multi-Head Attention은 왜 여러 개인가요?**  
   → 문서: 문맥 갱신 방식이 다양함(Harry Potter vs Prince Harry 등), 서로 다른 패턴을 보기 위해 설명됨.

6. **KV cache가 뭐고, 왜 메모리 문제가 되나요?**  
   → 문서: Key/Value 저장, context 제곱에 따른 크기·대역폭, LLaMA-3-70B 예시로 설명됨.

7. **MHA, MQA, GQA 차이가 뭔가요?**  
   → 문서: 1:1 vs N:1 vs N:M KV 공유 관계로 비교됨.

8. **LM Head에서 다음 토큰은 어떻게 정하나요?**  
   → 문서: WTE 전치로 logit → Softmax → Argmax 또는 sampling으로 설명됨.

검증: 위 질문들은 모두 `index.ko.md` 본문에서 답을 찾을 수 있음.
