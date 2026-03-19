import { ComponentWithHTML, FullPiece, PieceKind } from "@domino/analyzer/types";

export type Piece = FullPiece<ComponentWithHTML>;

export type OptimizedPathKind =
  | "absolute"
  | "child"
  | "next_sibling"
  | "relative_parent";

type OptimizedPathBase<TMode extends OptimizedPathKind, TPath extends number[]> = {
  piece: Piece;
  mode: TMode;
  path: TPath;
};

export type AbsoluteOptimizedPath = OptimizedPathBase<"absolute", number[]> & {
  from?: never;
  relative_parent_path?: never;
  idx?: never;
};

export type ChildOptimizedPath = OptimizedPathBase<"child", number[]> & {
  from: string;
  relative_parent_path?: never;
  idx?: never;
};

export type NextSiblingOptimizedPath = OptimizedPathBase<"next_sibling", []> & {
  from: string;
  relative_parent_path?: never;
  idx?: never;
};

export type RelativeParentOptimizedPath =
  OptimizedPathBase<"relative_parent", [number, ...number[]]> & {
    // Compiler can cache a resolved parent node using this generated key.
    idx: number;
    // Absolute path to the shared parent used for sibling lookup.
    relative_parent_path: number[];
    from?: never;
  };

export type OptimizedPath =
  | AbsoluteOptimizedPath
  | ChildOptimizedPath
  | NextSiblingOptimizedPath
  | RelativeParentOptimizedPath;

function is_prefix(prefix: number[], target: number[]): boolean {
  if (prefix.length >= target.length) return false;

  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] !== target[i]) return false;
  }

  return true;
}

function has_same_parent(a: number[], b: number[]): boolean {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return false;

  for (let i = 0; i < a.length - 1; i++) {
    if (a[i] !== b[i]) return false;
  }

  return true;
}

function shared_prefix_length(a: number[], b: number[]): number {
  const max = Math.min(a.length, b.length);
  let i = 0;

  while (i < max && a[i] === b[i]) i++;

  return i;
}

/**
 * Takes in a list of pieces (they are already in order)
 * 
 * And creates a structure for the compiler that optimizes the paths for three different cases
 * 
 * case 1: child 
 * this case is only possible if piece_1.kind is PieceKind.Element,
 * if the kind is PieceKind.If / PieceKind.Tile the dataset already handles this,
 * as those have a pieces array with paths that are already relative to the parent
 * 
 * piece_1 [1, 2]
 * piece_2 [1, 2, 3]
 * 
 * output:
 * piece_1 [1, 2]
 * piece_2 [3] relative to piece_1
 * 
 * case 2: direct siblings
 * piece_1 [1, 2]
 * piece_2 [1, 3]
 * piece_3 [1, 4]
 * 
 * piece_1 [1, 2]
 * piece_2 is the next sibling of piece_1
 * piece_3 is the next sibling of piece_2
 * 
 * case 3: siblings with gaps in between (i'm not sure if this is worse or better for compilation size & runtime speed)
 * piece_1 [1, 1]
 * piece_2 [1, 3]
 * piece_3 [1, 5]
 * 
 * relative_parent_1 [1]
 * piece_1 [1] relative to relative_parent_1
 * piece_2 [3] relative to relative_parent_1
 * piece_3 [5] relative to relative_parent_1
 */
export function optimize_paths(pieces: Piece[]): OptimizedPath[] {
  const optimized: OptimizedPath[] = [];
  let relative_parent_idx = 0;
  const relative_parent_cache = new Map<string, number>();

  const get_relative_parent_idx = (path: number[]): number => {
    const key = path.join(",");
    const cached = relative_parent_cache.get(key);

    if (cached !== undefined) return cached;

    const idx = relative_parent_idx++;
    relative_parent_cache.set(key, idx);
    return idx;
  };

  for (const piece of pieces) {
    const previous = optimized.at(-1)?.piece;

    if (!previous) {
      optimized.push({
        piece,
        mode: "absolute",
        path: piece.path,
      });
      continue;
    }

    if (
      previous.kind === PieceKind.Element &&
      is_prefix(previous.path, piece.path)
    ) {
      optimized.push({
        piece,
        mode: "child",
        from: previous.name,
        path: piece.path.slice(previous.path.length),
      });
      continue;
    }

    if (has_same_parent(previous.path, piece.path)) {
      const previous_index = previous.path.at(-1)!;
      const current_index = piece.path.at(-1)!;

      if (current_index === previous_index + 1) {
        optimized.push({
          piece,
          mode: "next_sibling",
          from: previous.name,
          path: [],
        });
        continue;
      }
    }

    const prefix_len = shared_prefix_length(previous.path, piece.path);

    // Never emit a relative parent rooted at target ([]).
    if (prefix_len > 0 && prefix_len < piece.path.length) {
      const relative_parent_path = piece.path.slice(0, prefix_len);
      const previous_relative_path = previous.path.slice(prefix_len);
      const relative_path = piece.path.slice(prefix_len) as [number, ...number[]];
      const previous_relative_path_tuple = previous_relative_path as [number, ...number[]];

      if (previous_relative_path.length === 0) {
        optimized.push({
          piece,
          mode: "absolute",
          path: piece.path,
        });
        continue;
      }

      const idx = get_relative_parent_idx(relative_parent_path);

      const previous_optimized = optimized.at(-1)!;
      if (previous_optimized.mode === "absolute") {
        optimized[optimized.length - 1] = {
          piece: previous_optimized.piece,
          mode: "relative_parent",
          relative_parent_path,
          path: previous_relative_path_tuple,
          idx,
        };
      }

      optimized.push({
        piece,
        mode: "relative_parent",
        relative_parent_path,
        path: relative_path,
        idx,
      });
      continue;
    }

    optimized.push({
      piece,
      mode: "absolute",
      path: piece.path,
    });
  }

  return optimized;
}