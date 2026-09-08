---
date: '2026-09-07T00:00:00+09:00'
draft: false
title: 'Exploring Category Theory Through Monads, Part 1: Function Composition and Categories'
cover:
  image: "cover.jpg"
  alt: "Two composition paths grouping the same functions in different places"
  relative: true
  hidden: false
  hiddenInSingle: false
  hiddenInList: false
authors: [Jaeho Choi]
tags: ["category theory", "functional programming", "Lean4", "monad", "composition"]
series: ["Exploring Category Theory Through Monads"]
series_idx: 1
categories: ["Programming Language"]
summary: "Starting with a manager-contact lookup, we calculate the associativity and identity laws of function composition and generalize this structure to the definition of a category."
description: "Compose three functions that find an employee's manager contact, examining why regrouping preserves the result and what identity functions do."
comments: true
keywords: ["category theory", "function composition", "associativity", "identity laws", "Option", "Lean 4"]
---

Hello, I'm Jaeho Choi from the Compiler team at HyperAccel.

In this series, we will explore the **monads** we often encounter in functional programming from the perspective of category theory.

Writing a program often means connecting computations by passing one function's result to the next. Mathematics has a field that studies connections between objects and the laws for composing those connections: **category theory**. Function composition is one example of the connections it studies, and monads are also defined in this field.

You do not need to know monads or category theory beforehand. If you can read function inputs and outputs, we will introduce the necessary terms and mathematical notation as we go.

In Part 1, we will build a program that takes an employee ID and returns that employee's manager's email address. If we split the work into three functions, will the program remain the same whichever two steps we group first? Starting from this question, we will examine function composition and identity functions, then move to the definition of a category that generalizes this structure.

## Two ways to split a manager-contact lookup

Suppose we want an organization-chart screen to display the selected employee's manager's email address. We look up the employee by ID, find their manager, and then read the manager's email address. Let us write each step as a function.

~~~text
findEmployee : Nat → Employee
managerOf    : Employee → Employee
emailOf      : Employee → String
~~~

The notation `f : A → B` means that function `f` takes an `A` and returns a `B`. Applying a function as `f x` means the same thing as `f(x)`. `Nat` is the type of nonnegative integers, used here for employee IDs. `Employee` is the type of employee information.

We pass the employee returned by `findEmployee` to `managerOf`, then pass the resulting manager to `emailOf`. Each function's return type matches the next function's input type.

~~~text
emailOf (managerOf (findEmployee employeeId))
~~~

To reuse part of this lookup, we can extract two steps into a separate function. Call the function that finds a manager from an employee ID `findManager`.

~~~text
findManager : Nat → Employee
findManager employeeId = managerOf (findEmployee employeeId)
~~~

We can now obtain the manager's contact information with `emailOf (findManager employeeId)`. Alternatively, we can first group the two steps that obtain a manager's email from an employee.

~~~text
managerEmailOf : Employee → String
managerEmailOf employee = emailOf (managerOf employee)
~~~

This gives the same contact information through `managerEmailOf (findEmployee employeeId)`. Either way, we obtain the employee, manager, and email in that order. Let us check why regrouping these steps gives the same function.

## Associativity: the same computation with different grouping

The operation of connecting two functions to make a new function is called **function composition**. Using the composition symbol `∘`, we can write the functions we just defined as follows.

~~~text
findManager = managerOf ∘ findEmployee
managerEmailOf = emailOf ∘ managerOf
~~~

`managerOf ∘ findEmployee` applies `findEmployee` first and then `managerOf` to its result. Read it in the same order as the nested call `managerOf (findEmployee employeeId)`.

The construction is the same when we use general function and type names. Given `f : A → B` and `g : B → C`, define their composition by:

~~~text
g ∘ f : A → C

(g ∘ f) x = g (f x)
~~~

Like the nested call `g (f x)`, `g ∘ f` applies the right-hand function `f` first. The result of composition is itself a function, so it can be composed with another function.

Now we can group our three functions in two ways.

~~~text
emailOf ∘ (managerOf ∘ findEmployee)
(emailOf ∘ managerOf) ∘ findEmployee
~~~

![The same three functions in the same order, grouping either the first two or the last two](composition-grouping.en.svg)

