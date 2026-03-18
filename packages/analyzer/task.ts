import { analyze } from "./mod.ts"

const appDomino = Deno.readTextFileSync('./app.domino')
const app = analyze(appDomino, true);
console.log(Deno.inspect(app, { depth: Infinity }))