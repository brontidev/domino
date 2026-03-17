import { PieceKind } from "./types.ts";
import type {
  Component,
  ComponentWithHTML,
  FullPiece,
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

function match_directives(
  document: HTMLElement,
  parent?: HTMLElement,
): HTMLElement[] {
  return document
    .querySelectorAll("[d-piece], d-text[piece], d-if[piece]")
    .filter((el) => {
      const tag = el.tagName.toLowerCase();
      const enclosing = tag === "d-if"
        ? (el.parentNode instanceof HTMLElement
          ? el.parentNode.closest("d-if")
          : null)
        : el.closest("d-if");

      return parent ? enclosing === parent : !enclosing;
    });
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
  const document = source instanceof HTMLElement ? source : parse(source);

  document.removeWhitespace();
  return analyze_internal(document, compiling, false);
}

function analyze_internal(
  document: HTMLElement,
  compiling: boolean,
  isRecursive: boolean,
): Result<Component | ComponentWithHTML, AnalyzeError> {
  const pieces = new Map<string, FullPiece<Component | ComponentWithHTML>>();

  const directives = match_directives(
    document,
    isRecursive ? document : undefined,
  );

  for (const element of directives) {
    const path = get_node_path(element, document);
    const tag = element.tagName.toLowerCase();

    let name: string;
    let piece: Piece<Component | ComponentWithHTML>;
    if (tag === "d-if") {
      name = element.getAttribute("piece")!;

      const result = analyze_internal(element, compiling, true);
      if (!result.isOk()) return result;

      const if_analyzed = result.unwrap();

      piece = {
        kind: PieceKind.If,
        pieces: if_analyzed.pieces,
      };

      // This code is ugly but it's the least ugly option that makes typescript stop yelping
      if (compiling && "html_inject" in if_analyzed) {
        (piece as unknown as ComponentWithHTML).html_inject =
          if_analyzed.html_inject;
        element.replaceWith(new CommentNode("domino_piece"));
      }
    } else if (tag === "d-text") {
      name = element.getAttribute("piece")!;
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
      html_inject: document.toString(),
    });
  }

  return ok({
    pieces: Array.from(pieces.values()) as FullPiece<Component>[],
  });
}
