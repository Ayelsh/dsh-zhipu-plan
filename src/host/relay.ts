/**
 * The authorization relay's wire client: the two calls a browser-and-poll
 * sign-in needs, over the same `fetch` every other egress point uses so the
 * process-wide proxy policy applies. Parsing is fail-closed — an envelope with
 * the wrong shape is a refused login, never a half-filled account — and the
 * relay's vocabulary stays its own: nothing here names dsh credentials.
 *
 * The relay and its envelope are an undocumented third-party contract observed
 * from ZCode (Apache-2.0); every address stays configurable for that reason.
 *
 * @module dsh-zhipu-plan/host/relay
 */

import type { ZhipuPlanDeployment } from './types.ts'

/** A one-time flow the relay opened: where to send the human, and how to wait. */
export interface RelayFlow {
  /** Relay-owned flow identity the poll addresses. */
  readonly flowId: string
  /** Page the human authorizes the sign-in on. Always https. */
  readonly authorizeUrl: string
  /** Epoch seconds the flow expires at; the attempt's deadline never extends past it. */
  readonly expiresAtSec: number
  /** Seconds the relay asks callers to wait between polls. */
  readonly pollIntervalSec: number
}

/** The human has not finished authorizing. */
export interface RelayPollPending {
  readonly status: 'pending'
}

/** The relay closed the flow without issuing tokens. */
export interface RelayPollFailed {
  readonly status: 'failed'
}

/** The account facts a finished flow carries. Labels follow the relay's wire names. */
export interface RelayPollReady {
  readonly status: 'ready'
  /** ZCode JWT issued by the relay for this sign-in. */
  readonly zcodeJwt: string
  /** Account access token under the signed-in deployment's key. */
  readonly accessToken: string
  /** Refresh token, when the deployment issues one. */
  readonly refreshToken?: string
  readonly accountId: string
  readonly accountName?: string
  readonly accountEmail?: string
  readonly accountAvatar?: string
}

/** One poll answer. */
export type RelayPoll = RelayPollPending | RelayPollFailed | RelayPollReady

/** The relay refused a call: a transport failure, a status, a business code, or unusable data. */
export class RelayError extends Error {
  /**
   * @param message - what went wrong, safe to show the user.
   * @param details - the transport status, the relay's business code, whether a
   *   retry can plausibly succeed, or any combination.
   */
  constructor(
    message: string,
    readonly details: {
      readonly httpStatus?: number
      readonly businessCode?: number
      /** True for an unreachable relay and a 5xx answer; false for everything else. */
      readonly retryable?: boolean
    } = {},
  ) {
    super(message)
    this.name = 'RelayError'
  }
}

/** Hex digits per poll token; 32 bytes is what the relay's CLI flow documents by usage. */
const POLL_TOKEN_BYTES = 32

/**
 * Create one attempt's poll token.
 * @param length - byte length of the token.
 * @returns a random hex poll token for one sign-in flow.
 */
export function createPollToken(length: number = POLL_TOKEN_BYTES): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Parse and validate one relay envelope.
 * @param status - HTTP status of the answer.
 * @param body - the decoded body text.
 * @returns the envelope's `data`, or undefined when the envelope carried none.
 * @throws RelayError on a non-2xx transport answer, a non-JSON body, or a non-zero business code.
 */
function parseEnvelope(status: number, body: string): unknown {
  if (status < 200 || status >= 300) {
    throw new RelayError(`Authorization relay answered HTTP ${status}`, {
      httpStatus: status,
      retryable: status >= 500,
    })
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new RelayError('Authorization relay returned a non-JSON answer', { httpStatus: status })
  }
  if (!isRecord(parsed) || typeof parsed['code'] !== 'number') {
    throw new RelayError('Authorization relay returned an invalid envelope', { httpStatus: status })
  }
  if (parsed['code'] !== 0) {
    const message = readString(parsed['msg']) ?? `Authorization relay business error ${String(parsed['code'])}`
    throw new RelayError(message, { httpStatus: status, businessCode: parsed['code'] })
  }
  return parsed['data']
}

/**
 * Run one relay request with the shared timeout and cancellation.
 * @param url - absolute https address to call.
 * @param init - request method, headers, and body.
 * @param timeoutMs - per-call deadline in milliseconds.
 * @param signal - the caller's cancellation.
 * @returns the answer's envelope data, or undefined when the envelope carried none.
 * @throws RelayError on a transport refusal or a non-zero business code.
 */
async function request(
  url: string,
  init: { readonly method: string; readonly headers: Record<string, string>; readonly body?: string },
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  const timeout = AbortSignal.timeout(timeoutMs)
  const composed = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
  let response: Response
  try {
    response = await fetch(url, {
      method: init.method,
      headers: init.headers,
      ...init.body === undefined ? {} : { body: init.body },
      signal: composed,
    })
  } catch (error) {
    if (signal?.aborted === true) throw error
    throw new RelayError(`Authorization relay is unreachable: ${String(error)}`, { retryable: true })
  }
  const body = await response.text()
  return parseEnvelope(response.status, body)
}

