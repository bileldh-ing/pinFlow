# PinFlow Arduino Visual Subset v1 — parser coverage

Status: implemented in `packages/cpp-parser` (tree-sitter-cpp 0.23.4 on web-tree-sitter 0.27.1).
Every row below is exercised by tests in `packages/cpp-parser/test/` (mapping, golden, property).

**Promise:** constructs in the *Native* column become structured IR (editable blocks) and
round-trip through `parse → generate → parse` to the same normalized IR. Everything else is
**preserved byte-for-byte** as a raw node (`RawTopLevel` / `RawStatement` / `RawExpr`) with a
`reason` and a coverage entry. Nothing is dropped or rewritten. On a syntax error the parse returns
`ok: false` and the caller keeps the last good IR.

## Coverage classes (spec 3.2)

| Class | Meaning |
|---|---|
| `fully_visualized` | Top-level item mapped natively with no raw descendants. |
| `partially_visualized` | Native item (e.g. a function) that contains raw statements/expressions. |
| `raw_preserved` | Raw node: exact source text + plain-language reason. |
| `parse_error` | Source has ERROR/MISSING nodes; `ok:false`, diagnostics carry line/col. |

`CoverageReport.ratio` = 1 − (non-whitespace characters inside raw nodes / non-whitespace characters in the file).
Comments count as represented (they are attached to nodes).

## Top level

| Construct | Native IR | Raw-preserved (reason / construct name) |
|---|---|---|
| `#include <X.h>` / `#include "x.h"` | `Include {path, system}` | macro-computed include |
| `#define NAME value` (single line) | `Define {name, value}`; a trailing `//` or `/* */` comment becomes `trailingComment` (only when the value has no string/char literal) | multi-line `\` defines, define with literal **and** comment (`preproc_def`) |
| `#define F(x) ...` | — | `preproc_function_def` |
| `#ifdef/#ifndef/#if/#elif/#else/#endif` blocks | — | `preproc_ifdef`, `preproc_if` (whole block incl. branches, verbatim) |
| `#pragma`, `#undef`, other directives | — | `preproc_call` |
| Items containing `PROGMEM`, `IRAM_ATTR`, … | — | `arduino_attribute_macro` (see limitation 5) |
| Global variables: `int x;`, `const float k = 1.5f;`, `static`/`volatile` qualifiers, `unsigned long`, `uint8_t`, `byte`, `bool`, `String`… | `VarDecl {type, isConst, name, init}` | `auto` (`auto`), pointer/reference declarators (`pointer_declarator`), `int x{5}`/`int x(5)` (`initializer_list` / `constructor_initializer`), `extern`/`constexpr`/attributes, template types (`std::vector<int>`) |
| Arrays: `int a[3];`, `int a[N] = {1, 2, 3};`, `char s[] = "x";` | `VarDecl.arraySize` (verbatim text) + `arrayInit` / `init` | multi-dimensional arrays (`multidimensional_array`) |
| `int a, b = 2;` | **split** into two `VarDecl`s (semantically identical; regenerated on two lines) | — |
| Library objects: `DHT dht(DHTPIN, DHTTYPE);`, `DHT dht(4, DHT11);`, `Servo s;` | `ObjectDecl {className, name, args, hasParens}` | `Foo f();` (it declares a function in C++), brace init `Foo f{…}`, qualified/const objects |
| Function definitions incl. `setup`/`loop`, `static`/`inline`, params `int a`, `const char *s`, `String &out`, `(void)` | `Function {returnType, name, params, body}` (pointer/reference params keep `*`/`&` in `Param.type`; `(void)` becomes `[]`) | methods `Foo::bar`, pointer/reference return types, default arguments (`optional_parameter_declaration`), array params, `noexcept`/`const` qualifiers |
| Function prototypes `int f(int);` | — | `function_prototype` (Arduino generates prototypes itself) |
| `class`, `struct`, `enum`, `union`, `template`, `namespace`, `typedef`, `using` | — | `class_specifier`, `struct_specifier`, `enum_specifier`, `union_specifier`, `template_declaration`, `namespace_definition`, `type_definition`, `using_declaration`, `alias_declaration` (the trailing `;` is folded into the same raw region) |
| Comments | `Comment` (standalone), `leadingComments` (run directly above a node, no blank line), `trailingComment` (same line after a node) | comment in a position no field can hold (e.g. between `if (c)` and its body) ⇒ the enclosing statement becomes raw |

