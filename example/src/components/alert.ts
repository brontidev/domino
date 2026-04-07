// import type { State } from "domino:runtime";
// import { define } from "domino:types"

import type { State } from '@domino/runtime'
import { define } from "@domino/runtime/define"

export default define<{ text: State<string>; visible: State<boolean> }>(({ pieces: { banner }, $, props: { text, visible } }) => {
    text.init("")
    visible.init(false)

    $.effect((show, msg) => {
        banner(show)
        if (show) {
            banner.message(msg)
            banner.dismiss.addEventListener("click", () => visible.set(false))
        }
    }, visible, text)

    text.effect(msg => banner.message?.(msg))
})

