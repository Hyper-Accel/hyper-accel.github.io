---
date: '2025-12-13T15:10:28+09:00'
draft: false
title: 'Crafting Compilers (Chapter 1.1) : Building a Programming Language'
cover:
  image: "macintosh.jpeg"
  # can also paste direct link from external site
  # ex. https://i.ibb.co/K0HVPBd/paper-mod-profilemode.png
  alt: "<alt text>"
  caption: "<text>"
  relative: false # To use relative path for cover image, used in hugo Page-bundles
authors: [Jaewoo Kim] # must match with content/authors
tags: [compiler]
categories: [compiler]
summary: [First article about building a programming language]
comments: true
---

# **Building a Programming Language**

Before building a compiler, we need to define the language it will compile. A programming language isn’t just syntax and semantics—it’s the user interface between humans and computers.

---

## **What Is a Programming Language?**

Abstraction is one of the core ideas in computer science. Without abstraction, interacting with computers would require understanding electrical signals, memory layout, registers, and countless hardware details.

A programming language simplifies this complexity. It provides a human-friendly way to express ideas while hiding the low-level mechanisms that make them work. In this sense, a programming language functions as a **UI for computing**—a layer that lets us focus on building logic, applications, and systems, rather than manually manipulating hardware.

Whatever language you choose—Python, Rust, C++, Go, or something entirely new—its purpose is the same: turn human intention into machine behavior.

---

## **Compiled vs. Interpreted**

Programming language implementations are often categorized by how they execute code:

- **Compiled languages**
- **Interpreted languages**

A compiled language translates the entire source code into machine instructions before execution. Once compiled, the program can run directly on the hardware, resulting in high performance and efficient CPU usage.

An interpreted language, on the other hand, executes code step-by-step. The interpreter reads each instruction and performs it immediately, without producing a standalone machine binary.

A simple analogy:

> Imagine you have a recipe book written in French.
> 
- With an **interpreter**, you translate each sentence as you read it and cook immediately.
- With a **compiler**, you translate the entire cookbook into your language first and then cook smoothly without stopping.

Compiled languages (like C, C++, or Rust) typically offer speed, safety analyses, and optimization, but require recompilation when the code changes. Interpreted languages (like Python, Ruby, or Perl) prioritize convenience, interactivity, and flexibility—especially during early development—but generally run slower. This is why C is generally faster than Python. C can have REPL-like environments, but they are uncommon and not part of the language’s standard toolchain.

**Languages can be compiled & interpreted at same time**

Actually, being “compiled language” or “interpreted language” is not property of language itself, but it is more accurate to view this distinction as a property of the language implementation rather than the language itself.

Languages based on JVM (Java Virtual Machine) can be both “compiled” and “interpreted”. Meaning, they can be compiled into machine code on the fly at runtime using a Just-In-Time compiler, or they can be interpreted. Typically, Java (or any other JVM based language) programs are first compiled to something called “bytecode”. Which is instruction for JVM, but not hardware-specific. This bytecode can be deployed anywhere that runs JVM, and it is JVM’s choice to compile them down to target-specific code, or interpret bytecode.

Moreover, Python is often described as an interpreted language, but in practice, its source code is first compiled into Python bytecode (.pyc files), which is then executed by the Python virtual machine. Some implementation like PyPy can compile Python down to machine code, just like JVMs do.

---

## **Managed vs. Unmanaged**

Another useful distinction between languages is how they manage memory.

Programs need memory to run. They request memory from the operating system and should return it when finished. If they fail to do so, we get issues such as:

- **Segmentation faults** when accessing memory the program doesn’t own.
- **Memory leaks** when unused memory is never returned.

**Managed languages** automate memory handling, often using garbage collection or runtime analysis. This reduces the chance of memory-related mistakes and simplifies development. They typically use program called “Garbage Collector (GC)”, which automatically detects unreachable memory regions and frees them, so operating system can allocate that memory for another program (process). Some garbage collectors may stop the entire program (stop-the-world) during certain phases, although modern collectors often reduce or avoid long pauses using concurrent or incremental techniques. Garbage collectors are convenient, but might make programs run slower.

Example of managed programming language (Python)

```python
# my_list is internally allocated
size = input()

# Python internally allocates memory space for storing list.
my_list = [x for x in range(0, int(size))]

# Do some work using my_list
# my_list is automatically deallocated after use
```

**Unmanaged languages**, like C/C++ give developers direct control. They provide APIs such as malloc and free, which ultimately request memory from the operating system through lower-level system calls. Programmers are responsible for making sure memory is allocated and freed correctly. Since unmanaged languages do not rely on garbage collectors, they avoid GC-related pauses such as stop-the-world events, but this shifts the responsibility of correctness and safety to the programmer or the compiler. Also, they give more optimization headroom since programmers can hand-optimize when to allocate and free memory. But managing this makes programs more complicated, and easier to break. (Rust uses a static ownership and borrowing system enforced by the compiler to achieve memory safety without garbage collection.)

