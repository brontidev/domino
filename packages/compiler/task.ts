import { compile } from "./mod.ts";

const appDomino = Deno.readTextFileSync("./demo.domino");
const script = compile(appDomino, "./demo.ts");
console.log(script);
