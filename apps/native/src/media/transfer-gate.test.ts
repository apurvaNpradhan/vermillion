import { describe, expect, it } from "vitest";

import { cancellable, createTransferGate, TransferCancelled } from "./transfer-gate";

describe("transfer gate", () => {
  it("is closed until the queue starts, and each start is a new generation", () => {
    const gate = createTransferGate();
    expect(gate.signal.aborted).toBe(true);
    gate.open();
    const first = gate.signal;
    expect(first.aborted).toBe(false);
    gate.close();
    expect(first.aborted).toBe(true);
    gate.open();
    expect(gate.signal).not.toBe(first);
    expect(gate.signal.aborted).toBe(false);
  });

  it("lets work finish while the gate is open", async () => {
    const gate = createTransferGate();
    gate.open();
    await expect(cancellable(gate.signal, async () => 7)).resolves.toBe(7);
  });

  it("releases the caller when the gate closes and drops the late answer", async () => {
    const gate = createTransferGate();
    gate.open();
    let answer: (value: number) => void = () => undefined;
    const pending = cancellable(
      gate.signal,
      () => new Promise<number>((resolve) => (answer = resolve)),
    );
    gate.close();
    await expect(pending).rejects.toBeInstanceOf(TransferCancelled);
    answer(1);
  });

  it("does not start work for a closed gate", async () => {
    const gate = createTransferGate();
    let started = false;
    await expect(
      cancellable(gate.signal, async () => {
        started = true;
      }),
    ).rejects.toBeInstanceOf(TransferCancelled);
    expect(started).toBe(false);
  });
});
