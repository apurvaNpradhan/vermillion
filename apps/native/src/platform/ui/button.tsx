import { Button as HeroButton, cn } from "heroui-native";
import type { ComponentProps } from "react";

type ButtonProps = ComponentProps<typeof HeroButton>;

/**
 * HeroUI Button as a raised keycap: 8pt corners, 44pt tall (the touch minimum), 14pt medium label.
 * `primary` is the one bright action on a screen; `secondary` and `outline` are quiet with a
 * hairline ring; destructive actions use `danger-soft`, rose text on a faint tint with a rose
 * ring. Never use the filled `danger` variant.
 */
function ButtonRoot(props: ButtonProps) {
  return (
    <HeroButton
      {...props}
      className={cn(
        "rounded-xl",
        props.size !== "sm" && props.size !== "lg" && "h-11 px-3",
        (props.variant === "secondary" || props.variant === "outline") &&
          "border border-border bg-default",
        props.variant === "danger-soft" && "border border-danger/40",
        props.className,
      )}
    />
  );
}

function ButtonLabel({ className, ...props }: ComponentProps<typeof HeroButton.Label>) {
  return <HeroButton.Label className={cn("text-body font-medium", className)} {...props} />;
}

export const Button = Object.assign(ButtonRoot, { Label: ButtonLabel });
