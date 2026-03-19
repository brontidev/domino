import { PieceKind } from "./types.ts";
import type {
  Component,
  ComponentWithHTML,
  FullPiece,
  FullTile,
  Piece,
} from "./types.ts";
import { CommentNode, HTMLElement, parse } from "node-html-parser";
import { err, ok, type Result } from "@bronti/robust/Result";

export abstract class AnalyzeError extends Error {}

export class DuplicatePieceError extends AnalyzeError {
  constructor(readonly piece_name: string) {
    super(`Piece \`${piece_name}\` duplicated`);
  }
}

export class DuplicateTileError extends AnalyzeError {
  constructor(readonly tile_name: string) {
    super(`Tile \`${tile_name}\` duplicated`);
  }
}

export class InvalidTileError extends AnalyzeError {
  constructor(readonly tile_name: string) {
    super(
      `Tile \`${tile_name}\` is in an invalid spot, a tile must be top-level and not nested inside of any other directive or tile`,
    );
  }
}

export class NestedTileError extends InvalidTileError {
  constructor(override readonly tile_name: string) {
    super(
      `Tile \`${tile_name}\` is nested inside of another tile, which is not allowed`,
    );
  }
}

export class InvalidIdentifierError extends AnalyzeError {
  constructor(readonly kind: "piece" | "tile", readonly invalid_name: string) {
    super(
      `${kind[0].toUpperCase()}${kind.slice(1)} name \`${invalid_name}\` is not a valid JavaScript identifier`,
    );
  }
}

const JS_RESERVED_WORDS = new Set([
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
  "implements",
  "interface",
  "let",
  "package",
  "private",
  "protected",
  "public",
  "static",
]);

function is_valid_js_identifier(name: string): boolean {
  if (!/^[$A-Z_a-z][$\w]*$/.test(name)) return false;
  return !JS_RESERVED_WORDS.has(name);
}

function validate_identifier(kind: "piece" | "tile", name: string): AnalyzeError | null {
  if (is_valid_js_identifier(name)) {
    return null;
  }

  return new InvalidIdentifierError(kind, name);
}

type AnalyzeContext = {
  insideDirective: boolean;
  insideTile: boolean;
};

/**
 * Gets the path of a node (array of indexes relative to ancestor)
 */
function get_node_path(node: HTMLElement, ancestor: HTMLElement): number[] {
  const path: number[] = [];

  while (node !== ancestor && node.parentNode) {
    const parent = node.parentNode;
    const idx = parent.childNodes.indexOf(node);

    path.unshift(idx);
    node = parent;
  }

  return path;
}

function parse_fragment(source: string): HTMLElement {
  const document = parse(source);
  document.removeWhitespace();
  return document;
}

function match_directives(document: HTMLElement): HTMLElement[] {
  return document
    .querySelectorAll("[d-piece], d-text[piece], d-if[piece]")
    .filter((el) => {
      const tag = el.tagName.toLowerCase();
      const enclosing = tag === "d-if"
        ? (el.parentNode instanceof HTMLElement
          ? el.parentNode.closest("d-if, d-tile")
          : null)
        : el.closest("d-if, d-tile");

      return !enclosing;
    });
}

function match_tiles(document: HTMLElement): HTMLElement[] {
  return document.querySelectorAll("d-tile[name]");
}

export function analyze(
  source: string | HTMLElement,
  compiling: true,
): Result<ComponentWithHTML, AnalyzeError>;

export function analyze(
  source: string | HTMLElement,
  compiling: false,
): Result<Component, AnalyzeError>;

export function analyze(
  source: string | HTMLElement,
  compiling: boolean,
): Result<Component | ComponentWithHTML, AnalyzeError> {
  const document = source instanceof HTMLElement ? source : parse_fragment(source);
  if (source instanceof HTMLElement) {
    document.removeWhitespace();
  }

  return analyze_internal(document, compiling, {
    insideDirective: false,
    insideTile: false,
  });
}

