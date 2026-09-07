---
date: '2026-09-07T00:00:00+09:00'
draft: false
title: '모나드로 알아보는 범주론 1편: 함수를 어디서 묶어도 결과가 같은 이유'
cover:
  image: "cover.jpg"
  alt: "같은 함수들을 서로 다른 위치에서 묶은 두 합성 경로"
  relative: true
  hidden: false
  hiddenInSingle: false
  hiddenInList: false
authors: [Jaeho Choi]
tags: ["category theory", "functional programming", "Lean4", "monad", "composition"]
series: ["모나드로 알아보는 범주론"]
series_idx: 1
categories: ["Programming Language"]
summary: "팀장 연락처를 찾는 코드를 나누는 문제에서 출발합니다. 함수 합성의 결합법칙과 항등법칙을 직접 계산하고, 이 구조를 일반화한 category의 정의를 알아봅니다."
description: "함수를 묶는 위치가 달라도 같은 계산이 되는 이유를 따라가며, 함수 합성에서 category의 정의로 나아갑니다."
comments: true
keywords: ["category theory", "범주론", "함수 합성", "결합법칙", "항등법칙", "Option", "Lean 4"]
---

안녕하세요, HyperAccel Compiler팀 최재호입니다.

이번 글부터 함수형 프로그래밍에서 자주 접하는 **모나드**(monad)를 범주론의 관점에서 살펴보려 합니다.

프로그램을 작성하다 보면 한 함수의 결과를 다음 함수에 넘겨 여러 계산을 연결하게 됩니다. 수학에도 대상 사이의 연결과 그 연결을 이어 붙이는 법칙에 주목하는 분야가 있습니다. **범주론**(category theory)입니다. 함수 합성은 범주론에서 다루는 연결의 한 예이며, 모나드도 이 분야에서 정의되는 개념입니다.

모나드나 범주론을 미리 알고 있을 필요는 없습니다. 함수의 입력과 출력을 읽을 수 있다면, 필요한 용어와 수학 표기는 그때그때 설명하겠습니다.

1편에서는 세 함수를 연결해 직원의 팀장 연락처를 찾는 프로그램을 만들어 보겠습니다. 이를 통해 함수 합성의 결합법칙과 항등법칙을 확인하고, 그 구조를 일반화한 category의 정의를 알아보겠습니다.

## 팀장 연락처 조회를 두 가지 방식으로 나누기

조직도 화면에 직원의 팀장 연락처를 표시하려고 합니다. 직원 번호로 직원을 찾고, 그 직원의 팀장을 찾은 뒤, 팀장의 이메일 주소를 읽으면 됩니다. 각 단계를 함수로 적어 보겠습니다.

~~~text
findEmployee : Nat → Employee
managerOf    : Employee → Employee
emailOf      : Employee → String
~~~

`f : A → B`는 함수 `f`가 `A`를 받아 `B`를 반환한다는 뜻입니다. 함수에 값을 넣는 `f x`는 `f(x)`와 같은 표기입니다. `Nat`은 0부터 시작하는 정수 타입이고, 여기서는 직원 번호에 사용합니다. `Employee`는 직원 정보를 나타내는 타입입니다.

`findEmployee`가 반환한 직원을 `managerOf`에 넘기고, 그 결과인 팀장을 `emailOf`에 넘깁니다. 앞 함수의 반환 타입과 다음 함수의 입력 타입이 맞아떨어집니다.

~~~text
emailOf (managerOf (findEmployee employeeId))
~~~

이 조회의 일부를 다른 곳에서도 사용하려면 두 단계를 별도 함수로 묶을 수 있습니다. 직원 번호로 팀장을 찾는 함수를 `findManager`라고 하겠습니다.

~~~text
findManager : Nat → Employee
findManager employeeId = managerOf (findEmployee employeeId)
~~~

