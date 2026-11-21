import { useMemo, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";

import { isLongMarkdown, markdownRuns } from "./markdown";

/**
 * Markdown, read only, as one block of native text (headings bold, lists bulleted, links
 * tappable for web and mail addresses). With `collapsedLines` a long text is clamped to that
 * many lines with a "More" / "Less" toggle; the labels come in as props.
 */
export function MarkdownText({
  markdown,
  collapsedLines,
  moreLabel,
  lessLabel,
}: {
  markdown: string;
  collapsedLines?: number;
  moreLabel?: string;
  lessLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const runs = useMemo(() => markdownRuns(markdown), [markdown]);
  const long = collapsedLines !== undefined && isLongMarkdown(runs, collapsedLines);
  const clamp = long && !expanded ? collapsedLines : undefined;

  return (
    <View className="items-start gap-1">
      <Text numberOfLines={clamp} className="font-normal text-body text-foreground">
        {runs.map((run, index) => {
          const href = run.href;
          const font = run.code
            ? run.bold
              ? "font-mono-medium"
              : "font-mono"
            : run.bold
              ? "font-semibold"
              : "";
          return (
            <Text
              key={index}
              accessibilityRole={href === null ? undefined : "link"}
              onPress={href === null ? undefined : () => void Linking.openURL(href)}
              className={`text-body text-foreground ${font} ${href === null ? "" : "underline"}`}
              style={{
                fontStyle: run.italic ? "italic" : "normal",
                textDecorationLine:
                  run.strike && href !== null
                    ? "underline line-through"
                    : run.strike
                      ? "line-through"
                      : href !== null
                        ? "underline"
                        : "none",
              }}
            >
              {run.text}
            </Text>
          );
        })}
      </Text>
      {long && moreLabel !== undefined && lessLabel !== undefined ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((current) => !current)}
          hitSlop={8}
          className="min-h-8 justify-center"
        >
          <Text className="text-label font-medium text-muted">
            {expanded ? lessLabel : moreLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
