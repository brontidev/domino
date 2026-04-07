
import type { State } from '@domino/runtime'
import { define } from "@domino/runtime/define"
import mount from "./components/counter.domino"

export default define(({ pieces: { counter } }) => {
    mount(counter)
})
