import { Redirect } from "expo-router";

/** Keep the home URL reachable when the protected app group is unavailable. */
export default function SignedOutHome() {
  return <Redirect href="/sign-in" />;
}
