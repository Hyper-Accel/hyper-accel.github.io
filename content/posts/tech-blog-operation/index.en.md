---
date: '2025-12-26T10:38:16+09:00'
draft: false
title: 'Starting Our Tech Blog'
cover:
  image: "timeline.png"
  # can also paste direct link from external site
  # ex. https://i.ibb.co/K0HVPBd/paper-mod-profilemode.png
  alt: "Tech Blog Build Timeline"
  caption: "Tech Blog Build Timeline"
  relative: false # To use relative path for cover image, used in hugo Page-bundles
authors: ["Minho Park"] # must match with content/authors
tags: [tech-blog, hugo, engineering-culture]
categories: [engineering-culture]
summary: ["This post shares the journey of starting HyperAccel's tech blog, from the initial motivation to building it with Hugo, operating through an Editor Group, and implementing a Bus Factor-aware operation strategy."]
comments: true
---

## The Motivation Behind Starting Our Tech Blog

In our company's SW group, we have a developer named Jaewoo Kim ([Author](https://hyper-accel.github.io/authors/jaewoo-kim/), [LinkedIn](https://www.linkedin.com/in/jaewoo-kim-b38325237/)). Jaewoo is developing `legato`, a language for our HW kernel development. For several months, Jaewoo has been consistently requesting something from us.


![jaewoo-teams](./jaewoo-teams.png)
> **Shouldn't we have a company tech blog?**                   (from Jaewoo)

Jaewoo mentioned that he had experience posting projects from his previous company on a tech blog, and thanks to those posts, many talented developers became interested in the company and even joined.

I also had been thinking a lot about wanting to share with external developers the many challenges we face in **building high-performance LLM Inference Chips** and **creating Software Stacks to support those Chips**.

> **But... who will build and operate it?**

I knew that we had plenty of content to post on the blog in our company's Wiki (operated on Confluence).
However, having a lot of content to post and actually building and operating a blog are completely different challenges.

![confluence](./confluence.png)

> Open source analysis for HyperAccel's LLM Inference Engine support (**Coming Soon...**)

Months had passed since Jaewoo suggested operating a tech blog, but no one had taken the initiative. That's because no one had experience operating one!

![안해봤는데](./I_havent_done.png)

But **I actually had experience**... I had been posting on my [personal blog](https://mino-park7.github.io/blog/categories/) for several years.

![사실해봄](./I_did_this_game.png)

However, I was pretending not to know, with a vague expectation that **"someone else will step up, right?"** and the thought that "I'm already too busy..."

But in October of this year, I had the opportunity to attend PyTorch Conference with Jaewoo ([see previous post](https://hyper-accel.github.io/posts/pytorchcon2025-report/)).

Seeing Jaewoo continuously discussing and developing the compiler with team members in Korean time even during his business trip to the US, I thought, **"Is being busy just an excuse for me?"**

And there was something I always tell my team members as a team lead. 
> **"If you think you can do it, just do it"** - that's the mindset.

So I decided. **I'll do it**

## Choosing a Tech Blog Platform

When building a tech blog, there are several options.

- Using blog platforms
  - Velog
  - Medium
  - Tistory
  - ...
- Self-hosting (using Static Site Generator + GitHub Pages)
  - Jekyll
  - Hugo
  - ...

Of course, the simplest approach would be using a blog platform. You can just sign up and create a blog.

However, I had several **important factors** in mind for operating a tech blog.

- Must have comment functionality
- Must be able to integrate Google Analytics
- Must have good SEO
- Must be easy to maintain
- Multiple users should be able to easily submit their posts

While other factors could be sufficiently supported by using blog platforms, **ease of maintenance** and **allowing multiple users to easily submit their posts** seemed difficult to achieve with blog platforms.

> Wait, but shouldn't using a blog platform make maintenance easier?

Yes. For personal blogs, using a blog platform would be much more convenient. However, there was a critical point we had to consider.

"Our tech blog should be operated by an **Editor Group**, not by a single employee."

I really like the book [Software Engineering at Google](https://abseil.io/resources/swe-book), and I apply many things I learned from it in team management. This book introduces the term [Bus Factor](https://en.wikipedia.org/wiki/Bus_factor).

> Bus Factor: An index that represents how many team members working on a project can suddenly leave without proper handover procedures before the project is halted or faces a similarly serious situation.

**The higher the Bus Factor, the more stable the project becomes**, but if we operate the blog using a blog platform, if the blog operator (probably me?) **falls into a situation where they cannot operate the blog, our tech blog will become a ghost blog.**

However, if we self-host using GitHub, while I would need to do most of the blog setup, the operation can be handled by the Editor Group.

And so it began. **Building a tech blog with Hugo**

## Building the Tech Blog!

My previous blog was built with **Jekyll**. However, Jekyll was difficult to modify themes, and being Ruby-based, it sometimes caused dependency issues. Since I had never used Ruby, when dependency problems occurred, I would just turn a blind eye and ignore them.

![blurred_eye](./blurred_eye.png)

But when I looked into modern SSGs (Static Site Generators), I found [Hugo](https://gohugo.io/), built with Go, which had diverse themes and an active community, so I started building the blog based on it.

![timeline](./techblog_timeline.png)

And we also recruited people who wanted to participate in the Editor Group.

![We need you](./we_need_you.png)

> As many as 9 applicants!

And we completed implementing **comment functionality, multilingual support (Korean, English), search functionality, Google Search registration, Google Analytics registration, Author functionality...** everything!

## Operating the Tech Blog

If you want to write a post on our tech blog, you can do so through a GitHub Pull Request. Since it operates through GitHub PRs, it's a system where anyone who wants to write can freely submit posts, not just a specific administrator.

![pull request](./pull_request.png)

And, **the Editor Group can freely leave comments with their opinions on posts in PRs.**

![review](./review.png)

The Editor Group has one very important role. That is to **encourage developers to write tech blog posts**.

I once posted a blog post called [BERT 논문정리](https://mino-park7.github.io/nlp/2018/12/12/bert-%EB%85%BC%EB%AC%B8%EC%A0%95%EB%A6%AC/) after reading the BERT paper around 2018. Thankfully, so many people read this post that it appeared at the top of Google search results for a while.

Sharing what you've studied and researched externally is good for promoting the company's technical capabilities, but I believe it should also serve as personal promotion, so I encourage developers to actively blog post content from our internal wiki that can be shared externally.

## Upcoming Posts...

At HyperAccel, we develop everything from HW design for LLM Inference to the entire Software Stack for it.

That's why we deal with a really wide range of technologies within one company. So the posts we'll put on the tech blog will cover really diverse topics.

- How to build a Compiler?
- GPU characteristics (Know your enemy and know yourself)
- Open source analysis of LLM Inference Frameworks (vLLM, SGLang, ...)
- Development of Kubernetes Components for Hardware support in Cluster environments
- Building an internal development environment based on Kubernetes
- ...

We're planning to share really diverse and high-quality posts, so please stay tuned!

## HyperAccel is Hiring!

The biggest purpose of operating this tech blog is **talent recruitment**!

If you're interested in the technologies we work with, please apply at [HyperAccel Career](https://hyperaccel.career.greetinghr.com/ko/guide)!

HyperAccel has many excellent and brilliant engineers. We're waiting for your applications.
