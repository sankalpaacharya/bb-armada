import { FOCUS_RING } from "../../lib/styles";
import { cn } from "../../lib/utils";

/** An on/off toggle; name it with `aria-labelledby` or `aria-label`. */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  ...aria
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  "aria-labelledby"?: string;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "group inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-input bg-transparent p-0.5 transition-colors disabled:pointer-events-none disabled:opacity-50 aria-checked:border-transparent aria-checked:bg-foreground",
        FOCUS_RING,
      )}
      {...aria}
    >
      <span
        aria-hidden="true"
        className="size-3.5 rounded-full bg-muted-foreground transition-transform group-aria-checked:translate-x-4 group-aria-checked:bg-background"
      />
    </button>
  );
}
