---
date: '2026-05-07T10:00:00+09:00'
draft: true
title: 'Back to the Terminal: Why the Vibe Coding Era is Reviving the CLI'
cover:
  image: '[TODO: cover image]'
  alt: 'An AI agent running a developer workflow on a black terminal screen'
  caption: 'The black screen is back — but this time, it has agents.'
  relative: true
authors: ['Taeseo Um']
tags: ['AI Agents', 'CLI', 'Vibe Coding', 'Context Engineering', 'Developer Tools']
categories: ['AI', 'Developer Tools']
series: ['AI Agent Series']
series_idx: 2
summary: 'The next chapter of AI coding is not just about larger models. It is about better harnesses, tighter loops, and why the CLI is becoming the natural habitat for agents.'
comments: true
---

Hello, my name is Taeseo Um, currently on the ML team at HyperAccel.

In the previous post, I wrote about how we moved from **Copy & Paste** workflows to coding agents. At first, AI felt like a slightly smarter search bar. Then it became autocomplete. Now it can write a `plan.md`, run tests, read failures, and try again. At that point, it starts to feel less like a feature and more like a junior engineer with unusually fast hands.

This post is about a surprisingly old character in that story: the terminal.

Not a heavier IDE. Not a shinier chat UI. The black screen. The same interface that many people once treated as something we would eventually abstract away is becoming one of the most important surfaces in the AI agent era.

And no, this is not because developers suddenly got nostalgic for the 1990s. It is because the terminal is where agents naturally live.

## From Model Wars to Harness Wars

For the last year or two, we have compared models almost like sports teams. GPT wins this one. Claude writes cleaner code. Gemini remembers more context. Of course model quality matters. A weak engine will not take a sports car very far.

But once we enter the agentic era, the question changes.

Instead of asking **“Which model is the smartest?”**, the more useful question becomes **“What environment did we put the model in?”**

I like to call this the shift from **Model Wars** to **Harness Wars**. A harness is the execution environment around the model. It is the set of tools, sandboxes, loops, permissions, files, tests, logs, and recovery paths that turns a language model into something that can actually do work.

A mediocre model inside a great harness can often be more useful than a frontier model sitting alone in an empty chat box. Software engineering is not a school exam where the model writes one perfect answer. It is a messy feedback loop inside a real repository.

That difference is larger than it looks. A model in a chat window gives you an answer. An agent in a harness performs a task. In software engineering, we usually prefer passing work over elegant paragraphs.

## Why the CLI Is Back

The terminal has always been the backstage of software development. Builds, tests, deployments, logs, `git diff`, `grep`, `curl`, `ssh`. Even when we spend most of the day in an IDE, the pulse of the system still beats in the shell.

AI agents like that pulse.

The CLI is fast. There are no buttons to find, no panels to rearrange, no visual state to interpret. Commands are text. Outputs are text. For an agent, this is almost a native language. Run `npm test`, read the failure, inspect the relevant file, patch it, run the test again. That loop fits the shell much better than it fits a mouse-driven interface.

The CLI is composable. The output of one command becomes the input to the next. Test logs become context. Search results become navigation. To humans, this is old Unix philosophy. To agents, it is a great sensory system.

The CLI also gives raw control. If an IDE is a friendly city, the terminal is closer to an airport control tower. It is dense, direct, and sometimes unforgiving. But it makes it easier to see what the agent did, which command it ran, where it failed, and what changed.

That is why terminal-based agent workflows feel both futuristic and primitive. You sit in front of a black screen, describe a goal in natural language, and underneath it, the file system, test runner, package manager, and Git all start moving. The commands developers used to type manually become the agent’s arms and legs.

This is what I think vibe coding really means. It does not mean coding carelessly. It means working closer to the speed of thought and speech, while the agent translates intent into executable loops. The developer spends less time on keystroke labor and more time on direction, judgment, and verification.

## The IDE Is Not Dead. Its Role Is Changing.

This is not an “IDE is dead” post. IDEs are still excellent. For refactoring, debugging, type exploration, visual navigation, and final polishing, they remain some of the best tools we have.

But in the agentic era, the center of gravity moves a little.

An IDE is like a precise carving knife. A CLI agent is more like a forklift in the workshop. One gives you fingertip control. The other moves large blocks of work. This is not a competition where only one tool survives. It is a question of which tool belongs at which stage.

Here is the way I think about it.

