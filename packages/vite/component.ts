import { Plugin } from "vite";
import { compile } from "@domino/compiler";

export default function component(): Plugin {
    const td = new TextDecoder()
    return {
        name: "domino:component",
        resolveId(id) {
            if (id.endsWith(".domino")) return id;
        },
        async load(id) {
            if (!id.endsWith(".domino")) return;

            const html = await this.fs.readFile(id);

            return compile(td.decode(html), id.substring(0, id.length - ".domino".length));
        },
    };
}
