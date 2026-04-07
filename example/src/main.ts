import './style.css'
import typescriptLogo from './assets/typescript.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import mount from "./app.domino"

const app_anchor = document.querySelector<HTMLDivElement>('#app')!
mount(app_anchor)
