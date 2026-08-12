import { startStack, stopStack, StackProcesses } from "./lib/harness";

const processes: StackProcesses = { backend: null as any, frontend: null as any };

export default async function globalSetup() {
  const stack = await startStack();
  processes.backend = stack.backend;
  processes.frontend = stack.frontend;
  // Expor para o teardown via globalThis.
  (globalThis as any).__E2E_STACK__ = processes;
}

export async function globalTeardown() {
  const stack = (globalThis as any).__E2E_STACK__ as StackProcesses | undefined;
  if (stack) {
    stopStack(stack);
  }
}
