import type { CardBackground } from "@workspace/ui/tokens/share-card";
import { Spinner, useThemeColor } from "heroui-native";
import { Check, Image as ImageIcon, X } from "phosphor-react-native";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  FlatList,
  PixelRatio,
  Platform,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { useRouter } from "expo-router";

import { captureDimensions } from "./capture-dimensions";
import { useCardLink, type CardLinkSource } from "./links/use-card-link";
import { CardCanvas } from "./card-canvas";
import { useCardPalettes } from "./card-theme";
import { availableBackgrounds, availableTemplates, effectiveBackground } from "./choice";
import { ImageGateProvider, useCreateImageGate } from "./image-gate-context";
import { useShareActions } from "./use-share-actions";
import { useShareChoice } from "./use-share-choice";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  type ShareKind,
  type SharePhoto,
  type ShareTemplate,
  type ShareToggle,
} from "./types";

const SIDE = 20;

/**
 * The full-screen Share composer (ADR 0042): a live preview of the card at a scaled size, a pager
 * for the templates, background swatches, privacy toggles and the two actions. It knows no card
 * content: the kind's vertical passes its templates, toggles and photo. The preview is the very
 * frame the capture saves, scaled down, so what is shown is what is saved.
 */
export function ShareComposer<Id extends string>({
  kind,
  title,
  templates,
  toggles,
  photo,
  linkSource,
}: {
  kind: ShareKind;
  title: string;
  templates: readonly ShareTemplate<Id>[];
  toggles: readonly ShareToggle<Id>[];
  /** A picture for the Photo background; omitted when the card has none. */
  photo?: SharePhoto<Id>;
  /** What the card's Share link points at; omitted for cards that have no link. */
  linkSource?: CardLinkSource<Id>;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const ink = useThemeColor("foreground");
  const muted = useThemeColor("muted");
  const { palettes } = useCardPalettes();
  const gate = useCreateImageGate();
  const actions = useShareActions(gate);
  const { choice, update } = useShareChoice(kind, templates, toggles);
  const cardLink = useCardLink(linkSource, choice.toggles);
  const pages = availableTemplates(templates, choice.toggles);
  const current = pages.find((page) => page.id === choice.template) ?? pages[0];
  const index = current ? pages.indexOf(current) : 0;
  const offered = availableBackgrounds(photo ? photo.requires : null, choice.toggles);
  const target = captureDimensions(Platform.OS, PixelRatio.get());
  const background = current ? effectiveBackground(choice.background, current, offered) : "theme";
  const [viewportHeight, setViewportHeight] = useState(0);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const pager = useRef<FlatList<ShareTemplate<Id>>>(null);
  const nodes = useRef(new Map<string, View>());

  // Keep the pager on the chosen template when the list changes under it (Show photo).
  useEffect(() => {
    if (box.width > 0 && pages.length > 0) {
      pager.current?.scrollToOffset({ offset: index * box.width, animated: false });
    }
  }, [index, pages.length, box.width]);

  if (!current) return null;
  const scale = Math.max(
    0,
    Math.min((box.width - SIDE * 2) / CARD_WIDTH, (box.height - SIDE) / CARD_HEIGHT),
  );
  const showSwatches = !current.supportsTransparent && current.fixedBackground === undefined;
  const cardTarget = (page: ShareTemplate<Id>) => ({
    view: nodes.current.get(page.id) ?? null,
    transparent: page.supportsTransparent,
  });
  // Every card of a Program in one go. A Sticker is a variant of a card, not one more card.
  const whole = pages.filter((page) => !page.supportsTransparent);

  const onSettle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = pages[Math.round(event.nativeEvent.contentOffset.x / Math.max(box.width, 1))];
    if (next && next.id !== choice.template) {
      haptic.tick();
      update({ template: next.id });
    }
  };

  return (
    <ImageGateProvider gate={gate}>
      <View
        className="flex-1 bg-background"
        style={{ paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 12) }}
        onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
      >
        <View className="h-14 flex-row items-center px-2">
          <Button
            variant="ghost"
            accessibilityLabel={t("share__close")}
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          >
            <X color={ink} />
          </Button>
          <Text
            accessibilityRole="header"
            className="flex-1 text-center font-semibold text-title-md text-foreground"
          >
            {title}
          </Text>
          <View className="w-11" />
        </View>

        {/* Only the body scrolls; growing controls cannot move Save/Share below the viewport. */}
        <ScrollView className="flex-1" contentInsetAdjustmentBehavior="never">
          <View
            style={{ height: Math.min(420, viewportHeight * 0.5) }}
            onLayout={(event) => setBox(event.nativeEvent.layout)}
          >
            {box.width > 0 ? (
              <FlatList
                ref={pager}
                data={pages}
                extraData={[choice, scale]}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={(page) => page.id}
                getItemLayout={(_, at) => ({
                  length: box.width,
                  offset: box.width * at,
                  index: at,
                })}
                initialScrollIndex={index}
                // Every page stays mounted, so Save all can capture cards that are off screen.
                initialNumToRender={pages.length}
                maxToRenderPerBatch={pages.length}
                windowSize={pages.length * 2 + 1}
                onMomentumScrollEnd={onSettle}
                renderItem={({ item }) => {
                  const own = item.supportsTransparent
                    ? "sticker"
                    : effectiveBackground(choice.background, item, offered);
                  return (
                    <View
                      accessible
                      accessibilityLabel={t("share__preview", { template: item.label })}
                      style={{
                        width: box.width,
                        height: box.height,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <View
                        className={item.supportsTransparent ? "bg-default" : "bg-surface"}
                        style={{
                          width: CARD_WIDTH * scale,
                          height: CARD_HEIGHT * scale,
                          borderRadius: 14,
                          overflow: "hidden",
                        }}
                      >
                        <View
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: target.layoutWidth,
                            height: target.layoutHeight,
                            transform: [{ scale: scale / target.designScale }],
                            transformOrigin: "top left",
                          }}
                        >
                          <CardCanvas
                            viewRef={(node) => {
                              if (node) nodes.current.set(item.id, node);
                              else nodes.current.delete(item.id);
                            }}
                            palette={palettes(own)}
                            hasRecords={item.hasRecords}
                            transparent={item.supportsTransparent}
                            photo={own === "photo" && photo ? photo.render() : null}
                            link={cardLink.link}
                          >
                            {item.render({ palette: palettes(own), toggles: choice.toggles })}
                          </CardCanvas>
                        </View>
                      </View>
                    </View>
                  );
                }}
              />
            ) : null}
          </View>

          <View className="gap-4 px-4 pt-3">
            <View className="items-center gap-2">
              <Text className="text-caption font-medium text-muted">{current.label}</Text>
              {pages.length > 1 ? (
                <View
                  className="flex-row items-center justify-center gap-2"
                  accessible
                  accessibilityLabel={t("share__page", { index: index + 1, count: pages.length })}
                >
                  {pages.map((page, at) => (
                    <View
                      key={page.id}
                      className={at === index ? "bg-foreground" : "bg-separator"}
                      style={{ width: 7, height: 7, borderRadius: 4 }}
                    />
                  ))}
                </View>
              ) : null}
            </View>

            {showSwatches ? (
              <View className="flex-row justify-center gap-5" accessibilityRole="radiogroup">
                {offered.map((option) => (
                  <Swatch
                    key={option}
                    option={option}
                    selected={option === background}
                    label={t(`share__background_${option}`)}
                    fill={palettes(option).fill}
                    dot={option === "theme" ? palettes(option).accent : null}
                    icon={option === "photo" ? <ImageIcon size={20} color={muted} /> : null}
                    onPress={() => {
                      haptic.tick();
                      update({ background: option });
                    }}
                  />
                ))}
              </View>
            ) : null}

            {toggles.length > 0 ? (
              <View className="flex-row flex-wrap justify-center gap-2">
                {toggles.map((toggle) => {
                  const on = choice.toggles[toggle.id];
                  return (
                    <Pressable
                      key={toggle.id}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={toggle.label}
                      onPress={() => {
                        haptic.tick();
                        update({ toggles: { ...choice.toggles, [toggle.id]: !on } });
                      }}
                      className={`h-9 flex-row items-center gap-1.5 rounded-full border px-3 ${
                        on ? "border-foreground bg-default" : "border-transparent bg-default"
                      }`}
                    >
                      {on ? <Check size={20} color={ink} /> : null}
                      <Text
                        className={`text-label ${on ? "font-medium text-foreground" : "text-muted"}`}
                      >
                        {toggle.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {linkSource ? (
              <View className="flex-row flex-wrap items-center justify-center gap-2">
                <Pressable
                  accessibilityRole="switch"
                  accessibilityState={{
                    checked: cardLink.enabled && cardLink.allowed,
                    disabled: !cardLink.allowed,
                  }}
                  accessibilityLabel={t("share__toggle_link")}
                  disabled={!cardLink.allowed}
                  onPress={() => {
                    haptic.tick();
                    cardLink.setEnabled(!cardLink.enabled);
                  }}
                  className={`h-9 flex-row items-center gap-1.5 rounded-full border border-transparent bg-default px-3 ${
                    cardLink.allowed ? "" : "opacity-40"
                  }`}
                >
                  {cardLink.enabled && cardLink.allowed ? <Check size={20} color={ink} /> : null}
                  <Text
                    className={`text-label ${cardLink.enabled && cardLink.allowed ? "font-medium text-foreground" : "text-muted"}`}
                  >
                    {t("share__toggle_link")}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: cardLink.busy, busy: cardLink.busy }}
                  disabled={cardLink.busy || !cardLink.allowed}
                  onPress={() => void cardLink.shareLink()}
                  className={`h-9 flex-row items-center gap-1.5 rounded-full bg-default px-3 active:opacity-60 ${
                    cardLink.allowed ? "" : "opacity-40"
                  }`}
                >
                  {cardLink.busy ? <Spinner size="sm" /> : null}
                  <Text className="text-label font-medium text-foreground">
                    {t("share__share_link")}
                  </Text>
                </Pressable>
                {cardLink.allowed ? null : (
                  <Text className="w-full text-center text-caption text-muted">
                    {t("share__link_needs_exercises")}
                  </Text>
                )}
              </View>
            ) : null}

            {actions.denied ? (
              <View className="items-center gap-2">
                <Text className="font-normal text-center text-caption text-muted">
                  {t("share__denied")}
                </Text>
                <Button variant="secondary" size="sm" onPress={() => void Linking.openSettings()}>
                  <Button.Label>{t("share__open_settings")}</Button.Label>
                </Button>
              </View>
            ) : null}

            {whole.length > 1 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  disabled: actions.busy !== null,
                  busy: actions.busy === "save-all",
                }}
                disabled={actions.busy !== null}
                onPress={() => void actions.saveAll(whole.map(cardTarget))}
                className="min-h-11 flex-row items-center justify-center gap-2 active:opacity-60"
              >
                {actions.busy === "save-all" ? <Spinner size="sm" /> : null}
                <Text className="text-label font-medium text-muted">
                  {t("share__every_card", { total: whole.length })}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
        <View className="flex-row gap-3 px-4 pt-3">
          <View className="flex-1">
            <Button
              variant="secondary"
              isDisabled={actions.busy !== null}
              accessibilityState={{ busy: actions.busy === "save" }}
              onPress={() => void actions.save(cardTarget(current))}
            >
              {actions.busy === "save" ? <Spinner size="sm" /> : null}
              <Button.Label>{t("share__save")}</Button.Label>
            </Button>
          </View>
          <View className="flex-1">
            <Button
              isDisabled={actions.busy !== null}
              accessibilityState={{ busy: actions.busy === "share" }}
              onPress={() => void cardLink.prepare().then(() => actions.share(cardTarget(current)))}
            >
              {actions.busy === "share" ? <Spinner size="sm" /> : null}
              <Button.Label>{t("share__share")}</Button.Label>
            </Button>
          </View>
        </View>
      </View>
    </ImageGateProvider>
  );
}

function Swatch({
  option,
  selected,
  label,
  fill,
  dot,
  icon,
  onPress,
}: {
  option: CardBackground;
  selected: boolean;
  label: string;
  fill: string | null;
  dot: string | null;
  icon: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      className="min-h-11 items-center gap-1"
      testID={`share-swatch-${option}`}
    >
      <View
        className={`items-center justify-center rounded-full border-2 ${
          selected ? "border-foreground" : "border-transparent"
        }`}
        style={{ width: 36, height: 36 }}
      >
        <View
          className={`items-center justify-center rounded-full ${fill ? "" : "bg-default"}`}
          style={{ width: 26, height: 26, backgroundColor: fill ?? undefined }}
        >
          {dot ? (
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
          ) : null}
          {icon}
        </View>
      </View>
      <Text className={`text-caption ${selected ? "font-medium text-foreground" : "text-muted"}`}>
        {label}
      </Text>
    </Pressable>
  );
}
