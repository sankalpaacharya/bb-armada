import { toast } from "sonner";

export function toastFailure(title: string, cause: unknown): void {
  toast.error(title, {
    description: cause instanceof Error ? cause.message : String(cause),
  });
}
