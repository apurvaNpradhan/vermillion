import { useRouter } from "expo-router";
import { Spinner, cn, useThemeColor } from "heroui-native";
import { CaretLeft, X } from "phosphor-react-native";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";

import type { FlowPosition } from "../flow";

/** Room the pinned action takes, so the form scrolls clear of it. */
const ACTION_AREA = 96;
/** Extra room when a secondary action sits under the primary one. */
const SECONDARY_AREA = 56;

export type FlowStepAction = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Shows a spinner inside the button and ignores presses. */
  loading?: boolean;
};

/** A quieter action under the primary one, e.g. "Not now". */
export type FlowStepSecondary = { label: string; onPress: () => void; disabled?: boolean };

/** Segmented dashes: the current step in the identity colour, done steps muted, the rest hairline. */
function StepDashes({ index, total, label }: FlowPosition & { label: string }) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 1, max: total, now: index + 1 }}
      className="flex-row justify-center gap-1.5"
    >
      {Array.from({ length: total }, (_, step) => (
        <View
          key={step}
          className={cn(
            "h-1 w-8 rounded-full",
            step === index ? "bg-identity" : step < index ? "bg-muted/60" : "bg-border",
          )}
        />
      ))}
    </View>
  );
}

/**
 * The frame of one sign-up, sign-in or onboarding screen. Top row: a back chevron (a close cross
 * on the first step, nothing where there is nowhere to go) beside the flow's progress dashes.
 * Then a left-aligned title and subtitle, the screen's field as children, and one Continue button
 * pinned above the keyboard in thumb reach.
 */
export function FlowStep({
  position,
  title,
  subtitle,
  children,
  action,
  secondary,
  leading,
}: {
  position: FlowPosition;
  title: string;
  subtitle?: string;
  /** The field, its helper text and anything else that scrolls with the form. */
  children: ReactNode;
  action: FlowStepAction;
  secondary?: FlowStepSecondary;
  /** Defaults to a close cross on the first step and a back chevron after it. */
  leading?: "back" | "close" | "none";
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const foreground = useThemeColor("foreground");
  const kind = leading ?? (position.index === 0 ? "close" : "back");
  const blocked = action.disabled === true || action.loading === true;

  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));

  return (
    <View className="flex-1 bg-background">
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerClassName="grow px-5"
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: ACTION_AREA + (secondary ? SECONDARY_AREA : 0) + 24,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        bottomOffset={ACTION_AREA + (secondary ? SECONDARY_AREA : 0)}
      >
        <View className="h-11 flex-row items-center">
          <View className="w-11">
            {kind === "none" ? null : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={kind === "close" ? t("common__close") : t("nav__back")}
                onPress={leave}
                hitSlop={8}
                className="h-11 w-11 justify-center"
              >
                {kind === "close" ? (
                  <X size={22} color={foreground} />
                ) : (
                  <CaretLeft size={22} color={foreground} />
                )}
              </Pressable>
            )}
          </View>
          <View className="flex-1">
            <StepDashes
              {...position}
              label={t("onboarding__progress", {
                current: position.index + 1,
                total: position.total,
              })}
            />
          </View>
          <View className="w-11" />
        </View>
        <View className="mx-auto w-full max-w-md gap-6 pt-10">
          <View className="gap-2">
            <Text accessibilityRole="header" className="text-title-xl text-foreground">
              {title}
            </Text>
            {subtitle ? <Text className="text-body-lg text-muted">{subtitle}</Text> : null}
          </View>
          <View className="gap-3">{children}</View>
        </View>
      </KeyboardAwareScrollView>
      {/* A third-party view: Uniwind classes do not reach its style, so the pinning is inline. */}
      <KeyboardStickyView
        offset={{ closed: 0, opened: insets.bottom }}
        style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}
      >
        <View className="bg-background px-5 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
          <View className="mx-auto w-full max-w-md">
            <Button
              variant="primary"
              size="lg"
              className="h-14 rounded-xl"
              onPress={action.onPress}
              isDisabled={blocked}
              accessibilityState={{ disabled: blocked, busy: action.loading === true }}
            >
              {action.loading ? <Spinner size="sm" /> : null}
              <Button.Label className="text-body-lg font-semibold">{action.label}</Button.Label>
            </Button>
            {secondary ? (
              <Button
                variant="ghost"
                size="lg"
                className="mt-2 h-12 rounded-xl"
                onPress={secondary.onPress}
                isDisabled={secondary.disabled === true || action.loading === true}
              >
                <Button.Label className="text-body font-medium">{secondary.label}</Button.Label>
              </Button>
            ) : null}
          </View>
        </View>
      </KeyboardStickyView>
    </View>
  );
}
