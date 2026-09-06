---
date: '2026-09-07T00:00:00+09:00'
draft: false
title: 'Exploring Category Theory Through Monads, Part 1: Why Regrouping Functions Preserves the Result'
cover:
  image: "/images/logo.png"
  alt: "HyperAccel logo"
  relative: false
  hidden: true
  hiddenInSingle: true
  hiddenInList: true
authors: [Jaeho Choi]
tags: ["category theory", "functional programming", "Lean4", "monad", "composition"]
series: ["Exploring Category Theory Through Monads"]
series_idx: 1
categories: ["Programming Language"]
summary: "Starting with a manager-contact lookup, we calculate the associativity and identity laws of function composition and generalize this structure to the definition of a category."
description: "Follow why regrouping functions preserves a computation, from ordinary function composition to the definition of a category."
comments: true
keywords: ["category theory", "function composition", "associativity", "identity laws", "Option", "Lean 4"]
---

Hello, I'm Jaeho Choi from HyperAccel.

Writing a program often means connecting computations. We read input, perform some work, and pass the result to the next function. Each function's behavior matters, but so does the way we connect functions to make the whole program behave as intended. If we can pass one function's result straight to the next, the connection is simple. If the first function's return type differs from the next function's input type, we need to decide how to connect them.

Mathematics has a field that studies not only individual objects, but also the connections between them and how those connections compose: **category theory**. For example, functions between sets can be connected by passing the output of one to the input of the next. Category theory extracts these connections and their laws to describe different mathematical structures in a common language.

The **monads** we encounter in functional programming are also defined in category theory. How does the way we connect computations in code relate to that mathematical definition? I started this series to understand that connection through small examples. We will put code and equations side by side to explain which operations and laws make a structure a monad.

You do not need to know monads or category theory beforehand. If you can read function inputs and outputs and conditional branches, we will introduce the necessary terms and mathematical notation as we go. For readers who want to experiment, the series also includes runnable Lean 4 examples and small proofs.

This first article starts with splitting code into functions. If the code still performs the same computation, regrouping the functions should preserve the result. We will express this requirement through the laws of function composition and use them to understand the basic structure studied in category theory: a category.

## Two ways to split a manager-contact lookup

Suppose we want an organization-chart screen to display an employee's manager's contact information. We look up the employee by ID, find their manager, and then read the manager's email address.

~~~text
findEmployee : Nat → Option Employee
managerOf    : Employee → Option Employee
emailOf      : Employee → Option String
~~~

The notation `f : A → B` means that function `f` takes an `A` and returns a `B`. Applying a function as `f x` means the same thing as `f(x)`. `Nat` is the type of nonnegative integers, used here for employee IDs. `Employee` is a record containing a name, a manager ID, and contact information.

The three functions return `Option` for different reasons. An employee ID might not exist, an employee might have no manager assigned, or a manager's contact information might be missing. `Option A` is a type that represents the possible absence of an `A`. If a value `a` is present, we write `some a`; otherwise, we write `none`.

The following call has a type mismatch.

~~~text
managerOf (findEmployee 1)
~~~

`findEmployee 1` has type `Option Employee`, but `managerOf` expects an `Employee`. We have passed the lookup result as if it were an employee, before checking whether an employee was found.

~~~text
Nat --findEmployee--> Option Employee
                             ×
                          Employee --managerOf--> Option Employee
~~~

We can handle this by branching on whether a value is present. The following pseudocode calls the next function only when there is a value to pass.

~~~text
match findEmployee employeeId:
  none          => none
  some employee =>
    match managerOf employee:
      none         => none
      some manager => emailOf manager
~~~

Now let us extract part of this code into a separate function without changing its behavior. Given the same employee ID, we should find the same contact information; if the original lookup returned `none`, the refactored version should still return `none`. This is refactoring: changing the structure of the code while preserving its behavior.

There are two ways to group two adjacent steps. Grouping `findEmployee` with `managerOf` gives us `findManager`, which finds a manager from an employee ID. Grouping `managerOf` with `emailOf` gives us `managerEmailOf`, which finds a manager's email from an employee record.

~~~text
findManager    : Nat → Option Employee
managerEmailOf : Employee → Option String
~~~

