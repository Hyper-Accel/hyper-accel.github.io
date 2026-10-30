---
title: "문법 검증: image-layouts"
date: "2026-10-27T00:00:00Z"
draft: true
authors: ["Fixture Author"]
categories: ["Engineering"]
---

<!-- b:image-layouts-1 -->
## 이미지 배치

<!-- b:image-layouts-2 -->
![본문](images/a.svg "본문 캡션")

<!-- b:image-layouts-3 -->
![넓게](images/a.svg#wide "와이드 캡션")

<!-- b:image-layouts-4 -->
![오른쪽](images/a.svg#side-right)

<!-- b:image-layouts-5 -->
![별칭](images/a.svg#side)

<!-- b:image-layouts-6 -->
![왼쪽](images/a.svg#side-left)

<!-- b:image-layouts-7 -->
{{< pair >}}
![첫째](images/a.svg)
![둘째](images/b.svg)
{{< /pair >}}

<!-- b:image-layouts-8 -->
{{< pair >}}
![첫째](images/a.svg "첫째 캡션")
![둘째](images/b.svg)
![셋째](images/a.svg)
{{< /pair >}}

<!-- b:image-layouts-9 -->
{{< slides >}}
![첫 장](images/a.svg "첫 장 캡션")
![둘째 장](images/b.svg)
{{< /slides >}}
