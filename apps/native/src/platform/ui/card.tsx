import { Card as HeroCard, cn } from "heroui-native";
import type { ComponentProps } from "react";

/** Panels use a surface fill and rounded corners for separation. */
function CardRoot({ className, ...props }: ComponentProps<typeof HeroCard>) {
  return <HeroCard className={cn("rounded-xl border-0 shadow-none", className)} {...props} />;
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
