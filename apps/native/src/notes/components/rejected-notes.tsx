import { rejectionMessageKey } from "@workspace/client/sync-rejection";
import { rejectedNoteFields, type NoteValues, type RejectedWrite } from "@workspace/sync";
import { Alert, Button, Card } from "heroui-native";
import { useState } from "react";
import { Alert as NativeAlert, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";

import { useRejectedNotes } from "../use-rejected-notes";
import { NoteForm } from "./note-form";

/** Changes the server refused, with the reason and the two ways out: edit and retry, or discard. */
export function RejectedNotes() {
  const { t } = useTranslation();
  const { writes, hasMore, loadValues, retry, discard } = useRejectedNotes();
  const [editing, setEditing] = useState<{ id: string; initial: NoteValues } | null>(null);

  if (writes.length === 0) return null;

  function confirmDiscard(id: string) {
    NativeAlert.alert(t("sync__rejected_discard_title"), t("sync__rejected_discard_body"), [
      { text: t("common__cancel"), style: "cancel" },
      {
        text: t("sync__rejected_discard_confirm"),
        style: "destructive",
        onPress: () => void discard(id),
      },
    ]);
  }

  return (
    <View className="gap-3">
      <Alert status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{t("sync__rejected_title")}</Alert.Title>
          <Alert.Description>{t("sync__rejected_description")}</Alert.Description>
        </Alert.Content>
      </Alert>
      {writes.map((write) => (
        <Card key={write.id}>
          <Card.Body className="gap-2">
            <RejectedSummary write={write} />
            {editing?.id === write.id ? (
              <NoteForm
                initial={editing.initial}
                submitLabel={t("sync__rejected_send")}
                onSubmit={async (values) => {
                  await retry(write.id, values);
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <View className="flex-row gap-2">
                {write.truncated ? null : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onPress={() =>
                      void loadValues(write).then((initial) =>
                        write.op === "DELETE"
                          ? retry(write.id, initial)
                          : setEditing({ id: write.id, initial }),
                      )
                    }
                  >
                    <Button.Label>
                      {write.op === "DELETE" ? t("sync__rejected_send") : t("sync__rejected_retry")}
                    </Button.Label>
                  </Button>
                )}
                <Button size="sm" variant="danger" onPress={() => confirmDiscard(write.id)}>
                  <Button.Label>{t("sync__rejected_discard")}</Button.Label>
                </Button>
              </View>
            )}
          </Card.Body>
        </Card>
      ))}
      {hasMore ? <Text className="text-muted text-sm">{t("sync__rejected_more")}</Text> : null}
    </View>
  );
}

function RejectedSummary({ write }: { write: RejectedWrite }) {
  const { t } = useTranslation();
  const fields = rejectedNoteFields(write);
  const operation =
    write.op === "PUT"
      ? t("sync__rejected_op_put")
      : write.op === "PATCH"
        ? t("sync__rejected_op_patch")
        : t("sync__rejected_op_delete");
  return (
    <View className="gap-1">
      <Text className="font-medium text-foreground">
        {operation}
        {fields?.title ? `: ${fields.title}` : ""}
      </Text>
      <Text className="text-muted">{t(rejectionMessageKey(write.code))}</Text>
      {write.truncated ? <Text className="text-muted">{t("sync__rejected_too_large")}</Text> : null}
    </View>
  );
}
