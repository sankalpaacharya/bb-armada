import { useRef, type KeyboardEvent, type RefObject } from "react";

export const ROW_ANCHOR = "data-armada-anchor";

/** Arrow keys move focus between the list's thread anchors. */
export function useArrowKeyRows(): {
  ref: RefObject<HTMLDivElement | null>;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
} {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      !(event.target instanceof HTMLElement) ||
      !event.target.matches(`[${ROW_ANCHOR}]`)
    )
      return;
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const anchors = Array.from(
      ref.current?.querySelectorAll<HTMLElement>(`[${ROW_ANCHOR}]`) ?? [],
    );
    const index = anchors.indexOf(event.target);
    const step = event.key === "ArrowDown" ? 1 : -1;
    anchors[Math.min(anchors.length - 1, Math.max(0, index + step))]?.focus();
  };
  return { ref, onKeyDown };
}
