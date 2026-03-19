import { analyze } from "@domino/analyzer";
import { ComponentWithHTML, PieceKind } from "@domino/analyzer/types";
import { Result } from "@bronti/robust/Result";
import { optimize_paths, OptimizedPath, Piece } from "./optimizer.ts";
import { ESTree, Helpers } from "node-estree";
import { generate } from "astring";

function create_program(
  import_name: string,
  module_level_body: ESTree.Node[] = [],
  function_body: ESTree.Node[] = [],
) {
  return ESTree.Program("module", [
    ESTree.ImportDeclaration([
      ESTree.ImportDefaultSpecifier(ESTree.Identifier("_mount")),
    ], ESTree.Literal(import_name)),
    ESTree.ImportDeclaration([
      ESTree.ImportNamespaceSpecifier(ESTree.Identifier("d")),
    ], ESTree.Literal("@domino/runtime/internal")),

    ...module_level_body,

    ESTree.ExportDefaultDeclaration(
      ESTree.FunctionDeclaration(ESTree.Identifier("mount"), {
        params: [
          ESTree.Identifier("target"),
          ESTree.AssignmentPattern(
            ESTree.Identifier("props"),
            Helpers.PlainObject({}),
          ),
        ],
        async: false,
        generator: false,
        body: ESTree.BlockStatement(function_body),
      }),
    ),
  ]);
}

function or_throw<T>(r: Result<T, unknown>): T {
  return r.match((a) => a, (e) => {
    throw e;
  });
}

const declare_const = (name: string, init: ESTree.Expression): ESTree.Node =>
  ESTree.VariableDeclaration([
    ESTree.VariableDeclarator(ESTree.Identifier(name), init),
  ], "const");

const scoped_piece_name = (scope: string, name: string) => `__${scope}${name}`;

const scoped_template_name = (scope: string, name: string) =>
  `_${scope}${name}_template`;

const scoped_relative_parent_name = (scope: string, idx: number) =>
  `relative_parent_${scope}${idx}`;

function generate_path(
  item: OptimizedPath,
  declared_relative_parents: Set<number>,
  root: ESTree.Expression,
  scope: string,
): ESTree.Node[] {
  const child_member = ESTree.MemberExpression(
    ESTree.Identifier("d"),
    ESTree.Identifier("child"),
  );
  const tree_member = ESTree.MemberExpression(
    ESTree.Identifier("d"),
    ESTree.Identifier("tree"),
  );

  const build_child_path = (
    start: ESTree.Expression,
    path: number[],
  ): ESTree.Expression => {
    if (path.length === 0) return start;

    if (path.length === 1) {
      return ESTree.CallExpression(child_member, [
        start,
        ESTree.Literal(path[0]),
      ]);
    }

    return ESTree.CallExpression(tree_member, [
      start,
      ...path.map((index) => ESTree.Literal(index)),
    ]);
  };

  const id = (id: string) => scoped_piece_name(scope, id);

  switch (item.mode) {
    case "absolute": {
      const init = build_child_path(root, item.path);
      return [declare_const(id(item.piece.name), init)];
    }

    case "child": {
      const init = build_child_path(
        ESTree.Identifier(id(item.from)),
        item.path,
      );
      return [declare_const(id(item.piece.name), init)];
    }

    case "next_sibling": {
      const init = ESTree.MemberExpression(
        ESTree.Identifier(id(item.from)),
        ESTree.Identifier("nextSibling"),
      );
      return [declare_const(id(item.piece.name), init)];
    }

    case "relative_parent": {
      const relative_parent_name = scoped_relative_parent_name(scope, item.idx);
      const piece_init = build_child_path(
        ESTree.Identifier(relative_parent_name),
        item.path,
      );
      const nodes: ESTree.Node[] = [];

      if (!declared_relative_parents.has(item.idx)) {
        const relative_parent_init = build_child_path(
          root,
          item.relative_parent_path,
        );
        nodes.push(declare_const(relative_parent_name, relative_parent_init));
        declared_relative_parents.add(item.idx);
      }

      nodes.push(declare_const(id(item.piece.name), piece_init));
      return nodes;
    }
  }

  const never_mode: never = item;
  throw new Error(`Unsupported optimized path mode: ${String(never_mode)}`);
}

