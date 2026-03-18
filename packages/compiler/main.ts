import { analyze } from "@domino/analyzer";
import { ComponentWithHTML, FullPiece, PieceKind } from "@domino/analyzer/types";
import { Result } from "@bronti/robust/Result";
import { optimize_paths, OptimizedPath, Piece } from "./optimizer.ts";
import { ESTree } from "node-estree";


function or_throw<T>(r: Result<T, unknown>): T {
  return r.match((a) => a, (e) => {
    throw e;
  });
}

function generate_path(item: OptimizedPath): ESTree.Node[] {

}

export function compile(from: string | ComponentWithHTML): string {
  const component = typeof from == "string"
    ? or_throw(analyze(from, true))
    : from;

  const items = optimize_paths(component.pieces as Piece[]);

  const module_level_body: ESTree.Node[] = []
  const function_body: ESTree.Node[] = []

  for(const item of items) {
  }
}
