---
date: '2026-09-07T00:00:00+09:00'
draft: false
title: '모나드로 알아보는 범주론 1편: 함수를 어디서 묶어도 결과가 같은 이유'
cover:
  image: "/images/logo.png"
  alt: "HyperAccel 로고"
  relative: false
  hidden: true
  hiddenInSingle: true
  hiddenInList: true
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

안녕하세요. HyperAccel의 최재호입니다.

프로그램을 작성하다 보면 여러 계산을 연결하게 됩니다. 입력을 읽고, 필요한 작업을 진행하고, 그 결과를 다음 함수에 넘깁니다. 각 함수가 무슨 일을 하는지도 중요하지만, 함수들을 어떻게 연결해야 전체 프로그램이 원하는 대로 동작하는지도 생각해야 합니다. 한 함수의 결과를 다음 함수에 그대로 넘길 수 있다면 연결은 간단합니다. 하지만 앞 함수가 반환하는 타입과 다음 함수가 받는 타입이 다르다면, 두 함수를 어떻게 연결할지부터 생각해야 합니다.

수학에도 개별 대상의 성질뿐 아니라, 대상 사이의 관계와 그 관계를 이어 붙이는 방식에 주목하는 분야가 있습니다. **범주론(category theory)** 입니다. 예를 들어 집합 사이의 함수들은 한 함수의 출력을 다음 함수의 입력으로 넘겨 연결할 수 있습니다. 범주론에서는 이런 연결과 그 법칙을 추려 내어, 서로 다른 수학적 구조를 공통된 언어로 다룹니다.

함수형 프로그래밍에서 만나는 **모나드(monad)** 도 범주론에서 정의되는 개념입니다. 그렇다면 코드에서 계산을 연결하는 방법과 수학적 정의는 어떻게 이어질까요? 이 연결을 작은 예제부터 이해해 보고 싶어 시리즈를 시작했습니다. 어떤 연산이 있고 그 연산이 어떤 법칙을 만족하기에 모나드라고 부르는지, 코드와 수식을 나란히 놓고 설명하려고 합니다.

모나드나 범주론을 미리 알고 있을 필요는 없습니다. 함수의 입력과 출력, 조건 분기를 읽을 수 있다면 필요한 용어와 수학 표기는 그때그때 설명하겠습니다. 코드로 직접 확인하고 싶은 분들을 위해 Lean 4로 실행할 수 있는 예제와 작은 증명도 함께 제공합니다.

첫 글에서는 코드를 여러 함수로 나누는 작업부터 시작합니다. 같은 계산을 하는 코드라면, 함수를 어디서 나누어 묶든 결과는 같아야 합니다. 이 요구를 함수 합성의 법칙으로 표현해 보고, 그 과정에서 범주론의 기본 단위인 category가 무엇인지 알아보겠습니다.

## 팀장 연락처 조회를 두 가지 방식으로 나누기

조직도 화면에 직원의 팀장 연락처를 표시하려고 합니다. 직원 번호로 직원을 찾고, 그 직원의 팀장을 찾은 뒤, 팀장의 이메일 주소를 읽으면 됩니다.

~~~text
findEmployee : Nat → Option Employee
managerOf    : Employee → Option Employee
emailOf      : Employee → Option String
~~~

`f : A → B`는 함수 `f`가 `A`를 받아 `B`를 반환한다는 뜻입니다. 함수에 값을 넣는 `f x`는 `f(x)`와 같은 표기입니다. `Nat`은 0부터 시작하는 정수 타입이고, 여기서는 직원 번호에 사용합니다. `Employee`는 이름과 팀장 번호, 연락처를 담은 레코드입니다.

세 함수가 `Option`을 반환하는 이유는 서로 다릅니다. 번호에 해당하는 직원이 없을 수 있고, 직원에게 팀장이 지정되지 않았을 수 있으며, 팀장을 찾아도 연락처가 비어 있을 수 있습니다. `Option A`는 `A` 타입의 값이 있을 수도, 없을 수도 있음을 나타내는 타입입니다. 값 `a`가 있으면 `some a`, 없으면 `none`으로 나타냅니다.

다음 호출은 타입이 맞지 않습니다.

~~~text
managerOf (findEmployee 1)
~~~