Using `findManager` to find the manager, then `emailOf` to read their email, gives this lookup.

~~~text
match findManager employeeId:
  none         => none
  some manager => emailOf manager
~~~

Alternatively, we can find the employee with `findEmployee` and pass that employee to `managerEmailOf`.

~~~text
match findEmployee employeeId:
  none          => none
  some employee => managerEmailOf employee
~~~

In the first version, finding the employee and their manager happens inside `findManager`. Only reading the manager's email remains outside. In the second version, finding the employee remains outside, while finding the manager and their email happens inside `managerEmailOf`. Both versions take an employee ID and return an email or `none`, so their overall type is `Nat → Option String`.

The function boundaries have changed, but the order has not: find the employee, find their manager, then read the email. If the employee is missing, the first version detects the absence inside `findManager`, while the second detects it in the outer call to `findEmployee`. Either way, the lookup must stop with `none` without looking for a manager. If the email is found, both versions must return the same address.

Passing one function's result to another to form a single function can be described as composition. Here, however, a branch checks whether a value is present. Let us first connect some simpler functions that need no such branch, to see what composition means and what changes when we regroup functions.

## Function composition: the same computation with different grouping

This time, we want to display the city where a department's office is located. The department record already contains an office record, which contains an address, which contains a city name. We give each field access its own function.

~~~text
officeOf  : Department → Office
addressOf : Office → Address
cityOf    : Address → String
~~~

`officeOf` reads the office field of a department record and returns an `Office`. `addressOf` takes exactly that `Office`, and `cityOf` takes the `Address` returned by `addressOf`. At each step, we can pass the result directly to the next function without checking whether it is present.

The manager lookup returned `Option Employee`, while the next function expected `Employee`. Here, each function's return type matches the next function's input type. An `Option`-returning lookup is still a mathematical function: `none` is itself a value of its return type. The difference is not whether these are functions, but whether one result can be passed directly to the next.

For example, the following development-department record gives the city name `"서울"` ("Seoul"). In pseudocode, the record and call look like this.

~~~text
development = { office: { address: { city: "서울" } } }

cityOf (addressOf (officeOf development)) = "서울"
~~~

Let us first group the two steps that obtain the office address. We call the function that reads the office with `officeOf`, then its address with `addressOf`, `officeAddressOf`.

~~~text
officeAddressOf : Department → Address
officeAddressOf department = addressOf (officeOf department)
~~~

A caller of `officeAddressOf` only needs to pass a department record. The function performs both steps internally. To obtain the city as well, pass its result to `cityOf`.

~~~text
cityOf (officeAddressOf development) = "서울"
~~~

The operation of connecting two functions to make a new function is called **function composition**. Using the composition symbol `∘`, we can write the function we just defined as follows.

~~~text
officeAddressOf = addressOf ∘ officeOf
~~~

`addressOf ∘ officeOf` applies `officeOf` first and then `addressOf` to its result. Read it in the same order as the nested call `addressOf (officeOf department)`.

The construction is the same when we use general function and type names. Given `f : A → B` and `g : B → C`, define their composition by:

~~~text
g ∘ f : A → C

(g ∘ f) x = g (f x)
~~~

`g ∘ f` applies `f` first, then `g`. The nested call `g (f x)` explains why the right-hand function comes first. The result of composition is itself a function, so it can be composed with another function.

Now we can group our three functions in two ways.

~~~text
cityOf ∘ (addressOf ∘ officeOf)
(cityOf ∘ addressOf) ∘ officeOf
~~~

In the first expression, `addressOf ∘ officeOf` is the `officeAddressOf` we just defined. It obtains the office address from the department, then `cityOf` reads the city. The second expression first forms `cityOf ∘ addressOf`, which obtains a city from an office, and feeds it the office read by `officeOf`. Both expressions have type `Department → String`. Both read the office, address, and city in that order. The parentheses change which functions we group together, not the sequence of steps the input goes through.

Applying both expressions to `development` and expanding the definition of composition gives the same nested call.

~~~text
(cityOf ∘ (addressOf ∘ officeOf)) development
= cityOf (addressOf (officeOf development))
= "서울"

((cityOf ∘ addressOf) ∘ officeOf) development
= cityOf (addressOf (officeOf development))
= "서울"
~~~

