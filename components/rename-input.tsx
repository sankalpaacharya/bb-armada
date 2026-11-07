import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSdk, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";

import { cn } from "@/lib/utils";

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
    // A closing context menu hands focus back to its trigger; take it after.
    const timer = setTimeout(() => {
      ref.current?.focus();
      ref.current?.select();
    }, 60);
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
      .catch((cause: unknown) => {
        toast.error("Could not rename the thread", {
          description: cause instanceof Error ? cause.message : String(cause),
        });
      });
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