The first expression uses `findManager` to find a manager from an employee ID, then reads the email. The second passes the employee found by `findEmployee` to `managerEmailOf`. Applying either expression to the same employee ID gives `emailOf (managerOf (findEmployee employeeId))`. Both expressions have type `Nat → String`.

Here, equality of functions means returning the same value for every input.

Let us generalize this calculation to arbitrary functions. Take three functions whose types line up, and an input:

~~~text
f : A → B
g : B → C
h : C → D
x : A
~~~

Expand the definition of composition one step at a time.

~~~text
(h ∘ (g ∘ f)) x
= h ((g ∘ f) x)
= h (g (f x))

((h ∘ g) ∘ f) x
= (h ∘ g) (f x)
= h (g (f x))
~~~

Both sides become the same expression, whatever the input `x`. We did not use any details of what `f`, `g`, or `h` computes internally. We used only the matching types and the definition of composition.

~~~text
h ∘ (g ∘ f) = (h ∘ g) ∘ f
~~~

This equation is the **associative law**, or **associativity**. Regrouping the functions leaves the overall function unchanged.

Both expressions apply the functions in the same order: `f`, then `g`, then `h`. Only the choice of which two functions to compose first changes.

## Identity functions: composing without changing the original function

When connecting functions, we can also ask for a function that leaves the original function unchanged when placed before or after it. Adding 0 leaves a number unchanged; let us look for a similar role in function composition.

`findEmployee` takes an employee ID and returns employee information. First, place a function that returns the ID unchanged before it.

~~~text
identityNat : Nat → Nat
identityNat employeeId = employeeId

findEmployee (identityNat employeeId)
= findEmployee employeeId
~~~

After finding the employee, place a function that returns employee information unchanged after `findEmployee`.

~~~text
identityEmployee : Employee → Employee
identityEmployee employee = employee

identityEmployee (findEmployee employeeId)
= findEmployee employeeId
~~~

A function that returns its input unchanged is called an **identity function**. For any type `A`, we can define it as follows:

~~~text
id_A : A → A
id_A x = x
~~~

The subscript `A` identifies the type. We can write `identityNat` as `id_Nat` and `identityEmployee` as `id_Employee`.

Place `id_A` before `f : A → B`, or `id_B` after it.

~~~text
(f ∘ id_A) x
= f (id_A x)
= f x

(id_B ∘ f) x
= id_B (f x)
= f x
~~~

This gives the two **identity laws**.

~~~text
f ∘ id_A = f
id_B ∘ f = f
~~~

Notice that the identity functions before and after `f` have different types. For `findEmployee : Nat → Employee`, we need `id_Nat` before it and `id_Employee` after it.

~~~text
Nat --id_Nat-------> Nat      --findEmployee--> Employee
Nat --findEmployee-> Employee --id_Employee---> Employee
~~~

## Defining a category: objects, morphisms, composition, and laws

We have used functions that find employees and their managers’ contact information to explore associativity and identity functions. We could check the laws without knowing the employee ID or how each function was implemented. We used only the matching types and the definitions of composition and identity.

Mathematics similarly focuses on shared properties rather than concrete details. Three people and three apples are different, but focusing on their number lets us represent both by the natural number `3`. We can also treat the residents of Seoul and the students at a school as sets by focusing on collections of members rather than the details of each person. Extracting properties or structure of interest from concrete details in this way is called **abstraction**.

A category is another example of abstraction. Functions between sets can be composed, and paths between vertices of a graph can be joined. Category theory extracts such connections, their composition, and the laws they satisfy from different mathematical structures and studies them in a common language.

Let us return to our function example to see what structure we retain.

~~~text
Nat --findEmployee--> Employee --managerOf--> Employee --emailOf--> String
~~~

Let us describe the types and functions we have been using in the language of categories. In this example, types such as `Nat`, `Employee`, and `String` are **objects**, and functions between types are **morphisms**. The function `findEmployee : Nat → Employee` is a morphism from the object `Nat` to the object `Employee`.

An object here is the type `Employee`, not a particular employee. The two occurrences of `Employee` in the diagram refer to the same object; `managerOf` is a morphism from that object to itself.

Composing two morphisms gives another morphism. For example, composing `findEmployee` and `managerOf` gives `managerOf ∘ findEmployee : Nat → Employee`. Each type also has the identity function defined earlier.