function analyze_internal(
  document: HTMLElement,
  compiling: boolean,
  context: AnalyzeContext,
): Result<Component | ComponentWithHTML, AnalyzeError> {
  const pieces = new Map<string, FullPiece<Component | ComponentWithHTML>>();
  const tiles = new Map<string, FullTile<Component | ComponentWithHTML>>();

  for (const tile of match_tiles(document)) {
    const name = tile.getAttribute("name")!;
    const tile_name_error = validate_identifier("tile", name);
    if (tile_name_error) return err(tile_name_error);

    const path = get_node_path(tile, document);
    const parent = tile.parentNode instanceof HTMLElement ? tile.parentNode : null;
    const enclosing_tile = parent?.closest("d-tile") ?? null;
    const invalid_enclosing = parent?.closest("d-if, [d-piece]") ?? null;

    if (context.insideTile || enclosing_tile) {
      return err(new NestedTileError(name));
    }

    if (context.insideDirective || invalid_enclosing) {
      return err(new InvalidTileError(name));
    }

    if (tiles.has(name)) {
      if (compiling) {
        return err(new DuplicateTileError(name));
      }

      continue;
    }

    const result = analyze_internal(parse_fragment(tile.innerHTML), compiling, {
      insideDirective: false,
      insideTile: true,
    });

    if (!result.isOk()) return result;

    if (compiling) {
      const analyzed_tile = result.unwrap() as ComponentWithHTML;

      tiles.set(name, {
        name,
        pieces: analyzed_tile.pieces,
        html_inject: analyzed_tile.html_inject,
        path,
      });
      tile.remove();
      continue;
    }

    const analyzed_tile = result.unwrap() as Component;

    tiles.set(name, {
      name,
      pieces: analyzed_tile.pieces,
      path,
    });
  }

  for (const element of match_directives(document)) {
    const path = get_node_path(element, document);
    const tag = element.tagName.toLowerCase();

    let name: string;
    let piece: Piece<Component | ComponentWithHTML>;

    if (tag === "d-if") {
      name = element.getAttribute("piece")!;

      const piece_name_error = validate_identifier("piece", name);
      if (piece_name_error) return err(piece_name_error);

      const result = analyze_internal(parse_fragment(element.innerHTML), compiling, {
        insideDirective: true,
        insideTile: false,
      });

      if (!result.isOk()) return result;

      if (compiling) {
        const if_analyzed = result.unwrap() as ComponentWithHTML;

        piece = {
          kind: PieceKind.If,
          pieces: if_analyzed.pieces,
          html_inject: if_analyzed.html_inject,
        };

        element.replaceWith(new CommentNode("domino_piece"));
      } else {
        const if_analyzed = result.unwrap() as Component;

        piece = {
          kind: PieceKind.If,
          pieces: if_analyzed.pieces,
        };
      }
    } else if (tag === "d-text") {
      name = element.getAttribute("piece")!;
      const piece_name_error = validate_identifier("piece", name);
      if (piece_name_error) return err(piece_name_error);

      const raw = element.hasAttribute("raw");

      piece = {
        kind: PieceKind.Text,
        raw,
      };

      if (compiling) {
        element.replaceWith(new CommentNode("domino_piece"));
      }
    } else {
      name = element.getAttribute("d-piece")!;
      const piece_name_error = validate_identifier("piece", name);
      if (piece_name_error) return err(piece_name_error);

      piece = {
        kind: PieceKind.Element,
        element_tag: tag,
      };

      if (compiling) {
        element.removeAttribute("d-piece");
      }
    }

    if (pieces.has(name)) {
      if (compiling) {
        return err(new DuplicatePieceError(name));
      }

      continue;
    }

    pieces.set(name, {
      name,
      path,
      ...piece,
    });
  }

  if (compiling) {
    return ok({
      pieces: Array.from(pieces.values()) as FullPiece<ComponentWithHTML>[],
      tiles: Array.from(tiles.values()) as FullTile<ComponentWithHTML>[],
      html_inject: document.toString(),
    });
  }

  return ok({
    pieces: Array.from(pieces.values()) as FullPiece<Component>[],
    tiles: Array.from(tiles.values()) as FullTile<Component>[],
  });
}
