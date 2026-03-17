# Selectors API Design — Nested State Reactivity

## Problem Statement
Current API lacks granular reactivity for nested states. Svelte's store→runes migration teaches us: flat state + computed properties fail at scale. We need **path-tracking updates** that notify only affected subscribers, without compiler magic or automatic tracking.

## Proposed Solution
Introduce **selector-based memoization** via a fluent `.select()` API: selectors read only the data they need, and callbacks only fire when the selector output changes. Leverage existing `.derive()` under the hood; `.select()` is a semantic alias that returns a derived state.

---

## Core Design Principles

1. **Selectors are pure functions**: `(value: T) => U` — read what you need, return the computed result
2. **Memoization by output equality**: If selector output hasn't changed, callback doesn't fire
3. **Fluent `.select()` API**: Use `.select(selector)` to create a derived state, then `.effect()` or `.subscribe()` on it
4. **Backwards compatible**: Existing `.effect(cb)` and `.subscribe(cb)` stay unchanged
5. **Single implementation point**: All selector logic lives in `.derive()` (memoization happens there)
6. **Semantic clarity**: `.select()` is an alias to `.derive()` with clearer intent when chaining

---

## API Design

### Single-State (Instance Methods)

#### `state.effect(callback)` — Legacy (unchanged)
```ts
const user = create_state({ name: "Alice", age: 30 });

// Fires immediately (if initialized) + on any mutation
user.effect((u) => {
  console.log("user changed:", u);
});
```

#### `state.subscribe(callback)` — Legacy (unchanged)
```ts
// Fires only on subsequent mutations (not immediately)
user.subscribe((u) => {
  console.log("user changed:", u);
});
```

#### `state.select(selector)` — New: returns derived state with memoization
```ts
const user = create_state({ name: "Alice", age: 30 });

// select() returns a ReadableState<U> (via derive() under the hood)
// Then chain .effect() or .subscribe() on it
user.select((u) => u.name).effect((name) => {
  console.log("name changed:", name);
});

// With subscribe (fires on mutations only)
user.select((u) => u.name).subscribe((name) => {
  console.log("name changed:", name);
});

// Complex selectors
user.select((u) => `${u.name} (age ${u.age})`)
    .effect((display) => console.log(display));
```

#### `state.derive(selector)` — Direct use (same as .select())
```ts
// Both are identical—select() is an alias to derive()
const name = user.derive((u) => u.name);
name.effect((n) => console.log(n));
```

---

### Multi-State (Module Functions)

#### Legacy multi-state APIs (unchanged)
```ts
const user = create_state({ name: "Alice" });
const settings = create_state({ theme: "dark" });

// effect(...states) — fires immediately + on mutations
effect((u, s) => {
  console.log(`${u.name} uses ${s.theme}`);
}, user, settings);

// subscribe(...states) — fires on mutations only
subscribe((u, s) => {
  console.log(`${u.name} uses ${s.theme}`);
}, user, settings);
```

#### `derived(selector, ...states)` — Multi-state with memoization (NEW)
```ts
// Returns ReadableState<U>
// Selector only runs when any source state mutates
// Callback fires only when selector output changes
const displayInfo = derived(
  (u, s) => `${u.name} (${s.theme})`,
  user,
  settings
);

// Then chain effect or subscribe
displayInfo.effect((info) => console.log(info));
displayInfo.subscribe((info) => console.log(info));
```

---

## Use Cases (Comprehensive)

### UC1: Simple single-state subscription (legacy)
```ts
const count = create_state(0);

count.effect((c) => console.log("count:", c));
```

### UC2: Filtering/mapping single state (with selector)
```ts
const todos = create_state([
  { id: 1, done: false },
  { id: 2, done: true },
]);

// Select incomplete todos, fire only when filtered result changes
todos.select((t) => t.filter(x => !x.done))
     .effect((incomplete) => console.log(incomplete.length + " remaining"));

// Select count only
todos.select((t) => t.filter(x => !x.done).length)
     .effect((count) => updateBadge(count));
```

### UC3: Deep nested property access (with selector)
```ts
const app = create_state({
  user: {
    profile: {
      name: "Alice",
      avatar: "url"
    }
  }
});

// Memoized: fires only when user.profile.name changes
app.select((a) => a.user.profile.name)
   .effect((name) => console.log(name));
```

### UC4: Combining multiple states (multi-state derived)
```ts
const userState = create_state({ name: "Alice" });
const cartState = create_state({ items: 5 });

derived(
  (user, cart) => `${user.name} has ${cart.items} items`,
  userState,
  cartState
).effect((display) => console.log(display));
```

### UC5: Conditional logic across states (multi-state derived)
```ts
const isLoggedIn = create_state(false);
const userRole = create_state("guest");

derived(
  (loggedIn, role) => loggedIn && role === "admin",
  isLoggedIn,
  userRole
).effect((isAdmin) => showAdminPanel(isAdmin));
```

### UC6: Derived state from derived state (chaining)
```ts
const user = create_state({ age: 25 });

const isAdult = user.select((u) => u.age >= 18);
const message = isAdult.select((adult) => adult ? "Welcome" : "Too young");

message.effect((msg) => console.log(msg));  // "Welcome"
```

