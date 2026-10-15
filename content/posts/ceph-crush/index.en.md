---
date: '2026-10-15T10:00:00+09:00'
draft: false
title: 'Ceph Deep-Dive Part 1: CRUSH'
cover:
  image: "images/en/cover.webp"
  alt: "CRUSH placing replicas by descending the row, cabinet, and disk levels of a cluster map"
  caption: "CRUSH placement rule example (adapted from Weil et al., SC'06 Figure 1)"
  relative: true
authors: [Sinhyun Park]
tags: [ceph, crush, distributed storage, object storage]
categories: [storage]
series: ["Ceph Deep-Dive"]
series_idx: 1
summary: "A walkthrough of CRUSH, the data distribution algorithm at the heart of Ceph, based on the SC'06 paper. It covers how object locations are computed without a mapping table, placement rules and failure handling, data movement on cluster changes, and the trade-offs between bucket algorithms."
description: "Ceph is one of the most widely used open-source distributed storage systems. Let's take it apart, starting from its foundation: the CRUSH algorithm."
keywords: [Ceph, CRUSH, Object Storage, Placement Rule, Cluster Map, Bucket Algorithm, Straw, Distributed Storage]
comments: true
---

## Introduction

Hi, I'm Sinhyun Park from the LLMOps team at HyperAccel.

The **Ceph Deep-Dive** series takes apart the internals of Ceph, an open-source distributed storage system, one piece at a time. It is written for engineers who are meeting Ceph for the first time.

