---
date: '2026-10-15T10:00:00+09:00'
draft: true
title: 'Ceph 뜯어먹기 1편: CRUSH'
cover:
  image: "images/ko/cover.webp"
  alt: "CRUSH가 cluster map의 row, cabinet, disk 계층을 따라 replica를 배치하는 과정"
  caption: "CRUSH Placement Rule 예시 (Weil et al., SC'06 Figure 1 재구성)"
  relative: true
authors: [Sinhyun Park]
tags: [ceph, crush, distributed storage, object storage]
categories: [storage]
series: ["Ceph 뜯어먹기"]
series_idx: 1
summary: "Ceph의 근간인 데이터 분산 알고리즘 CRUSH를 SC'06 논문을 바탕으로 정리합니다. Mapping Table 없이 Object 위치를 계산하는 원리, Placement Rule과 Failure Handling, Cluster 변경 시 데이터 이동, Bucket Algorithm별 Trade-off를 다룹니다."
description: "현대 분산 스토리지 오픈소스 중 가장 널리 사용되고 있는 Ceph의 근본, CRUSH 알고리즘부터 뜯어봅시다."
keywords: [Ceph, CRUSH, Object Storage, Placement Rule, Cluster Map, Bucket Algorithm, Straw, Distributed Storage]
comments: true
---

## 들어가며

안녕하세요? HyperAccel LLMOps팀 박신현입니다. 

**Ceph 뜯어먹기** 시리즈는 오픈소스 분산 스토리지인 Ceph의 내부 동작을 처음 접하는 엔지니어의 눈높이에서 하나씩 뜯어보는 시리즈입니다.

