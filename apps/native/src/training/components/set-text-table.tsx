import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";

import { SET_TONES } from "../set-tones";
import type { SetTextRow } from "../set-text-rows";

/**
 * A read-only set table as plain text: a muted caps header (SET plus the given columns), then
 * rows about 44pt high with the set marker coloured by its kind and a faint tint on alternate
 * rows. `flex` weights the data columns; `trailing` adds a mark after a row (a record medal).
 */
export function SetTextTable({
  headers,
  rows,
  flex,
  trailing,
}: {
  headers: readonly string[];
  rows: readonly SetTextRow[];
  /** A weight per data column; defaults to equal columns. */
  flex?: readonly number[];
  trailing?: (row: SetTextRow) => ReactNode;
}) {
  const { t } = useTranslation();
  const weight = (index: number) => flex?.[index] ?? 1;
  return (
    <View>
      <View className="flex-row items-center px-1 py-1">
        <Text className="w-14 font-semibold text-overline uppercase text-muted">
          {t("training__col_set")}
        </Text>
        {headers.map((header, index) => (
          <Text
            key={header}
            numberOfLines={1}
            className="font-semibold text-overline uppercase text-muted"
            style={{ flex: weight(index) }}
          >
            {header}
          </Text>
        ))}
      </View>
      {rows.map((row, index) => (
        <View
          key={row.key}
          className={`min-h-11 flex-row items-center rounded-lg px-1 ${index % 2 === 1 ? "bg-default/40" : ""}`}
        >
          <Text
            className={`w-14 font-semibold text-body ${SET_TONES[row.kind].text}`}
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {row.marker}
          </Text>
          {row.cells.map((cell, cellIndex) => (
            <Text
              key={cellIndex}
              className="text-body text-foreground"
              style={{ flex: weight(cellIndex), fontVariant: ["tabular-nums"] }}
            >
              {cell}
            </Text>
          ))}
          {trailing ? trailing(row) : null}
        </View>
      ))}
    </View>
  );
}
