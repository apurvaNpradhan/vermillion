import { Button as HeroButton, cn } from "heroui-native";
import type { ComponentProps } from "react";

type ButtonProps = ComponentProps<typeof HeroButton>;

/**
 * Filled controls with 12pt corners and 44pt standard touch targets. `primary` is the bright
 * action; `secondary` and `outline` use a quiet default fill. Destructive actions use
 * `danger-soft`, rose text on a faint tint. Callers may add an outline to mark selection.
 */
function ButtonRoot(props: ButtonProps) {
  return (
    <HeroButton
      {...props}
      className={cn(
        "rounded-xl border-0",
        props.size !== "sm" && props.size !== "lg" && "h-11 px-3",
        (props.variant === "secondary" || props.variant === "outline") && "bg-default",
        props.className,
      )}
    />
  );
}

function ButtonLabel({ className, ...props }: ComponentProps<typeof HeroButton.Label>) {
  return <HeroButton.Label className={cn("text-body font-medium", className)} {...props} />;
}

export const Button = Object.assign(ButtonRoot, { Label: ButtonLabel });
