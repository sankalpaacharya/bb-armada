import { Icon } from "@/components/ui/icon";
import { colorClass, type ColorId } from "@/lib/colors";
import { logoIcon, type LogoId } from "@/lib/logos";
import { cn } from "@/lib/utils";

export function CaptainTile({
  logo,
  color,
  size = "md",
  className,
}: {
  logo: LogoId;
  color: ColorId;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center text-white",
        colorClass(color),
        size === "sm" && "size-5 rounded-md",
        size === "md" && "size-7 rounded-lg",
        size === "lg" && "size-10 rounded-xl",
        className,
      )}
    >
      <Icon
        name={logoIcon(logo)}
        className={cn(
          size === "sm" && "size-3",
          size === "md" && "size-4",
          size === "lg" && "size-6",
        )}
      />
    </span>
  );
}
