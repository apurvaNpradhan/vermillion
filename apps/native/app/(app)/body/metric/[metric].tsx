import { useLocalSearchParams } from "expo-router";
import { BODY_METRICS } from "@workspace/shared";
import { MetricScreen } from "@/body";
import { Redirect } from "expo-router";
export default function Metric() {
  const params = useLocalSearchParams<{ metric: string }>();
  const metric = BODY_METRICS.find((metric) => metric === params.metric && metric !== "weight");
  return metric ? <MetricScreen metric={metric} /> : <Redirect href="/body/measurements" />;
}
