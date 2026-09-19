/** Types for node-http.mjs — see identify.d.mts for why these exist. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { HttpDecision } from './identify.mjs';

type Env = Record<string, string | undefined>;

export function readBody(req: IncomingMessage): Promise<Uint8Array>;
export function send(res: ServerResponse, decision: HttpDecision): void;
export function handleIdentify(
  req: IncomingMessage,
  res: ServerResponse,
  env?: Env,
  options?: { setupHint?: string },
): Promise<void>;
export function handleHealth(req: IncomingMessage, res: ServerResponse, env?: Env): void;