But agreeing on one input does not make two functions equal. Here, equality of functions means returning the same value for every input.

Let us check whether the calculation holds beyond this particular department record. Take three functions whose types line up, and an input:

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

This equation is the **associative law**, or **associativity**.[^milewski-composition] Regrouping the functions leaves the overall function unchanged.

Changing the parentheses is different from changing the order of the functions. Adding 1 to 3 and then doubling gives 8; doubling 3 and then adding 1 gives 7. On both sides of the associative law, the application order is always `f`, then `g`, then `h`.

## Identity functions: composing without changing the original function

When connecting functions, we can also ask for a function that leaves the original function unchanged when placed before or after it. Adding 0 leaves a number unchanged; let us look for a similar role in function composition.

`officeOf` takes a department record and returns an office. First, place a function that returns the department unchanged before it.

~~~text
identityDepartment : Department → Department
identityDepartment department = department

officeOf (identityDepartment development)
= officeOf development
~~~

Passing through `identityDepartment` does not change the department that `officeOf` receives. The same idea works after reading the office. This time, place a function that returns the office unchanged after `officeOf`.

~~~text
identityOffice : Office → Office
identityOffice office = office

identityOffice (officeOf development)
= officeOf development
~~~

Both calls return the same office as `officeOf development`. The function placed before it passes the department through unchanged, and the one placed after it passes the office through unchanged.

A function that returns its input unchanged is called an **identity function**. We can define one not just for departments and offices, but for strings, natural numbers, or any other type.

For a type `A`, the definition is:

~~~text
id_A : A → A
id_A x = x
~~~

The subscript `A` identifies the type. We can write `identityDepartment` as `id_Department` and `identityOffice` as `id_Office`.

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

Notice that the identity functions before and after `f` have different types. For `officeOf : Department → Office`, we need `id_Department` before it and `id_Office` after it.

~~~text
Department --id_Department--> Department --officeOf--> Office
Department --officeOf-------> Office     --id_Office-> Office
~~~

## Defining a category: objects, arrows, composition, and laws

We have used functions that read department information to explore composition and identity. Yet the calculations establishing associativity and the identity laws did not use any specific department or office information. The matching input and output types, together with the definitions of composition and identity, were enough to show that both sides were the same function.

Can we take this structure beyond the department example and apply it to other objects? This brings us to a familiar mathematical method: abstraction.

Three people and three apples are different, but counting either gives the natural number `3`. We set aside what we counted and retain how many there are. Mathematics often treats different things in the same way by retaining the properties of interest. This is abstraction.

Sets offer another familiar example. Natural numbers and high-school students in Seoul are very different kinds of elements. Still, for sets of either kind, we can ask whether something belongs to a set or whether one set is included in another. We are not treating the two sets as the same set. We are using a common language of membership and inclusion to discuss different elements.

A category is another form of abstraction. This time, we look not only at objects individually, but at the connections between them and how those connections compose. Return to the department example.

~~~text
Department --officeOf--> Office --addressOf--> Address --cityOf--> String
~~~

In this picture, call types such as `Department`, `Office`, `Address`, and `String` **objects**, and the functions between types **arrows**, or **morphisms**. An object here is the type `Department`, not the particular department record `development`. The function `officeOf` is an arrow from the object `Department` to the object `Office`.

An arrow here is not merely a sign that two objects are related. It represents a specific function. Connecting `officeOf` and `addressOf` gives another arrow, `addressOf ∘ officeOf : Department → Address`. Each type also has an identity function that returns its input unchanged. This composition is associative, and composing with the appropriate identity before or after a function leaves it unchanged.

The definition of a category generalizes even the choice of types and functions as our ingredients. It leaves open what the objects and arrows are, while requiring each arrow to have a source and target, specifying composition and identities, and requiring the same laws.

To define a category, we specify the following components.[^riehl-category]

| Component | What we must specify |
|---|---|
| Objects | Which objects we work with |
| Arrows (morphisms) | Which arrows there are, and the source and target of each |
| Identity arrows | An arrow `id_A : A ⟶ A` for each object `A` |
| Composition | A specified `g ∘ f : A ⟶ C` for `f : A ⟶ B` and `g : B ⟶ C` |

