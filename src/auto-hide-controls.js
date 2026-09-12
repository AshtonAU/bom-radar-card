const IDLE_DELAY_MS = 10_000;
const CLICK_GUARD_MS = 700;

// Keep keyboard access intact: opacity hides only the visual chrome, and
// focusin reveals it synchronously before the focused control is painted.
export function createAutoHideControls({ content, windowTarget, getActiveElement, isControlFocused, isPanelOpen }) {
  let idleTimer = null;
  let clickGuardTimer = null;
  let hidden = false;
  let disposed = false;
  let revealGesture = false;
  let suppressClick = false;
  const pointers = new Set();
  const holds = new Set();
  const listeners = [];

  const clearIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = null;
  };
  const isHeld = () => pointers.size > 0 || holds.size > 0 || isPanelOpen() || isControlFocused(getActiveElement());
  const activity = () => {
    if (disposed) return;
    clearIdle();
    hidden = false;
    content.classList.remove('is-idle');
    if (isHeld()) return;
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (disposed || isHeld()) return;
      hidden = true;
      content.classList.add('is-idle');
    }, IDLE_DELAY_MS);
  };
  const stop = event => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const isWakeSurface = event => {
    const path = event.composedPath();
    // The thin colour strip remains visible and directly opens its colour key.
    // Everywhere else, including playback and credits, the first tap wakes only.
    return path.includes(content) && !path.some(node => node.classList?.contains('legend-card'));
  };
  const clearClickGuard = () => {
    clearTimeout(clickGuardTimer);
    clickGuardTimer = null;
    suppressClick = false;
  };
  const onPointerDown = event => {
    const wakeOnly = (hidden || revealGesture) && isWakeSurface(event);
    if (!pointers.size) clearClickGuard();
    pointers.add(event.pointerId);
    if (wakeOnly) {
      revealGesture = true;
      suppressClick = true;
      stop(event);
    }
    activity();
  };
  const onPointerEnd = event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (revealGesture) {
      stop(event);
      if (!pointers.size) {
        revealGesture = false;
        // A cancelled pointer must not leave the next independent click gated.
        if (event.type === 'pointercancel') clearClickGuard();
        else clickGuardTimer = setTimeout(clearClickGuard, CLICK_GUARD_MS);
      }
    }
    activity();
  };
  const onPointerMove = event => {
    // Touch browsers can emit pointermove immediately before pointerdown. Only
    // actual mouse/pen hover should turn a wake-only tap into a normal action.
    if (event.pointerType === 'touch' && !pointers.has(event.pointerId)) return;
    if (revealGesture) stop(event);
    activity();
  };
  const onCompatibilityEvent = event => {
    // Leaflet also listens to mouse/touch events. Cancelling pointerdown alone
    // does not suppress every compatibility event (notably click/touchstart).
    if (isWakeSurface(event) && (revealGesture || suppressClick)) stop(event);
  };
  const onClick = event => {
    if (isWakeSurface(event) && (hidden || revealGesture || suppressClick)) stop(event);
    activity();
  };
  const onFocusOut = event => {
    // relatedTarget is the upcoming focused node; activeElement may still be
    // the old control while focusout is being dispatched.
    if (isControlFocused(event.relatedTarget)) return;
    activity();
    if (idleTimer === null && !isPanelOpen() && !pointers.size && !holds.size) {
      idleTimer = setTimeout(() => { idleTimer = null; activity(); }, 0);
    }
  };
  const onBlur = () => {
    pointers.clear();
    holds.clear();
    revealGesture = false;
    clearClickGuard();
    activity();
  };
  const listen = (target, type, handler) => {
    const options = { capture: true, passive: false };
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  };
  listen(content, 'pointerdown', onPointerDown);
  listen(content, 'pointermove', onPointerMove);
  listen(windowTarget, 'pointerup', onPointerEnd);
  listen(windowTarget, 'pointercancel', onPointerEnd);
  listen(windowTarget, 'blur', onBlur);
  for (const type of ['mousedown', 'mouseup', 'touchstart', 'touchmove', 'touchend', 'dblclick']) {
    listen(content, type, onCompatibilityEvent);
  }
  listen(content, 'click', onClick);
  listen(content, 'wheel', activity);
  listen(content, 'keydown', activity);
  listen(content, 'focusin', activity);
  listen(content, 'focusout', onFocusOut);
  activity();

  return {
    activity,
    hold(reason) { holds.add(reason); activity(); },
    release(reason) { holds.delete(reason); activity(); },
    destroy() {
      disposed = true;
      clearIdle();
      clearClickGuard();
      listeners.forEach(remove => remove());
      pointers.clear();
      holds.clear();
      content.classList.remove('is-idle');
    },
  };
}
