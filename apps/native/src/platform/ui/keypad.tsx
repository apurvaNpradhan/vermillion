import { ArrowRight, Backspace, Check, Minus, Plus } from "phosphor-react-native";
import { useEffect, useRef, type ReactNode } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColor } from "heroui-native";

import { KEYPAD_DIGITS, keypadKeyOf, keypadNavOf, type KeypadKey } from "./keypad-keys";

/** Everything the keypad says; the caller passes translated text, so nothing here is hard-coded. */
export type KeypadLabels = {
  /** "Decimal point". */
  point: string;
  backspace: string;
  /** "Decrease by 2.5". */
  decrease: string;
  /** "Increase by 2.5". */
  increase: string;
  next: string;
  done: string;
};

type KeyCap = { label: string; onPress: () => void; children: ReactNode; disabled?: boolean };

function Cap({ label, onPress, children, disabled = false }: KeyCap) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      // Pressing a key must not take focus from the hidden hardware-keyboard input.
      className={`h-12 flex-1 items-center justify-center rounded-xl bg-default active:bg-field ${disabled ? "opacity-40" : ""}`}
    >
      {children}
    </Pressable>
  );
}

/**
 * A number pad for set cells: digits, a decimal point, backspace, − and + steps, Next and Done,
 * with an optional accessory slot above the keys (the plate chip of barbell exercises). It
 * replaces the system keyboard, which Android's IME handles badly in these tables, and also
 * accepts a hardware keyboard: digits, point, Backspace, Tab (Next) and Enter (Done), through
 * a hidden input that never shows a keyboard. Every key has an accessible name.
 */
export function Keypad({
  labels,
  onKey,
  onStep,
  onNext,
  onDone,
  allowPoint,
  hasNext,
  stepText,
  accessory,
}: {
  labels: KeypadLabels;
  onKey: (key: KeypadKey) => void;
  onStep: (direction: 1 | -1) => void;
  onNext: () => void;
  onDone: () => void;
  allowPoint: boolean;
  /** Whether there is another cell after this one. */
  hasNext: boolean;
  /** The step size shown on the − and + keys ("2.5"). */
  stepText: string;
  /** Anything that belongs above the keys for the cell being edited; generic on purpose. */
  accessory?: ReactNode;
}) {
  const { bottom } = useSafeAreaInsets();
  const foreground = useThemeColor("foreground");
  const input = useRef<TextInput>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);

  const digit = (value: (typeof KEYPAD_DIGITS)[number]) => (
    <Cap key={value} label={value} onPress={() => onKey(value)}>
      <Text className="text-numeric-md text-foreground" style={{ fontVariant: ["tabular-nums"] }}>
        {value}
      </Text>
    </Cap>
  );

  return (
    <View
      className="gap-2 border-t border-border bg-surface px-3 pt-3"
      style={{ paddingBottom: bottom + 8 }}
    >
      {/* Hardware keyboard: focused, invisible, never shows the IME and never keeps text. */}
      <TextInput
        ref={input}
        value=""
        onChangeText={() => undefined}
        inputMode="none"
        showSoftInputOnFocus={false}
        caretHidden
        importantForAccessibility="no"
        accessibilityElementsHidden
        onKeyPress={(event) => {
          const name = event.nativeEvent.key;
          const key = keypadKeyOf(name);
          if (key !== null) {
            if (key !== "." || allowPoint) onKey(key);
            return;
          }
          const nav = keypadNavOf(name);
          if (nav === "next") (hasNext ? onNext : onDone)();
          if (nav === "done") onDone();
        }}
        style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
      />
      {accessory ? <View className="flex-row items-center gap-2">{accessory}</View> : null}
      <View className="flex-row gap-2">
        {digit("1")}
        {digit("2")}
        {digit("3")}
        <Cap label={labels.decrease} onPress={() => onStep(-1)}>
          <View className="flex-row items-center gap-0.5">
            <Minus size={16} color={foreground} weight="bold" />
            <Text className="text-label text-foreground" style={{ fontVariant: ["tabular-nums"] }}>
              {stepText}
            </Text>
          </View>
        </Cap>
      </View>
      <View className="flex-row gap-2">
        {digit("4")}
        {digit("5")}
        {digit("6")}
        <Cap label={labels.increase} onPress={() => onStep(1)}>
          <View className="flex-row items-center gap-0.5">
            <Plus size={16} color={foreground} weight="bold" />
            <Text className="text-label text-foreground" style={{ fontVariant: ["tabular-nums"] }}>
              {stepText}
            </Text>
          </View>
        </Cap>
      </View>
      <View className="flex-row gap-2">
        {digit("7")}
        {digit("8")}
        {digit("9")}
        <Cap label={labels.next} onPress={onNext} disabled={!hasNext}>
          <ArrowRight size={20} color={foreground} weight="bold" />
        </Cap>
      </View>
      <View className="flex-row gap-2">
        <Cap label={labels.point} onPress={() => onKey(".")} disabled={!allowPoint}>
          <Text className="text-numeric-md text-foreground">.</Text>
        </Cap>
        {digit("0")}
        <Cap label={labels.backspace} onPress={() => onKey("backspace")}>
          <Backspace size={20} color={foreground} />
        </Cap>
        <Cap label={labels.done} onPress={onDone}>
          <Check size={22} color={foreground} weight="bold" />
        </Cap>
      </View>
    </View>
  );
}
