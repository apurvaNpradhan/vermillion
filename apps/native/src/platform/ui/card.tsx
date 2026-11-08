import { Card as HeroCard, cn } from "heroui-native";
import type { ComponentProps } from "react";

/** HeroUI Card in Vermillion depth: `surface` plus a 1px hairline, 16pt corners, no shadow. */
function CardRoot({ className, ...props }: ComponentProps<typeof HeroCard>) {
  return <HeroCard className={cn("rounded-2xl border border-border", className)} {...props} />;
}

function CardTitle({ className, ...props }: ComponentProps<typeof HeroCard.Title>) {
  return <HeroCard.Title className={cn("font-semibold text-title-md", className)} {...props} />;
}

export const Card = Object.assign(CardRoot, {
  Header: HeroCard.Header,
  Body: HeroCard.Body,
  Footer: HeroCard.Footer,
  Title: CardTitle,
  Description: HeroCard.Description,
});
