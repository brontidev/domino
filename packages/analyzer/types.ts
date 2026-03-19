export enum PieceKind {
  Element,
  Text,
  If,
}

export interface TextPiece {
  kind: PieceKind.Text;
  raw: boolean;
}

export interface ElementPiece {
  kind: PieceKind.Element;
  element_tag: string;
}

export type IfPiece<TComponent extends ComponentWithHTML | Component> = {
  kind: PieceKind.If;
  pieces: FullPiece<TComponent>[];
  // using Record<PropertyKey, never> breaks types
  // deno-lint-ignore ban-types
} & (TComponent extends ComponentWithHTML ? { html_inject: string } : {});

export type Tile<TComponent extends ComponentWithHTML | Component> = {
  pieces: FullPiece<TComponent>[];
  path: number[];
  // using Record<PropertyKey, never> breaks types
  // deno-lint-ignore ban-types
} & (TComponent extends ComponentWithHTML ? { html_inject: string } : {});

export type Piece<TComponent extends ComponentWithHTML | Component> =
  | ElementPiece
  | TextPiece
  | IfPiece<TComponent>;

export type FullPiece<TComponent extends ComponentWithHTML | Component> =
  & Piece<TComponent>
  & {
    path: number[];
    name: string;
  };

export type FullTile<TComponent extends ComponentWithHTML | Component> =
  & Tile<TComponent>
  & {
    name: string;
  };

export interface Component {
  pieces: FullPiece<Component>[];
  tiles: FullTile<Component>[];
}

export interface ComponentWithHTML {
  pieces: FullPiece<ComponentWithHTML>[];
  tiles: FullTile<ComponentWithHTML>[];
  html_inject: string;
}
