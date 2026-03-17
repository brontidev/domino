import type { ReadableState } from "./state.ts";
import type { StateProxy } from "./state_proxy.ts";

export type Pieces<P extends Record<string, unknown>> = P;

export type Context<
  TStates extends Record<string, unknown>,
  TPieces extends Record<string, HTMLElement | CallableFunction>,
  Props extends Record<string, unknown>,
  TSignals extends Record<string, ReadableState<unknown>> = Record<
    string,
    ReadableState<unknown>
  >,
> = {
  $: StateProxy<TStates>;
  pieces: Pieces<TPieces>;
  props: Props;
  signals: TSignals;
};

export type Render<
  TStates extends Record<string, unknown>,
  TPieces extends Record<string, HTMLElement | CallableFunction>,
  Props extends Record<string, unknown>,
  TSignals extends Record<string, ReadableState<unknown>> = Record<
    string,
    ReadableState<unknown>
  >,
> = (ctx: Context<TStates, TPieces, Props, TSignals>) => void;

export const define = <
  TStates extends Record<string, unknown> = Record<string, unknown>,
  TPieces extends Record<string, HTMLElement | CallableFunction> = Record<
    string,
    HTMLElement | CallableFunction
  >,
  Props extends Record<string, unknown> = Record<string, unknown>,
  TSignals extends Record<string, ReadableState<unknown>> = Record<
    string,
    ReadableState<unknown>
  >,
>(
  render: Render<TStates, TPieces, Props, TSignals>,
): Render<TStates, TPieces, Props, TSignals> => render;
