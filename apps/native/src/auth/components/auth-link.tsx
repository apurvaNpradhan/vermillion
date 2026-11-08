import { Link, type Href } from "expo-router";
import { Text } from "react-native";

/**
 * A text link between auth screens. `replace` swaps the screen instead of stacking it, for the
 * sign-in / sign-up pair, so going back and forth never builds a pile to back out of.
 */
export function AuthLink({
  href,
  replace = false,
  children,
}: {
  href: Href;
  replace?: boolean;
  children: string;
}) {
  return (
    <Link href={href} replace={replace} asChild>
      <Text className="font-semibold text-foreground">{children}</Text>
    </Link>
  );
}