`findEmployee 1`의 타입은 `Option Employee`인데 `managerOf`는 `Employee`를 받습니다. 찾았는지 확인하기 전에, 찾은 직원인 것처럼 넘긴 셈입니다.

~~~text
Nat --findEmployee--> Option Employee
                             ×
                          Employee --managerOf--> Option Employee
~~~

값이 있는지 없는지에 따라 분기하면 해결할 수 있습니다. 아래는 값이 있는 경우에만 다음 함수를 호출하는 의사코드입니다.

~~~text
match findEmployee employeeId:
  none          => none
  some employee =>
    match managerOf employee:
      none         => none
      some manager => emailOf manager
~~~

이제 이 코드의 동작은 그대로 두고, 일부를 별도 함수로 빼 보겠습니다. 같은 직원 번호를 넣었을 때 찾는 연락처는 같아야 하고, 찾지 못했던 경우에는 여전히 `none`이 나와야 합니다. 동작을 보존하면서 코드의 구조를 바꾸는 리팩터링입니다.

세 조회 중 어느 두 단계를 한 함수로 묶느냐에 따라 두 가지로 나눌 수 있습니다. `findEmployee`와 `managerOf`를 묶으면, 직원 번호로 팀장을 찾는 `findManager`가 됩니다. `managerOf`와 `emailOf`를 묶으면, 직원 정보로 팀장의 이메일을 찾는 `managerEmailOf`가 됩니다.

~~~text
findManager    : Nat → Option Employee
managerEmailOf : Employee → Option String
~~~

`findManager`로 팀장을 찾고 `emailOf`로 이메일을 읽으면 전체 조회는 다음과 같습니다.

~~~text
match findManager employeeId:
  none         => none
  some manager => emailOf manager
~~~

반대로 `findEmployee`로 직원을 찾은 뒤, 그 직원 정보를 `managerEmailOf`에 넘길 수도 있습니다.

~~~text
match findEmployee employeeId:
  none          => none
  some employee => managerEmailOf employee
~~~

첫 번째 코드에서는 직원과 팀장을 찾는 과정이 `findManager` 안으로 들어갑니다. 바깥에는 찾은 팀장의 이메일을 읽는 일만 남습니다. 두 번째 코드에서는 직원을 찾는 일이 바깥에 남고, 팀장과 이메일을 찾는 과정이 `managerEmailOf` 안으로 들어갑니다. 두 코드 모두 직원 번호에서 시작해 이메일 또는 `none`을 반환하므로, 전체 타입은 `Nat → Option String`입니다.

함수의 경계는 달라졌지만, 직원부터 찾고 그 직원의 팀장을 찾은 뒤 이메일을 읽는 순서는 같습니다. 직원이 없다면 첫 번째 코드에서는 `findManager` 안에서, 두 번째 코드에서는 바깥의 `findEmployee` 호출에서 부재를 확인합니다. 확인하는 위치는 달라도 어느 쪽도 팀장 조회로 넘어가지 않고 `none`으로 끝나야 합니다. 연락처까지 찾았다면 같은 이메일을 반환해야 합니다.

이처럼 한 함수의 결과를 다음 함수에 넘겨 하나의 함수로 만드는 일을 합성으로 표현할 수 있습니다. 다만 지금의 조회에는 값이 있는지 확인하는 분기가 끼어 있습니다. 먼저 그 분기가 필요 없는 간단한 함수들을 연결해 보면서, 합성이 무엇이고 묶는 위치를 바꾼다는 것이 어떤 뜻인지 살펴보겠습니다.

## 함수 합성: 묶는 위치가 달라도 같은 계산

이번에는 부서의 사무실이 어느 도시에 있는지 표시하려고 합니다. 이미 받은 부서 정보에는 사무실 정보가, 사무실 정보에는 주소가, 주소에는 도시명이 들어 있습니다. 각 필드를 읽는 함수를 하나씩 두겠습니다.

~~~text
officeOf  : Department → Office
addressOf : Office → Address
cityOf    : Address → String
~~~

`officeOf`는 부서 정보의 사무실 필드를 읽어 `Office`를 반환합니다. `addressOf`는 바로 그 `Office`를 받고, `cityOf`도 `addressOf`가 반환한 `Address`를 받습니다. 각 단계에서 값이 있는지 확인할 필요 없이 반환값을 그대로 넘길 수 있습니다.

