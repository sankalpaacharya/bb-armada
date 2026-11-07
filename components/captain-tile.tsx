import { Icon } from "@/components/ui/icon";
import { colorClass, type ColorId } from "@/lib/colors";
import { logoIcon, type LogoId } from "@/lib/logos";
import { TILE } from "@/lib/styles";
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
        TILE[size],
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