The definition of a category generalizes even the choice of types and functions as our ingredients. It leaves open what the objects and morphisms are, while requiring each morphism to have a source and target, specifying composition and identities, and requiring the same laws.

Earlier, we wrote function types as `A → B`. For general morphisms, we will use `f : A ⟶ B`: the source of `f` is `A` and its target is `B`. These two objects may be the same.

### Definition — Category

> **A category consists of the following data, satisfying the laws below.**[^riehl-category]
>
> **Data**
>
> 1. **Objects:** Specify the objects of the category.
> 2. **Morphisms:** For each pair of objects `A`, `B`, specify the morphisms from `A` to `B`. Each morphism has a specified source and target.
> 3. **Identity morphisms:** For each object `A`, specify a morphism `id_A : A ⟶ A`.
> 4. **Composition:** For every pair `f : A ⟶ B`, `g : B ⟶ C` with matching target and source, specify a composite `g ∘ f : A ⟶ C`.
>
> **Laws**
>
> **Associativity.** For every `f : A ⟶ B`, `g : B ⟶ C`, and `h : C ⟶ D`, the following equation holds.
>
> ~~~text
> h ∘ (g ∘ f) = (h ∘ g) ∘ f
> ~~~
>
> **Identity laws.** For every morphism `f : A ⟶ B`, both equations hold.
>
> ~~~text
> id_B ∘ f = f
> f ∘ id_A = f
> ~~~

Specifying composition and identity morphisms is distinct from checking their laws. All the data above must be given and the laws must hold to form a category.

Our types and functions provide one instance of this definition. Take types as objects,[^size-level] and pure total functions `A → B` as morphisms from `A` to `B`. Here, a pure function returns the same value for the same input and does not change external state; a total function returns a value of its return type for every input. Define composition by `g (f x)` and identities by returning the input unchanged. The calculations we made for arbitrary functions and inputs then prove the laws of this category.

In a general category, objects need not be types, and morphisms need not be functions. Other choices also form a category when equipped with composition and identities satisfying the same laws. A later article will give an example whose morphisms are not functions.

## Associativity alone does not guarantee an identity

The function composition defined earlier satisfies both associativity and the identity laws. If we choose an associative operation, can we always find a morphism that acts as an identity?

Take `Bool` as the only object, and all functions `Bool → Bool` as morphisms. Every morphism has the same source and target, so any pair has matching types.

Instead of ordinary function composition, define an operation `⋄` that keeps only the function on the left.

~~~text
g ⋄ f = g
~~~

This operation returns the function `g` itself without running either function. It discards `f`. The result still has type `Bool → Bool`, as required for a morphism.

What happens when we group three functions?

~~~text
h ⋄ (g ⋄ f) = h ⋄ g = h
(h ⋄ g) ⋄ f = h ⋄ f = h
~~~

Either grouping leaves only the leftmost function, `h`. The operation is therefore associative.

But an identity morphism `e` would have to satisfy `e ⋄ f = f` for every function `f`. Compare this requirement with the definition of the operation.

~~~text
e ⋄ f = f    -- required by the identity law
e ⋄ f = e    -- given by the definition of the operation
~~~

For both equations to hold, we need `e = f`. Moreover, a single identity morphism must work for **every** function, so the same `e` would have to equal every function `Bool → Bool`.

Comparing just two functions shows why this is impossible: `id_Bool`, which returns its input, and `not`, which reverses true and false.

~~~text
id_Bool true = true
not true = false
~~~

These functions differ, so one `e` cannot equal both. Thus this operation has no identity morphism.

Even with the same objects and morphisms, the choice of composition can determine whether we get a category. With the function composition defined earlier, the functions `Bool → Bool` have an identity function and satisfy both laws. With `⋄` as composition, no morphism acts as an identity. The operation `⋄` is not forbidden; the structure obtained by choosing it as composition fails to meet the conditions for a category.

## Returning to the earlier example

So far, we have described each lookup as succeeding and returning the value needed by the next step. But the employee ID might not exist, the employee might have no manager assigned, or the manager's email address might be missing.

To represent this absence in the return value, we need to change the function types. `Option A` represents the possible absence of an `A`. If a value `a` is present, we write `some a`; otherwise, we write `none`.