앞의 팀장 조회에서는 `Option Employee`를 반환했지만 다음 함수가 받는 것은 `Employee`였습니다. 여기서는 앞 함수의 반환 타입과 뒤 함수의 입력 타입이 맞아떨어집니다. `Option`을 반환하는 조회도 수학적으로는 함수입니다. `none` 역시 그 반환 타입의 값입니다. 두 예제의 차이는 함수인지 아닌지가 아니라, 결과를 다음 함수에 그대로 넘길 수 있는지에 있습니다.

예를 들어 개발 부서의 정보가 다음과 같다면 도시명은 `"서울"`입니다. 데이터와 호출을 의사코드로 적으면 다음과 같습니다.

~~~text
development = { office: { address: { city: "서울" } } }

cityOf (addressOf (officeOf development)) = "서울"
~~~

이 중 사무실 주소를 얻는 두 단계를 먼저 묶어 보겠습니다. `officeOf`로 사무실을 읽은 뒤 `addressOf`로 주소를 읽는 함수를 `officeAddressOf`라고 하겠습니다.

~~~text
officeAddressOf : Department → Address
officeAddressOf department = addressOf (officeOf department)
~~~

`officeAddressOf`를 사용하는 쪽에서는 부서 정보만 넘기면 됩니다. 함수 안에서 사무실을 거쳐 주소를 읽는 두 단계가 수행됩니다. 도시명까지 필요하다면 그 결과를 `cityOf`에 넘깁니다.

~~~text
cityOf (officeAddressOf development) = "서울"
~~~

이렇게 두 함수를 이어 새 함수 하나를 만드는 연산을 함수 합성(function composition)이라고 합니다. 합성을 나타내는 기호 `∘`를 사용하면, 방금 만든 함수를 다음과 같이 쓸 수 있습니다.

~~~text
officeAddressOf = addressOf ∘ officeOf
~~~

`addressOf ∘ officeOf`는 먼저 `officeOf`를 적용하고, 그 결과에 `addressOf`를 적용하는 함수입니다. 중첩 호출 `addressOf (officeOf department)`와 같은 순서로 읽으면 됩니다.

함수의 이름과 타입을 일반적으로 바꿔 적어도 만드는 방법은 같습니다. `f : A → B`, `g : B → C`일 때 합성은 다음과 같이 정의합니다.

~~~text
g ∘ f : A → C

(g ∘ f) x = g (f x)
~~~

`g ∘ f`는 먼저 `f`, 다음에 `g`를 적용합니다. 오른쪽 함수부터 실행되는 이유는 중첩 호출 `g (f x)`를 보면 알 수 있습니다. 합성 결과도 함수이므로 다른 함수와 다시 합성할 수 있습니다.

이제 이 세 함수를 두 가지 방식으로 묶어 보겠습니다.

~~~text
cityOf ∘ (addressOf ∘ officeOf)
(cityOf ∘ addressOf) ∘ officeOf
~~~

첫 번째 식의 `addressOf ∘ officeOf`는 방금 만든 `officeAddressOf`입니다. 부서에서 사무실 주소를 얻은 뒤 `cityOf`로 도시명을 읽습니다. 두 번째 식은 사무실에서 도시명을 얻는 `cityOf ∘ addressOf`를 먼저 만듭니다. 여기에 `officeOf`로 읽은 사무실을 넘깁니다. 전체 타입은 둘 다 `Department → String`입니다. 어느 쪽이든 부서 정보에서 사무실, 주소, 도시명 순서로 읽습니다. 괄호가 달라지는 것은 먼저 묶어 둘 함수들이지, 입력값이 거치는 단계의 순서가 아닙니다.

`development`를 넣고 합성의 정의를 펼치면, 두 식에서 같은 중첩 호출이 나옵니다.

~~~text
(cityOf ∘ (addressOf ∘ officeOf)) development
= cityOf (addressOf (officeOf development))
= "서울"

((cityOf ∘ addressOf) ∘ officeOf) development
= cityOf (addressOf (officeOf development))
= "서울"
~~~

하지만 입력 하나에서 결과가 같은 것만으로 두 함수가 같다고 할 수는 없습니다. 여기서 함수가 같다는 말은 모든 입력에 대해 같은 값을 반환한다는 뜻입니다.

