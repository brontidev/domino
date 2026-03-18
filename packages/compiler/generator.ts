import { ESTree, Helpers, VarDeclaration } from "node-estree";
import { generate } from "astring";

function create_program(
  import_name: string,
  module_level_body: ESTree.Node[],
  function_body: ESTree.Node[],
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
          ESTree.Identifier("props"),
        ],
        async: false,
        generator: false,
        body: ESTree.FunctionBody(function_body),
      }),
    ),
  ]);
}
