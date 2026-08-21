/**
 * Opening the assistant from anywhere on the page.
 *
 * `<BaBot />` is mounted once in `app/layout.tsx` and owns `open` as local
 * state — that is what lets an interview survive client-side navigation. So a
 * page cannot reach it by prop, and lifting the state into a context provider
 * would wrap the whole app to serve a single call site.
 *
 * A DOM event costs neither: anything on the page can fire it, and the widget
 * listens for as long as it is mounted. If the widget is ever absent the event
 * is simply unheard, which is the correct failure — no crash, no dead button
 * wired to a missing provider.
 */
export const BABOT_OPEN_EVENT = 'babot:open'

export function openBaBot(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(BABOT_OPEN_EVENT))
}
