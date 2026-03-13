export enum PieceKind {
  Element,
  Text,
}


export interface TextPiece  {
  kind: PieceKind.Text,
  raw: boolean,
}

export interface ElementPiece {
  kind: PieceKind.Element;
  element_tag: string;
}

export type Piece =  ElementPiece | TextPiece;

export type FullPiece = Piece & {
  path: number[];
  name: string;
}

export interface Component {
  pieces: Piece[];
};

export interface ComponentWithHTML extends Component {
  html_inject: string;
}