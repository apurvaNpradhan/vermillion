import { Link, type Href } from "expo-router";
import { Text } from "react-native";

/** A text link between auth screens. */
export function AuthLink({ href, children }: { href: Href; children: string }) {
  return (
    <Link href={href} asChild>
      <Text className="text-foreground underline">{children}</Text>
    </Link>
  );
}