| Category | Model Era | Agentic Era |
| --- | --- | --- |
| Main question | Which model is smarter? | Which harness gets work done? |
| Interface | Chat window, autocomplete | CLI, tool calls, execution loops |
| Developer role | Prompt writer | Context designer, reviewer, orchestrator |
| Output | Answers, snippets | Patches, test results, logs |
| Core skill | Prompt Engineering | Context Engineering |

The IDE remains a place for polishing code. The CLI and agent become a place for manifesting code. When you say, “build this feature,” “fix this failing test until it passes,” or “split this work into reviewable commits,” the terminal is a surprisingly natural place for that request to become real work.

## From Prompt Engineering to Context Engineering

For a while, many of us learned how to write better prompts. Assign a role. Ask the model to think step by step. Provide examples. Those ideas are still useful. But in agent workflows, the real skill is no longer making one beautiful prompt.

The real skill is **Context Engineering**.

Context engineering is the practice of designing the state in which the agent works. Which files should it read? Which rules should it remember? Which tests should it trust? How far should it retry after a failure? Which parts of the codebase are off limits?

Here is a human analogy. Prompt engineering is learning how to tell a junior engineer, “Please write good code.” Context engineering is giving that junior engineer the onboarding doc, architecture diagram, test account, CI rules, review checklist, and the one scary file they should never touch on Friday afternoon.

The second one matters more.

Agents can look like they have strong memory, but in practice they can lose task state easily. If they do not know which decisions were already made, which files should not be edited, or which failing test is already flaky, they can perform very convincing nonsense at high speed. Speed is useful, but if the direction is wrong, speed just gets you to the cliff earlier.

Good agent workflows therefore need explicit state management: plan files, checklists, execution logs, test evidence, scope boundaries, and “must not do” constraints. These used to look like process documents. Now they are working memory for agents.

## The Research Points in the Same Direction

This shift is not just a developer lifestyle trend. Research and benchmarks are pointing in a similar direction. Instead of asking a model to write “the correct code” in one shot, the more realistic pattern is becoming: inspect the repository, run commands, observe failures, patch, and verify.