이제 팀장 연락처는 `emailOf (findManager employeeId)`로 구합니다. 반대로, 직원 정보에서 팀장 이메일을 얻는 두 단계를 먼저 묶을 수도 있습니다.

~~~text
managerEmailOf : Employee → String
managerEmailOf employee = emailOf (managerOf employee)
~~~

이번에는 `managerEmailOf (findEmployee employeeId)`로 같은 연락처를 구합니다. 어느 쪽으로 나누든 직원, 팀장, 이메일 순서로 값을 구한다는 점은 같습니다. 이처럼 묶는 위치를 바꿔도 같은 함수가 되는 이유를 확인해 보겠습니다.

## 결합법칙: 묶는 위치가 달라도 같은 계산

두 함수를 이어 새 함수 하나를 만드는 연산을 함수 합성(function composition)이라고 합니다. 합성을 나타내는 기호 `∘`를 사용하면, 방금 만든 함수를 다음과 같이 쓸 수 있습니다.

~~~text
findManager = managerOf ∘ findEmployee
managerEmailOf = emailOf ∘ managerOf
~~~

`managerOf ∘ findEmployee`는 먼저 `findEmployee`를 적용하고, 그 결과에 `managerOf`를 적용하는 함수입니다. 중첩 호출 `managerOf (findEmployee employeeId)`와 같은 순서로 읽으면 됩니다.

함수의 이름과 타입을 일반적으로 바꿔 적어도 만드는 방법은 같습니다. `f : A → B`, `g : B → C`일 때 합성은 다음과 같이 정의합니다.

~~~text
g ∘ f : A → C

(g ∘ f) x = g (f x)
~~~

중첩 호출 `g (f x)`처럼, `g ∘ f`도 오른쪽의 `f`부터 적용합니다. 합성 결과 역시 함수이므로 다른 함수와 다시 합성할 수 있습니다.

이제 이 세 함수를 두 가지 방식으로 묶어 보겠습니다.

~~~text
emailOf ∘ (managerOf ∘ findEmployee)
(emailOf ∘ managerOf) ∘ findEmployee
~~~

첫 번째 식의 `managerOf ∘ findEmployee`는 방금 만든 `findManager`입니다. 직원 번호로 팀장을 찾은 뒤 이메일을 읽습니다. 두 번째 식은 `managerEmailOf`를 먼저 만들고, 여기에 `findEmployee`로 찾은 직원을 넘깁니다. 전체 타입은 둘 다 `Nat → String`입니다. 괄호가 달라지는 것은 먼저 묶어 둘 함수들이지, 입력값이 거치는 단계의 순서가 아닙니다.

직원 번호 `employeeId`를 넣고 합성의 정의를 펼치면, 두 식에서 같은 중첩 호출이 나옵니다.

~~~text
(emailOf ∘ (managerOf ∘ findEmployee)) employeeId
= emailOf (managerOf (findEmployee employeeId))

((emailOf ∘ managerOf) ∘ findEmployee) employeeId
= emailOf (managerOf (findEmployee employeeId))
~~~

여기서 함수가 같다는 말은 모든 입력에 대해 같은 값을 반환한다는 뜻입니다. 위 계산에서는 특정 직원 번호나 조회 결과를 사용하지 않았습니다.

이 계산을 임의의 함수로 일반화해 보겠습니다. 서로 이어지는 세 함수와 입력의 타입은 다음과 같습니다.

~~~text
f : A → B
g : B → C
h : C → D
x : A
~~~

합성의 정의를 한 번씩 펼치면 됩니다.

~~~text
(h ∘ (g ∘ f)) x
= h ((g ∘ f) x)
= h (g (f x))

((h ∘ g) ∘ f) x
= (h ∘ g) (f x)
= h (g (f x))
~~~

입력 `x`가 무엇이든 양쪽이 같은 식이 됩니다. `f`, `g`, `h`의 내부에서 무엇을 계산하는지도 사용하지 않았습니다. 세 함수의 타입이 이어진다는 조건과 합성의 정의만 사용했습니다.