The notation `A ⟶ B` denotes a morphism from object `A` to object `B`. We used `→` for functions earlier; here we use `⟶` for general arrows. Each arrow has a specified source and target. To compose two arrows, the target of the first must match the source of the next.

The chosen composition and identity arrows must satisfy these laws.

~~~text
h ∘ (g ∘ f) = (h ∘ g) ∘ f

id_B ∘ f = f
f ∘ id_A = f
~~~

The first equation is associativity, required for every composable triple of arrows. The last two equations are the identity laws, required for every `f : A ⟶ B`.

Choosing identity arrows and a composition operation is one task; checking whether those choices satisfy associativity and the identity laws is another. Calling an operation "composition" does not by itself make a category.

Our types and functions provide one instance of this definition. Take types as objects,[^size-level] and pure total functions `A → B` as arrows from `A` to `B`. Here, a pure function returns the same value for the same input and does not change external state; a total function returns a value of its return type for every input. Define composition by `g (f x)` and identities by returning the input unchanged. The calculations we made for arbitrary functions and inputs then prove the laws of this category.

The general definition, however, does not require objects to be types or arrows to be functions. Nor does it require operations that access elements or fields inside an object. Even with already-abstract mathematical objects and connections, such as sets and functions, we can extract the structure of composition and identity. In this sense, categories provide an abstraction for discussing different mathematical structures in a common language. A later article will give an example whose arrows are not functions.

## Associativity alone does not guarantee an identity

Ordinary function composition satisfies both associativity and the identity laws. If we choose an associative operation, can we always find an arrow that acts as an identity? In the following example, associativity holds, but no such arrow exists.

Take `Bool` as the only object, and all functions `Bool → Bool` as arrows. Every arrow has the same source and target, so any pair has matching types.

Instead of ordinary function composition, define an operation `⋄` that keeps only the function on the left.

~~~text
g ⋄ f = g
~~~

This operation does not run `f` and then `g`. It discards `f` and returns the function `g` itself. The result still has type `Bool → Bool`, as required for an arrow.

What happens when we group three functions?

~~~text
h ⋄ (g ⋄ f) = h ⋄ g = h
(h ⋄ g) ⋄ f = h ⋄ f = h
~~~

Either grouping leaves only the leftmost function, `h`. The operation is therefore associative.

The identity law is a problem, though. If an arrow `e` acts as an identity, placing it on the left of any function `f` must leave `f` unchanged.

~~~text
e ⋄ f = f
~~~

But our operation always keeps the function on the left.

~~~text
e ⋄ f = e
~~~

For both equations to hold, we need `e = f`. Moreover, a single identity arrow must work for **every** function, so the same `e` would have to equal every function `Bool → Bool`.

Comparing just two functions shows why this is impossible: `id_Bool`, which returns its input, and `not`, which reverses true and false.

~~~text
id_Bool true = true
not true = false
~~~

These functions differ, so one `e` cannot equal both. Thus this operation has no identity arrow.

The operation is associative, but we cannot specify an identity. These objects and arrows, with `⋄` as composition, therefore do not form a category. The identity laws do not follow automatically from associativity.

## Lean exercise: run both computations and check the composition laws

