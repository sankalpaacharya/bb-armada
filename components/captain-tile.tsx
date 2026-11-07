import { Icon } from "@/components/ui/icon";
import { colorClass, type ColorId } from "@/lib/colors";
import { logoIcon, type LogoId } from "@/lib/logos";
import { cn } from "@/lib/utils";

export function CaptainTile({
  logo,
  color,
  size = "row",
  className,
}: {
  logo: LogoId;
  color: ColorId;
  size?: "row" | "preview";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center text-white",
        colorClass(color),
        size === "row" ? "size-[18px] rounded-[5px]" : "size-10 rounded-[10px]",
        className,
      )}
    >
      <Icon
        name={logoIcon(logo)}
        className={size === "row" ? "size-3" : "size-6"}
      />
    </span>
  );
}