~~~text
h ∘ (g ∘ f) = (h ∘ g) ∘ f
~~~

이 등식이 결합법칙(associativity)입니다. 함수들을 어디서 나누어 묶을지 바꿔도, 전체 함수는 같습니다.

두 식 모두 함수를 적용하는 순서는 `f`, `g`, `h`로 같습니다. 달라지는 것은 어느 두 함수를 먼저 합성하느냐뿐입니다.

## 항등 함수: 합성해도 원래 함수를 바꾸지 않는 함수

함수를 이어 붙일 때, 앞뒤에 붙여도 원래 함수를 바꾸지 않는 함수도 생각할 수 있습니다. 덧셈에서 0을 더해도 원래 수가 그대로인 것처럼, 함수 합성에서도 그런 역할을 하는 함수를 찾아보겠습니다.

`findEmployee`는 직원 번호를 받아 직원 정보를 반환합니다. 그 앞에 직원 번호를 그대로 돌려주는 함수를 하나 넣어 보겠습니다.

~~~text
identityNat : Nat → Nat
identityNat employeeId = employeeId

findEmployee (identityNat employeeId)
= findEmployee employeeId
~~~

`identityNat`을 거쳐도 `findEmployee`가 받는 직원 번호는 달라지지 않습니다. 직원을 찾은 뒤에도 마찬가지입니다. 이번에는 직원 정보를 그대로 돌려주는 함수를 뒤에 연결해 보겠습니다.

~~~text
identityEmployee : Employee → Employee
identityEmployee employee = employee

identityEmployee (findEmployee employeeId)
= findEmployee employeeId
~~~

두 코드 모두 원래 `findEmployee employeeId`와 같은 직원 정보를 반환합니다. 앞에 넣은 함수는 직원 번호를, 뒤에 넣은 함수는 직원 정보를 그대로 통과시켰기 때문입니다.

이렇게 입력을 그대로 반환하는 함수를 항등 함수(identity function)라고 합니다. 자연수나 직원 정보에만 만들 수 있는 것은 아닙니다. 문자열을 그대로 돌려주는 함수도 같은 방식으로 정의할 수 있습니다.

타입을 `A`라고 적으면 항등 함수의 정의는 다음과 같습니다.

~~~text
id_A : A → A
id_A x = x
~~~

첨자 `A`는 어느 타입의 항등 함수인지 표시합니다. 앞에서 만든 `identityNat`은 `id_Nat`, `identityEmployee`는 `id_Employee`라고 쓸 수 있습니다.

`f : A → B` 앞에 `id_A`를 붙이거나 뒤에 `id_B`를 붙여 보겠습니다.

~~~text
(f ∘ id_A) x
= f (id_A x)
= f x

(id_B ∘ f) x
= id_B (f x)
= f x
~~~

따라서 두 항등법칙(identity laws)이 성립합니다.

~~~text
f ∘ id_A = f
id_B ∘ f = f
~~~

앞에 붙일 항등 함수와 뒤에 붙일 항등 함수의 타입이 다르다는 점에 주의해야 합니다. `findEmployee : Nat → Employee` 앞에는 `id_Nat`, 뒤에는 `id_Employee`가 들어갑니다.

~~~text
Nat --id_Nat-------> Nat      --findEmployee--> Employee
Nat --findEmployee-> Employee --id_Employee---> Employee
~~~

## Category의 정의: 대상과 화살표, 합성과 법칙

지금까지 직원과 팀장 연락처를 찾는 함수로 합성과 항등을 살펴봤습니다. 그런데 결합법칙과 항등법칙을 확인하는 계산에서는 직원 번호나 직원의 구체적인 정보를 사용하지 않았습니다. 함수의 입력과 출력 타입이 어떻게 이어지는지, 합성과 항등을 어떻게 정의했는지만으로 양쪽이 같은 함수임을 확인할 수 있었습니다.

