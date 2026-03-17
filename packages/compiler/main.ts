import { analyze, AnalyzeError, DuplicatePieceError } from "@domino/analyzer";
import { ComponentWithHTML, Piece } from "@domino/analyzer/types";
import { Result } from "@bronti/robust/Result";

function or_throw<T>(r: Result<T, unknown>): T {
  return r.match((a) => a, (e) => {
    throw e;
  });
}

function create_tree(pieces: Pieces[]) {
}

export function compile(from: string | ComponentWithHTML): string {
  const component = typeof from == "string"
    ? or_throw(analyze(from, true))
    : from;
}