첫 편에서는 Ceph의 근간이 되는 데이터 분산 알고리즘인 **Controlled Replication Under Scalable Hashing(CRUSH)** 를 다룹니다. 본 글은 [CRUSH: Controlled, Scalable, Decentralized Placement of Replicated Data(SC'06)](https://ceph.io/assets/pdfs/weil-crush-sc06.pdf) 논문을 바탕으로 설명합니다.

---

## Background

### Object-based Storage

> Object Storage는 데이터를 파일이나 블록이 아니라 독립적인 **Object 단위** 로 저장하고 관리합니다.

- 일반 파일 스토리지는 데이터를 디렉토리 구조, inode 등 metadata를 통해 관리합니다.
- Object Storage는 데이터를 Object ID(Key)와 Object(Value)로 관리합니다.

```text
bucket
├── logs/2026/09/09/a.json
├── logs/2026/09/09/b.json
└── model/llama/weights-001
```

- 데이터 저장 구조가 단순하며 scale-out에 유리하고 replication 비용이 낮습니다.
- Object 기반 대규모 분산 스토리지는 데이터를 작은 Object로 쪼개서 여러 Disk에 분산 저장합니다.
  - 대규모 데이터 R/W 시 여러 Storage Device에서 병렬 처리합니다.
  - 장애에 대비해 Replica와 Erasure Coding Shard를 분산 배치합니다.

{{< figure src="images/ko/object-storage-overview.svg" alt="디렉토리와 inode로 관리하는 파일 스토리지와 key로 Object에 바로 접근하는 Object Storage 비교, 큰 데이터를 Object 4개로 나눠 OSD 4개에 분산 저장하는 모습" align="center" class="full-width" >}}

> Object Storage의 과제는 **수많은 Object를 어떤 Device에 저장할 것인가?** 입니다.

---

## Challenge

### Q1. Object Metadata Scalability

Ceph에서 실제로 데이터를 저장하는 Disk 단위를 **Object Storage Daemon(OSD)** 라고 부릅니다. 아래는 Object와 OSD의 매핑 정보를 표로 저장하는 방식입니다.

```text
object-A → osd.1
object-B → osd.7
object-C → osd.3
...
```

- Object와 Disk의 매핑 정보를 모두 저장한다면 Metadata 부하로 확장성과 가용성이 떨어집니다.

{{< figure src="images/ko/metadata-table-vs-crush.svg" alt="모든 client가 Metadata Server에 위치를 조회하는 방식과 각 client가 CRUSH로 위치를 직접 계산하는 방식 비교" align="center" class="full-width" >}}

- 왼쪽처럼 모든 요청이 Metadata Server를 거치면, 이 서버가 병목이자 단일 장애점이 됩니다.
- 오른쪽은 이 글에서 다룰 CRUSH 방식입니다. 각 client가 위치를 직접 계산하므로 중앙 조회가 필요 없습니다.

> Object Placement **정보를 저장하지 않고도** 어느 노드에서나 Object의 위치를 계산할 수 있는가?

### Q2. Reliable Replica Placement

데이터를 여러 Device에 분산 저장한다고 해도 반드시 안전한 것은 아닙니다.

{{< figure src="images/ko/failure-domain-racks.svg" alt="replica 3개를 한 rack에 모두 둔 경우와 rack 3개에 하나씩 나눠 둔 경우의 rack-1 전원 장애 영향 비교" align="center" class="full-width" >}}

- 왼쪽처럼 **동일한 rack domain에 replica가 모두 배치** 된다면, power fail 시 데이터에 접근할 수 없습니다.
- 오른쪽처럼 rack마다 replica를 하나씩 두면, rack 하나가 멈춰도 남은 replica로 데이터에 접근할 수 있습니다.
- Replica의 배치는 Rack, Power, Site, Server 등 여러 가지 Failure Domain을 고려해야 합니다.

> 데이터 배치 과정에서 Failure Domain을 구분하고 구조화할 수 있는가?

### Q3. Dynamic Cluster & Data Rebalancing

```python
# N = Device 개수
device = hash(object_id) % N
```

- hash 기반의 분산 배치는 randomness를 활용해 Object를 여러 Device에 균등하게 분산 배치할 수 있습니다.

스토리지 클러스터는 Device 추가, 삭제, 변경 등으로 구성이 지속적으로 바뀝니다. 일부 Device가 고장나면 해당 데이터를 다른 Device로 옮겨야 합니다.

```text
hash(x) % 10 -> hash(x) % 11 ...?
```

아래는 Device를 4개에서 5개로 늘렸을 때 Object 12개의 위치가 어떻게 바뀌는지 보여 주는 예시입니다.

{{< figure src="images/ko/hash-mod-remapping.svg" alt="hash % 4에서 hash % 5로 바꾸면 Object 12개 중 9개가 다른 Device로 이동하는 예시" align="center" class="full-width" >}}

- **Device의 개수가 바뀌게 되면** 기존 Object의 매핑이 대부분 변경됩니다. 결과적으로 **대량의 relocation** 이 필요합니다.

> 클러스터 상태 변화에 맞게 데이터를 재분배하면서도, 데이터 이동량을 최소화할 수 있는가?

---

## Solution: CRUSH Overview

> CRUSH는 Object Placement를 **Mapping Table에 저장하는 대신, Hash 함수를 바탕으로 계산** 합니다.

```text
object_id -> CRUSH(object_id, cluster_map, placement rule) -> [device1, device2]
```

- CRUSH는 hash 함수로 Object Placement를 계산하므로 데이터가 **pseudo-random** 하게 분산됩니다.
- 그러나 같은 `(object_id, cluster_map, placement rule)` 을 입력하면 언제나 같은 값이 나오는 **deterministic** 알고리즘입니다.

### Deterministic Pseudo-random Placement

```text
CRUSH(X) = 항상 OSD 7번
```

- Object `X` 가 있을 때, CRUSH 알고리즘의 결과는 항상 OSD 7번입니다.

```text
X, Y, Z -> CRUSH(X), CRUSH(Y), CRUSH(Z) -> OSD 7번, 3번, 5번
```

- 많은 Object에 대해서는 CRUSH 값이 여러 Device에 랜덤하게 분산됩니다.

> **중앙 Placement 저장 서버 없이** 모든 노드가 독립적으로 Object의 위치를 계산할 수 있습니다.

### Cluster Map

> CRUSH는 클러스터의 물리적 구조를 **Weighted Hierarchy Tree** 로 표현합니다.

```text
root
└── row
    └── cabinet
        └── shelf
            └── device (말단 Disk)
```

- Tree Leaf는 실제로 데이터가 저장되는 Device입니다.
- Tree Node는 Device를 계층적 구조로 관리하기 위한 Node로, `Bucket` 이라고 부릅니다.
  - 논문 예시에서는 **root > row > cabinet > shelf** 순서의 4계층 Bucket을 사용합니다.

{{< figure src="images/ko/crush-placement-rule-example.svg" alt="root에서 row 하나, cabinet 세 개, disk 하나씩을 차례로 선택하는 CRUSH 계층 탐색 예시" attr="Weil et al., CRUSH (SC'06) Figure 1 재구성" attrlink="https://ceph.io/assets/pdfs/weil-crush-sc06.pdf" align="center" class="full-width" >}}

- Device와 Bucket은 각각 개별적인 Weight를 가집니다.
  - **Device Weight**: 해당 Device가 저장할 상대적인 데이터의 양입니다. 일반적으로 용량에 비례합니다.
  - **Bucket Weight**: `Σ child weights` 로, 하위 Bucket과 Device Weight의 합입니다.

Bucket 안에서 Device Weight가 다음과 같다면 각 Device는 `1 : 2` 비율로 데이터를 저장합니다.

```text
osd.1 weight = 1
osd.2 weight = 2
```

{{< figure src="images/ko/bucket-weight-tree.svg" alt="leaf weight가 1인 네 개의 Device, weight 2인 두 개의 하위 Bucket, weight 4인 상위 Bucket으로 구성된 트리" align="center" class="full-width" >}}

- 상위 Bucket의 Weight는 하위 Bucket Weight의 합 `(2+2)` 입니다.
- 하위 Bucket의 Weight는 하위 Device Weight의 합 `(1+1)` 입니다.

> cluster map을 통해 각 IDC site, Rack, Network Switch 등 **실제 Failure Domain을 계층적 Bucket에 할당** 함으로써 물리적인 환경을 구조화할 수 있습니다.

{{< figure src="images/ko/cluster-map-failure-domains.svg" alt="root 아래에 IDC, Rack, Switch, Device 순서로 Bucket을 구성한 cluster map과 계층별 replica 배치 전략" align="center" class="full-width" >}}

- 서로 다른 IDC site를 root Bucket에 할당하여 **cross-IDC 데이터 클러스터** 를 구축합니다.
- 각 Rack을 상위 Bucket에 할당하고, Bucket별로 2개씩 **replica를 분산하여 가용성** 을 높입니다.
- 각 Switch를 하위 Bucket에 할당하고, Bucket에 **replica를 몰아넣어 replica 간 동기화 비용** 을 줄입니다.

### Placement Rule

> Placement Rule은 cluster map을 어떤 방식으로 탐색하고 Replica를 배치할지 결정합니다.

예를 들어 cluster map에 row, cabinet, disk로 3계층 Bucket이 존재한다고 해 보겠습니다.

```text
root
 ↓
row1    row2
 ↓       ↓
cab21   cab23   cab24
 ↓       ↓       ↓
disk    disk    disk
```

- replica를 동일한 row에 몰아서 배치하여 rebalancing 비용을 줄일지 정할 수 있습니다.
- 반대로 replica를 서로 다른 row에 분산하여 가용성을 높일지 정할 수도 있습니다.

CRUSH 알고리즘의 `TAKE / SELECT / EMIT` 함수를 통해 이러한 replica 배치 정책을 결정합니다.

{{< columns >}}
```text
take(root)
select(1,disk)
emit
```
<--->
```text
take(root)
select(1,row)
select(3,cabinet)
select(1,disk)
emit
```
{{< /columns >}}

> Placement Rule로 Replica를 특정 Failure Domain에서는 분리하면서, 다른 Domain에는 제한할 수 있습니다.

---

## Placement Algorithm

### TAKE / SELECT / EMIT

> Placement Algorithm은 **TAKE / SELECT / EMIT** 로 구성된 Placement Rule에 따라 cluster map을 **재귀 탐색** 하면서 Object id에 대한 적절한 disk를 찾습니다.

```text
TAKE(a)
SELECT(n, t)
EMIT

- i = 현재 working vector
- b = 현재 descent 중인 bucket
- o = b에서 선택한 candidate
```

```text
root
 ↓
row1    row2
 ↓       ↓
cab21   cab23   cab24
 ↓       ↓       ↓
disk    disk    disk
```

**`TAKE(a)`** 는 탐색을 시작하는 entry point를 working vector `i` 에 집어넣는 함수입니다.

```text
take(root) -> [root]
```

**`SELECT(n,t)`** 는 현재 working vector `i` 의 각 item 아래에서 type `t` 인 item을 `n` 개 선택해 `i` 에 추가합니다. 아래는 동작을 설명하기 위한 pseudocode입니다.

```text
[root] -> select(2,row)

for r=1 in range(N):
- r=1. i: root, b: root, o: row1 (type(o) = row 탐색 성공) -> [row1]
- r=2. i: root, b: root, o: row2 (type(o) = row 탐색 성공) -> [row1, row2]
```

- SELECT는 **target type이 나올 때까지 재귀적으로 탐색** 합니다.

```text
select(1,disk) - i: [row1, row2]
- r=1. i: row1, b: row1,  o: cab21 (type(o) != disk 재귀 탐색)
- r=1. i: row1, b: cab21, o: disk2107 (type(o) = disk 탐색 성공) -> [disk2107]
```

- bucket에서 candidate는 index `r` 과 object id `x` 를 인자로 받는 **hash 기반 선택 함수** `c(r,x)` 로 결정됩니다.
  - `c(r,x)` 는 bucket 알고리즘에 따라 다르며, 뒤의 [Bucket Algorithm](#bucket-algorithm) 섹션에서 설명합니다.

```text
b.c(r,x) -> cab21.c(1,21H3T#) -> disk2107
```

**`EMIT`** 은 현재 working vector `i` 를 최종 Placement Result에 추가합니다.

```text
emit -> [disk2107, disk2313]
```

지금까지의 과정을 working vector `i` 기준으로 정리하면 다음과 같습니다.

{{< figure src="images/ko/select-walkthrough.svg" alt="take, select, select, emit을 차례로 실행할 때 working vector가 root, row 두 개, disk 두 개로 바뀌고 최종 결과가 되는 과정" align="center" class="full-width" >}}

### Failure Handling

> **Collision, Crushed, Overload** 상황에서는 CRUSH가 선택한 candidate라고 해도 데이터를 저장하기에 적합하지 않을 수 있으므로 재탐색이 필요합니다.

- **Collision**: 현재 candidate index `r` 이 이미 선택된 candidate에 존재하는 경우입니다. 중복 저장을 방지해야 합니다.
- **Crushed**: 선택된 candidate가 disk 고장 등으로 사용이 불가능한 경우입니다.
- **Overload**: 선택된 candidate가 과부하되어 load balancing이 필요한 경우입니다.

세 가지 경우 모두 candidate를 재탐색하여 다른 candidate를 골라야 합니다.

> 다른 candidate를 선택하기 위해 재탐색 시 `c(r,x)` 함수의 인자인 `r` 대신 **mutated index** `r'` 을 사용합니다.
>
> - SELECT **전체의 탐색 실패 횟수** 인 `f` 와 **특정 replica의 실패 횟수** 인 `fr` 을 카운트합니다.

```text
select(1,disk) - i: [row1, row2], f:0,
- [r=1, f:0]. i: row1, b: row1,  o: cab21
- [r=1, f:0]. i: row1, b: cab21, o: disk2107 (disk2107 Fail!!)
```

{{< figure src="images/ko/failure-handling-mutation.svg" alt="r' = r + f 방식과 r' = r + fr·n 방식으로 실패한 candidate를 대체하는 과정 비교" attr="Weil et al., CRUSH (SC'06) Figure 2 재구성" attrlink="https://ceph.io/assets/pdfs/weil-crush-sc06.pdf" align="center" class="full-width" >}}

- 선택된 candidate가 실패하면 탐색 실패 횟수를 늘리고(`f += 1`), index를 `r' = r + f` 로 mutation합니다.
  - Collision의 경우는 **현재 탐색 중인 bucket** 안에서 다시 탐색합니다.

```text
select(1,disk) - i: [row1, row2], f:0,
- [r=1,  f:0]. i: row1, b: row1,  o: cab21
- [r=1,  f:0]. i: row1, b: cab21, o: disk2107 (disk2107 Collision!!)
- [r'=2, f:1]. i: row1, b: cab21, o: disk3421
```

- Crushed와 Overload의 경우는 **현재 탐색 시작점인 working vector item** 으로 돌아가 다시 탐색합니다.

```text
select(1,disk) - i: [row1, row2], f:0,
- [r=1,  f:0]. i: row1, b: row1,  o: cab21
- [r=1,  f:0]. i: row1, b: cab21, o: disk2107 (disk2107 Overload!!)
- [r'=2, f:1]. i: row1, b: row1,  o: cab23
- [r'=2, f:1]. i: row1, b: cab23, o: disk5679
```

> **Collision handling vs Crushed/Overload handling**
>
> - **Collision**: 디스크 자체는 문제가 없으므로 중복 저장되지 않게 bucket 안에서 분산 배치만 해 주면 됩니다.
> - **Crushed/Overload**: 정상 디스크 쪽으로 데이터가 갈 수 있게 다른 bucket 분기로 유도합니다.

{{< figure src="images/ko/failure-retry-paths.svg" alt="Collision은 같은 cab21 안에서 disk3421을 다시 고르고, Crushed와 Overload는 row1부터 다시 탐색해 cab23의 disk5679를 고르는 경로 비교" align="center" class="full-width" >}}

- 특정 replica의 실패 횟수인 `fr` 은 Erasure Coding처럼 **replica rank가 의미를 가지는 경우, 위치를 유지** 하기 위해 사용됩니다.
  - `fr` 은 `f` 와 마찬가지로 실패할 때마다 카운트되지만, candidate 탐색이 종료될 때마다 0으로 초기화됩니다.
  - mutation 시에는 `fr` 을 더하는 대신 candidate 개수만큼 곱한 `fr x N` 을 더해 위치 정보를 유지합니다. 위 그림의 오른쪽을 참고하세요.

```text
select(1,disk) - i: [row1, row2], f:0,
- [r=1,  fr:0]. i: row1, b: row1,  o: cab21
- [r=1,  fr:0]. i: row1, b: cab21, o: disk2107 (disk2107 Collision!!)
- [r'=3, fr:1]. i: row1, b: cab21, o: disk9823
```

---

## Cluster Change & Data Movement

> Device가 추가, 제거, Reweight되는 경우 cluster map이 변경되며 데이터 리밸런싱이 일어납니다.

### Add / Remove / Reweight

{{< columns >}}
```text
B1(1)  B2(1)
```
<--->
```text
B1(1)  B2(2)
```
{{< /columns >}}

{{< figure src="images/ko/reweight-data-ratio.svg" alt="B2의 weight를 1에서 2로 바꾸면 데이터 비율이 50:50에서 33:67로 바뀌고 전체의 약 1/6이 이동하는 모습" align="center" class="full-width" >}}

- 위 예시와 같이 Disk의 Weight가 변경되면, 변경된 비율에 따라 데이터가 이동해야 합니다(`B1 → B2`).
- 이상적으로는 **Weight의 변경분만큼** 의 데이터를 `B1` 에서 `B2` 로 마이그레이션하면 됩니다.
- CRUSH는 직접 데이터를 삭제하거나 복사하는 알고리즘이 아닙니다. 대신 **변경된 Cluster map에 따라 데이터들이 Desired placement에 위치하도록 유도** 합니다.

### Hierarchical Remapping

{{< columns >}}
```text
     root
    /    \
  A(1)   B(2)
         /  \
     B1(1)  B2(1)
```
<--->
```text
     root
    /    \
  A(1)   B(3)
         /  \
     B1(1)  B2(2)
```
{{< /columns >}}

- 그러나 Hierarchy에서는 `B1`, `B2` 의 weight 분포뿐만 아니라 상위 계층인 `A`, `B` 의 분포도 변경됩니다.
  - 따라서 `B1 → B2` 와 동시에 `A → B` 방향의 데이터 이동이 발생합니다.
- 이때 **root와 B에서의 Placement Decision은 서로 독립적** 이므로 의도치 않은 데이터 이동이 발생할 수 있습니다.
  - 이상적인 데이터의 이동 방향은 `A → B → B2` 입니다.
  - 그러나 `A → B` 로 이동한 데이터 중 일부는 `B1` 으로 배치될 수 있습니다.
  - 이 경우 데이터 비중이 상대적으로 감소해야 하는 `B1` 의 데이터가 증가하여 목표 weight 분포에서 벗어납니다.
  - 그 결과 B 내부의 목표 weight 분포를 맞추기 위해 추가적으로 `B1 → B2` 데이터 이동이 발생합니다.

{{< figure src="images/ko/hierarchical-remapping.svg" alt="새 item이 추가되면 leaf부터 root까지 경로상의 weight가 함께 바뀌는 모습" attr="Weil et al., CRUSH (SC'06) Figure 3 재구성" attrlink="https://ceph.io/assets/pdfs/weil-crush-sc06.pdf" align="center" class="full-width" >}}

> 즉, Weight가 증가한 leaf로 모든 데이터가 직접 이동하는 것이 아니라, **Hierarchy의 각 Level에서 서로 다른 Object가 독립적으로 재배치** 되기 때문에 의도치 않은 추가적 데이터 이동이 발생할 수 있습니다.
>
> 따라서 **cluster map 변경으로 인해 발생하는 remapping이 최소화** 되도록 cluster map을 설계해야 합니다.

---

## Bucket Algorithm

> Cluster map의 각 Bucket은 candidate를 선택하는 `c(r,x)` 구현체를 가집니다.
>
> - 각 Bucket Algorithm은 **Placement 계산 비용** 과 **Cluster 변경 비용** 에 따라 Trade-off가 있습니다.
> - Bucket의 특성에 따라 적절한 알고리즘을 선택하면 계산 비용과 변경 비용을 최소화할 수 있습니다.

{{< fulltable >}}
| Bucket | Mapping Cost | Addition | Removal |
|--------|--------------|----------|---------|
| Uniform | `O(1)` | Poor | Poor |
| List | `O(n)` | Optimal | Poor |
| Tree | `O(log n)` | Good | Good |
| Straw | `O(n)` | Optimal | Optimal |
{{< /fulltable >}}

### Uniform

> item들에 데이터를 완전히 균등한 확률로 분산하는 알고리즘입니다.

{{< figure src="images/ko/uniform-bucket.svg" alt="object x와 replica r을 hash 후 item 개수로 나눈 나머지로 item을 고르는 Uniform bucket 구조" align="center" class="full-width" >}}

- hash 값을 item 개수로 나누어 bucket의 하위 item들을 서로 동등한 확률로 선택하는 알고리즘입니다.
  - `c(r,x) = hash(r,x) mod m` 이며, `m` 은 item 개수입니다.
- **모든 item이 동일한 weight** 를 가질 때 사용하며, Placement 계산 속도가 가장 빠릅니다(`O(1)`).
- 대신 **item 개수가 변경되면 대부분의 Object mapping이 변경** 되므로 리밸런싱 비용이 최악입니다.

### List

> item을 **앞부분에 stack 형식으로 추가** 하면서 기존 weight 분포를 최대한 유지하는 알고리즘입니다.

- 모든 item을 연결 리스트로 구성하고, 최근에 추가된 item부터 차례대로 조건부 확률에 따라 선택합니다. 아래는 pseudocode입니다.

```python
# hash 값은 [0, 1) 범위로 정규화되어 있고,
# remaining_weights는 현재 item부터 tail까지의 weight 목록입니다.
for item, weight in items:
    if hash(x, r, item) < weight / sum(remaining_weights):
        return item
```

- hash 값이 현재 item의 몫인 `weight / sum(remaining_weights)` 보다 작으면 해당 item을 선택합니다. 그렇지 않으면 다음 item으로 넘어갑니다.

{{< figure src="images/ko/list-bucket.svg" alt="가장 최근에 추가된 item E부터 A까지 순서대로 조건부 확률로 선택 여부를 판단하는 List bucket 구조" align="center" class="full-width" >}}

- head부터 순서대로 item을 순회하며 탐색하기 때문에 Placement 계산 비용은 `O(n)` 입니다.
- **새로 item이 추가되는 경우**, 해당 item을 선택하는 데이터를 제외한 **나머지 데이터는 Object mapping이 유지** 됩니다.

```text
기존 리스트 순회 시 조건부 확률: E(3/7)  -> D(1/4) -> C(1/3) -> B(1/2) -> A(1/1)
신규 리스트 순회 시 조건부 확률: F(4/11) -> E(3/7) -> D(1/4) -> C(1/3) -> B(1/2) -> A(1/1)
```

- 추가된 item `F` 이후로는 조건부 확률이 이전과 동일합니다.
- 반면 **중간 혹은 tail 쪽 item이 제거되는 경우** 조건부 확률이 **대부분 변경되므로 Object mapping이 크게 변화** 합니다.

```text
기존 리스트 순회 시 조건부 확률: E(3/7) -> D(1/4) -> C(1/3) -> B(1/2) -> A(1/1)
신규 리스트 순회 시 조건부 확률: E(3/6) -> D(1/3) -> C(1/2) -> B(1/1)
```

### Tree

> List 순회로 일방향 item을 선택하는 대신 **재귀 탐색으로 탐색 범위를 좁혀가며 item을 선택** 하는 알고리즘입니다.

- 확률에 기반한 선택 알고리즘 자체는 List와 동일하지만, 자료구조를 **weighted binary tree** 로 구성한 알고리즘입니다.

{{< figure src="images/ko/tree-bucket-labeling.svg" alt="leaf에 1, 11, 101, 111 등 이진 라벨이 붙은 Tree bucket의 node 라벨링 구조" attr="Weil et al., CRUSH (SC'06) Figure 4 재구성" attrlink="https://ceph.io/assets/pdfs/weil-crush-sc06.pdf" align="center" class="full-width" >}}

- 모든 item은 leaf에 존재하며, node는 분기를 수행합니다.
- **가장 왼쪽 leaf가 항상 1번 라벨** 을 가집니다. leaf 라벨은 홀수, 분기 node 라벨은 짝수입니다.
- 트리가 한 단계 커질 때마다 기존 root는 새 root의 왼쪽 자식이 되고, 새 root는 기존 root 라벨을 **left bit shifting** 한 라벨을 가집니다(`100 → 1000`).
- 덕분에 트리가 커져도 기존 node의 라벨이 바뀌지 않아, 기존 item으로 가는 경로가 유지됩니다.

{{< figure src="images/ko/tree-bucket-expansion.svg" alt="item 4개인 기존 트리에 새로운 item E를 추가하면 오른쪽 서브트리 아래로 확장되는 모습" align="center" class="full-width" >}}

- item 탐색은 root부터 weight 비율에 따라 확률적으로 좌우를 재귀적으로 탐색합니다.
- item 추가로 tree가 확장되면 **새로운 분기로 데이터가 다수 이동하지만, 기존 분기의 mapping은 대부분 유지** 됩니다.
- Placement 탐색 비용은 Tree 자료구조 특성상 `O(log n)` 입니다.

### Straw

> item 선택 과정에서 일부 item만 참여하는 List, Tree와 달리 **매번 모든 item이 후보가 되는 알고리즘** 입니다.

- hash 함수로 모든 item에 대해 score를 계산하고, 가장 높은 점수를 선택하는 알고리즘입니다. score는 item이 뽑은 **straw(지푸라기)의 길이** 에 해당합니다.
  - 논문의 Straw는 `c(r,x) = max_i( f(w_i) · hash(x, r, i) )` 입니다. `f(w_i)` 는 weight가 클수록 길어지는 straw 길이 계수입니다.
  - 현재 Ceph는 이를 개선한 **straw2** 를 기본으로 사용하며, score를 `ln(hash(x, r, i)) / w_i` 로 계산합니다.
  - hash 값이 `(0, 1]` 범위이므로 `ln` 값은 0 이하입니다. 따라서 weight가 클수록 score가 0에 가까워져 선택될 확률이 높아집니다.

{{< figure src="images/ko/straw-bucket.svg" alt="모든 item의 score를 계산한 뒤 최대 score인 item B를 winner로 선택하는 Straw bucket 구조" align="center" class="full-width" >}}

- 모든 item이 매번 독립적으로 경쟁하므로 **cluster 변경 시 winner item이 바뀌는 경우에만 데이터가 이동** 합니다.
- 그러나 선택할 때마다 모든 item에 대해 score를 계산해야 하므로 Placement 계산 비용이 `O(n)` 입니다.

### Bucket Algorithm 선택 기준

- **디스크의 용량과 성능이 동일하고 클러스터 변화가 거의 없는 경우**: Placement가 가장 빠른 Uniform을 사용합니다.
- **디스크를 삭제하지 않고 지속적으로 클러스터를 확장하는 경우**: item 추가 비용이 작은 List를 사용하고, 대규모라면 Tree를 검토합니다.
- **디스크 삭제와 추가가 잦고 리밸런싱 비용을 최소화하고 싶은 경우**: Placement 비용이 큰 대신 데이터 이동이 적은 Straw를 사용합니다.
- **클러스터 변동성이 존재하고 규모가 상당히 큰 경우**: Placement 비용과 데이터 이동 비용의 균형이 적절한 Tree를 사용합니다.

---

## 마치며

이번 글에서는 CRUSH가 Mapping Table 없이 Object의 위치를 계산하는 원리를 살펴봤습니다. cluster map으로 Failure Domain을 구조화하고, Placement Rule로 replica 배치 정책을 표현하며, Bucket Algorithm으로 계산 비용과 데이터 이동 비용 사이의 균형을 잡습니다.

다음 편에서는 CRUSH 위에서 동작하는 Ceph의 전체 설계를 다룹니다.

---

## References

- Sage A. Weil, Scott A. Brandt, Ethan L. Miller, Carlos Maltzahn. [CRUSH: Controlled, Scalable, Decentralized Placement of Replicated Data](https://ceph.io/assets/pdfs/weil-crush-sc06.pdf). SC'06.