We grouped the functions that obtain a department's city in two ways. The code below runs both computations and checks the law that regrouping produces the same function. We use Lean 4, a language in which we can write both functions and proofs. This code was checked with Lean 4.32.1; [open the complete code in the Lean playground](https://live.lean-lang.org/#codez=LTAEFEA8AcBsHsBOBLAdgc1AYQIYBcBTdJAT1ABUALA0iyxeAV3UtAFl5UcATAZwBpQABRyI8oAIwAoEKADqlMgCUiDRtDSYAYo1QBjPMk69hiArwKIAbudB5qoFb0aw8MsFmp6A1gW6gAd2R7UAAZAhxUUAAWADoAZgAmWIlY0AA5eFBkAFtoJDwTUQJQVAI%2FP1j3bHg84sDKfDsHPACsgGICKxxYUD1anMi%2BO3NxIJCAxvF7EvszWeokAhyTaAYbKur%2BvPgLUEwAM2yTTEAMIlAjtGaS0UM9WAIALlAcaDgyI4PkRF48QRmougqtwCEdtvk9gBvACCoAAQthQM9yCRoAQAL6gAAUmGeCMASYTYACU2KOz1hhLhJPJoEJWCRAF4pKALrpQJBQAyAHz7UnsolSarIEGoQx4MhmPCMRCoEzBOWoaCMcS6PSNDCVUAASUKdlRJVhyAVB0sZn8TQiatAjAswNB2RFYrIMKRFH1mJphNhjyZLIObI53PZgtkKh411A8AOXz0BEEPG4Zl4AheqH8emCZF%2BS38VxwoBB0FuOQIotAZn6iG4VV%2BiEYBmlBu4ifMJkmlgIzL6mddAGU8CgMILa%2FWpWZQAB5aPIWMNDtdhNJkzk5tL4cD0eN0AAEQIRbEJbL7bMXajMZKzyn58FIKOZ5nBCn2MLxdL4meu%2F3eEPeGpk%2Bns4%2BgWe6vqKsT3rGUi3i8q6tk%2BWIQRe%2F7nn%2B0KwcmjKRgBBCxIurZQfaGbivBeEYSuLbJn%2B%2FaDriDIwRRvCxERJA3vaII2Ag0A%2Fq6n6ge%2BvqgJCWHnphQmkcudFCcxmEAESADiDgAdYzJoCYqpIZgAA4mo0DCQ%2BT5DPRS5Pl8Px4GkTguHgzzyUp2Iyb2NAuDJRJVJ03S9OCuwlMx8GeXs4lPohU4kuxBCcT%2B1RaUwOkBUcBk%2BZ83y%2FOZ5iWdZinKVi9mObAzmuV0PR9LUEIlFifneZm%2BnobwwW6bGT6heFb7qXQJQFbAjD4EYsojL8kaoLAZCNfAXFvmkVALDQZgrNa%2FmIAARsEiCiGQ4pokUaasvohjGFUsjQsm8AZl1ViZs8ZjoNpmigGs5iWDYJgzC8bywDOXWcJGVaWBc%2FzUICv2lqAlB7WAcLwCEvDCrYugHPAsD%2BHgWT%2BlEgY8qwOJ8pARJEoIvBZIgBy9DYKBfLYMzfKABAAI6da94pVDMSw5EVOwWAA%2Bjgh16IJsIIvS26uiiaLol2LJYqwzz0oS24khjeK0sSfKevC1KiyzJVA9i5W8gcJJ0drZXFV5mvoCSZJ0QTsAtcKbMIucRx0Qc50EGOURPQiazwNw9Z%2BKA80fNa%2BjquglRSIz00Om%2BmZs%2BCPPwoL7pK6AFIq0iava1Doo9g7FyYZbLVHOcNuwo7zxFhhT1oEq4iwojueqsHofh8s6ts5nTpxwiyKJ1iZLJwrVJpyyLLa5cjo9o7eeEy1E17JbN0MFGJg2iUTCIMBXyoME3UmFGW0GN16u7NvH0Ge3mYg61Q1ZKg4OU78ODza9vCsE9sA4AEJiw%2Bv%2BZ6PgRC0HGKwfM3BkDRg7GWPyJ9UBVCAA).

Start with the two `#eval` lines. `#eval` evaluates an expression and displays its result. The first line groups `officeOf` and `addressOf` first; the second groups `addressOf` and `cityOf` first. Both take `development` as input and print `"서울"`.

In the code, `compose g f` is our `g ∘ f`, and `identity` is the identity function. The first part defines the department information and functions. The three `theorem` declarations at the end state associativity and the two identity laws.

~~~lean
-- Exploring Category Theory Through Monads, Part 1
-- Why Regrouping Functions Preserves the Result
-- Checked with Lean 4.32.1. No imports are needed.
-- Compare what the two #eval commands test with what the three theorems prove.

-- compose g f is g ∘ f in the article: apply f first, then g.
def compose {A B C : Type} (g : B → C) (f : A → B) : A → C :=
  fun x => g (f x)

-- identity returns its input unchanged. Its type A is inferred at each use.
def identity {A : Type} : A → A :=
  fun x => x

-- Read the office, address, and city stored in a department record.
structure Address where
  city : String

