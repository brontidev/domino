import { create_state, derived, effect, subscribe } from "./state.ts";
import type { State, StateUtilities } from "./state.ts"

type StateMap = Record<string, unknown>;

export type StateProxy<T extends StateMap = StateMap> =
    & StateUtilities
    & {
        [K in keyof T]: State<T[K]>;
    }
    & {
        [key: string]: State<unknown>;
    };


export function create_state_proxy(): StateProxy {
    const map = new Map<string, State<unknown>>();

    const utilities: StateUtilities = {
        effect,
        subscribe,
        derived,
        isolated: create_state,
    };

    return new Proxy(utilities, {
        get(_, prop) {
            if (typeof prop == "symbol") return;
            if (prop in utilities) {
                return (utilities as Record<string, unknown>)[prop];
            }
            if (!map.has(prop)) map.set(prop, create_state());
            return map.get(prop);
        },
        set() {
            return false;
        },
    }) as StateProxy;
}