이 계산이 특정 부서 정보에만 우연히 맞는 것은 아닌지 확인해 보겠습니다. 서로 이어지는 세 함수와 입력의 타입은 다음과 같습니다.

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

이 등식이 결합법칙(associativity)입니다.[^milewski-composition] 함수들을 어디서 나누어 묶을지 바꿔도, 전체 함수는 같습니다.

괄호를 바꾸는 것과 함수의 순서를 바꾸는 것은 다릅니다. 예를 들어 3에 1을 더한 뒤 두 배 하면 8이고, 두 배 한 뒤 1을 더하면 7입니다. 결합법칙의 양쪽에서는 항상 `f`, `g`, `h` 순서로 적용합니다.

## 항등 함수: 합성해도 원래 함수를 바꾸지 않는 함수

함수를 이어 붙일 때, 앞뒤에 붙여도 원래 함수를 바꾸지 않는 함수도 생각할 수 있습니다. 덧셈에서 0을 더해도 원래 수가 그대로인 것처럼, 함수 합성에서도 그런 역할을 하는 함수를 찾아보겠습니다.

`officeOf`는 부서 정보를 받아 사무실을 반환합니다. 그 앞에 부서 정보를 그대로 돌려주는 함수를 하나 넣어 보겠습니다.

~~~text
identityDepartment : Department → Department
identityDepartment department = department

officeOf (identityDepartment development)
= officeOf development
~~~

`identityDepartment`를 거쳐도 `officeOf`가 받는 부서 정보는 달라지지 않습니다. 사무실을 읽은 뒤에도 마찬가지입니다. 이번에는 사무실을 그대로 돌려주는 함수를 뒤에 연결해 보겠습니다.

~~~text
identityOffice : Office → Office
identityOffice office = office

identityOffice (officeOf development)
= officeOf development
~~~

두 코드 모두 원래 `officeOf development`와 같은 사무실을 반환합니다. 앞에 넣은 함수는 부서 정보를, 뒤에 넣은 함수는 사무실 정보를 그대로 통과시켰기 때문입니다.

이렇게 입력을 그대로 반환하는 함수를 항등 함수(identity function)라고 합니다. 부서나 사무실에만 만들 수 있는 것은 아닙니다. 문자열을 그대로 돌려주는 함수, 자연수를 그대로 돌려주는 함수도 같은 방식으로 정의할 수 있습니다.

타입을 `A`라고 적으면 항등 함수의 정의는 다음과 같습니다.

~~~text
id_A : A → A
id_A x = x
~~~

첨자 `A`는 어느 타입의 항등 함수인지 표시합니다. 앞에서 만든 `identityDepartment`는 `id_Department`, `identityOffice`는 `id_Office`라고 쓸 수 있습니다.

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

앞에 붙일 항등 함수와 뒤에 붙일 항등 함수의 타입이 다르다는 점에 주의해야 합니다. `officeOf : Department → Office` 앞에는 `id_Department`, 뒤에는 `id_Office`가 들어갑니다.

~~~text
Department --id_Department--> Department --officeOf--> Office
Department --officeOf-------> Office     --id_Office-> Office
~~~

## Category의 정의: 대상과 화살표, 합성과 법칙

지금까지 부서 정보를 읽는 함수로 합성과 항등을 살펴봤습니다. 그런데 결합법칙과 항등법칙을 확인하는 계산에서는 부서나 사무실의 구체적인 정보를 사용하지 않았습니다. 함수의 입력과 출력 타입이 어떻게 이어지는지, 합성과 항등을 어떻게 정의했는지만으로 양쪽이 같은 함수임을 확인할 수 있었습니다.

그렇다면 부서 조회라는 구체적인 예제에서 벗어나, 이 구조를 다른 대상에도 적용할 수 있을까요? 여기서 수학의 익숙한 방법인 추상화를 생각해 볼 수 있습니다.

사람 세 명과 사과 세 개는 서로 다르지만, 개수를 셀 때는 둘 다 자연수 `3`으로 나타냅니다. 무엇을 세었는지는 내려놓고, 몇 개인지만 남긴 것입니다. 수학에서는 이처럼 관심 있는 성질을 남겨 서로 다른 것들을 같은 방식으로 다룹니다. 이를 추상화라고 합니다.