[Software Engineering Benchmark(SWE-bench)](https://www.swebench.com/original.html), for example, evaluates whether models can patch real GitHub issues. [SWE-bench Verified](https://www.swebench.com/verified) uses a human-filtered subset of 500 tasks. The important part is not that any single number proves “coding intelligence.” It does not. The important part is that realistic software engineering evaluation increasingly looks less like answer generation and more like repair inside an environment.

Andrew Ng has also described agentic workflow patterns such as **Reflection**, **Tool Use**, **Planning**, and **Multi-agent Collaboration**. This is practical guidance rather than a universal theorem, but it captures the direction well. We are moving from asking a model one question to building systems where models can use tools, critique outputs, plan steps, and combine roles over time.

[CodeAct](https://arxiv.org/abs/2402.01030) is another interesting example. It proposes using executable code as the agent’s action space instead of only text or JSON-style actions. The paper reports benchmark-specific gains on tool-use tasks, but we should be careful not to turn that into “code actions always win.” Results depend heavily on the benchmark, the available tools, and the execution environment.

The safe takeaway is this: for software engineering and tool-use tasks, raw model quality is only one part of the system. Loops, tools, execution environments, and context management increasingly matter just as much.

## What Famous Harnesses Got Right

If you look at developer tools today, the personality of the harness is often more visible than the name of the model underneath. Two tools can call the same Claude or GPT-family model and still feel completely different. One behaves like a pair programmer. Another behaves like a GitHub issue repair bot. Another feels like a small engineering team made of parallel specialist agents.

[Claude Code](https://code.claude.com/docs/en/overview) is one of the clearest reference points in this shift. It reads the repository, edits files, runs commands, and exposes extension points such as **Model Context Protocol(MCP)**, hooks, and subagents. It became famous not simply because it put Claude in the CLI, but because it placed the model inside the development loop where developers already live.

[OpenCode](https://opencode.ai/) pushes a similar terminal feeling in a more open direction. It emphasizes provider-agnostic model support, **Language Server Protocol(LSP)**-enabled code understanding, and multi-session workflows. It is terminal-centric, but it also reaches toward desktop and IDE surfaces. That is a realistic posture: the terminal may be the center of gravity, but it does not have to be the only surface.

[OpenHands](https://openhands.dev/) is closer to a platform. It spans CLI, GUI, SDK, cloud, and self-hosted workflows, which makes it feel less like a single terminal tool and more like an operating layer for agents. Reducing it to “just a CLI” misses the bigger point.

[Aider](https://aider.chat/) is sharper and more minimal. It is a Git-native terminal pair programmer. It is usually more human-in-the-loop than fully autonomous, but that is exactly why developers like it. It thinks in diffs, commits, and repo maps. It made the agent workflow feel lightweight enough to use every day.

[SWE-agent](https://swe-agent.com/latest/) became famous through the language of research and benchmarks. Its issue-to-fix loop—read the GitHub issue, inspect the repository, run commands, patch, and verify—became one of the iconic patterns of the SWE-bench era. The current project notes that major development has shifted toward mini-swe-agent, so the safe lesson is not the brand name. The lesson is the loop.

Nous Research’s [Hermes Agent](https://github.com/NousResearch/hermes-agent) points in another direction. Hermes here is not just a model family name; it is an autonomous agent system with memory, skills, and messaging gateway workflows. You can start it from the terminal with the `hermes` command, but it can also extend into Telegram, Discord, Slack, and other messaging surfaces. That is interesting because the harness stops being only a coding tool and starts looking like a runtime for persistent agents.

Then come the more opinionated wrappers. [Oh My OpenAgent](https://ohmyopenagent.com/docs) builds on top of OpenCode with parallel specialist agents, LSP, AST-Grep, hash-anchored edits, and ultrawork-style workflows. [Oh My Claude](https://github.com/TechDufus/oh-my-claude) extends Claude Code with subagents, guardrails, review gates, and similar orchestration ideas. They are not famous because they are new base models. They are famous because they change how work gets delegated, verified, and recovered.

Here is the quick map.

| Harness | Why it became known | Character |
| --- | --- | --- |
| Claude Code | Terminal-native coding loop and official Anthropic experience | Commercial CLI agent reference point |
| OpenCode | Provider-agnostic setup, LSP, multi-session work | Open terminal/desktop/IDE agent |
| OpenHands | CLI/GUI/SDK/cloud platform story | Closer to an agent operating layer |
| Aider | Git-native pair programming | Human-in-the-loop terminal assistant |
| SWE-agent | SWE-bench and issue-to-fix workflows | Research and benchmark harness |
| Hermes Agent | Memory, skills, messaging gateway | Persistent autonomous agent system |
| Oh My OpenAgent / Oh My Claude | Parallel agents, review gates, ultrawork | Opinionated plugins that strengthen existing CLI agents |

The common thread is that each tool answers the same question differently. Not “what should we ask the model?” but “what environment should the model act inside, what tools should it use, what loop should it run, and what evidence should it leave behind?”

In other words, it is not enough for the model to be smart in isolation. It needs a stage where it can act. Right now, one of the most practical stages is the CLI.

## The Lifestyle Shift on the Black Screen

After a few days with terminal-based agent workflows, the texture of work starts to change.

Before, the developer kept typing. Open the file. Rename the function. Run the test. Read the log. Fix the code. Run the test again. Now, more often, the developer declares an objective.

“Fix this failing test all the way through.”

“Apply this API change to all call sites.”

“Turn this feature request into a small, reviewable implementation plan.”

Then, while the agent works, the developer drinks coffee. Important clarification: the coffee does not remove responsibility. If anything, review becomes more important. Code generated quickly must be verified quickly. Tests, diffs, logs, security, and design intent are still human responsibilities.

But the texture changes. Less time is spent stacking bricks one by one. More time is spent deciding which wall should exist and why. The developer becomes less like a typist and more like a site supervisor. A good site supervisor can still use the shovel, but does not personally dig every hole.

This shift feels especially natural in the terminal because everything leaves a trace. Commands, outputs, failures, retries, patches. The agent’s work accumulates as a log on the black screen. In a chat UI, it feels like conversation. In the CLI, it feels like work history.

For developers, that history is a very useful comfort blanket.

## What a Good Harness Needs

So what should a good CLI agent harness provide? I do not want this to become a feature checklist, but a few things matter.

First, tool access. The agent should be able to read files, search code, run tests, and inspect Git state. A model without eyes and hands is mostly a consultant. Consultants are useful, but sometimes you really want someone to fix the build.

Second, safe execution. Agents make mistakes. That means sandboxes, permission controls, scope limits, and explicit approval points matter. The faster the tool, the better the brakes need to be.

Third, iteration loops. One-shot generation does not match real software development. If a test fails, the agent should inspect the failure, revise the patch, and run the test again. The quality of that loop is often the quality of the harness.

Fourth, context management. Rules, past decisions, project structure, coding style, forbidden paths, and target behavior need to reach the agent reliably. Blurry context produces blurry results.

Finally, reviewable evidence. “Done” is not enough. The agent should leave behind what it ran, what it changed, what failed, and what passed. In the agent era, trust comes less from confidence and more from evidence.
