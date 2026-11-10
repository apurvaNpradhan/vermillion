import { useStartSession } from "@/session";
import { TrainScreen } from "@/training";

export default function Train() {
  const { start, sheet } = useStartSession();
  return (
    <>
      <TrainScreen onStartEmpty={() => void start(null)} />
      {sheet}
    </>
  );
}