### UC7: Complex selector returning object (with selector)
```ts
const user = create_state({ name: "Alice", bio: "Engineer" });
const posts = create_state([]);

derived(
  (u, p) => ({
    name: u.name,
    bio: u.bio,
    postCount: p.length,
    lastPostDate: p[0]?.date || null,
  }),
  user,
  posts
).effect((p) => renderCard(p));
```

### UC8: Array element/length tracking (with selector)
```ts
const items = create_state(["a", "b"]);

// Select specific element
items.select((arr) => arr[0])
     .effect((first) => console.log(first));

// Select length
items.select((arr) => arr.length)
     .effect((len) => console.log(len));
```

### UC9: Transition state (multi-state derived)
```ts
const fromState = create_state({ x: 0, y: 0 });
const toState = create_state({ x: 100, y: 100 });
const progress = create_state(0);

derived(
  (from, to, p) => ({
    x: from.x + (to.x - from.x) * p,
    y: from.y + (to.y - from.y) * p,
  }),
  fromState,
  toState,
  progress
).effect((pos) => element.style.transform = `translate(${pos.x}px, ${pos.y}px)`);
```

### UC10: Subscribe vs Effect distinction (selectors respect the difference)
```ts
const search = create_state("");

// Effect: fires immediately + on mutations
search.select((s) => s.trim().toLowerCase())
      .effect((q) => console.log("initial:", q));

// Subscribe: fires on mutations only
search.select((s) => s.trim().toLowerCase())
      .subscribe((q) => console.log("changed:", q));
```

---

## Implementation Details

### Single-State Instance Methods

```ts
interface ReadableState<T> {
  effect(selector: (v: T) => U, cb: (u: U) => void): Unsubscriber;
  effect(cb: (v: T) => void): Unsubscriber;  // overload: backwards compat
  
  subscribe(selector: (v: T) => U, cb: (u: U) => void): Unsubscriber;
  subscribe(cb: (v: T) => void): Unsubscriber;  // overload: backwards compat
  
  derive<U>(selector: (v: T) => U): ReadableState<U>;
}

interface WritableState<T> extends ReadableState<T> {
  // ... existing methods ...
}
```

**Backwards compat overloads**:
- `state.effect(cb)` treats `cb` as selector AND callback (fires on any mutation)
- `state.effect((v) => cb(v))` is the explicit form

### Multi-State Module Functions

```ts
export function effect<States extends readonly ReadableState<unknown>[], U>(
  selector: (...values: StateValues<States>) => U,
  callback: (result: U) => void,
  ...states: States
): Unsubscriber;

export function effect<States extends readonly ReadableState<unknown>[]>(
  callback: (...values: StateValues<States>) => void,
  ...states: States
): Unsubscriber;  // backwards compat overload

export function subscribe<States extends readonly ReadableState<unknown>[], U>(
  selector: (...values: StateValues<States>) => U,
  callback: (result: U) => void,
  ...states: States
): Unsubscriber;

export function derived<States extends readonly ReadableState<unknown>[], U>(
  selector: (...values: StateValues<States>) => U,
  ...states: States
): ReadableState<U>;
```

### Memoization Logic

```ts
// For each subscriber, track:
// - selector function
// - callback function
// - last output value
// - which states it depends on

// On any state update:
// 1. Collect all dirty subscribers (all states that changed feed their subscribers into a Set)
// 2. For each unique subscriber in the dirty set:
//    a. Extract current values from all source states
//    b. Call selector(...values)
//    c. Compare output to lastOutput (shallow equality)
//    d. If different, update lastOutput and fire callback(output)

// Batching: all updates happen in one flush cycle per mutation
```

### Backwards Compatibility

#### Old API still works:
```ts
// Old: effect with just callback, no selector
state.effect((v) => {
  console.log(v);
});

// Implemented as: selector = (v) => v, callback = cb
// So every mutation fires (no memoization, but still correct)
```

#### Transition path:
```ts
// If you want memoization, wrap in selector:
state.effect(
  (v) => v.property,  // selector
  (val) => { console.log(val) }  // callback
);

// Or use the explicit overload:
state.effect((v) => v.property, (val) => console.log(val));
```

---

## Open Questions

1. **Backwards compat function signature collision**: How do we distinguish `effect(cb)` from `effect(selector, cb)` at runtime? Answer: Check if first arg is a function AND second arg is provided.

2. **Array element mutations**: Should `arr[0] = x` update subscribers? Currently no—selectors only track returned value equality. If you need array mutation reactivity, return `arr.length` or use `derived()` to create a snapshot.

3. **Performance**: Selectors run on every mutation. Is this acceptable? Yes if selectors are fast (they should be—just property access/filtering, not network calls). For heavy computation, use `derived()` + effect separately.

4. **Selector side effects**: Are side effects in selectors allowed? No—treat selectors as pure. Side effects belong in callbacks.

5. **Why both `effect()` and `subscribe()`?**: 
   - `effect()` fires immediately if state is initialized
   - `subscribe()` waits for first mutation
   - This matches Svelte's `$effect` and `$effect.pre()` philosophy

---

## Implementation Notes

- Re-use existing `Subscriber<T>` type; extend to support selectors
- Batch memoization checks: all dirty subscribers notified in one flush
- Consider internal `_lastOutput` map: `Map<SubscriberFn, any>` to track output per subscriber
- Test edge case: multi-state where some states are uninitialized
- Test chaining: `state.derive().derive().effect(...)`