This first part covers **Controlled Replication Under Scalable Hashing(CRUSH)**, the data distribution algorithm that Ceph is built on. The explanation follows the paper [CRUSH: Controlled, Scalable, Decentralized Placement of Replicated Data(SC'06)](https://ceph.io/assets/pdfs/weil-crush-sc06.pdf).

---

## Background

### Object-based Storage

> Object storage stores and manages data as independent **objects**, not as files or blocks.

- A conventional file system manages data through metadata such as the directory tree and inodes.
- Object storage manages data as an object ID (key) and an object (value).

```text
bucket
├── logs/2026/09/09/a.json
├── logs/2026/09/09/b.json
└── model/llama/weights-001
```

- The storage structure is simple, scales out well, and keeps replication cheap.
- Large object-based distributed storage splits data into small objects and spreads them across many disks.
  - Large reads and writes are served by many storage devices in parallel.
  - Replicas and erasure coding shards are spread out to survive failures.

{{< figure src="/posts/ceph-crush/images/en/object-storage-overview.svg" alt="File storage managed through directories and inodes versus object storage accessed directly by key, and large data split into four objects stored on four OSDs" align="center" class="full-width" >}}

> The core problem of object storage is **which device should store each of a huge number of objects?**

---

## Challenge

### Q1. Object Metadata Scalability

In Ceph, the unit that actually stores data on a disk is called an **Object Storage Daemon(OSD)**. The example below stores the object-to-OSD mapping in a table.

```text
object-A → osd.1
object-B → osd.7
object-C → osd.3
...
```

- Storing the mapping for every object to every disk creates a metadata load that hurts scalability and availability.

{{< figure src="/posts/ceph-crush/images/en/metadata-table-vs-crush.svg" alt="Every client asking a metadata server for locations versus each client computing locations directly with CRUSH" align="center" class="full-width" >}}

- On the left, every request goes through the metadata server, which becomes both a bottleneck and a single point of failure (SPOF).
- On the right is the CRUSH approach covered in this post. Each client computes the location itself, so no central lookup is needed.

> Can any node compute an object's location **without storing placement information**?

### Q2. Reliable Replica Placement

Spreading data across devices does not by itself make it safe.

{{< figure src="/posts/ceph-crush/images/en/failure-domain-racks.svg" alt="Impact of a rack-1 power failure when all three replicas sit in one rack versus one replica per rack" align="center" class="full-width" >}}

- As on the left, if **all replicas land in the same rack domain**, a power failure makes the data unreachable.
- As on the right, with one replica per rack, the remaining replicas keep the data reachable even if one rack goes down.
- Replica placement must take several failure domains into account, such as rack, power, site, and server.

> Can the placement process distinguish and structure failure domains?

### Q3. Dynamic Cluster & Data Rebalancing

```python
# N = number of devices
device = hash(object_id) % N
```

- Hash-based placement uses randomness to spread objects evenly across devices.

A storage cluster changes constantly as devices are added, removed, or replaced. When a device fails, its data has to move to other devices.

```text
hash(x) % 10 -> hash(x) % 11 ...?
```

The example below shows how the locations of 12 objects change when the cluster grows from 4 devices to 5.

{{< figure src="/posts/ceph-crush/images/en/hash-mod-remapping.svg" alt="Switching from hash % 4 to hash % 5 moves 9 of 12 objects to a different device" align="center" class="full-width" >}}

- **When the number of devices changes**, most existing object mappings change. The result is **massive relocation**.

> Can data be redistributed as the cluster changes while keeping data movement to a minimum?

---

## Solution: CRUSH Overview

> CRUSH **computes object placement from a hash function instead of storing it in a mapping table**.

```text
object_id -> CRUSH(object_id, cluster_map, placement rule) -> [device1, device2]
```

- Because CRUSH computes placement with a hash function, data is distributed **pseudo-randomly**.
- Yet it is a **deterministic** algorithm: the same `(object_id, cluster_map, placement rule)` input always produces the same output.

### Deterministic Pseudo-random Placement

```text
CRUSH(X) = always OSD 7
```

- For object `X`, CRUSH always returns OSD 7.

```text
X, Y, Z -> CRUSH(X), CRUSH(Y), CRUSH(Z) -> OSD 7, 3, 5
```

- Across many objects, CRUSH results are spread randomly over many devices.

> **Without a central placement server**, every node can compute an object's location on its own.

### Cluster Map

> CRUSH represents the physical layout of a cluster as a **weighted hierarchy tree**.

```text
root
└── row
    └── cabinet
        └── shelf
            └── device (leaf disk)
```

- Tree leaves are the devices that actually store data.
- Tree nodes organize devices into a hierarchy and are called `buckets`.
  - The paper's example uses a four-level bucket hierarchy: **root > row > cabinet > shelf**.

{{< figure src="/posts/ceph-crush/images/en/crush-placement-rule-example.svg" alt="CRUSH descending from root and selecting one row, three cabinets, and one disk under each" attr="Adapted from Weil et al., CRUSH (SC'06) Figure 1" attrlink="https://ceph.io/assets/pdfs/weil-crush-sc06.pdf" align="center" class="full-width" >}}

- Devices and buckets each have their own weight.
  - **Device weight**: the relative amount of data the device should store. It is usually proportional to capacity.
  - **Bucket weight**: `Σ child weights`, the sum of the weights of its child buckets and devices.

If the device weights in a bucket are as follows, the devices store data in a `1 : 2` ratio.

```text
osd.1 weight = 1
osd.2 weight = 2
```

{{< figure src="/posts/ceph-crush/images/en/bucket-weight-tree.svg" alt="A tree of four devices with weight 1, two child buckets with weight 2, and a parent bucket with weight 4" align="center" class="full-width" >}}

- The parent bucket's weight is the sum of its child bucket weights `(2+2)`.
- Each child bucket's weight is the sum of its device weights `(1+1)`.

> By **mapping real failure domains to hierarchical buckets** in the cluster map, such as IDC sites, racks, and network switches, you can model the physical environment.

{{< figure src="/posts/ceph-crush/images/en/cluster-map-failure-domains.svg" alt="A cluster map with IDC, rack, switch, and device levels under root, and the replica placement strategy at each level" align="center" class="full-width" >}}

- Assign different IDC sites to buckets under root to build a **cross-IDC data cluster**.
- Assign each rack to an upper-level bucket and place two replicas per bucket to **spread replicas and raise availability**.
- Assign each switch to a lower-level bucket and **keep replicas together to cut replica synchronization cost**.

### Placement Rule

> A placement rule decides how to traverse the cluster map and where to place replicas.

For example, suppose the cluster map has three bucket levels: row, cabinet, and disk.

```text
root
 ↓
row1    row2
 ↓       ↓
cab21   cab23   cab24
 ↓       ↓       ↓
disk    disk    disk
```

- You can keep replicas in the same row to reduce rebalancing cost.
- Or you can spread replicas across different rows to raise availability.

CRUSH expresses these replica placement policies with its `TAKE / SELECT / EMIT` functions.

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

> A placement rule can separate replicas across one failure domain while confining them within another.

---

## Placement Algorithm

### TAKE / SELECT / EMIT

> The placement algorithm **recursively descends** the cluster map according to a placement rule made of **TAKE / SELECT / EMIT**, and finds suitable disks for an object ID.

```text
TAKE(a)
SELECT(n, t)
EMIT

- i = current working vector
- b = bucket currently being descended
- o = candidate selected from b
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

**`TAKE(a)`** puts the entry point where the traversal starts into the working vector `i`.

```text
take(root) -> [root]
```

**`SELECT(n,t)`** selects `n` items of type `t` under each item in the current working vector `i` and adds them to `i`. The pseudocode below illustrates how it works.

```text
[root] -> select(2,row)

for r=1 in range(N):
- r=1. i: root, b: root, o: row1 (type(o) = row, found) -> [row1]
- r=2. i: root, b: root, o: row2 (type(o) = row, found) -> [row1, row2]
```

- SELECT **descends recursively until it reaches the target type**.

```text
select(1,disk) - i: [row1, row2]
- r=1. i: row1, b: row1,  o: cab21 (type(o) != disk, descend)
- r=1. i: row1, b: cab21, o: disk2107 (type(o) = disk, found) -> [disk2107]
```

- Within a bucket, the candidate is chosen by a **hash-based selection function** `c(r,x)` that takes the index `r` and the object ID `x`.
  - `c(r,x)` depends on the bucket algorithm, which is covered in the [Bucket Algorithm](#bucket-algorithm) section.

```text
b.c(r,x) -> cab21.c(1,21H3T#) -> disk2107
```

**`EMIT`** appends the current working vector `i` to the final placement result.

```text
emit -> [disk2107, disk2313]
```

The whole process, seen from the working vector `i`, looks like this.

{{< figure src="/posts/ceph-crush/images/en/select-walkthrough.svg" alt="Running take, select, select, and emit in order turns the working vector into root, then two rows, then two disks, which become the final result" align="center" class="full-width" >}}

### Failure Handling

> In **collision, crushed, and overload** situations, a candidate chosen by CRUSH may not be fit to store data, so CRUSH has to search again.

- **Collision**: the candidate for index `r` has already been selected. Duplicate placement must be avoided.
- **Crushed**: the selected candidate is unusable, for example because the disk has failed.
- **Overload**: the selected candidate is overloaded and load needs to be balanced.

In all three cases, CRUSH searches again and picks a different candidate.

> To pick a different candidate, the retry passes a **mutated index** `r'` to `c(r,x)` instead of `r`.
>
> - CRUSH counts `f`, the **total number of failures in the SELECT**, and `fr`, the **number of failures for a specific replica**.

```text
select(1,disk) - i: [row1, row2], f:0,
- [r=1, f:0]. i: row1, b: row1,  o: cab21
- [r=1, f:0]. i: row1, b: cab21, o: disk2107 (disk2107 Fail!!)
```

{{< figure src="/posts/ceph-crush/images/en/failure-handling-mutation.svg" alt="Replacing a rejected candidate with r' = r + f versus r' = r + fr·n" attr="Adapted from Weil et al., CRUSH (SC'06) Figure 2" attrlink="https://ceph.io/assets/pdfs/weil-crush-sc06.pdf" align="center" class="full-width" >}}

- When the selected candidate fails, CRUSH increments the failure count (`f += 1`) and mutates the index to `r' = r + f`.
  - On a collision, it searches again **inside the bucket currently being descended**.

```text
select(1,disk) - i: [row1, row2], f:0,
- [r=1,  f:0]. i: row1, b: row1,  o: cab21
- [r=1,  f:0]. i: row1, b: cab21, o: disk2107 (disk2107 Collision!!)
- [r'=2, f:1]. i: row1, b: cab21, o: disk3421
```

- On crushed or overload, it goes back to **the working vector item where the descent started** and searches again.

```text
select(1,disk) - i: [row1, row2], f:0,
- [r=1,  f:0]. i: row1, b: row1,  o: cab21
- [r=1,  f:0]. i: row1, b: cab21, o: disk2107 (disk2107 Overload!!)
- [r'=2, f:1]. i: row1, b: row1,  o: cab23
- [r'=2, f:1]. i: row1, b: cab23, o: disk5679
```

> **Collision handling vs Crushed/Overload handling**
>
> - **Collision**: the disk itself is fine, so CRUSH only needs to spread replicas within the bucket to avoid duplicates.
> - **Crushed/Overload**: CRUSH steers data into a different bucket branch so it reaches a healthy disk.

{{< figure src="/posts/ceph-crush/images/en/failure-retry-paths.svg" alt="On collision CRUSH picks disk3421 again inside cab21, while on crushed or overload it restarts from row1 and picks disk5679 in cab23" align="center" class="full-width" >}}

- `fr`, the failure count for a specific replica, is used to **keep positions stable when replica rank matters**, as in erasure coding.
  - Like `f`, `fr` is incremented on every failure, but it is reset to 0 each time a candidate search finishes.
  - During mutation, CRUSH adds `fr x N`, `fr` multiplied by the number of candidates, instead of `fr` itself. This preserves position information, as shown on the right side of the figure above.

```text
select(1,disk) - i: [row1, row2], f:0,
- [r=1,  fr:0]. i: row1, b: row1,  o: cab21
- [r=1,  fr:0]. i: row1, b: cab21, o: disk2107 (disk2107 Collision!!)
- [r'=3, fr:1]. i: row1, b: cab21, o: disk9823
```

---

## Cluster Change & Data Movement

> When a device is added, removed, or reweighted, the cluster map changes and data is rebalanced.

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

{{< figure src="/posts/ceph-crush/images/en/reweight-data-ratio.svg" alt="Changing the weight of B2 from 1 to 2 shifts the data ratio from 50:50 to 33:67, moving about 1/6 of all data" align="center" class="full-width" >}}

- When a disk's weight changes as in the example above, data has to move to match the new ratio (`B1 → B2`).
- Ideally, only **the data matching the weight change** migrates from `B1` to `B2`.
- CRUSH does not delete or copy data itself. Instead, it **guides data toward its desired placement under the updated cluster map**.

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

- In a hierarchy, however, not only the weight distribution of `B1` and `B2` changes, but also that of the upper level, `A` and `B`.
  - So data moves in the `A → B` direction at the same time as `B1 → B2`.
- Here, **the placement decisions at root and at B are independent**, which can cause unintended data movement.
  - The ideal path for the moving data is `A → B → B2`.
  - However, some of the data that moves from `A` to `B` may land on `B1`.
  - Then `B1`, whose share should shrink, actually gains data and drifts from the target weight distribution.
  - As a result, additional `B1 → B2` movement occurs to restore the target weight distribution inside B.

{{< figure src="/posts/ceph-crush/images/en/hierarchical-remapping.svg" alt="When a new item is added, the weights along the path from the leaf to the root change together" attr="Adapted from Weil et al., CRUSH (SC'06) Figure 3" attrlink="https://ceph.io/assets/pdfs/weil-crush-sc06.pdf" align="center" class="full-width" >}}

> In other words, data does not move straight to the leaf whose weight increased. **Different objects are remapped independently at each level of the hierarchy**, which can cause extra, unintended data movement.
>
> The cluster map should therefore be designed so that **remapping caused by cluster map changes is minimized**.

---

## Bucket Algorithm

> Each bucket in the cluster map has its own `c(r,x)` implementation for choosing a candidate.
>
> - Each bucket algorithm trades off **placement computation cost** against **cluster change cost**.
> - Choosing an algorithm that fits the bucket keeps both costs low.

{{< fulltable >}}
| Bucket | Mapping Cost | Addition | Removal |
|--------|--------------|----------|---------|
| Uniform | `O(1)` | Poor | Poor |
| List | `O(n)` | Optimal | Poor |
| Tree | `O(log n)` | Good | Good |
| Straw | `O(n)` | Optimal | Optimal |
{{< /fulltable >}}

### Uniform

> Distributes data across items with perfectly equal probability.

{{< figure src="/posts/ceph-crush/images/en/uniform-bucket.svg" alt="A uniform bucket hashes object x and replica r and picks an item by the remainder modulo the number of items" align="center" class="full-width" >}}

- It divides the hash value by the number of items and picks each child item with equal probability.
  - `c(r,x) = hash(r,x) mod m`, where `m` is the number of items.
- It is used when **all items have the same weight**, and it computes placement the fastest (`O(1)`).
- In exchange, **changing the number of items changes most object mappings**, so its rebalancing cost is the worst.

### List

> Keeps the existing weight distribution as intact as possible by **adding items to the front, like a stack**.

- All items form a linked list, and items are considered one by one from the most recently added, each with a conditional probability. The pseudocode is below.

```python
# hash values are normalized to [0, 1),
# remaining_weights holds the weights from the current item to the tail.
for item, weight in items:
    if hash(x, r, item) < weight / sum(remaining_weights):
        return item
```

- If the hash value is smaller than the current item's share, `weight / sum(remaining_weights)`, that item is selected. Otherwise the search moves to the next item.

{{< figure src="/posts/ceph-crush/images/en/list-bucket.svg" alt="A list bucket checking items from the newest, E, down to A, deciding with a conditional probability at each step" align="center" class="full-width" >}}

- Because it walks the items in order from the head, placement costs `O(n)`.
- **When a new item is added**, every object except those that now pick the new item **keeps its mapping**.

```text
Conditional probabilities, old list: E(3/7)  -> D(1/4) -> C(1/3) -> B(1/2) -> A(1/1)
Conditional probabilities, new list: F(4/11) -> E(3/7) -> D(1/4) -> C(1/3) -> B(1/2) -> A(1/1)
```

- After the added item `F`, the conditional probabilities are the same as before.
- In contrast, **when an item in the middle or near the tail is removed**, **most conditional probabilities change, so object mappings change significantly**.

```text
Conditional probabilities, old list: E(3/7) -> D(1/4) -> C(1/3) -> B(1/2) -> A(1/1)
Conditional probabilities, new list: E(3/6) -> D(1/3) -> C(1/2) -> B(1/1)
```

### Tree

> Instead of walking a list in one direction, it **narrows the search range recursively** to pick an item.

- The probability-based selection is the same as in List, but the data structure is a **weighted binary tree**.

{{< figure src="/posts/ceph-crush/images/en/tree-bucket-labeling.svg" alt="Node labeling in a tree bucket, with binary labels such as 1, 11, 101, and 111 on the leaves" attr="Adapted from Weil et al., CRUSH (SC'06) Figure 4" attrlink="https://ceph.io/assets/pdfs/weil-crush-sc06.pdf" align="center" class="full-width" >}}

- All items live in the leaves, and internal nodes only branch.
- **The leftmost leaf always has label 1**. Leaf labels are odd, and branch node labels are even.
- Each time the tree grows by one level, the old root becomes the left child of a new root, and the new root's label is the old root's label **shifted left by one bit** (`100 → 1000`).
- As a result, existing node labels never change as the tree grows, so the paths to existing items stay the same.

{{< figure src="/posts/ceph-crush/images/en/tree-bucket-expansion.svg" alt="Adding a new item E to a four-item tree extends it under the right subtree" align="center" class="full-width" >}}

- Item lookup descends from the root, going left or right with probabilities based on the weight ratio.
- When adding an item expands the tree, **a lot of data moves to the new branch, but most mappings in existing branches are preserved**.
- Because it is a tree, placement costs `O(log n)`.

### Straw

> Unlike List and Tree, where only some items take part in a selection, **every item is a candidate every time**.

- It computes a score for every item with a hash function and picks the highest. The score corresponds to the **length of the straw** each item draws.
  - In the paper, Straw is `c(r,x) = max_i( f(w_i) · hash(x, r, i) )`. `f(w_i)` is a straw length factor that grows with weight.
  - Ceph now uses an improved version, **straw2**, by default. It computes the score as `ln(hash(x, r, i)) / w_i`.
  - Because hash values lie in `(0, 1]`, `ln` is at most 0. A larger weight pulls the score closer to 0, which makes the item more likely to win.

{{< figure src="/posts/ceph-crush/images/en/straw-bucket.svg" alt="A straw bucket scoring every item and choosing item B, the one with the highest score, as the winner" align="center" class="full-width" >}}

- Every item competes independently every time, so **data moves only when the winning item changes after a cluster change**.
- However, every selection must score every item, so placement costs `O(n)`.

### Choosing a Bucket Algorithm

- **Disks have identical capacity and performance, and the cluster rarely changes**: use Uniform, which has the fastest placement.
- **The cluster keeps growing and disks are never removed**: use List, which makes adding items cheap, and consider Tree at large scale.
- **Disks are added and removed often, and rebalancing cost must be minimal**: use Straw, which moves less data at the cost of slower placement.
- **The cluster changes and is quite large**: use Tree, which balances placement cost and data movement cost.

---

## Wrapping Up

This post looked at how CRUSH computes object locations without a mapping table. The cluster map structures failure domains, placement rules express replica placement policies, and bucket algorithms balance computation cost against data movement cost.

The next part covers the overall design of Ceph, which runs on top of CRUSH.

---

## References

- Sage A. Weil, Scott A. Brandt, Ethan L. Miller, Carlos Maltzahn. [CRUSH: Controlled, Scalable, Decentralized Placement of Replicated Data](https://ceph.io/assets/pdfs/weil-crush-sc06.pdf). SC'06.
