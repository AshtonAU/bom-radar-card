export function getLayerPickerBounds({ card, viewport, topInset = 8, bottomInset = 8 }) {
  const visibleLeft = Math.max(card.left, viewport.left) + 8;
  const visibleRight = Math.min(card.right, viewport.right) - 8;
  const visibleTop = Math.max(card.top + topInset, viewport.top + 8);
  const visibleBottom = Math.min(card.bottom - bottomInset, viewport.bottom - 8);
  const width = Math.max(0, Math.min(480, visibleRight - visibleLeft));

  return {
    left: Math.max(visibleLeft, visibleRight - width) - card.left,
    top: visibleTop - card.top,
    width,
    maxHeight: Math.max(0, Math.min(480, visibleBottom - visibleTop)),
    columns: width >= 440 ? 3 : width >= 240 ? 2 : 1,
  };
}