Example of unmanaged programming language (C)

```c
#include <stdio.h>
#include <stdlib.h>

int main(){
  int size;
  scanf("%d", &size);
  
  // Explicitly allocate aray
  int* my_list = malloc(size * sizeof(int));
  for(int i = 0; i < size; ++i){
	  my_list[i] = i;
	}
	
	// Do some work with my_list
	
	// my_list has to be explicitly freed, or memory would leak.
	free(my_list);
	return 0;
}
```

---

## Functional vs Imperative

One last way to categorize programming languages is the distinction between “functional” and “imperative” languages. Imperative languages describe programs as sequences of commands that change program state, while functional languages emphasize expressions, immutability, and function composition. In functional languages, computation is often expressed as the evaluation of expressions rather than execution of statements.

Here are simple examples of adding all numbers in list in functional & imperative way

Example of imperative language (Python)

```python
my_list = [1,2,3,4,5]

sum = 0
for elem in my_list:
  sum += elem
print(f"Sum : {sum}") # Prints "Sum : 15"
```

Example of functional language (F#)

```fsharp
let my_list = [1;2;3;4;5]
let sum = List.fold (fun acc elem -> acc + elem) 0 my_list
printfn "Sum : %A" sum // Prints "Sum : 15"
```

They both do the same thing, but way they are written is different.

Pure functional languages have restrictions that imperative language does not.

1. All values (let bindings) are immutable
2. No for loops (All iterations are done by recursion)
    1. However,  compiler can transform recursions to loops for optimization if function is “tail-recursive” (More on this later)
3. Functions are “Pure”
    1. By “Pure”, we mean functions have no side effects at all. 
    2. It is safe to remove the function if its result is not used (Compilers can do aggressive dead code elimination)
    3. Functions always give same result when same inputs were given

Functional programming languages generally have stiffer learning curve, and a lot of programmers aren’t familiar with functional languages. However, it comes with some clear advantages.

**Advantages of functional programming**

1. Since there are no side effects, programs are safer and easier to reason about.
2. Clear dataflow makes it easier for compilers to detect potential errors.
3. Programs can be described declaratively. It focuses on “What to compute” rather than mutating states.
4. Purity and immutability makes it easier to write safe concurrent programs.

It is out of scope for this chapter to explain reasons for all of them, but if you keep following the journey of building a programming language, you will see why these problems matter, and why functional language has edges over imperative language.

Of course, functional programming is not a silver bullet. For certain tasks, especially those that are inherently stateful or performance-critical, imperative styles may be more natural or efficient.

---

## Let’s build a programming language!

So, what kind of language are we going to build?

We are building unmanaged, fully compiled, functional-style language. But we will implement ownership control (Just like Rust!) so programmer does not have to manually manage the lifetime of data. The reason for this is quite straightforward. It is easier to focus on compiler itself (We don’t have to build interpreters or garbage collectors!), and there are already good articles and books written by other people for implementing interpreters. But I might explain design choices that I would’ve made if I made interpreter for our language during our journey.

**Why functional language?**

Functional languages are harder to learn for most people, and it’s type of language that lots of programmers aren’t familiar with. But, why are we building it functional-style? First, from the perspective of a language designer, it is easier and clearer to define. Secondly, because most programmers aren’t familiar with functional programming, I wanted to give you taste of how functional programming looks like. We will see how it behaves differently from imperative style languages, and see what advantages and disadvantages it has. However, if you want to build imperative language yourself, you can still use concepts and skills described here.

---

## The Hoya Language.

Our language is called “Hoya”. Rest of this post will be centered on implementing Hoya, our programming language. But before we put ourselves hitting keyboard in front of a code editor, let me give you how our language looks like. We should define what we’re building before we start doing so.

### Hello world!

Let us make Hoya to say hello to us. Here is the simplest example of Hoya language.

```go
func main(){
  print("Hello world!")
  0
}
```

Although many languages can be represented as a single AST, functional-style languages often emphasize expression-based program structure, which naturally maps well to tree representations.

![CraftingCompilers.drawio.png](ast.png)

This is what our program looks like (where the suffix “E” stands for “Expression”).

The `CallE` (call expression) consists of three children. The first one represents the callee (the function being called). The second one is the argument, “Hello world”, which represents a string. The last one is `NextE`, which represents the next expression to execute. In our case, the next expression is the constant zero.

By representing a program in a tree-like format, compilers or interpreters can traverse it and either compile or execute it. This kind of tree is called an AST (short for Abstract Syntax Tree). Converting a program—which is just a plain string from the computer’s perspective—into an AST is usually the first process a compiler performs. Once the program is converted into an AST, the compiler or interpreter can start translating it into machine-level instructions or interpreting it directly.

From the following chapters, we will start designing all parts of the Hoya language. We will see how a language can be defined and how we can describe its behavior as each expression is evaluated.
