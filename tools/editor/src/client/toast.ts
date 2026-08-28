export type ShowToast = (message: string, tone: "success" | "error") => void

export function createToastController(element: HTMLElement): ShowToast {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (message, tone) => {
    element.textContent = message
    element.dataset["tone"] = tone
    element.hidden = false
    if (timer) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      element.hidden = true
    }, 4_000)
  }
}
