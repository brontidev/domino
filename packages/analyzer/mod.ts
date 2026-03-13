import { PieceKind } from "./types.ts";
import type {
  Component,
  ComponentWithHTML,
  FullPiece,
  Piece,
} from "./types.ts";
import { CommentNode, HTMLElement, parse } from "node-html-parser";
import { err, ok, type Result } from "@bronti/robust";

export abstract class AnalyzeError extends Error {}

export class DuplicatePieceError extends AnalyzeError {
  constructor(readonly piece_name: string) {
    super(`Piece \`${piece_name}\` duplicated`);
  }
}

/**
 * Gets the path of a node (an array of indexes relative to document)
 */
function get_node_path(node: HTMLElement): number[] {
  const path = [];

  while (node.parentNode) {
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
  return (parent ?? document).querySelectorAll(
    "[d-piece], d-text[piece], d-if[piece], d-each[piece]",
  ).filter((el) => {
    const closest = el.closest("d-if, d-each");
    return parent ? closest == parent : !closest;
  });
}

export function analyze(
  source: string | HTMLElement,
  compiling: false,
): Result<Component, AnalyzeError>;

export function analyze(
  source: string | HTMLElement,
  compiling: true,
): Result<ComponentWithHTML, AnalyzeError>;

export function analyze(
  source: string | HTMLElement,
  compiling: boolean,
): Result<Component | ComponentWithHTML, AnalyzeError> {
  const document = (source instanceof HTMLElement ? source : parse(source))
    .removeWhitespace();

  const pieces = new Map<string, FullPiece>();

  for (
    const element of match_directives(document)
  ) {
    const path = get_node_path(element);
    console.log(element.tagName);

    let name: string;
    let piece: Piece;

    if (element.tagName == "d-piece") {
      name = element.getAttribute("piece")!;
      const raw = element.hasAttribute("raw");

      piece = {
        kind: PieceKind.Text,
        raw,
      };

      if (compiling) {
        element.removeAttribute("piece");
        element.removeAttribute("raw");
        element.replaceWith(new CommentNode("domino_piece"));
      }
    } else {
      name = element.getAttribute("d-piece")!;

      piece = {
        kind: PieceKind.Element,
        element_tag: element.tagName.toLowerCase(),
      };

      if (compiling) element.removeAttribute("d-piece");
    }

    if (pieces.has(name)) {
      // for now just ignore duplicates when doing typegen/linting
      if (!compiling) continue;
      return err(new DuplicatePieceError(name));
    }

    pieces.set(name, {
      name,
      path,
      ...piece,
    });
  }

  const component: Component = {
    pieces: Array.from(pieces.values()),
  };

  if (compiling) {
    return ok({
      ...component,
      html_inject: document.toString(),
    });
  }

  return ok(component);
}