집합도 익숙한 예입니다. 자연수의 집합과 서울에 있는 고등학생들의 집합은 원소의 성격이 전혀 다릅니다. 그래도 둘 다 어떤 것이 그 집합에 속하는지, 한 집합이 다른 집합에 포함되는지를 이야기할 수 있습니다. 두 집합을 같은 집합으로 취급하는 것은 아닙니다. 서로 다른 원소들을 다루면서도 소속과 포함이라는 공통된 언어를 쓰는 것입니다.

Category(범주)도 추상화의 한 방식입니다. 다만 이번에는 대상을 따로 보는 데서 그치지 않고, 대상 사이에 어떤 연결이 있으며 그 연결을 어떻게 이어 붙일 수 있는지에 주목합니다. 앞에서 다룬 부서 예제를 다시 보겠습니다.

~~~text
Department --officeOf--> Office --addressOf--> Address --cityOf--> String
~~~

이 그림에서 `Department`, `Office`, `Address`, `String` 같은 타입을 **대상(object)**, 타입 사이의 함수를 **화살표(morphism)** 라고 부르겠습니다. 대상은 특정 부서의 정보인 `development`가 아니라, 그 값이 속하는 타입 `Department`입니다. `officeOf`는 대상 `Department`에서 대상 `Office`로 가는 화살표입니다.

여기서 화살표는 단순히 두 대상이 관련 있다는 표시가 아닙니다. 구체적인 함수를 나타냅니다. `officeOf`와 `addressOf`를 이으면 `addressOf ∘ officeOf : Department → Address`라는 또 하나의 화살표를 얻습니다. 각 타입에는 값을 그대로 반환하는 항등 함수도 있습니다. 이 합성은 묶는 위치를 바꾸어도 같고, 항등 함수를 앞뒤에 붙여도 원래 함수와 같습니다.

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

보통 함수 합성에서는 결합법칙과 항등법칙이 모두 성립했습니다. 그렇다면 결합법칙을 만족하도록 연산을 정하면, 항등 역할을 하는 화살표도 항상 찾을 수 있을까요? 다음 예에서는 결합법칙이 성립해도 그런 화살표가 존재하지 않습니다.

대상은 `Bool` 하나로, 화살표는 `Bool → Bool`인 모든 함수로 정하겠습니다. 모든 화살표의 출발점과 도착점이 같으므로, 어떤 두 화살표를 골라도 연결할 타입은 맞습니다.

이제 보통 함수 합성 대신, 두 함수 중 왼쪽 함수만 남기는 연산 `⋄`를 정합니다.

~~~text
g ⋄ f = g
~~~

이 연산은 `f`를 실행한 뒤 `g`를 실행하지 않습니다. `f`는 버리고 함수 `g` 자체를 결과로 돌려줍니다. 결과 역시 `Bool → Bool`이므로 화살표의 타입은 맞습니다.

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

## Lean 실습: 두 계산을 실행하고 합성 법칙 확인하기