수학에서는 이처럼 구체적인 대상에서 관심 있는 성질을 골라내어 다른 대상에도 적용합니다. 사람 세 명과 사과 세 개를 셀 때 무엇을 세었는지 내려놓고 자연수 `3`을 남기는 것도 그런 추상화입니다.

Category(범주)에서는 대상 사이의 연결, 그 연결을 합성하는 방법, 합성이 만족하는 법칙을 남깁니다. 앞의 예제에서 어떤 구조를 골라낼 수 있는지 보겠습니다.

~~~text
Nat --findEmployee--> Employee --managerOf--> Employee --emailOf--> String
~~~

이 그림에서 `Nat`, `Employee`, `String` 같은 타입을 **대상(object)**, 타입 사이의 함수를 **화살표(morphism)** 라고 부르겠습니다. 대상은 특정 직원의 정보가 아니라, 그 값이 속하는 타입 `Employee`입니다. `findEmployee`는 대상 `Nat`에서 대상 `Employee`로 가는 화살표입니다. 그림에 두 번 나타난 `Employee`는 같은 대상이며, `managerOf`는 그 대상에서 자신으로 가는 화살표입니다.

여기서 화살표는 단순히 두 대상이 관련 있다는 표시가 아닙니다. 구체적인 함수를 나타냅니다. `findEmployee`와 `managerOf`를 이으면 `managerOf ∘ findEmployee : Nat → Employee`라는 또 하나의 화살표를 얻습니다. 각 타입에는 값을 그대로 반환하는 항등 함수도 있습니다. 이 합성은 묶는 위치를 바꾸어도 같고, 항등 함수를 앞뒤에 붙여도 원래 함수와 같습니다.

Category의 정의는 여기서 타입과 함수라는 구체적인 재료까지 일반화합니다. 대상과 화살표가 무엇인지는 열어 두되, 각 화살표에는 출발점과 도착점이 있고, 합성과 항등이 주어지며, 같은 법칙을 만족하도록 요구하는 것입니다.

Category를 정의하려면 다음 구성 요소를 정해야 합니다.[^riehl-category]

| 구성 요소 | 정해야 하는 것 |
|---|---|
| 대상(object) | 어떤 대상들을 다루는가 |
| 화살표(morphism) | 어떤 화살표가 있으며, 각각 어디에서 어디로 가는가 |
| 항등 화살표 | 각 대상 `A`의 `id_A : A ⟶ A` |
| 합성 | `f : A ⟶ B`, `g : B ⟶ C`에 대해 지정한 `g ∘ f : A ⟶ C` |

`A ⟶ B`는 대상 `A`에서 대상 `B`로 가는 morphism이라는 표기입니다. 앞에서는 함수에 `→`를 썼고, 여기서는 일반적인 화살표를 나타내려고 `⟶`를 씁니다. 화살표마다 출발 대상과 도착 대상이 정해져 있습니다. 도착 대상이 다음 화살표의 출발 대상과 맞아야 합성할 수 있습니다.

이렇게 정한 합성과 항등 화살표는 다음 법칙을 만족해야 합니다.

~~~text
h ∘ (g ∘ f) = (h ∘ g) ∘ f

id_B ∘ f = f
f ∘ id_A = f
~~~

첫 등식은 모든 합성 가능한 세 화살표에 요구하는 결합법칙입니다. 뒤의 두 등식은 모든 `f : A ⟶ B`에 요구하는 항등법칙입니다.

어떤 화살표를 항등으로 삼을지, 두 화살표를 어떻게 합성할지를 정하는 것과, 그렇게 정한 합성이 결합법칙과 항등법칙을 만족하는지는 별개의 문제입니다. 연산에 합성이라는 이름을 붙였다고 해서 category가 되는 것은 아닙니다.