type CompiledScope = {
  prelude: ESTree.Node[];
  pieces: ESTree.Expression;
};

const create_template = (template_name: string, source: string) => [
  declare_const(
    template_name,
    Helpers.AutoChain("document", ["createTemplate"]),
  ),
  ESTree.ExpressionStatement(
    ESTree.AssignmentExpression(
      "=",
      Helpers.AutoChain(template_name, "innerHTML"),
      ESTree.Literal(source),
    ),
  ),
];

function compile_scope(
  pieces: Piece[],
  root: ESTree.Expression,
  scope: string,
  module_level_body: ESTree.Node[],
): CompiledScope {
  const items = optimize_paths(pieces);
  const declared_relative_parents = new Set<number>();
  const prelude: ESTree.Node[] = [];
  const pieces_obj = Helpers.PlainObject({});

  for (const item of items) {
    prelude.push(
      ...generate_path(item, declared_relative_parents, root, scope),
    );
    let piece_value: ESTree.Node;

    if (item.piece.kind == PieceKind.Element) {
      piece_value = ESTree.Identifier(
        scoped_piece_name(scope, item.piece.name),
      );
    } else if (item.piece.kind == PieceKind.Text) {
      const text_node_name = scoped_piece_name(scope, `${item.piece.name}_txt`);
      prelude.push(
        declare_const(
          text_node_name,
          Helpers.AutoChain("document", ["createTextNode"]),
        ),
        Helpers.AutoChain(scoped_piece_name(scope, item.piece.name), [
          "replaceWith",
          [
            ESTree.Identifier(text_node_name),
          ],
        ]),
      );
      piece_value = ESTree.ArrowFunctionExpression(
        ESTree.AssignmentExpression(
          "=",
          Helpers.AutoChain(
            text_node_name,
            item.piece.raw ? "innerHTML" : "data",
          ),
          item.piece.raw
            ? ESTree.Identifier("value")
            : ESTree.CallExpression(ESTree.Identifier("String"), [
              ESTree.Identifier("value"),
            ]),
        ),
        { params: [ESTree.Identifier("value")] },
      );
    } else if (item.piece.kind == PieceKind.If) {
      const template_name = scoped_template_name(scope, item.piece.name);
      const child_scope = `${scope}${item.piece.name}_`;

      module_level_body.push(
        ...create_template(template_name, item.piece.html_inject),
      );

      const child_scope_result = compile_scope(
        item.piece.pieces as Piece[],
        ESTree.Identifier("element"),
        child_scope,
        module_level_body,
      );

      piece_value = Helpers.AutoChain("d", ["if", [
        ESTree.Identifier(scoped_piece_name(scope, item.piece.name)),
        ESTree.Identifier(template_name),
        ESTree.ArrowFunctionExpression(
          ESTree.BlockStatement([
            ...child_scope_result.prelude,
            ESTree.ReturnStatement(child_scope_result.pieces),
          ]),
          { params: [ESTree.Identifier("element")] },
        ),
      ]]);
    } else {
      throw new Error(`unsupported piece type`);
    }

    pieces_obj.properties.push(
      ESTree.Property(ESTree.Identifier(item.piece.name), piece_value, {
        shorthand: false,
        kind: "init",
        computed: false,
        method: false,
      }),
    );
  }

  return { prelude, pieces: pieces_obj };
}

export function compile(
  from: string | ComponentWithHTML,
  import_name: string,
): string {
  const component = typeof from == "string"
    ? or_throw(analyze(from, true))
    : from;

  const module_level_body: ESTree.Node[] = [
    ...create_template(scoped_template_name("", ""), component.html_inject),
  ];

  const compiled = compile_scope(
    component.pieces as Piece[],
    ESTree.Identifier("target"),
    "",
    module_level_body,
  );

  const function_body: ESTree.Node[] = [
    ...compiled.prelude,
    declare_const("pieces", compiled.pieces),
  ];

  return generate(
    create_program(import_name, module_level_body, function_body),
  );
}