~~~text
findEmployee : Nat → Option Employee
managerOf    : Employee → Option Employee
emailOf      : Employee → Option String
~~~

![The original connection passes Employee directly; the revised connection needs to handle Option Employee](option-composition.en.svg)

We can no longer write `managerOf (findEmployee employeeId)` as before. The return type of `findEmployee` is `Option Employee`, while the input type of `managerOf` is `Employee`.

These are still mathematical functions: `none` is also a value of the return type. What has changed is that we can no longer pass one function's result directly to the next. If an employee is found, we need to pass the enclosed employee to the next lookup; otherwise, we need to stop.

How, then, should we connect these two functions?

~~~text
f : A → Option B
g : B → Option C

Result of connecting the two functions : A → Option C
~~~

## What we established

We could regroup the three employee-lookup functions because function composition is associative. Identity functions left the composed functions unchanged. A category specifies objects, morphisms, composition, and identities, and requires these laws to hold.

With the lookups changed to return `Option`, we can still connect them by passing a found value to the next step and stopping when it is absent. Once we make this handling part of a composition operation, we can ask the questions from earlier again. Does regrouping preserve the result? What function acts as an identity for this composition?

Monads are used to connect computations that account for the absence of a value, as `Option` does. In the next article, we will turn the repeated absence handling in our employee lookup into a composition operation and check associativity and the identity laws. This will give us a concrete example on the way to understanding monads.

## Lean exercise: check the types and laws of composition

This optional exercise is for readers who want to check the preceding calculations in Lean. The main conclusions follow from the equation expansions in the text without running the code.

