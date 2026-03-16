# Selectors API Design — Nested State Reactivity

## Problem Statement
Current API lacks granular reactivity for nested states. Svelte's store→runes migration teaches us: flat state + computed properties fail at scale. We need **path-tracking updates** that notify only affected subscribers, without compiler magic or automatic tracking.

## Proposed Solution
Introduce **selector-based memoization**: selectors read only the data they need, and callbacks only fire when the selector output changes. Support both instance methods (`state.effect()`) and module functions (`effect(...states)`).

---

## Core Design Principles

1. **Selectors are pure functions**: `(value: T) => U` — read what you need, return the computed result
2. **Memoization by output equality**: If selector output hasn't changed, callback doesn't fire
3. **Instance vs module API**: Both available; instance is ergonomic for single-state, module for multi-state
4. **Backwards compatible**: Existing `state.effect(cb)` still works (implicitly `state.effect(v => v, cb)`)
5. **Nested reactivity without arrays**: Supports deep property access like `(u) => u.user.profile.name`

---

## API Design

### Single-State (Instance Methods)

#### `state.effect(selector, callback)` — With selector memoization
```ts
const user = create_state({ name: "Alice", age: 30 });

// Fires when user.name changes (shallow equality on output)
user.effect(
  (u) => u.name,  // selector: read only .name
  (name) => console.log(name)  // callback: fires when output changes
);

// Fires when entire user object changes (always different reference)
user.effect(
  (u) => u,  // selector: return whole value
  (u) => console.log(u)
);

// Fires only when computed result changes
user.effect(
  (u) => `${u.name} (${u.age})`,  // selector: string
  (display) => console.log(display)
);
```

#### `state.effect(callback)` — Backwards compat (no selector)
```ts
// Old API still works: fires on any mutation
user.effect((u) => {
  console.log("user changed", u);
});
```

#### `state.subscribe(selector, callback)` — Same as effect, but called immediately? No, only on change
```ts
// Similar to effect, but what's the difference?
// Answer: effect() fires immediately if state is initialized; subscribe() waits for first change
user.subscribe(
  (u) => u.name,
  (name) => console.log(name)  // doesn't fire until user mutates
);
```

#### `state.derive(selector)` — Create derived state with selector memoization
```ts
// Fires when selector output changes
const displayName = user.derive((u) => `${u.name} (${u.age})`);

// Later: whenever user changes, if display name is different, displayName state updates
displayName.get();  // "Alice (30)"
```

---

### Multi-State (Module Functions)

#### `effect(selector, callback, ...states)` — Multi-state with selector
```ts
const user = create_state({ name: "Alice", age: 30 });
const settings = create_state({ theme: "dark", locale: "en" });

// Selector receives all state values in order
effect(
  (u, s) => `${u.name} uses ${s.theme}`,
  (result) => console.log(result),
  user,
  settings
);

// Fires only when this specific combination changes
effect(
  (u, s) => u.age > 18 && s.locale === "en",
  (isAdult) => console.log(isAdult),
  user,
  settings
);

// Complex selector across multiple states
effect(
  (u, s, cart) => ({
    user: u.name,
    items: cart.length,
    theme: s.theme,
  }),
  (combined) => updateUI(combined),
  user,
  settings,
  cartState
);
```

#### `subscribe(selector, callback, ...states)` — Multi-state subscribe (wait for first change)
```ts
subscribe(
  (u, s) => u.name + s.theme,
  (result) => console.log(result),
  user,
  settings
);
```

#### `derived(selector, ...states)` — Multi-state derived with memoization
```ts
// Returns ReadableState<U>
const displayInfo = derived(
  (u, s) => `${u.name} (${s.theme})`,
  user,
  settings
);

// Re-runs selector only when any state mutates, but callback fires only if output changed
displayInfo.effect((info) => console.log(info));
```

---

## Use Cases (Comprehensive)

### UC1: Simple single-state subscription
```ts
const count = create_state(0);

count.effect(
  (c) => c,  // identity selector
  (value) => console.log("count:", value)
);
```

### UC2: Filtering/mapping single state
```ts
const todos = create_state([
  { id: 1, done: false },
  { id: 2, done: true },
]);

// Selector maps to computed value
todos.effect(
  (t) => t.filter(x => !x.done),  // only incomplete todos
  (incomplete) => console.log(incomplete.length + " remaining")
);

// Fires only when .length of filtered array changes
todos.effect(
  (t) => t.filter(x => !x.done).length,
  (count) => updateBadge(count)
);
```

### UC3: Deep nested property access
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
app.effect(
  (a) => a.user.profile.name,
  (name) => console.log(name)
);
```

### UC4: Combining multiple states
```ts
const userState = create_state({ name: "Alice" });
const cartState = create_state({ items: 5 });

effect(
  (user, cart) => `${user.name} has ${cart.items} items`,
  (display) => console.log(display),
  userState,
  cartState
);

// Only one callback fires per update cycle, even if both states change
```

### UC5: Conditional logic across states
```ts
const isLoggedIn = create_state(false);
const userRole = create_state("guest");

effect(
  (loggedIn, role) => loggedIn && role === "admin",
  (isAdmin) => showAdminPanel(isAdmin),
  isLoggedIn,
  userRole
);
```

### UC6: Derived state from derived state (chaining)
```ts
const user = create_state({ age: 25 });

const isAdult = user.derive((u) => u.age >= 18);
const message = isAdult.derive((adult) => adult ? "Welcome" : "Too young");

message.effect((msg) => console.log(msg));  // "Welcome"
```

### UC7: Complex selector returning object
```ts
const user = create_state({ name: "Alice", bio: "Engineer" });
const posts = create_state([]);

const profile = derived(
  (u, p) => ({
    name: u.name,
    bio: u.bio,
    postCount: p.length,
    lastPostDate: p[0]?.date || null,
  }),
  user,
  posts
);

profile.effect((p) => renderCard(p));
```

### UC8: Array mutations should NOT auto-track
```ts
const items = create_state(["a", "b"]);

// Selector reads array, returns specific element
items.effect(
  (arr) => arr[0],
  (first) => console.log(first)  // fires when first element changes
);

// Selector counts items
items.effect(
  (arr) => arr.length,
  (len) => console.log(len)  // fires when length changes
);
```

### UC9: Transition state (multi-source derived)
```ts
const fromState = create_state({ x: 0, y: 0 });
const toState = create_state({ x: 100, y: 100 });
const progress = create_state(0);

const interpolated = derived(
  (from, to, p) => ({
    x: from.x + (to.x - from.x) * p,
    y: from.y + (to.y - from.y) * p,
  }),
  fromState,
  toState,
  progress
);

interpolated.effect((pos) => element.style.transform = `translate(${pos.x}px, ${pos.y}px)`);
```

### UC10: Debounced selector (side effect in selector)
```ts
const searchQuery = create_state("");

searchQuery.effect(
  (query) => {
    // Selector can have side effects (though not recommended)
    // Better: use selector to get debounced value from external state
    return query.trim().toLowerCase();
  },
  (q) => performSearch(q)
);
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