/** Parse and validate one `init` answer. */
function parseFlow(data: unknown): RelayFlow {
  if (!isRecord(data)) throw new RelayError('Authorization relay returned no flow data')
  const flowId = readString(data['flow_id'])
  const authorizeUrl = readString(data['authorize_url'])
  const expiresAtSec = readNumber(data['expires_at'])
  const pollIntervalSec = readNumber(data['poll_interval_sec'])
  if (flowId === undefined || authorizeUrl === undefined || expiresAtSec === undefined
    || pollIntervalSec === undefined || pollIntervalSec < 1) {
    throw new RelayError('Authorization relay returned an incomplete flow')
  }
  let parsedUrl: URL
  try {
    parsedUrl = new URL(authorizeUrl)
  } catch {
    throw new RelayError('Authorization relay returned an unusable authorize address')
  }
  if (parsedUrl.protocol !== 'https:') {
    throw new RelayError('Authorization relay returned a non-https authorize address')
  }
  return { flowId, authorizeUrl, expiresAtSec, pollIntervalSec }
}

/** Parse and validate one `poll` answer. */
function parsePoll(data: unknown, deployment: ZhipuPlanDeployment): RelayPoll {
  if (!isRecord(data)) throw new RelayError('Authorization relay returned no poll data')
  const status = data['status']
  if (status === 'pending') return { status: 'pending' }
  if (status === 'failed') return { status: 'failed' }
  if (status !== 'ready') throw new RelayError('Authorization relay returned an unknown poll status')
  const user = isRecord(data['user']) ? data['user'] : undefined
  const provider = isRecord(data[deployment]) ? data[deployment] : undefined
  const zcodeJwt = readString(data['token'])
  const accessToken = readString(provider?.['access_token']) ?? readString(provider?.['accessToken'])
  const accountId = readString(user?.['user_id'])
  if (zcodeJwt === undefined || accessToken === undefined || accountId === undefined) {
    throw new RelayError('Authorization relay returned an incomplete sign-in result')
  }
  const refreshToken = readString(provider?.['refresh_token']) ?? readString(provider?.['refreshToken'])
  const accountName = readString(user?.['name'])
  const accountEmail = readString(user?.['email'])
  const accountAvatar = readString(user?.['avatar'])
  return {
    status: 'ready',
    zcodeJwt,
    accessToken,
    ...refreshToken === undefined ? {} : { refreshToken },
    accountId,
    ...accountName === undefined ? {} : { accountName },
    ...accountEmail === undefined ? {} : { accountEmail },
    ...accountAvatar === undefined ? {} : { accountAvatar },
  }
}

/** The two relay calls one sign-in needs, addressed at one configured base URL. */
export class ZhipuAuthRelay {
  /**
   * @param baseUrl - relay origin plus path prefix, without a trailing slash.
   * @param requestTimeoutMs - per-call deadline in milliseconds.
   */
  constructor(private readonly baseUrl: string, private readonly requestTimeoutMs: number) {}

  /**
   * Open one sign-in flow.
   * @param deployment - deployment the human is authorizing against.
   * @param pollToken - the attempt's poll token, sent as the bearer credential.
   * @param signal - the caller's cancellation.
   * @returns the flow to open in a browser and poll.
   * @throws RelayError when the relay refuses or answers an unusable flow.
   */
  async init(deployment: ZhipuPlanDeployment, pollToken: string, signal?: AbortSignal): Promise<RelayFlow> {
    const data = await request(
      `${this.baseUrl}/oauth/cli/init`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${pollToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ provider: deployment }),
      },
      this.requestTimeoutMs,
      signal,
    )
    return parseFlow(data)
  }

  /**
   * Ask one flow whether the human has finished.
   * @param deployment - deployment the flow was opened against.
   * @param flowId - the flow the init call opened.
   * @param pollToken - the attempt's poll token.
   * @param signal - the caller's cancellation.
   * @returns pending, failed, or the finished sign-in.
   * @throws RelayError when the relay refuses the poll or answers unusable data.
   */
  async poll(
    deployment: ZhipuPlanDeployment,
    flowId: string,
    pollToken: string,
    signal?: AbortSignal,
  ): Promise<RelayPoll> {
    const data = await request(
      `${this.baseUrl}/oauth/cli/poll/${encodeURIComponent(flowId)}`,
      {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${pollToken}` },
      },
      this.requestTimeoutMs,
      signal,
    )
    return parsePoll(data, deployment)
  }
}
