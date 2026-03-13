export class UninitializedStateError extends Error {}

function throw_uninitialized(): never {
    throw new UninitializedStateError("State read before being written to");
}

const uninitialized = Symbol();
const raw = Symbol();

export function create_state<T>(
    initial_value: T | typeof uninitialized = uninitialized,
): WritableState<T> {
    let _value = initial_value;
    const subscribers = new Set<Subscriber<T>>();

    function subscribe(cb: Subscriber<T>): Unsubscriber {
        subscribers.add(cb);
        return () => void subscribers.delete(cb);
    }

    function set(value: T) {
        _value = value;
        for (const subscriber of subscribers) {
            subscriber(_value);
        }
        return _value;
    }

    const state: WritableState<T> = {
        set(value) {
            return set(value);
        },
        init(value) {
            if (_value === uninitialized) set(value);
            return state;
        },
        subscribe(cb) {
            return subscribe(cb);
        },
        effect(cb) {
            if (_value !== uninitialized) cb(_value);
            return subscribe(cb);
        },
        get() {
            if (_value === uninitialized) throw_uninitialized();
            return _value;
        },
        update(cb) {
            if (_value === uninitialized) throw_uninitialized();
            return set(cb(_value));
        },
        derive(cb) {
            const derived_state = create_state<ReturnType<typeof cb>>();
            state.effect((value) => {
                derived_state.set(cb(value));
            });

            return derived_state.reader();
        },
        reader() {
            return reader;
        },
        get [raw]() {
            return _value;
        },
    };

    const reader: ReadableState<T> = {
        effect: state.effect,
        get: state.get,
        subscribe: state.subscribe,
        derive: state.derive,
        [raw]: state[raw],
    };

    return state;
}

/// COMBINED UTILITIES

export function subscribe<States extends readonly ReadableState<unknown>[]>(
    cb: (...values: StateValues<States>) => void,
    ...states: States
): Unsubscriber {
    const handler = () => {
        if (
            states.every((s) => s[raw] !== uninitialized)
        ) {
            const values = states.map((s) => s.get()) as StateValues<States>;
            cb(...values);
        }
    };

    const unsubs = states.map((s) => s.subscribe(handler));
    return () => unsubs.forEach((u) => u());
}

export function effect<States extends readonly ReadableState<unknown>[]>(
    cb: (...values: StateValues<States>) => void,
    ...states: States
): Unsubscriber {
    const handler = () => {
        if (
            states.every((s) => s[raw] !== uninitialized)
        ) {
            const values = states.map((s) => s.get()) as StateValues<States>;
            cb(...values);
        }
    };

    const unsubs = states.map((s) => s.effect(handler));
    return () => unsubs.forEach((u) => u());
}

export function derived<States extends readonly ReadableState<unknown>[], U>(
    cb: (...values: StateValues<States>) => U,
    ...states: States
): ReadableState<U> {
    const derived_state = create_state<U>();
    effect((...values) => {
        derived_state.set(cb(...values));
    }, ...states);
    return derived_state.reader();
}

//// TYPES


export type StateUtilities = {
    effect: typeof effect;
    subscribe: typeof subscribe;
    derived: typeof derived;
    isolated: typeof create_state;
};

export type Subscriber<T> = (value: T) => void;
export type Updater<T, U> = (value: T) => U;
export type Unsubscriber = () => void;

export interface ReadableState<T> {
    [raw]: T | typeof uninitialized;
    get(): T;
    subscribe(cb: Subscriber<T>): Unsubscriber;
    effect(cb: Subscriber<T>): Unsubscriber;
    derive<U>(cb: Updater<T, U>): ReadableState<U>;
}

export interface WritableState<T> extends ReadableState<T> {
    set(value: T): T;
    init(value: T): WritableState<T>;
    update(cb: Updater<T, T>): T;
    reader(): ReadableState<T>;
}

export type State<T> = WritableState<T>;
export type StateValue<S> = S extends ReadableState<infer T> ? T : never;
export type StateValues<T extends readonly unknown[]> = {
    [K in keyof T]: StateValue<T[K]>;
};
