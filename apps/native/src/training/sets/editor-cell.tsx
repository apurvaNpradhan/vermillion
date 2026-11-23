import { memo } from "react";
import { Pressable, Text } from "react-native";

import { useCellText, useEditorKeypad } from "./editor-keypad";

/**
 * A number cell of the Workout editor's set table when the custom keypad types into it. It is a
 * pressable that shows the value, never a text input: the keypad owns the typing, so there is no
 * caret or selection to keep right, and a screen reader hears a button with its label and value.
 */
export const EditorCellButton = memo(function EditorCellButton({
  tableId,
  cellKey,
  label,
  text,
  placeholder,
}: {
  tableId: string;
  cellKey: string;
  label: string;
  /** The value as text when the cell is idle; empty when it has none. */
  text: string;
  placeholder: string;
}) {
  const keypad = useEditorKeypad();
  // Null unless this cell is the one being typed into: a keystroke re-renders only that cell.
  const typed = useCellText(keypad, cellKey);
  if (!keypad) return null;
  const active = typed !== null;
  const shown = typed ?? text;
  return (
    <Pressable
      ref={keypad.registerNode(cellKey)}
      collapsable={false}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityValue={{ text: shown === "" ? undefined : shown }}
      accessibilityState={{ selected: active }}
      onPress={() => keypad.open(tableId, cellKey)}
      className={`h-10 min-w-0 flex-1 items-center justify-center rounded-lg border px-1 ${
        active ? "border-focus-ring bg-default" : "border-transparent bg-field"
      }`}
    >
      <Text
        numberOfLines={1}
        className={`font-normal text-center text-body ${shown === "" ? "text-muted" : "text-foreground"}`}
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {shown === "" ? placeholder : shown}
      </Text>
    </Pressable>
  );
});
