/**
 * Where an admin page sends its visitor, decided from the session and the enrolment status
 * (`admin.enrolment.status`, which answers NOT_FOUND to anyone not allow-listed).
 */
export type AdminGate = "loading" | "sign-in" | "not-found" | "enrol" | "verify" | "ready";

export type AdminGateInput = {
  sessionLoading: boolean;
  signedIn: boolean;
  enrolment:
    | { state: "loading" }
    | { state: "denied" }
    | { state: "error" }
    | { state: "known"; twoFactorEnabled: boolean; sessionVerified: boolean };
};

export function adminGate({ sessionLoading, signedIn, enrolment }: AdminGateInput): AdminGate {
  if (sessionLoading) return "loading";
  if (!signedIn) return "sign-in";
  switch (enrolment.state) {
    case "loading":
      return "loading";
    // A signed-in person who is not an admin sees the site's plain not-found page.
    case "denied":
    case "error":
      return "not-found";
    case "known":
      if (!enrolment.twoFactorEnabled) return "enrol";
      if (!enrolment.sessionVerified) return "verify";
      return "ready";
  }
}