## Statements

| Construct | Native IR | Raw-preserved |
|---|---|---|
| Local declarations (same rules as globals) | `VarDecl` | as above; local object construction `DHT d(4, DHT11);` (`local_object`) |
| `x = e;` and `+= -= *= /= %= &= |= ^= <<= >>=` | `Assign {op, target, value}` (target: identifier or `a[i]`) | chained `a = b = c` (`chained_assignment`), member/pointer targets `p.x = 1` (`member_assignment`), brace assignment |
| Expression statements (calls, `i++`) | `ExprStmt` | statement whose expression is raw (unknown call, cast…) becomes a `RawStatement` with that reason |
| `if / else if / else` (with or without braces) | `If {branches[], elseBody}`; `else { if … }` stays nested (not an else-if) | `if constexpr`, conditions with declarations/init-statements |
| `for (init; cond; update)` incl. `for (;;)` | `For` (init: `VarDecl`/`Assign`/`ExprStmt`; update: `Expr` or `Assign`) | comma expressions, several declared variables, range-for `for (x : arr)` |
| `while`, `do … while` | `While`, `DoWhile` (round-trip proven by golden + property tests) | — |
| `switch / case / default` with fall-through | `Switch {subject, cases[{value?, body}]}` | statements before the first label, comments between labels |
| `break`, `continue`, `return [e]` | `Break`, `Continue`, `Return` | brace return values |
| Nested `{ … }` block | — | `compound_statement` (own scope) |
| `#ifdef …` inside a function | — | `preproc_ifdef` (emitted at column 0) |
| `;` (empty), `goto`, labels, `try`, `throw` | — | verbatim |

Single-statement bodies (`if (a) x();`) are mapped natively; the generator always emits braces.

## Expressions

| Construct | Native IR | Raw-preserved |
|---|---|---|
| Integer/float literals (`0x1F`, `1.5f`, `100UL`, `0b101`) | `NumberLit.raw` verbatim | — |
| Signed literal `-5` (tree-sitter folds the sign) | `Unary {-, NumberLit "5"}` | — |
| `true`/`false`, `'c'`, `"str"` with escapes | `BoolLit`, `CharLit.raw`, `StringLit.raw` verbatim | concatenated strings `"a" "b"`, raw strings `R"(…)"`, `nullptr`, `this` |
| Identifiers / constants (`HIGH`, `LED_BUILTIN`, `INPUT_PULLUP`) | `Ident` | `Foo::bar` |
| `+ - * / % == != < <= > >= && || & | ^ << >>` | `Binary` (structure from the CST, i.e. C++ precedence) | `<=>`, alternative tokens (`and`, `not`) |
| `! - + ~` | `Unary` | `&x`, `*p` (`pointer_expression`) |
| `++`/`--` prefix and postfix | `Update {prefix}` | — |
| `( … )` | `Paren` (explicit source parentheses are always kept) | comma expression in parens |
| `c ? a : b` | `Ternary` | GNU `a ?: b` |
| `a[i]` | `Index` | multi-index |
| `f(args)` | `Call` when `f` is an Arduino core function (see `CORE_FUNCTIONS`, incl. `F()`, `String()`), a function defined/declared in this file, or one passed in `extraKnownFunctions` | otherwise `unknown_function` |
| `obj.m(args)` | `MethodCall` when `obj` is `Serial`/`Serial1`/`Serial2` with a known method, or a global object of a class registered in a library pack (DHT: `begin`, `readTemperature`, `readHumidity`, `computeHeatIndex`, `convertCtoF`, `convertFtoC`, `read`) | otherwise `unknown_library_call` (e.g. `WiFi.begin`, `servo.write`), `p->m()` |
| Casts `(long)x`, `sizeof`, lambdas, `new`, member access `a.b` | — | `cast_expression`, `sizeof_expression`, `lambda_expression`, `field_expression` |
| Comment inside an expression | — | the smallest enclosing expression becomes raw |