앞의 타입과 함수는 이 정의를 채우는 한 사례입니다. 대상은 타입으로 정하고,[^size-level] `A`에서 `B`로 가는 화살표는 순수한 전체 함수 `A → B`로 정합니다. 여기서 순수한 함수는 같은 입력에 같은 값을 반환하고 외부 상태를 바꾸지 않는 함수이며, 전체 함수는 모든 입력에 대해 반환 타입의 값을 주는 함수입니다. 합성은 `g (f x)`로, 항등은 입력을 그대로 반환하는 함수로 정하면, 앞에서 임의의 함수와 입력에 대해 확인한 계산이 바로 이 category의 법칙을 증명합니다.

반면 일반 category의 정의에는 대상이 타입이어야 한다거나 화살표가 함수여야 한다는 조건이 없습니다. 대상 안의 원소나 필드에 접근하는 연산도 요구하지 않습니다. 집합과 함수처럼 이미 추상적인 수학적 대상과 그 사이의 연결에서도, 합성과 항등이라는 구조를 다시 골라내어 다룰 수 있는 것입니다. 이런 의미에서 category는 여러 수학적 구조를 공통된 언어로 다루게 해 주는 추상화입니다. 함수가 아닌 화살표로 이루어진 예는 뒤의 글에서 살펴보겠습니다.

## 결합법칙만으로는 항등이 보장되지 않습니다

보통 함수 합성에서는 결합법칙과 항등법칙이 모두 성립했습니다. 그렇다면 결합법칙을 만족하도록 연산을 정하면, 항등 역할을 하는 화살표도 항상 찾을 수 있을까요? 새로운 합성 후보를 정하고, 이것으로 category를 만들 수 있는지 확인해 보겠습니다. 다음 예에서는 결합법칙이 성립해도 항등 역할을 하는 화살표가 존재하지 않습니다.

대상은 `Bool` 하나로, 화살표는 `Bool → Bool`인 모든 함수로 정하겠습니다. 모든 화살표의 출발점과 도착점이 같으므로, 어떤 두 화살표를 골라도 연결할 타입은 맞습니다.

이제 보통 함수 합성 대신, 두 함수 중 왼쪽 함수만 남기는 연산 `⋄`를 정합니다.

~~~text
g ⋄ f = g
~~~

이 연산은 두 함수를 실행하지 않고, 함수 `g` 자체를 결과로 돌려줍니다. 함수 `f`는 버립니다. 결과 역시 `Bool → Bool`이므로 화살표의 타입은 맞습니다.

세 함수를 묶으면 어떻게 될까요?

~~~text
h ⋄ (g ⋄ f) = h ⋄ g = h
(h ⋄ g) ⋄ f = h ⋄ f = h
~~~

어느 쪽부터 묶어도 맨 왼쪽 함수 `h`만 남습니다. 따라서 결합법칙은 만족합니다.

하지만 항등법칙은 문제가 됩니다. 항등 역할을 하는 화살표 `e`가 있다면, 어떤 함수 `f`의 왼쪽에 붙여도 `f`가 그대로 남아야 합니다.

~~~text
e ⋄ f = f
~~~

그런데 우리가 정한 연산은 언제나 왼쪽 함수를 남깁니다.

~~~text
e ⋄ f = e
~~~

두 조건이 동시에 성립하려면 `e = f`여야 합니다. 더구나 항등 화살표 하나가 **모든** 함수에 대해 작동해야 하므로, 같은 `e`가 모든 `Bool → Bool` 함수와 같아야 합니다.

입력을 그대로 반환하는 `id_Bool`과, 참과 거짓을 뒤집는 `not`만 비교해도 이것이 불가능하다는 것을 알 수 있습니다.

~~~text
id_Bool true = true
not true = false
~~~

두 함수가 서로 다르므로, 하나의 `e`가 둘 모두와 같을 수는 없습니다. 따라서 이 연산에는 항등 화살표가 없습니다.

