import { useEffect, useRef, useState } from "react";
import { useSdk, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";

import { toastFailure } from "@/lib/toast";
import { cn } from "@/lib/utils";

/** bb's closing context menu hands focus back to the row; the field takes it after. */
const MENU_CLOSE_REFOCUS_MS = 60;

export function RenameInput({
  thread,
  onDone,
  className,
}: {
  thread: PluginSidebarThread;
  onDone: () => void;
  className?: string;
}) {
  const sdk = useSdk();
  const initial = thread.title ?? thread.displayTitle;
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const finished = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      ref.current?.focus();
      ref.current?.select();
    }, MENU_CLOSE_REFOCUS_MS);
    return () => clearTimeout(timer);
  }, []);

  const finish = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    const next = value.trim();
    onDone();
    if (!save || next === "" || next === initial) return;
    sdk.threads
      .update({ threadId: thread.id, title: next })
      .catch((cause: unknown) =>
        toastFailure("Could not rename the thread", cause),
      );
  };

  return (
    <input
      ref={ref}
      value={value}
      aria-label="Thread title"
      maxLength={200}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") finish(true);
        if (event.key === "Escape") finish(false);
      }}
      onBlur={() => finish(true)}
      className={cn(
        "min-w-0 flex-1 rounded-md border border-ring bg-background px-1.5 py-0.5 text-[13px] text-foreground outline-none",
        className,
      )}
    />
  );
}
