const retired = new WeakSet<HTMLTextAreaElement>();

export function isCurrentEditor(box: HTMLTextAreaElement) {
  return (
    !retired.has(box) &&
    box.isConnected &&
    box.ownerDocument.getElementById(box.id) === box
  );
}

/** Hand the committed text to a fresh host without blurring or waiting for IME events.
 * Late events delivered to the retired composition host must not mutate the draft.
 */
export function handoverEditor(
  previous: HTMLTextAreaElement,
  text: string,
  selection: [number, number],
  bind: (box: HTMLTextAreaElement) => void,
  focus: boolean,
) {
  const { scrollTop, scrollLeft } = previous;
  const next = previous.cloneNode(false) as HTMLTextAreaElement;
  next.value = text;
  next.setSelectionRange(...selection);
  retired.add(previous);
  previous.replaceWith(next);
  bind(next);
  if (focus) next.focus({ preventScroll: true });
  next.setSelectionRange(...selection);
  next.scrollTop = scrollTop;
  next.scrollLeft = scrollLeft;
  return next;
}