We use Lean 4, a language in which we can write both functions and proofs. Instead of implementing the lookups, the code takes functions with the types used in the article as parameters and checks that the two groupings agree. The next article implements the employee lookups. This code was checked with Lean 4.32.1; [open the complete code in the Lean playground](https://live.lean-lang.org/#codez=LTAEFEA8AcBsHsBOBLAdgc1AYQIYBcBTdJAT1ABUALA0iyxeAV3UtAFl5UcATAZwBpQABRyI8oAIwAoEKABijVAGM8yTtngBbaPF7JV6nKm7Z8RJMgK8ZYLNSUBrAiYDu%2B1gBkCR0ABYAdADMAEz%2BEv6gAHLwoMjaSHi8oKIEoKgEzs7%2BUjagSlo6vKmYAGaxSZiAGESgZWigeNTJYshKsAQAXMnQcGRlJciIvHiCDQSooOjZ3ARl%2BfFFoADeAIKgAELYoJ3kJNAEAL6gABSYnRuASYTYAJTHZZ2rl2s396CXWFsAvFKgNYqgkKAPgA%2BCa3f5XHKyZDTVCqPBkRAEPCMRCoJL6dGoaCMcSKJSUIzoLKgACSiXqu1Sq2QmJKBEQiJM%2BFA3nxoEYRSmM1iMLhZBWWwolMOL0uq3aXx%2BJT%2BAOB%2F0hYHIOCc9UaCHgDkY0F%2BygMaOSSWgohwmiR9KSRhM%2BIIjlVzIARvAGhMGFq0OgLehEQRsqMkARNKBNEYcETEOBg8hYAB9RFepjQd1LCNweAkDKCnZ7fbfH63NDcFMIdOpTqRZmXItpjI3I7BrhhgDydwg2mLGcrberBAheeOAZwUebgqrJdeoAAyngUBhnrmfnNCqkB0OykdF7pUvXQ%2FTh%2F1jKOa4D53mNwt1wVNyzI7Bh9umyUbvvC12xxLQIgSrAFaBlrxePASjIPgyAAG76CQnRxq6iYYKA0CIkUiCgVYqqpDg3SwC0IHqEg0yIDUIzUOM6BEWMoCUNkshrE6rB6NMSSKCU8CwCYeAxNK4yyiCrAnGCkBXFcggAR%2BX6gChKD9KhowDCyACOjA4Fh8K%2BtQ%2FqBmeBDRjg%2F6AUsqwbO8AAimbCieRysJ07yXEZtanOs45YLWLYPOsc59ppFHHJ5pQ3B8eSXuenmsOgT6fKJ365NC0YbNUZT%2BSUUFIii4yjA5CHwNwjBKM4oD2r07LKASGBZFIfqIoG0JjHy0aLvpDnbMKYKim5Wwnp5VWwhBNSAj176fpFshlNU0WrAlnRGv%2BaGxFiOK%2FvUHGFfihKleVAYBdo0adXy9UbI12bNfNjzuaegWpLUvLdQl4UDT%2BVBWKkA3wQw8AlIxCxMAR0z7voaj6q9OoqH9G2FL9hjGDy1UQVRirUGQ3AxKgToskMOD2lhvCsGlsA4C4STMQROB5GYxCIGQbjOkT3DICUdKIrCIO6GDqDZEAA%3D%3D).

In the code, `compose g f` is our `g ∘ f`, and `identity` is the identity function. `def` begins a definition, and `fun x => ...` creates a function with input `x`. A `theorem` declaration states a proposition to prove.

~~~lean
-- Exploring Category Theory Through Monads, Part 1
-- Function Composition and Categories
-- Checked with Lean 4.32.1. No imports are needed.

-- compose g f is g ∘ f in the article: apply f first, then g.
def compose {A B C : Type} (g : B → C) (f : A → B) : A → C :=
  fun x => g (f x)

-- identity returns its input unchanged. Its type A is inferred at each use.
def identity {A : Type} : A → A :=
  fun x => x

-- Take the lookup functions as parameters and check that both groupings agree.
theorem managerEmail_regrouping {Employee : Type}
    (findEmployee : Nat → Employee) (managerOf : Employee → Employee)
    (emailOf : Employee → String) :
    compose emailOf (compose managerOf findEmployee) =
      compose (compose emailOf managerOf) findEmployee := rfl

-- Associativity: regrouping preserves the application order f, then g, then h.
-- Both sides unfold to fun x => h (g (f x)), so rfl verifies their equality.
theorem compose_assoc {A B C D : Type}
    (h : C → D) (g : B → C) (f : A → B) :
    compose h (compose g f) = compose (compose h g) f := rfl

-- id_B ∘ f = f: return the B produced by f unchanged.
theorem identity_comp {A B : Type} (f : A → B) :
    compose identity f = f := rfl

-- f ∘ id_A = f: pass the input A to f unchanged.
theorem comp_identity {A B : Type} (f : A → B) :
    compose f identity = f := rfl

-- These rfl proofs use our definitions of function composition and identity.
-- They do not establish the laws for a category with a different composition.
~~~

`managerEmail_regrouping` states that the two groupings in the employee example agree. It does not depend on the fields of `Employee` or the implementations of the three lookup functions. Just as in the equation expansions above, both sides reduce to the same nested call.

`compose_assoc` states associativity for arbitrary types `A`, `B`, `C`, and `D`, and functions `f`, `g`, and `h`. The declaration `{A B C D : Type}` introduces type parameters; the braces allow Lean to infer those types at use sites. The theorem corresponds to our equation as follows.

~~~text
compose h (compose g f) = compose (compose h g) f

h ∘ (g ∘ f) = (h ∘ g) ∘ f
~~~

`identity_comp` and `comp_identity` correspond to `id_B ∘ f = f` and `f ∘ id_A = f`, respectively. The code calls both identities `identity`, but Lean infers their types from the function being composed.

The `rfl` at the end of each proof asks Lean to check that unfolding and computing with these definitions gives the same function on both sides. For the identity laws, Lean also treats `fun x => f x` as the same function as `f`. Different definitions of composition and identity may need a different proof. This does not mean that the laws of every category can be proved with `rfl`.

## References

- Bartosz Milewski, *Category Theory for Programmers*, Ch. 1, §§1.1–1.2, pp. 3–6. Notation for function composition, associativity, and the identity laws.
- Emily Riehl, *Category Theory in Context*, Definition 1.1.1, p. 3; Example 1.1.3(i), p. 4. The definition of a category and the example of sets and functions.

[^riehl-category]: Riehl, Definition 1.1.1, p. 3. The original states two axioms: identity and associativity. Here we display the two sides of the identity law separately.
[^size-level]: This does not mean placing all types, without restriction, into a single set. We work at a fixed size level; this assumption does not change the function calculations above.