## Known limitations (honest list)

1. **C++ ambiguities tree-sitter resolves without a symbol table.**
   - `(a) + b`, `(a) - b`, `(a) * b`, `(a) & b`, `(a) && b`, `(f()) + b` can be a cast of `+b`/`&&b`…
     to a type named `a` / function type `f()`; tree-sitter often picks the cast. Any cast whose type is
     a plain identifier is treated as this ambiguity (casts to built-in types like `(long)x` are not).
   - `a < b … > (c)` can be a template call `a<…>(c)`; tree-sitter may pick the template.
   PinFlow detects both readings and keeps the **whole root expression** raw (`cast_ambiguity`,
   `template_ambiguity`) so a wrong operator structure is never shown. Bytes are preserved; only
   visual editability of that expression is lost. A statement that *starts* with `(name) op …`
   (useless in Arduino code) can be a syntax error for the same reason.
2. **tree-sitter-cpp 0.23 associates `!i++` as `(!i)++`.** The mapper re-associates postfix
   updates under unary operators to C++ semantics (`!(i++)`); covered by tests.
3. **Unknown calls are raw by policy** (spec 15.2 #11). In multi-file sketches, functions defined in
   sibling files are only native when the caller passes `extraKnownFunctions`.
4. **Layout is normalized when code is regenerated** (only when blocks are edited — parsing never
   rewrites user text): 2-space indentation, braces everywhere, one blank line around functions,
   multi-declarator declarations split, `(void)` params dropped, raw regions start at the current
   indentation (preprocessor raw lines at column 0) with their internal bytes untouched.
   Generation is a fixed point after one normalization pass (tested on every fixture and in
   property tests). Blank lines between items are preserved (`blankLineBefore`).
5. **Arduino attribute macros.** `PROGMEM`, `IRAM_ATTR`, `DRAM_ATTR`, `RTC_DATA_ATTR`, `RTC_RODATA_ATTR`,
   `RTC_NOINIT_ATTR`, `ICACHE_RAM_ATTR`, `ICACHE_FLASH_ATTR`, `WORD_ALIGNED_ATTR`, `EXT_RAM_ATTR` are
   unknown to tree-sitter (they are syntax errors to it). Before parsing, these identifiers — outside
   strings, chars, comments and `#` lines — are replaced by same-length spaces in the copy given to
   tree-sitter (offsets unchanged); the statement / top-level item containing one is then kept raw
   from the ORIGINAL text (`arduino_attribute_macro`), so the macro is never lost. A function whose
   signature has `IRAM_ATTR` is therefore raw as a whole in v1. Any *other* unknown macro used in a
   declaration position (e.g. a library's `EXPORT` keyword) still makes the parse fail (`ok:false`),
   because a syntax error and an unknown macro are indistinguishable at CST level; the caller keeps
   the last good IR and shows the diagnostics.
6. **Spans:** `startByte/endByte` are UTF-8 byte offsets; `startLine/startCol/endLine/endCol` are
   0-based, columns in UTF-16 code units (Monaco column − 1).
7. **RawExpr precedence:** a raw expression is emitted verbatim and treated as a primary expression by
   the generator. That is exact for parsed code; if a user moves a raw expression into a
   tighter-binding context via blocks, the adapter should wrap it in a `Paren` node.
