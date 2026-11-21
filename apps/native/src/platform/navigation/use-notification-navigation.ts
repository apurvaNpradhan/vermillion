import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { ANCHORED } from "@/platform/navigation/anchored";

const bodyDestination = z.enum(["/body/weight?reminder=1", "/body/measurements?reminder=1"]);
/** Retain cold-start taps until the protected stack is ready, then consume the response once. */
export function useNotificationNavigation(ready: boolean) {
  const router = useRouter();
  const [response, setResponse] = useState<Notifications.NotificationResponse | null>(null);
  useEffect(() => {
    setResponse(Notifications.getLastNotificationResponse());
    const subscription = Notifications.addNotificationResponseReceivedListener(setResponse);
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!ready || !response) return;
    const request = response.notification.request;
    const destination = bodyDestination.safeParse(request.content.data?.url);
    if (destination.success) router.navigate(destination.data, ANCHORED);
    else if (request.identifier.startsWith("rest:"))
      router.push({ pathname: "/session/[id]", params: { id: request.identifier.slice(5) } });
    Notifications.clearLastNotificationResponse();
    setResponse(null);
  }, [ready, response, router]);
}
