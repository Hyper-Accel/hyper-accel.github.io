---
title: "Syntax fixture: image-layouts"
date: "2026-10-27T00:00:00Z"
draft: true
authors: ["Fixture Author"]
categories: ["Engineering"]
---

<!-- b:image-layouts-1 -->
## Image layouts

<!-- b:image-layouts-2 -->
![Body](images/a.svg "Body caption")

<!-- b:image-layouts-3 -->
![Wide](images/a.svg#wide "Wide caption")

<!-- b:image-layouts-4 -->
![Right](images/a.svg#side-right)

<!-- b:image-layouts-5 -->
![Alias](images/a.svg#side)

<!-- b:image-layouts-6 -->
![Left](images/a.svg#side-left)

<!-- b:image-layouts-7 -->
{{< pair >}}
![First](images/a.svg)
![Second](images/b.svg)
{{< /pair >}}

<!-- b:image-layouts-8 -->
{{< pair >}}
![First](images/a.svg "First caption")
![Second](images/b.svg)
![Third](images/a.svg)
{{< /pair >}}

<!-- b:image-layouts-9 -->
{{< slides >}}
![First slide](images/a.svg "First slide caption")
![Second slide](images/b.svg)
{{< /slides >}}
