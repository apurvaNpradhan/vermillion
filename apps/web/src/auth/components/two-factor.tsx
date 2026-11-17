import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";

import { useT, type SiteKey } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { Input } from "@/platform/ui/input";
import { Label } from "@/platform/ui/label";

import { useTwoFactor } from "../use-email-sign-in";
import { AuthCard, FormMessage } from "./auth-card";

function CodeField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        autoComplete="one-time-code"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        autoFocus
      />
    </>
  );
}

/**
 * First visit: set up the authenticator (QR code), confirm it with a code, then see the backup
 * codes once. There is no admin without this step.
 */
export function EnrolTwoFactor({ onDone }: { onDone: () => void }) {
  const t = useT();
  const { pending, enable, verifyTotp } = useTwoFactor();
  const [setup, setSetup] = useState<{ totpURI: string; backupCodes: string[] } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [code, setCode] = useState("");
  const [failure, setFailure] = useState<SiteKey | null>(null);

  if (confirmed && setup) {
    return (
      <AuthCard title={t("admin__backup_title")} body={t("admin__backup_body")}>
        <ul className="grid grid-cols-2 gap-2 rounded-lg bg-surface-control p-3 font-mono text-sm text-text-primary">
          {setup.backupCodes.map((backup) => (
            <li key={backup}>{backup}</li>
          ))}
        </ul>
        <Button onClick={onDone}>{t("admin__backup_done")}</Button>
      </AuthCard>
    );
  }
  if (!setup) {
    return (
      <AuthCard title={t("admin__enrol_title")} body={t("admin__enrol_body")}>
        <FormMessage message={failure ? t(failure) : null} />
        <Button
          loading={pending}
          onClick={async () => {
            const result = await enable();
            if (result.data && "totpURI" in result.data && result.data.totpURI) {
              setSetup({
                totpURI: result.data.totpURI,
                backupCodes: result.data.backupCodes ?? [],
              });
            } else setFailure(result.error ?? "errors__unknown");
          }}
        >
          {t("admin__enrol_start")}
        </Button>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={t("admin__enrol_scan_title")} body={t("admin__enrol_scan_body")}>
      <div className="self-center rounded-xl bg-white p-3">
        <QRCodeSVG value={setup.totpURI} size={184} title={t("admin__enrol_qr")} />
      </div>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const result = await verifyTotp(code.trim());
          if (result.error) setFailure(result.error);
          else setConfirmed(true);
        }}
      >
        <CodeField id="enrol-code" label={t("admin__totp_label")} value={code} onChange={setCode} />
        <FormMessage message={failure ? t(failure) : null} />
        <Button type="submit" loading={pending}>
          {t("admin__enrol_confirm")}
        </Button>
      </form>
    </AuthCard>
  );
}

/** Every new admin session passes the authenticator (or a backup code) before anything else. */
export function VerifyTwoFactor({
  onDone,
  onSignOut,
}: {
  onDone: () => void;
  onSignOut: () => void;
}) {
  const t = useT();
  const { pending, verifyTotp, verifyBackupCode } = useTwoFactor();
  const [backup, setBackup] = useState(false);
  const [code, setCode] = useState("");
  const [failure, setFailure] = useState<SiteKey | null>(null);
  return (
    <AuthCard
      title={t("admin__verify_title")}
      body={backup ? t("admin__verify_backup_body") : t("admin__verify_body")}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const result = backup
            ? await verifyBackupCode(code.trim())
            : await verifyTotp(code.trim());
          if (result.error) setFailure(result.error);
          else onDone();
        }}
      >
        <CodeField
          id="verify-code"
          label={backup ? t("admin__backup_label") : t("admin__totp_label")}
          value={code}
          onChange={setCode}
        />
        <FormMessage message={failure ? t(failure) : null} />
        <Button type="submit" loading={pending}>
          {t("admin__verify_action")}
        </Button>
        <Button variant="ghost" type="button" onClick={() => setBackup((value) => !value)}>
          {backup ? t("admin__use_authenticator") : t("admin__use_backup")}
        </Button>
        <Button variant="ghost" type="button" onClick={onSignOut}>
          {t("admin__sign_out")}
        </Button>
      </form>
    </AuthCard>
  );
}
