import { define } from "@domino/runtime/define"


export default define<{ count: number }>(({ $, pieces: { count, button } }) => {
    $.count.init(0)
    $.count.effect(current => {
        count(current.toString())
    })

    button.addEventListener("click", () => {
        $.count.update(c => c + 1)
    })
})