결합법칙은 만족하지만 항등을 지정할 수 없으므로, 이 대상과 화살표에 `⋄`를 합성으로 주어서는 category를 만들 수 없습니다. 항등법칙은 결합법칙에서 저절로 따라오는 조건이 아닙니다.

## 앞선 예제로 돌아가기

앞에서 정의한 함수 합성은 결합법칙을 만족하고, 항등 함수와 합성해도 원래 함수를 바꾸지 않습니다. 이 법칙들 덕분에 팀장 연락처를 찾는 세 함수를 어디서 나누어 묶든 같은 결과를 얻을 수 있었습니다.

지금까지는 각 조회가 성공해 다음 단계에 필요한 값을 반환하는 것으로 설명했습니다. 하지만 번호에 해당하는 직원이 없을 수도 있고, 직원에게 팀장이 지정되지 않았을 수도 있습니다. 팀장을 찾아도 이메일 주소가 비어 있을 수 있습니다.

이런 부재까지 반환값으로 나타내려면 함수의 타입을 바꿔야 합니다. `Option A`는 `A` 타입의 값이 있을 수도, 없을 수도 있음을 나타냅니다. 값 `a`가 있으면 `some a`, 없으면 `none`입니다.

~~~text
findEmployee : Nat → Option Employee
managerOf    : Employee → Option Employee
emailOf      : Employee → Option String
~~~

이제 처음처럼 `managerOf (findEmployee employeeId)`라고 쓸 수 없습니다. `findEmployee`의 반환 타입은 `Option Employee`인데, `managerOf`의 입력 타입은 `Employee`이기 때문입니다.

~~~text
Nat --findEmployee--> Option Employee
                             ×
                          Employee --managerOf--> Option Employee
~~~

이 함수들도 수학적인 함수입니다. `none` 역시 반환 타입의 값입니다. 달라진 것은 앞 함수의 결과를 다음 함수에 그대로 넘길 수 없다는 점입니다. 값을 찾았다면 그 안의 직원을 다음 조회에 넘기고, 찾지 못했다면 조회를 멈추는 처리가 필요합니다.

그렇다면 다음 두 함수를 어떻게 연결해야 할까요?

~~~text
f : A → Option B
g : B → Option C

두 함수를 연결한 결과 : A → Option C
~~~

새로 정한 연결에서도 함수를 어디서 나누어 묶든 같은 결과가 나와야 합니다. 항등 역할을 하는 함수와 두 항등법칙도 다시 확인해야 합니다. 다음 글에서는 `some`과 `none`을 처리하는 합성을 직접 만들고, 이 법칙들이 성립하는지 살펴보겠습니다.

## Lean 실습: 합성의 타입과 법칙 확인하기

이 절은 앞의 계산을 Lean으로 직접 확인하고 싶은 분들을 위한 선택 실습입니다. 본문의 결론은 Lean 코드를 실행하지 않아도 식 전개로 확인할 수 있습니다.