structure Office where
  address : Address

structure Department where
  office : Office

def officeOf (department : Department) : Office := department.office
def addressOf (office : Office) : Address := office.address
def cityOf (address : Address) : String := address.city

def development : Department :=
  { office := { address := { city := "서울" } } }

-- Group officeOf and addressOf first. Result: "서울" ("Seoul").
#eval compose cityOf (compose addressOf officeOf) development
-- Group addressOf and cityOf first. Result: "서울" ("Seoul").
#eval compose (compose cityOf addressOf) officeOf development

-- The evaluations test only development. The theorems use arbitrary types and functions.
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

The department definitions correspond to the earlier pseudocode. `structure` declares a record type, and `department.office` reads its `office` field. The expression `{ office := ... }` creates a record with that field populated. `def` begins a definition, and `fun x => ...` creates a function with input `x`.

Getting the same city in two evaluations does not establish equality for every input. Just as we expanded expressions for an arbitrary input earlier, we need an equation that does not depend on a particular department record.

`compose_assoc` states associativity for arbitrary types `A`, `B`, `C`, and `D`, and functions `f`, `g`, and `h`. The declaration `{A B C D : Type}` introduces type parameters; the braces allow Lean to infer those types at use sites. The theorem corresponds to our equation as follows.

~~~text
compose h (compose g f) = compose (compose h g) f

h ∘ (g ∘ f) = (h ∘ g) ∘ f
~~~

`identity_comp` and `comp_identity` correspond to `id_B ∘ f = f` and `f ∘ id_A = f`, respectively. The code calls both identities `identity`, but Lean infers their types from the function being composed.

The `rfl` at the end of each proof asks Lean to check that unfolding and computing with these definitions gives the same function on both sides. For the identity laws, Lean also treats `fun x => f x` as the same function as `f`. Different definitions of composition and identity may need a different proof. This does not mean that the laws of every category can be proved with `rfl`.

## Returning to the manager-contact lookup

We began by wanting to split a manager-contact lookup in two ways. We can now say more precisely what needs to be checked.

The three lookup functions had these types.

~~~text
findEmployee : Nat → Option Employee
managerOf    : Employee → Option Employee
emailOf      : Employee → Option String
~~~

These are functions too: they associate a return value with an input. But `findEmployee` returns `Option Employee`, while `managerOf` takes `Employee`. Ordinary function composition cannot connect them directly.

Our original `match` code handled this difference explicitly. Given `some employee`, it passed the enclosed `employee` to the next lookup. Given `none`, it returned `none` without performing the next lookup.

Making that handling into a common operation would let us construct one function from the following two.

~~~text
f : A → Option B
g : B → Option C

Result of connecting the two functions : A → Option C
~~~

The result has the same form, so we can connect it to another function `C → Option D`. This is the operation we need to connect the three lookups one at a time.

Being able to connect functions, however, does not by itself justify the original refactoring. We must get the same result whether we use `findManager`, which groups `findEmployee` and `managerOf`, or `managerEmailOf`, which groups `managerOf` and `emailOf`. That is why we need to check associativity for the new operation.

If we also choose a function that acts as an identity and verify the identity laws, these rules for connecting lookups give us a category. The arrows now have the form `A → Option B`, so the identity function must have type `A → Option A`.

In the next article, we will define the composition that handles `some` and `none`, then check that both ways of splitting the lookup agree even when it stops partway through.

## References

- Bartosz Milewski, *Category Theory for Programmers*, Ch. 1, §§1.1–1.2, pp. 3–6. Notation for function composition, associativity, and the identity laws.
- Emily Riehl, *Category Theory in Context*, Definition 1.1.1, p. 3; Example 1.1.3(i), p. 4. The definition of a category and the example of sets and functions.

[^milewski-composition]: Milewski, Ch. 1, §1.2, pp. 5–6. The department-record example used to illustrate the laws is original to this series, not adapted from the book.
[^riehl-category]: Riehl, Definition 1.1.1, p. 3. The original states two axioms: identity and associativity. Here we display the two sides of the identity law separately.
[^size-level]: This does not mean placing all types, without restriction, into a single set. We work at a fixed size level; this assumption does not change the function calculations above.
