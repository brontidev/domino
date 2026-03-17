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
  pieces: Piece<TComponent>[];
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

export interface Component {
  pieces: Piece<Component>[];
}

export interface ComponentWithHTML {
  pieces: Piece<ComponentWithHTML>[];
  html_inject: string;
}