함수와 증명을 함께 적을 수 있는 언어인 Lean 4를 사용합니다. 아래 코드는 조회 함수의 구현을 정하는 대신, 본문에 적은 타입의 함수들을 인자로 받아 두 묶음이 같은 함수인지 확인합니다. 직원 정보를 실제로 조회하는 구현은 다음 편에서 다룹니다. 이 코드는 Lean 4.32.1에서 확인하였고, [Lean playground에서 전체 코드를 열 수 있습니다](https://live.lean-lang.org/#codez=LTAEgquwMhsHZbB0O1Ayo4EVHAvPYFKbSBSewPxOAMO0AjIB3LAXKIBargGEOA%2BnaIC2jgKK2A4g6IGzddgI82iANNYD81gADWhAmDWABcdCAXccAE4wCgQoADIBTAIYA7UABYAdAGYATFoKAF0ZaBVNcAe44AjVwK1DgCabAJ01bQgEZ6OgDXHQASwC2ABwD2AE4ALqCAY6PioIAnQ4CRq4AGq6CUoIAR43aO0rJgAMb%2Bfv4AzoqgAOagAGYYgB89gBzdHqWAGETlgKHjDk6APF2AABPltICAE4CVY4A6q6CAJS0lvX2Alqut0gAmimWgOXmFoADeAIKgAEKgAMKgZAAqAJ6%2BigC%2BoAAUpWQ7gEmEewCU1wtkm49bL%2B%2Bgj%2FskAF5pKBygBXdQAD1AAIAfCVXqAIU8MnJPHNVMFPMFjhgmoBSDsAIuOgQAftYAAZvggAwewAaa1NHKB1hhADUDfQSgBlWiiUDyAAYWmkZQIA9zsADbOgQCoE4AXVcAi5PTOYLNGKDFY45rTZHU4XA7036awHAsGQ6FwiEosCABwnADFrHMAJy1E8yABPH4IBsHqQoEACi1sQAy45FRBzzIABydAFlpWmkwQAFoogopvKBvGplMVFIEAKKxzwAGwA%2BoFFMVAv5Qb5PKpSqsU740%2F5jooiqqzuddSCrmUizMyxWqzXQAA5ZShR5tyvVl5XWOqeOJgDyb1AA47WtnQ4b1yjynTU41C6KjwAysFAkXit8l0sAisV2uFlcTwUiqPx4F183VK2%2FO2h9ClyDrysr7lT0VzzTdc7wTB8yheJ8X3LQcawBUBAjKNNjR4CZAFSewBNObIQAQWsADjXaEAOjHAAqargygAGhKcjQw8fpQEAHCGmAwIQ0mDORAETRwBeqdFNxaEAHuXAA05wAXLr1REDVAUNrlKJtESeJ5BEADBbAAHu%2BAELTeALASJJUmmMMI2zaNv0UDNlHyfJ%2FCyZVtj2UAABENROOslyucSyH2R5rOHW5LL%2BYdpw%2BbYjxBL8%2FxvMTrgM%2BFwOhRZgp%2FcLxMPcoDjglTkLRDMdkaBY4LKMgykEakhi2WgyXgQAZ5sAEg7AFhJ7Tw0jaM5QVbEMxPCydlrdUpJ%2BT4AsC8KGsxbFEuypL4MQ5CFkaNLNmy3K%2BUADEbAA46%2BlivJUAKuq9IdLq6K%2FAzfrFVauy1UuTrNW6g5jxiopZXRAalWGwFRqQzInrEQAb0cABjqWBFNwhioUAJkARkHeFAQBbVcAR5a%2BVJIZAFzJwBQrpadI5CBol7EAF07ABia0UhiyXscyCY4TC4b14ciQBWxYGewMEAbnaxCQQBNpumIA).

코드에서 `compose g f`는 본문의 `g ∘ f`이고, `identity`는 항등 함수입니다. `def`는 정의를 시작하는 키워드이고, `fun x => ...`는 입력 `x`를 받는 함수를 만듭니다. `theorem`은 증명할 명제를 선언합니다.

~~~lean
-- 모나드로 알아보는 범주론 1편: 함수를 어디서 묶어도 결과가 같은 이유
-- Lean 4.32.1에서 확인했습니다. 별도의 import 없이 실행할 수 있습니다.

-- compose g f는 본문의 g ∘ f입니다. 먼저 f를 적용한 뒤 g를 적용합니다.
def compose {A B C : Type} (g : B → C) (f : A → B) : A → C :=
  fun x => g (f x)

-- identity는 입력을 그대로 반환합니다. A는 사용할 때 함수의 타입에 맞춰 정해집니다.
def identity {A : Type} : A → A :=
  fun x => x

-- 조회 함수들을 인자로 받아 두 묶음이 같은 함수인지 확인합니다.
theorem managerEmail_regrouping {Employee : Type}
    (findEmployee : Nat → Employee) (managerOf : Employee → Employee)
    (emailOf : Employee → String) :
    compose emailOf (compose managerOf findEmployee) =
      compose (compose emailOf managerOf) findEmployee := rfl

-- 결합법칙: 괄호를 옮겨도 f, g, h의 적용 순서는 같습니다.
-- 양쪽 정의를 펼치면 fun x => h (g (f x))가 되므로 rfl로 확인할 수 있습니다.
theorem compose_assoc {A B C D : Type}
    (h : C → D) (g : B → C) (f : A → B) :
    compose h (compose g f) = compose (compose h g) f := rfl

-- id_B ∘ f = f: f가 반환한 B를 그대로 돌려줍니다.
theorem identity_comp {A B : Type} (f : A → B) :
    compose identity f = f := rfl

-- f ∘ id_A = f: f에 넘길 A를 그대로 돌려줍니다.
theorem comp_identity {A B : Type} (f : A → B) :
    compose f identity = f := rfl

-- rfl은 여기서 정의한 함수 합성과 항등에 대한 증명입니다.
-- 합성을 다르게 정한 category에서도 같은 증명이 통한다는 뜻은 아닙니다.
~~~

`managerEmail_regrouping`은 직원 조회 예제의 두 묶음이 같다는 명제입니다. `Employee`의 구체적인 필드나 세 조회 함수의 구현에 의존하지 않습니다. 본문에서 합성의 정의를 펼쳤을 때처럼, 양쪽이 같은 중첩 호출이 되는지만 확인합니다.

`compose_assoc`는 임의의 타입 `A`, `B`, `C`, `D`와 함수 `f`, `g`, `h`에 대한 결합법칙입니다. `{A B C D : Type}`은 타입 매개변수를 선언하며, 중괄호는 사용할 때 Lean이 이 타입들을 추론하도록 한다는 뜻입니다. 정리에 적힌 등식은 본문의 식과 다음처럼 대응합니다.

~~~text
compose h (compose g f) = compose (compose h g) f

h ∘ (g ∘ f) = (h ∘ g) ∘ f
~~~

`identity_comp`와 `comp_identity`는 각각 `id_B ∘ f = f`와 `f ∘ id_A = f`에 대응합니다. 코드에서는 두 타입의 항등을 모두 `identity`라고 쓰지만, Lean은 합성할 함수의 타입에 맞춰 어느 타입의 항등인지 추론합니다.

증명 끝의 `rfl`은 이 정의들을 계산하면 양쪽이 같은 함수가 된다는 것을 Lean이 확인하게 합니다. 항등법칙에서는 입력에 `f`를 적용하는 함수 `fun x => f x`와 `f` 자체도 같은 것으로 처리합니다. 다른 방식으로 합성과 항등을 정의했다면 별도의 증명이 필요합니다. 일반적인 category의 법칙이 모두 `rfl`로 증명된다는 뜻은 아닙니다.

## 참고문헌

- Bartosz Milewski, *Category Theory for Programmers*, Ch. 1, §§1.1–1.2, pp. 3–6. 함수 합성의 표기와 결합법칙·항등법칙.
- Emily Riehl, *Category Theory in Context*, Definition 1.1.1, p. 3; Example 1.1.3(i), p. 4. Category의 정의와 집합·함수로 이루어진 category의 사례.

[^riehl-category]: Riehl, Definition 1.1.1, p. 3. 원전은 항등과 결합의 두 공리로 적습니다. 여기서는 항등법칙의 좌우 등식을 각각 표시했습니다.
[^size-level]: 모든 타입을 무제한으로 한 집합에 넣는다는 뜻은 아닙니다. 여기서는 하나의 고정된 크기 수준에서 타입을 다루며, 이 전제는 앞의 함수 계산을 바꾸지 않습니다.