앞에서 부서의 도시명을 구하는 함수를 두 가지 방식으로 묶었습니다. 아래 코드에서는 두 계산을 직접 실행하고, 묶는 위치를 바꾸어도 같은 함수가 된다는 법칙을 확인합니다. 함수와 증명을 함께 적을 수 있는 언어인 Lean 4를 사용합니다. 이 코드는 Lean 4.32.1에서 확인하였고, [Lean playground에서 전체 코드를 열 수 있습니다](https://live.lean-lang.org/#codez=LTAEktVxGQcBdHBxB1AVXYDIbA7LYGTrADk6AjIDuWBcogFquAYQ4D6dogbN2Ato4CPNogDTWA%2FNYAA1ogmDWAC46IC7jgBOMAoEKAAyAUwCGAO1AAWAHQBmAEzzsoAPSgAlgFsADgHsATgBdQgMdHAMuPzQgEVHAGe2hAKvMpAKU2hAC2OADmsAa46MkZQBQ%2BwF0Opg5AVqHACabAE6b5AQEAEzEAM1AAY0MDQwBnMVAAbwBBUAAhUABhUEIAFQBPfTEAX1AACgBzarLQQCTCSoBKNrTCEr7SwZHeyuqAXgFQUBSAVxkAD1AZgD5QTta01f6E5LTtZKlTbVM6wpLahuau0dBbuYXltY3t1YSc02Ml9KmJbGfJFRKJEE5HKgADuAAsxCD5hlLtdCABlP7aKTtH5%2FAFAkGgADyKRS2nS%2BXhiLEyIk4Mh0JGDLEULx%2F0BwPyABExPoJGZdGJzrCEUiFoYyRT8oRSeTKUdUqBJfKxKS2sl%2BYLheZCLytaYhecJiSpZTZqBNQLDTr5CrpUklfSIaycurWvbzbKzWITWCXVCLZ6xPJnYzHWl0qj3WHXY8WVCTZjjNjOvgZqBY1D5FGroq0skAG5iAA2hn0Rt1oH11srs2RBWVPotjazTIzjdzaIzACJYIAOsZ7oBaI4SAGIxIWJCWMlkjHkUVd3Zlsgu2%2Brg6TBkXS%2BXKwIJ1OZyv5%2FlWifcvku%2Br1ylBpuC5PdxWdQlTAiTGJdLPV2IAPoSFChjpDc3RVNyXT1I0TTIgsrRwl0VR9NygwdF05R9BUqHDM8UzjNUsE%2FqeoAIeec6XjsiyDBmF4LmRv4kTsgzDBmxgpCWb4fiC36nDqqJ%2FieoHlHc0FDI8eETIRtH5Lx5yoosGwKemoBsRxAjvmIn7fief6yRcVxCZB9wtHs4ljJJCwLNJCl6fJGYsSp7ECEAA).

먼저 코드의 두 `#eval` 줄을 보겠습니다. `#eval`은 식을 실행해 결과를 표시합니다. 첫 줄은 `officeOf`와 `addressOf`를 먼저 묶고, 둘째 줄은 `addressOf`와 `cityOf`를 먼저 묶습니다. 두 줄 모두 `development`를 입력으로 받아 `"서울"`을 출력합니다.

코드에서 `compose g f`는 본문의 `g ∘ f`이고, `identity`는 항등 함수입니다. 앞부분은 부서 정보와 함수를 정의하고, 뒷부분의 `theorem` 세 개는 결합법칙과 두 항등법칙을 적습니다.

~~~lean
def compose {A B C : Type} (g : B → C) (f : A → B) : A → C :=
  fun x => g (f x)

def identity {A : Type} : A → A :=
  fun x => x

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

#eval compose cityOf (compose addressOf officeOf) development
#eval compose (compose cityOf addressOf) officeOf development

theorem compose_assoc {A B C D : Type}
    (h : C → D) (g : B → C) (f : A → B) :
    compose h (compose g f) = compose (compose h g) f := rfl

theorem identity_comp {A B : Type} (f : A → B) :
    compose identity f = f := rfl

theorem comp_identity {A B : Type} (f : A → B) :
    compose f identity = f := rfl
~~~

부서 정보를 정의하는 부분은 앞의 의사코드와 대응합니다. `structure`는 레코드 타입을 선언하고, `department.office`는 `office` 필드를 읽습니다. `{ office := ... }`는 그 필드를 채운 레코드를 만드는 식입니다. `def`는 정의를 시작하는 키워드이고, `fun x => ...`는 입력 `x`를 받는 함수를 만듭니다.

두 실행에서 같은 도시명이 나왔다는 것만으로 모든 입력에서 결과가 같다고 결론낼 수는 없습니다. 앞서 임의의 입력으로 식을 펼쳤듯이, 코드에서도 특정 부서 정보에 의존하지 않는 등식을 확인해야 합니다.

`compose_assoc`는 임의의 타입 `A`, `B`, `C`, `D`와 함수 `f`, `g`, `h`에 대한 결합법칙입니다. `{A B C D : Type}`은 타입 매개변수를 선언하며, 중괄호는 사용할 때 Lean이 이 타입들을 추론하도록 한다는 뜻입니다. 정리에 적힌 등식은 본문의 식과 다음처럼 대응합니다.

~~~text
compose h (compose g f) = compose (compose h g) f

h ∘ (g ∘ f) = (h ∘ g) ∘ f
~~~

`identity_comp`와 `comp_identity`는 각각 `id_B ∘ f = f`와 `f ∘ id_A = f`에 대응합니다. 코드에서는 두 타입의 항등을 모두 `identity`라고 쓰지만, Lean은 합성할 함수의 타입에 맞춰 어느 타입의 항등인지 추론합니다.

증명 끝의 `rfl`은 이 정의들을 계산하면 양쪽이 같은 함수가 된다는 것을 Lean이 확인하게 합니다. 항등법칙에서는 입력에 `f`를 적용하는 함수 `fun x => f x`와 `f` 자체도 같은 것으로 처리합니다. 다른 방식으로 합성과 항등을 정의했다면 별도의 증명이 필요합니다. 일반적인 category의 법칙이 모두 `rfl`로 증명된다는 뜻은 아닙니다.

## 팀장 연락처 조회로 돌아가기

처음에는 직원 번호로 팀장 연락처를 찾는 코드를 두 가지 방식으로 나누고 싶었습니다. 이제 그 과정에서 무엇을 확인해야 하는지 더 구체적으로 말할 수 있습니다.

세 조회 함수의 타입은 다음과 같았습니다.

~~~text
findEmployee : Nat → Option Employee
managerOf    : Employee → Option Employee
emailOf      : Employee → Option String
~~~

이 함수들도 입력에 반환값을 대응시키는 함수입니다. 다만 `findEmployee`의 반환 타입은 `Option Employee`이고, `managerOf`의 입력 타입은 `Employee`입니다. 앞에서 정의한 보통 함수 합성으로는 두 함수를 그대로 이을 수 없습니다.

처음의 `match` 코드에서는 이 차이를 직접 처리했습니다. `some employee`를 얻으면 그 안의 `employee`를 다음 조회에 넘겼고, `none`이면 다음 조회를 하지 않고 `none`을 반환했습니다.

이 처리 방식을 공통된 연산으로 만들면, 다음 두 함수로부터 하나의 함수를 얻을 수 있습니다.

~~~text
f : A → Option B
g : B → Option C

두 함수를 연결한 결과 : A → Option C
~~~

연결한 결과도 같은 모양이므로, 여기에 `C → Option D`인 함수를 다시 연결할 수 있습니다. 세 조회를 하나씩 이어 붙이는 데 필요한 연산입니다.

하지만 함수를 연결할 수 있다는 것만으로 처음의 리팩터링이 정당해지는 것은 아닙니다. `findEmployee`와 `managerOf`를 먼저 묶은 `findManager`를 사용하든, `managerOf`와 `emailOf`를 먼저 묶은 `managerEmailOf`를 사용하든 같은 결과가 나와야 합니다. 새 연산에서도 결합법칙을 확인해야 하는 이유입니다.

여기에 항등 역할을 하는 함수까지 정하고 항등법칙을 확인하면, 이 조회들을 연결하는 규칙도 하나의 category로 다룰 수 있습니다. 이번에는 화살표의 모양이 `A → Option B`이므로, 항등 역할을 하는 함수의 타입도 `A → Option A`여야 합니다.

다음 글에서는 `some`과 `none`을 처리하는 합성을 직접 정의하고, 조회가 중간에 끊기는 경우에도 두 분할 방식이 같은 결과를 내는지 확인하겠습니다.

## 참고문헌

- Bartosz Milewski, *Category Theory for Programmers*, Ch. 1, §§1.1–1.2, pp. 3–6. 함수 합성의 표기와 결합법칙·항등법칙.
- Emily Riehl, *Category Theory in Context*, Definition 1.1.1, p. 3; Example 1.1.3(i), p. 4. Category의 정의와 집합·함수로 이루어진 category의 사례.

[^milewski-composition]: Milewski, Ch. 1 §1.2, pp. 5–6. 법칙을 보여 주는 본문의 부서 정보 예제는 원전 예제를 옮긴 것이 아닙니다.
[^riehl-category]: Riehl, Definition 1.1.1, p. 3. 원전은 항등과 결합의 두 공리로 적습니다. 여기서는 항등법칙의 좌우 등식을 각각 표시했습니다.
[^size-level]: 모든 타입을 무제한으로 한 집합에 넣는다는 뜻은 아닙니다. 여기서는 하나의 고정된 크기 수준에서 타입을 다루며, 이 전제는 앞의 함수 계산을 바꾸지 않습니다.
