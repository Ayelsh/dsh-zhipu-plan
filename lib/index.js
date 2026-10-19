var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : /* @__PURE__ */ Symbol.for("Symbol." + name);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __decoratorStart = (base) => [, , , __create(base?.[__knownSymbol("metadata")] ?? null)];
var __decoratorStrings = ["class", "method", "getter", "setter", "accessor", "field", "value", "get", "set"];
var __expectFn = (fn) => fn !== void 0 && typeof fn !== "function" ? __typeError("Function expected") : fn;
var __decoratorContext = (kind, name, done, metadata, fns) => ({ kind: __decoratorStrings[kind], name, metadata, addInitializer: (fn) => done._ ? __typeError("Already initialized") : fns.push(__expectFn(fn || null)) });
var __decoratorMetadata = (array, target) => __defNormalProp(target, __knownSymbol("metadata"), array[3]);
var __runInitializers = (array, flags, self, value) => {
  for (var i = 0, fns = array[flags >> 1], n = fns && fns.length; i < n; i++) flags & 1 ? fns[i].call(self) : value = fns[i].call(self, value);
  return value;
};
var __decorateElement = (array, flags, name, decorators, target, extra) => {
  var fn, it, done, ctx, access, k = flags & 7, s = !!(flags & 8), p = !!(flags & 16);
  var j = k > 3 ? array.length + 1 : k ? s ? 1 : 2 : 0, key = __decoratorStrings[k + 5];
  var initializers = k > 3 && (array[j - 1] = []), extraInitializers = array[j] || (array[j] = []);
  var desc = k && (!p && !s && (target = target.prototype), k < 5 && (k > 3 || !p) && __getOwnPropDesc(k < 4 ? target : { get [name]() {
    return __privateGet(this, extra);
  }, set [name](x) {
    return __privateSet(this, extra, x);
  } }, name));
  k ? p && k < 4 && __name(extra, (k > 2 ? "set " : k > 1 ? "get " : "") + name) : __name(target, name);
  for (var i = decorators.length - 1; i >= 0; i--) {
    ctx = __decoratorContext(k, name, done = {}, array[3], extraInitializers);
    if (k) {
      ctx.static = s, ctx.private = p, access = ctx.access = { has: p ? (x) => __privateIn(target, x) : (x) => name in x };
      if (k ^ 3) access.get = p ? (x) => (k ^ 1 ? __privateGet : __privateMethod)(x, target, k ^ 4 ? extra : desc.get) : (x) => x[name];
      if (k > 2) access.set = p ? (x, y) => __privateSet(x, target, y, k ^ 4 ? extra : desc.set) : (x, y) => x[name] = y;
    }
    it = (0, decorators[i])(k ? k < 4 ? p ? extra : desc[key] : k > 4 ? void 0 : { get: desc.get, set: desc.set } : target, ctx), done._ = 1;
    if (k ^ 4 || it === void 0) __expectFn(it) && (k > 4 ? initializers.unshift(it) : k ? p ? extra = it : desc[key] = it : target = it);
    else if (typeof it !== "object" || it === null) __typeError("Object expected");
    else __expectFn(fn = it.get) && (desc.get = fn), __expectFn(fn = it.set) && (desc.set = fn), __expectFn(fn = it.init) && initializers.unshift(fn);
  }
  return k || __decoratorMetadata(array, target), desc && __defProp(target, name, desc), p ? k ^ 4 ? extra : desc : target;
};
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateIn = (member, obj) => Object(obj) !== obj ? __typeError('Cannot use the "in" operator on this value') : member.has(obj);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);

// src/host/service.ts
import { Service } from "@deepseek-ai/cordis";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { Remote, RemoteError as RemoteError2, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import z from "@deepseek-ai/schemastery";

// src/host/errors.ts
import { RemoteError } from "@deepseek-ai/dsh-typert-protocol";
function zhipuPlanError(code, message, options = {}) {
  return new RemoteError(code, message, { reason: options.reason ?? code }, options.cause === void 0 ? {} : { cause: options.cause });
}

// src/host/relay.ts
var RelayError = class extends Error {
  /**
   * @param message - what went wrong, safe to show the user.
   * @param details - the transport status, the relay's business code, whether a
   *   retry can plausibly succeed, or any combination.
   */
  constructor(message, details = {}) {
    super(message);
    this.details = details;
    this.name = "RelayError";
  }
  details;
};
var POLL_TOKEN_BYTES = 32;
function createPollToken(length = POLL_TOKEN_BYTES) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function readString(value) {
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
function readNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function parseEnvelope(status, body) {
  if (status < 200 || status >= 300) {
    throw new RelayError(`Authorization relay answered HTTP ${status}`, {
      httpStatus: status,
      retryable: status >= 500
    });
  }
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new RelayError("Authorization relay returned a non-JSON answer", { httpStatus: status });
  }
  if (!isRecord(parsed) || typeof parsed["code"] !== "number") {
    throw new RelayError("Authorization relay returned an invalid envelope", { httpStatus: status });
  }
  if (parsed["code"] !== 0) {
    const message = readString(parsed["msg"]) ?? `Authorization relay business error ${String(parsed["code"])}`;
    throw new RelayError(message, { httpStatus: status, businessCode: parsed["code"] });
  }
  return parsed["data"];
}
async function request(url, init, timeoutMs, signal) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const composed = signal === void 0 ? timeout : AbortSignal.any([signal, timeout]);
  let response;
  try {
    response = await fetch(url, {
      method: init.method,
      headers: init.headers,
      ...init.body === void 0 ? {} : { body: init.body },
      signal: composed
    });
  } catch (error) {
    if (signal?.aborted === true) throw error;
    throw new RelayError(`Authorization relay is unreachable: ${String(error)}`, { retryable: true });
  }
  const body = await response.text();
  return parseEnvelope(response.status, body);
}
function parseFlow(data) {
  if (!isRecord(data)) throw new RelayError("Authorization relay returned no flow data");
  const flowId = readString(data["flow_id"]);
  const authorizeUrl = readString(data["authorize_url"]);
  const expiresAtSec = readNumber(data["expires_at"]);
  const pollIntervalSec = readNumber(data["poll_interval_sec"]);
  if (flowId === void 0 || authorizeUrl === void 0 || expiresAtSec === void 0 || pollIntervalSec === void 0 || pollIntervalSec < 1) {
    throw new RelayError("Authorization relay returned an incomplete flow");
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(authorizeUrl);
  } catch {
    throw new RelayError("Authorization relay returned an unusable authorize address");
  }
  if (parsedUrl.protocol !== "https:") {
    throw new RelayError("Authorization relay returned a non-https authorize address");
  }
  return { flowId, authorizeUrl, expiresAtSec, pollIntervalSec };
}
function parsePoll(data, deployment) {
  if (!isRecord(data)) throw new RelayError("Authorization relay returned no poll data");
  const status = data["status"];
  if (status === "pending") return { status: "pending" };
  if (status === "failed") return { status: "failed" };
  if (status !== "ready") throw new RelayError("Authorization relay returned an unknown poll status");
  const user = isRecord(data["user"]) ? data["user"] : void 0;
  const provider = isRecord(data[deployment]) ? data[deployment] : void 0;
  const zcodeJwt = readString(data["token"]);
  const accessToken = readString(provider?.["access_token"]) ?? readString(provider?.["accessToken"]);
  const accountId = readString(user?.["user_id"]);
  if (zcodeJwt === void 0 || accessToken === void 0 || accountId === void 0) {
    throw new RelayError("Authorization relay returned an incomplete sign-in result");
  }
  const refreshToken = readString(provider?.["refresh_token"]) ?? readString(provider?.["refreshToken"]);
  const accountName = readString(user?.["name"]);
  const accountEmail = readString(user?.["email"]);
  const accountAvatar = readString(user?.["avatar"]);
  return {
    status: "ready",
    zcodeJwt,
    accessToken,
    ...refreshToken === void 0 ? {} : { refreshToken },
    accountId,
    ...accountName === void 0 ? {} : { accountName },
    ...accountEmail === void 0 ? {} : { accountEmail },
    ...accountAvatar === void 0 ? {} : { accountAvatar }
  };
}
var ZhipuAuthRelay = class {
  /**
   * @param baseUrl - relay origin plus path prefix, without a trailing slash.
   * @param requestTimeoutMs - per-call deadline in milliseconds.
   */
  constructor(baseUrl, requestTimeoutMs) {
    this.baseUrl = baseUrl;
    this.requestTimeoutMs = requestTimeoutMs;
  }
  baseUrl;
  requestTimeoutMs;
  /**
   * Open one sign-in flow.
   * @param deployment - deployment the human is authorizing against.
   * @param pollToken - the attempt's poll token, sent as the bearer credential.
   * @param signal - the caller's cancellation.
   * @returns the flow to open in a browser and poll.
   * @throws RelayError when the relay refuses or answers an unusable flow.
   */
  async init(deployment, pollToken, signal) {
    const data = await request(
      `${this.baseUrl}/oauth/cli/init`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${pollToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ provider: deployment })
      },
      this.requestTimeoutMs,
      signal
    );
    return parseFlow(data);
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
  async poll(deployment, flowId, pollToken, signal) {
    const data = await request(
      `${this.baseUrl}/oauth/cli/poll/${encodeURIComponent(flowId)}`,
      {
        method: "GET",
        headers: { "Authorization": `Bearer ${pollToken}` }
      },
      this.requestTimeoutMs,
      signal
    );
    return parsePoll(data, deployment);
  }
};

// src/host/login.ts
var LoginError = class extends Error {
  /**
   * @param kind - why the attempt ended without tokens.
   * @param message - what happened, safe to show the user.
   */
  constructor(kind, message) {
    super(message);
    this.kind = kind;
    this.name = "LoginError";
  }
  kind;
};
async function runLoginAttempt(input) {
  const { relay, deployment, pollToken, clock, timeoutMs, signal } = input;
  const minPollIntervalMs = input.minPollIntervalMs ?? 250;
  signal?.throwIfAborted();
  const startedAt = clock.now();
  const flow = await relay.init(deployment, pollToken, signal);
  input.onAuthorizeUrl?.(flow);
  const flowExpiresAtMs = flow.expiresAtSec * 1e3;
  const deadlineMs = Math.min(startedAt + timeoutMs, flowExpiresAtMs);
  const pollIntervalMs = Math.max(minPollIntervalMs, flow.pollIntervalSec * 1e3);
  for (; ; ) {
    signal?.throwIfAborted();
    if (clock.now() >= deadlineMs) {
      throw new LoginError("auth-timeout", "Authorization timed out. Please retry the sign-in.");
    }
    await clock.sleep(pollIntervalMs, signal);
    signal?.throwIfAborted();
    let answer;
    try {
      answer = await relay.poll(deployment, flow.flowId, pollToken, signal);
    } catch (error) {
      if (signal?.aborted === true) throw error;
      if (!(error instanceof RelayError) || error.details.retryable !== true) {
        throw new LoginError("auth-rejected", error instanceof Error ? error.message : String(error));
      }
      void error;
      if (clock.now() >= deadlineMs) {
        throw new LoginError("auth-timeout", "Authorization timed out. Please retry the sign-in.");
      }
      continue;
    }
    if (answer.status === "ready") return answer;
    if (answer.status === "failed") {
      throw new LoginError("auth-failed", "Authorization failed. The sign-in was not completed.");
    }
  }
}

// src/host/quota.ts
function scopeHeaders(scope) {
  return scope === void 0 ? {} : { "bigmodel-organization": scope.organizationId, "bigmodel-project": scope.projectId };
}
function isRecord2(value) {
  return typeof value === "object" && value !== null;
}
function readNumber2(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function readString2(value) {
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
function parseLimit(payload) {
  const type = readString2(payload["type"]);
  if (type === void 0) return void 0;
  const unit = readNumber2(payload["unit"]);
  const number = readNumber2(payload["number"]);
  const usage = readNumber2(payload["usage"]);
  const currentValue = readNumber2(payload["currentValue"]);
  const remaining = readNumber2(payload["remaining"]);
  const percentage = readNumber2(payload["percentage"]);
  const nextResetTime = readNumber2(payload["nextResetTime"]);
  const details = Array.isArray(payload["usageDetails"]) ? payload["usageDetails"].flatMap((entry) => {
    if (!isRecord2(entry)) return [];
    const modelCode = readString2(entry["modelCode"]);
    const displayName = readString2(entry["displayName"]);
    const usage2 = readNumber2(entry["usage"]);
    if (modelCode === void 0 && displayName === void 0 && usage2 === void 0) return [];
    return [{
      ...modelCode === void 0 ? {} : { modelCode },
      ...displayName === void 0 ? {} : { displayName },
      ...usage2 === void 0 ? {} : { usage: usage2 }
    }];
  }) : void 0;
  return {
    type,
    ...unit === void 0 ? {} : { unit },
    ...number === void 0 ? {} : { number },
    ...usage === void 0 ? {} : { usage },
    ...currentValue === void 0 ? {} : { currentValue },
    ...remaining === void 0 ? {} : { remaining },
    ...percentage === void 0 ? {} : { percentage },
    ...nextResetTime === void 0 ? {} : { nextResetTime },
    ...details === void 0 ? {} : { usageDetails: details }
  };
}
function parseQuotaPayload(data) {
  if (!isRecord2(data)) return { limits: [] };
  const level = readString2(data["level"]);
  const limits = (Array.isArray(data["limits"]) ? data["limits"] : []).flatMap((entry) => {
    if (!isRecord2(entry)) return [];
    const limit = parseLimit(entry);
    return limit === void 0 ? [] : [limit];
  });
  return { ...level === void 0 ? {} : { level }, limits };
}
function pickPrimaryLimit(limits) {
  return limits.find((limit) => limit.type === "TIME_LIMIT") ?? limits.find((limit) => limit.remaining !== void 0) ?? limits[0];
}
async function fetchQuota(input) {
  const timeout = AbortSignal.timeout(input.requestTimeoutMs);
  const composed = input.signal === void 0 ? timeout : AbortSignal.any([input.signal, timeout]);
  const path = input.scope === void 0 ? "/api/monitor/usage/quota/limit" : "/api/monitor/usage/quota/limit?type=2";
  const response = await fetch(`${input.monitorOrigin}${path}`, {
    headers: { Authorization: `Bearer ${input.planKey}`, ...scopeHeaders(input.scope) },
    signal: composed
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`the plan monitor refused the request (HTTP ${String(response.status)})`);
  }
  const envelope = JSON.parse(text);
  if (envelope["success"] === false) {
    throw new Error(`the plan monitor refused the request (HTTP ${String(response.status)})`);
  }
  return parseQuotaPayload(envelope["data"]);
}

// src/host/monitor.ts
function isRecord3(value) {
  return typeof value === "object" && value !== null;
}
function readNumber3(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function readString3(value) {
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
function readSeries(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (typeof entry === "number" && Number.isFinite(entry)) return entry;
    if (typeof entry === "string") {
      const parsed = Number.parseFloat(entry);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  });
}
async function callMonitor(input, path) {
  const timeout = AbortSignal.timeout(input.requestTimeoutMs);
  const composed = input.signal === void 0 ? timeout : AbortSignal.any([input.signal, timeout]);
  const response = await fetch(`${input.monitorOrigin}${path}`, {
    headers: { Authorization: `Bearer ${input.planKey}`, ...scopeHeaders(input.scope) },
    signal: composed
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`the plan monitor refused the request (HTTP ${String(response.status)})`);
  }
  const envelope = JSON.parse(text);
  if (envelope["success"] === false) {
    throw new Error(`the plan monitor refused the request (HTTP ${String(response.status)})`);
  }
  return isRecord3(envelope.data) ? envelope.data : {};
}
var RANGE_DAYS = { "7d": 7, "30d": 30, all: 366 };
var CALENDAR_DAYS = 366;
var ACTIVITY_CHUNK_DAYS = 366;
var USAGE_CHUNK_DAYS = 30;
var CREDIT_CHUNK_DAYS = 30;
function usageWindows(range, timeZone, now, days) {
  const span = Math.min(RANGE_DAYS[range], CALENDAR_DAYS);
  const end = dayKey(now, timeZone);
  const windows = [];
  for (let covered = 0; covered < span; covered += days) {
    const length = Math.min(days, span - covered);
    const endTime = now - covered * 864e5;
    const startTime = now - (covered + length - 1) * 864e5;
    windows.push(
      `startTime=${encodeURIComponent(`${dayKey(startTime, timeZone)} 00:00:00`)}&endTime=${encodeURIComponent(`${dayKey(endTime, timeZone)} 23:59:59`)}`
    );
  }
  const newest = windows[0];
  if (newest !== void 0) {
    windows[0] = newest.replace(/endTime=[^&]*$/, `endTime=${encodeURIComponent(`${end} 23:59:59`)}`);
  }
  return windows;
}
function usageWindow(range, timeZone, now) {
  return usageWindows(range, timeZone, now, CALENDAR_DAYS)[0] ?? "";
}
function dayKey(time, timeZone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(time));
}
function mergeModelUsage(parts) {
  const models = /* @__PURE__ */ new Map();
  const days = /* @__PURE__ */ new Set();
  let calls = 0;
  let tokens = 0;
  for (const part of parts) {
    calls += part.calls;
    tokens += part.tokens;
    for (const day of part.days) days.add(day);
    for (const model of part.models) models.set(model.model, (models.get(model.model) ?? 0) + model.tokens);
  }
  return {
    days: [...days].sort(),
    calls,
    tokens,
    models: [...models].map(([model, total]) => ({ model, tokens: total })).sort((left, right) => right.tokens - left.tokens)
  };
}
function mergeToolUsage(parts) {
  const tools = /* @__PURE__ */ new Map();
  let searches = 0;
  let webReads = 0;
  let zreads = 0;
  for (const part of parts) {
    searches += part.searches;
    webReads += part.webReads;
    zreads += part.zreads;
    for (const tool of part.tools) tools.set(tool.tool, (tools.get(tool.tool) ?? 0) + tool.calls);
  }
  return {
    searches,
    webReads,
    zreads,
    tools: [...tools].map(([tool, calls]) => ({ tool, calls })).sort((left, right) => right.calls - left.calls)
  };
}
function mergeDecodeSpeed(parts) {
  const byDay = /* @__PURE__ */ new Map();
  for (const part of parts) {
    for (const [index, day] of part.days.entries()) {
      if (byDay.has(day)) continue;
      byDay.set(day, { proMax: part.proMax[index] ?? 0, lite: part.lite[index] ?? 0 });
    }
  }
  const days = [...byDay.keys()].sort();
  return {
    days,
    proMax: days.map((day) => byDay.get(day)?.proMax ?? 0),
    lite: days.map((day) => byDay.get(day)?.lite ?? 0)
  };
}
function withScopeType(input, teamType, window) {
  return input.scope === void 0 ? window : `type=${teamType}&${window}`;
}
async function fetchModelUsage(input, window, read) {
  const data = await callMonitor(read ?? input, `/api/monitor/usage/model-usage?${withScopeType(input, "2", window)}`);
  const totals = isRecord3(data["totalUsage"]) ? data["totalUsage"] : {};
  const summaryList = Array.isArray(totals["modelSummaryList"]) ? totals["modelSummaryList"] : Array.isArray(data["modelSummaryList"]) ? data["modelSummaryList"] : [];
  const models = /* @__PURE__ */ new Map();
  for (const entry of summaryList) {
    if (!isRecord3(entry)) continue;
    const name = readString3(entry["modelName"]);
    if (name === void 0) continue;
    models.set(name, (models.get(name) ?? 0) + (readNumber3(entry["totalTokens"]) ?? 0));
  }
  return {
    days: (Array.isArray(data["x_time"]) ? data["x_time"] : []).flatMap((entry) => readString3(entry) ?? []),
    calls: readNumber3(totals["totalModelCallCount"]) ?? 0,
    tokens: readNumber3(totals["totalTokensUsage"]) ?? 0,
    models: [...models].map(([model, tokens]) => ({ model, tokens }))
  };
}
async function fetchToolUsage(input, window, read) {
  const data = await callMonitor(read ?? input, `/api/monitor/usage/tool-usage?${withScopeType(input, "2", window)}`);
  const totals = isRecord3(data["totalUsage"]) ? data["totalUsage"] : {};
  const summaryList = Array.isArray(totals["toolSummaryList"]) ? totals["toolSummaryList"] : Array.isArray(data["toolSummaryList"]) ? data["toolSummaryList"] : [];
  const tools = /* @__PURE__ */ new Map();
  for (const entry of summaryList) {
    if (!isRecord3(entry)) continue;
    const name = readString3(entry["toolName"]) ?? readString3(entry["toolCode"]);
    if (name === void 0) continue;
    tools.set(name, (tools.get(name) ?? 0) + (readNumber3(entry["totalUsageCount"]) ?? 0));
  }
  return {
    searches: readNumber3(totals["totalNetworkSearchCount"]) ?? 0,
    webReads: readNumber3(totals["totalWebReadMcpCount"]) ?? 0,
    zreads: readNumber3(totals["totalZreadMcpCount"]) ?? 0,
    tools: [...tools].map(([tool, calls]) => ({ tool, calls }))
  };
}
async function fetchActivity(input, window) {
  const data = await callMonitor(input, `/api/monitor/credit-usage/activity?type=${input.scope === void 0 ? "1" : "3"}&${window}`);
  const summary = isRecord3(data["summary"]) ? data["summary"] : {};
  const days = (Array.isArray(data["series"]) ? data["series"] : []).flatMap((entry) => {
    if (!isRecord3(entry)) return [];
    const date = readString3(entry["date"]);
    if (date === void 0) return [];
    return [{ date, tokens: readNumber3(entry["totalTokens"]) ?? 0, mcpCalls: readNumber3(entry["mcpCalls"]) ?? 0 }];
  });
  const peakDay = readString3(summary["peakDailyTokensDate"]);
  return {
    days,
    totalTokens: readNumber3(summary["totalTokens"]) ?? 0,
    peakDayTokens: readNumber3(summary["peakDailyTokens"]) ?? 0,
    ...peakDay === void 0 ? {} : { peakDay },
    totalUsageMs: readNumber3(summary["totalUsageDurationMs"]) ?? 0,
    currentStreakDays: readNumber3(summary["currentStreakDays"]) ?? 0,
    longestStreakDays: readNumber3(summary["longestStreakDays"]) ?? 0
  };
}
async function fetchCreditSummary(input, window) {
  const data = await callMonitor(input, `/api/monitor/credit-usage/usage-detail?type=${input.scope === void 0 ? "1" : "3"}&${window}&usageType=MODEL`);
  const summary = isRecord3(data["summary"]) ? data["summary"] : {};
  const metric = (key) => {
    const entry = summary[key];
    if (!isRecord3(entry)) return void 0;
    const value = entry["value"];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : void 0;
    }
    return void 0;
  };
  const cacheHitRate = metric("cacheHitRate");
  const offPeakRate = metric("offPeakUsageRate");
  const totalCredits = metric("totalCredits");
  return {
    ...cacheHitRate === void 0 ? {} : { cacheHitRate },
    ...offPeakRate === void 0 ? {} : { offPeakRate },
    ...totalCredits === void 0 ? {} : { totalCredits }
  };
}
async function fetchDecodeSpeed(input, window, read) {
  const data = await callMonitor(read ?? input, `/api/monitor/usage/model-performance-day?${window}`);
  return {
    days: (Array.isArray(data["x_time"]) ? data["x_time"] : []).flatMap((entry) => readString3(entry) ?? []),
    proMax: readSeries(data["proMaxDecodeSpeed"]),
    lite: readSeries(data["liteDecodeSpeed"])
  };
}
async function fetchSubscriptionList(input, businessToken) {
  const timeout = AbortSignal.timeout(input.requestTimeoutMs);
  const composed = input.signal === void 0 ? timeout : AbortSignal.any([input.signal, timeout]);
  if (input.scope !== void 0) {
    const response2 = await fetch(`${input.monitorOrigin}/api/biz/team/subscribe/product/querySubscribeDetail`, {
      headers: {
        Authorization: input.deployment === "zai" ? `Bearer ${businessToken}` : businessToken,
        ...scopeHeaders(input.scope)
      },
      signal: composed
    });
    return readTeamSubscription(response2);
  }
  const response = await fetch(`${input.monitorOrigin}/api/biz/subscription/list`, {
    headers: { Authorization: `Bearer ${input.planKey}` },
    signal: composed
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`the plan service refused the subscription list (HTTP ${String(response.status)})`);
  }
  const envelope = JSON.parse(text);
  if (envelope["success"] === false) {
    throw new Error(`the plan service refused the subscription list (HTTP ${String(response.status)})`);
  }
  const entries = Array.isArray(envelope.data) ? envelope.data : [];
  return entries.flatMap((entry) => {
    if (!isRecord3(entry)) return [];
    const productName = readString3(entry["productName"]);
    const status = readString3(entry["status"]);
    if (productName === void 0 || status === void 0) return [];
    const renewTime = readString3(entry["nextRenewTime"]);
    const billingCycle = readString3(entry["billingCycle"]);
    const valid = readString3(entry["valid"]);
    const period = readNumber3(entry["currentPeriod"]);
    return [{
      productName,
      status,
      inCurrentPeriod: entry["inCurrentPeriod"] === true,
      autoRenew: entry["autoRenew"] === 1 || entry["autoRenew"] === true,
      ...renewTime === void 0 ? {} : { renewTime },
      ...billingCycle === void 0 ? {} : { billingCycle },
      ...valid === void 0 ? {} : { validRange: valid },
      ...period === void 0 ? {} : { period }
    }];
  });
}
async function readTeamSubscription(response) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`the plan service refused the subscription list (HTTP ${String(response.status)})`);
  }
  const envelope = JSON.parse(text);
  if (envelope["success"] === false) {
    throw new Error(`the plan service refused the subscription list (HTTP ${String(response.status)})`);
  }
  const data = envelope.data;
  if (!isRecord3(data) || data["hasSubscription"] !== true) return [];
  const productName = readString3(data["productName"]);
  const status = readString3(data["status"]);
  if (productName === void 0 || status === void 0) return [];
  const endTime = readString3(data["subscribeEndTime"]);
  const period = readString3(data["subscribePeriod"]);
  return [{
    productName,
    status,
    inCurrentPeriod: true,
    autoRenew: false,
    ...endTime === void 0 ? {} : { renewTime: endTime },
    ...period === void 0 ? {} : { billingCycle: period }
  }];
}

// src/host/plan-key.ts
var PlanKeyError = class extends Error {
  /**
   * @param code - the wire error class a caller branches on.
   * @param message - what went wrong, safe to show the user.
   */
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "PlanKeyError";
  }
  code;
};
var INDIVIDUAL_KEY_NAME = "zcode-api-key";
var TEAM_KEY_NAME = "zcode-team-api-key";
var TEAM_KEY_TYPE = 2;
var DEFAULT_ORG_NAME = "\u9ED8\u8BA4\u673A\u6784";
var DEFAULT_PROJECT_NAME = "\u9ED8\u8BA4\u9879\u76EE";
function readString4(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : void 0;
}
function isSuccessfulCode(code) {
  return code === void 0 || code === null || code === 0 || code === 200 || code === "0" || code === "200";
}
async function callBiz(url, headers, requestTimeoutMs, signal, body) {
  const timeout = AbortSignal.timeout(requestTimeoutMs);
  const composed = signal === void 0 ? timeout : AbortSignal.any([signal, timeout]);
  let response;
  try {
    response = await fetch(url, {
      method: body === void 0 ? "GET" : "POST",
      headers,
      ...body === void 0 ? {} : { body },
      signal: composed
    });
  } catch (error) {
    if (signal?.aborted === true) throw error;
    throw new PlanKeyError("zhipu-plan/network", `the plan service is unreachable: ${String(error)}`);
  }
  let envelope;
  try {
    envelope = JSON.parse(await response.text());
  } catch {
    throw new PlanKeyError("zhipu-plan/network", `the plan service returned a non-JSON answer (HTTP ${String(response.status)})`);
  }
  if (response.status >= 400 || !isSuccessfulCode(envelope.code)) {
    const message = typeof envelope.msg === "string" && envelope.msg.length > 0 ? envelope.msg : `the plan service refused the request (HTTP ${String(response.status)})`;
    throw new PlanKeyError("zhipu-plan/network", message);
  }
  return envelope.data ?? null;
}
function pickOrgAndProject(customerInfo) {
  const organizations = customerInfo?.organizations ?? [];
  const organization = organizations.find((entry) => typeof entry.organizationName === "string" && entry.organizationName.includes(DEFAULT_ORG_NAME)) ?? organizations[0];
  const projects = organization?.projects ?? [];
  const project = projects.find((entry) => typeof entry.projectName === "string" && entry.projectName.includes(DEFAULT_PROJECT_NAME)) ?? projects[0];
  const organizationId = readString4(organization?.organizationId);
  const projectId = readString4(project?.projectId);
  if (organizationId === void 0 || projectId === void 0) {
    throw new PlanKeyError("zhipu-plan/missing-org-project", "no organization and project could be resolved for this account");
  }
  return { organizationId, projectId };
}
function bizHeaders(authorization, teamContext) {
  return {
    Authorization: authorization,
    "Content-Type": "application/json",
    ...teamContext === void 0 ? {} : {
      "bigmodel-organization": teamContext.organizationId,
      "bigmodel-project": teamContext.projectId
    }
  };
}
async function ensureProjectKey(input) {
  const { origin, location, headers, keyName, teamKeyType, requireSecret, requestTimeoutMs, signal } = input;
  const listUrl = `${origin}/api/biz/v1/organization/${encodeURIComponent(location.organizationId)}/projects/${encodeURIComponent(location.projectId)}/api_keys`;
  const listed = await callBiz(listUrl, headers, requestTimeoutMs, signal);
  const usable = listed.find((entry) => entry.name === keyName && (!teamKeyType || entry.keyType === TEAM_KEY_TYPE) && readString4(entry.apiKey) !== void 0);
  const summary = usable ?? await callBiz(listUrl, headers, requestTimeoutMs, signal, JSON.stringify(
    teamKeyType ? { name: keyName, keyType: TEAM_KEY_TYPE } : { name: keyName }
  ));
  const apiKey = readString4(summary.apiKey);
  if (apiKey === void 0) {
    throw new PlanKeyError("zhipu-plan/no-plan", "the plan service returned no API key for this account");
  }
  const secretEnvelope = await callBiz(
    `${listUrl}/copy/${encodeURIComponent(apiKey)}`,
    headers,
    requestTimeoutMs,
    signal
  );
  const secretKey = readString4(secretEnvelope.secretKey);
  if (secretKey === void 0) {
    if (requireSecret) {
      throw new PlanKeyError("zhipu-plan/no-plan", "the plan service returned no secret for this API key");
    }
    return apiKey;
  }
  return `${apiKey}.${secretKey}`;
}
async function exchangeZaiBusinessToken(account, origins, requestTimeoutMs, signal) {
  const envelope = await callBiz(
    `${origins.zaiApiOrigin}/api/auth/z/login`,
    { "Content-Type": "application/json" },
    requestTimeoutMs,
    signal,
    JSON.stringify({ token: account.accessToken })
  );
  const bizToken = readString4(envelope.access_token) ?? readString4(envelope.accessToken);
  if (bizToken === void 0) {
    throw new PlanKeyError("zhipu-plan/no-plan", "the international deployment returned no business token");
  }
  return bizToken;
}
async function resolvePlanKey(input) {
  const { deployment, planKind, account, origins, requestTimeoutMs, signal } = input;
  if (planKind === "start-plan") {
    return { key: account.zcodeJwt };
  }
  const team = planKind === "team-coding-plan";
  if (deployment === "bigmodel") {
    const origin = origins.bigmodelApiOrigin;
    const customerInfo2 = await callBiz(
      `${origin}/api/biz/customer/getCustomerInfo`,
      bizHeaders(account.accessToken),
      requestTimeoutMs,
      signal
    );
    const location2 = pickOrgAndProject(customerInfo2);
    const key2 = await ensureProjectKey({
      origin,
      location: location2,
      headers: bizHeaders(account.accessToken, team ? location2 : void 0),
      keyName: team ? TEAM_KEY_NAME : INDIVIDUAL_KEY_NAME,
      teamKeyType: team,
      requireSecret: team,
      requestTimeoutMs,
      signal
    });
    return { key: key2, ...team ? { scope: location2 } : {} };
  }
  const bizToken = await exchangeZaiBusinessToken(account, origins, requestTimeoutMs, signal);
  const customerInfo = await callBiz(
    `${origins.zaiApiOrigin}/api/biz/customer/getCustomerInfo`,
    bizHeaders(`Bearer ${bizToken}`),
    requestTimeoutMs,
    signal
  );
  const location = pickOrgAndProject(customerInfo);
  const key = await ensureProjectKey({
    origin: origins.zaiApiOrigin,
    location,
    headers: bizHeaders(`Bearer ${bizToken}`, team ? location : void 0),
    keyName: INDIVIDUAL_KEY_NAME,
    teamKeyType: false,
    requireSecret: true,
    requestTimeoutMs,
    signal
  });
  return { key, ...team ? { scope: location } : {} };
}

// src/host/reset.ts
var RESET_TYPE = { five_hour: "FIVE_HOUR", week: "WEEK" };
function isRecord4(value) {
  return typeof value === "object" && value !== null;
}
function readNumber4(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function resetHeaders(input) {
  const scope = input.scope;
  return {
    Authorization: /^Bearer\s/i.test(input.zcodeJwt) ? input.zcodeJwt : `Bearer ${input.zcodeJwt}`,
    "X-Bigmodel-Authorization": input.accessToken,
    "Bigmodel-Target-Type": scope === void 0 ? "PERSONAL" : "TEAM",
    ...scope === void 0 ? {} : { "Bigmodel-Organization": scope.organizationId, "Bigmodel-Project": scope.projectId }
  };
}
function refusalMessage(text) {
  const trimmed = text.trim();
  if (trimmed === "") return void 0;
  try {
    const parsed = JSON.parse(trimmed);
    if (isRecord4(parsed)) {
      for (const key of ["error", "message", "msg", "detail"]) {
        const value = parsed[key];
        if (typeof value === "string" && value.trim() !== "") return value.trim();
      }
      if (typeof parsed["code"] === "number" && parsed["code"] !== 0) {
        return `code ${String(parsed["code"])}`;
      }
    }
  } catch {
  }
  return trimmed.length > 200 ? `${trimmed.slice(0, 200)}\u2026` : trimmed;
}
async function callReset(input, path, body) {
  const timeout = AbortSignal.timeout(input.requestTimeoutMs);
  const composed = input.signal === void 0 ? timeout : AbortSignal.any([input.signal, timeout]);
  const response = await fetch(`${input.zcodeApiOrigin}/api/v1/coding-plan/reset${path}`, {
    method: body === void 0 ? "GET" : "POST",
    headers: body === void 0 ? resetHeaders(input) : { ...resetHeaders(input), "Content-Type": "application/json" },
    ...body === void 0 ? {} : { body },
    signal: composed
  });
  const text = await response.text();
  if (!response.ok) {
    const detail = refusalMessage(text);
    throw new Error(`the reset service refused the request (HTTP ${String(response.status)}${detail === void 0 ? "" : `: ${detail}`})`);
  }
  const envelope = JSON.parse(text);
  if (typeof envelope.code === "number" && envelope.code !== 0) {
    const detail = refusalMessage(text);
    throw new Error(`the reset service refused the request (${detail ?? `code ${String(envelope.code)}`})`);
  }
  return isRecord4(envelope.data) ? envelope.data : {};
}
async function fetchResetStatus(input) {
  const data = await callReset(input, "/status");
  const opportunities = (key) => (Array.isArray(data[key]) ? data[key] : []).flatMap((entry) => {
    if (!isRecord4(entry)) return [];
    const expireAt = readNumber4(entry["expire_at"]);
    return expireAt === void 0 ? [] : [{ expireAt }];
  });
  const history = (key) => {
    const entry = data[key];
    if (!isRecord4(entry)) return void 0;
    return readNumber4(entry["used_at"]);
  };
  const fiveHourUsedAt = history("latest_five_hour_reset_history");
  const weekUsedAt = history("latest_week_reset_history");
  return {
    fiveHour: opportunities("available_five_hour_resets"),
    week: opportunities("available_week_resets"),
    ...fiveHourUsedAt === void 0 ? {} : { fiveHourUsedAt },
    ...weekUsedAt === void 0 ? {} : { weekUsedAt },
    hasUnreadHistory: data["has_unread_history"] === true
  };
}
async function requestResetOpportunity(input, idempotencyKey) {
  assertIdempotencyKey(idempotencyKey);
  const timeout = AbortSignal.timeout(input.requestTimeoutMs);
  const composed = input.signal === void 0 ? timeout : AbortSignal.any([input.signal, timeout]);
  const response = await fetch(`${input.zcodeApiOrigin}/api/v1/coding-plan/reset/opportunity`, {
    method: "POST",
    headers: { ...resetHeaders(input), "Content-Type": "application/json" },
    body: JSON.stringify({ idempotency_key: idempotencyKey }),
    signal: composed
  });
  if (response.status === 429) {
    throw new Error("the reset service is throttling opportunity requests");
  }
  const text = await response.text();
  if (!response.ok) {
    const detail = refusalMessage(text);
    throw new Error(`the reset service refused the request (HTTP ${String(response.status)}${detail === void 0 ? "" : `: ${detail}`})`);
  }
  const envelope = JSON.parse(text);
  const data = isRecord4(envelope.data) ? envelope.data : {};
  if (envelope.code === 3301) {
    const nextTryAt = readNumber4(data["next_try_at"]);
    if (nextTryAt === void 0) throw new Error("the reset service refused the request without a retry time");
    return { granted: false, nextTryAt };
  }
  if (typeof envelope.code === "number" && envelope.code !== 0) {
    throw new Error(`the reset service refused the request (code ${String(envelope.code)})`);
  }
  if (data["granted"] !== true) throw new Error("the reset service refused the request without a verdict");
  return { granted: true };
}
async function useReset(input, kind, idempotencyKey) {
  assertIdempotencyKey(idempotencyKey);
  const data = await callReset(input, "/use", JSON.stringify({
    idempotency_key: idempotencyKey,
    reset_type: RESET_TYPE[kind]
  }));
  if (data["used"] !== true) throw new Error("the reset service did not confirm the reset");
}
async function markResetHistoryRead(input) {
  await callReset(input, "/history/read", JSON.stringify({}));
}
function assertIdempotencyKey(value) {
  if (value.trim().length === 0 || value.length > 64) {
    throw new Error("the reset idempotency key must be 1 to 64 characters");
  }
}

// src/host/record.ts
import { credentialKey } from "@deepseek-ai/dsh-credentials";
var RECORD_SCOPE = "zhipu-plan";
var ACCOUNT_RECORD_ID = "account";
function accountRecordKey() {
  return credentialKey(RECORD_SCOPE, ACCOUNT_RECORD_ID);
}
function isDeployment(value) {
  return value === "bigmodel" || value === "zai";
}
function isPlanKind(value) {
  return value === "individual-coding-plan" || value === "team-coding-plan" || value === "start-plan";
}
function optionalTime(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function readAccountPayload(record) {
  if (record === void 0) return void 0;
  if (record.kind !== "grant") throw new Error("zhipu plan: the stored account record is not a grant");
  const payload = record.payload;
  if (typeof payload !== "object" || payload === null) throw new Error("zhipu plan: the stored account payload is not an object");
  const fields = payload;
  const { deployment, planKind, accountId, accountLabel, accessToken, zcodeJwt } = fields;
  if (!isDeployment(deployment)) throw new Error("zhipu plan: the stored account names an unknown deployment");
  if (!isPlanKind(planKind)) throw new Error("zhipu plan: the stored account names an unknown plan kind");
  if (typeof accountId !== "string" || accountId === "") throw new Error("zhipu plan: the stored account has no identifier");
  if (typeof accountLabel !== "string") throw new Error("zhipu plan: the stored account has no label");
  if (typeof accessToken !== "string" || accessToken === "") throw new Error("zhipu plan: the stored account has no access token");
  if (typeof zcodeJwt !== "string") throw new Error("zhipu plan: the stored account has no ZCode JWT field");
  const signedInAt = optionalTime(fields.signedInAt);
  if (signedInAt === void 0) throw new Error("zhipu plan: the stored account has no sign-in time");
  const scope = organizationScope(fields);
  return {
    deployment,
    planKind,
    accountId,
    accountLabel,
    accessToken,
    zcodeJwt,
    accessTokenExpiresAt: optionalTime(fields.accessTokenExpiresAt),
    jwtExpiresAt: optionalTime(fields.jwtExpiresAt),
    ...scope === void 0 ? {} : scope,
    signedInAt
  };
}
function organizationScope(fields) {
  const { organizationId, projectId } = fields;
  if (organizationId === void 0 && projectId === void 0) return void 0;
  if (typeof organizationId !== "string" || organizationId === "") {
    throw new Error("zhipu plan: the stored account names an organization without an id");
  }
  if (typeof projectId !== "string" || projectId === "") {
    throw new Error("zhipu plan: the stored account names a project without an id");
  }
  return { organizationId, projectId };
}

// src/host/service.ts
async function inBatches(items, size, read) {
  const readings = [];
  for (let index = 0; index < items.length; index += size) {
    readings.push(...await Promise.all(items.slice(index, index + size).map((item) => read(item))));
  }
  return readings;
}
async function readBestEffort(windows, read, signal, onFailure) {
  const readings = await inBatches(windows, 4, async (window) => {
    try {
      return await read(window);
    } catch (error) {
      if (signal?.aborted === true) throw error;
      onFailure(error);
      return void 0;
    }
  });
  return readings.filter((reading) => reading !== void 0);
}
var Config = z.object({
  relayBaseUrl: z.string().default("https://zcode.z.ai/api/v1"),
  requestTimeoutMs: z.natural().min(1e3).default(15e3),
  loginTimeoutMs: z.natural().min(1e3).default(3e5),
  bigmodelApiOrigin: z.string().default("https://open.bigmodel.cn"),
  zaiApiOrigin: z.string().default("https://api.z.ai"),
  zcodeApiOrigin: z.string().default("https://zcode.z.ai"),
  planKeyEnvs: z.object({
    bigmodel: z.string().default("DSH_ZHIPU_PLAN_KEY"),
    zai: z.string().default("DSH_ZHIPU_PLAN_KEY_ZAI")
  })
});
function accountView(payload, now) {
  return {
    deployment: payload.deployment,
    planKind: payload.planKind,
    accountId: payload.accountId,
    accountLabel: payload.accountLabel,
    // Absent rather than undefined: the Remote boundary carries JSON only, and
    // an unusable expiry is a fact the surface reads as "not reported".
    ...payload.accessTokenExpiresAt === void 0 ? {} : { accessTokenExpiresAt: payload.accessTokenExpiresAt },
    ...payload.jwtExpiresAt === void 0 ? {} : { jwtExpiresAt: payload.jwtExpiresAt },
    jwtExpired: payload.jwtExpiresAt === void 0 ? false : payload.jwtExpiresAt <= now
  };
}
var QUOTA_MIN_INTERVAL_MS = 3e4;
function accountScope(account) {
  const { organizationId, projectId } = account;
  return organizationId === void 0 || projectId === void 0 ? void 0 : { organizationId, projectId };
}
function accountGrant(payload) {
  const { accessTokenExpiresAt, jwtExpiresAt, organizationId, projectId, ...required } = payload;
  return {
    kind: "grant",
    payload: {
      ...required,
      ...accessTokenExpiresAt === void 0 ? {} : { accessTokenExpiresAt },
      ...jwtExpiresAt === void 0 ? {} : { jwtExpiresAt },
      ...organizationId === void 0 ? {} : { organizationId },
      ...projectId === void 0 ? {} : { projectId }
    }
  };
}
function accountPayloadFor(deployment, planKind, ready) {
  return {
    deployment,
    planKind,
    accountId: ready.accountId,
    accountLabel: ready.accountName ?? ready.accountEmail ?? ready.accountId,
    accessToken: ready.accessToken,
    zcodeJwt: ready.zcodeJwt,
    accessTokenExpiresAt: void 0,
    jwtExpiresAt: jwtExpiryMs(ready.zcodeJwt),
    signedInAt: Date.now()
  };
}
function jwtExpiryMs(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return void 0;
  try {
    const json = atob(parts[1].replaceAll("-", "+").replaceAll("_", "/"));
    const payload = JSON.parse(json);
    if (typeof payload !== "object" || payload === null) return void 0;
    const exp = payload["exp"];
    return typeof exp === "number" && Number.isFinite(exp) ? exp * 1e3 : void 0;
  } catch {
    return void 0;
  }
}
var _logout_dec, _cancelLogin_dec, _loginState_dec, _beginLogin_dec, _refreshCredential_dec, _markResetHistoryRead_dec, _requestResetOpportunity_dec, _useReset_dec, _resetStatus_dec, _usage_dec, _quota_dec, _status_dec, _a, _init, _b;
var ZhipuPlanService = class extends (_b = TypertRemoteService) {
  /**
   * @param ctx - host context carrying the credential and authorization seams.
   * @param config - validated relay address and deadlines.
   */
  constructor(ctx, config) {
    super(ctx, "zhipuPlan", { namespace: "zhipuPlan" });
    __runInitializers(_init, 5, this);
    __publicField(this, "relay");
    __publicField(this, "config");
    __publicField(this, "currentLoginState", { state: "idle" });
    /** Deployment the running or next attempt authorizes against, as the surface chose it. */
    __publicField(this, "requestedDeployment", "zai");
    /** Entitlement the running or next attempt resolves credentials for, as the surface chose it. */
    __publicField(this, "requestedPlanKind", "individual-coding-plan");
    __publicField(this, "lastQuota");
    __publicField(this, "quotaFetchStartedAt", 0);
    this.config = config;
    this.relay = new ZhipuAuthRelay(config.relayBaseUrl, config.requestTimeoutMs);
  }
  /** Register the login flow with the authorization seam for this fiber. */
  [(_a = Service.init, _status_dec = [Remote], _quota_dec = [Remote], _usage_dec = [Remote], _resetStatus_dec = [Remote], _useReset_dec = [Remote], _requestResetOpportunity_dec = [Remote], _markResetHistoryRead_dec = [Remote], _refreshCredential_dec = [Remote("refreshCredential")], _beginLogin_dec = [Remote("beginLogin")], _loginState_dec = [Remote], _cancelLogin_dec = [Remote], _logout_dec = [Remote], _a)]() {
    this.ctx.effect(() => this.ctx.authorization.registerFlow(this.loginFlow()), "zhipu-plan.loginFlow");
    void this.syncProviderRoutes().catch((error) => {
      this.ctx.logger.warn("zhipu-plan: provider route sync failed: %s", error);
    });
  }
  async status() {
    const payload = await this.account();
    if (payload === void 0) return { state: "signed-out" };
    return { state: "signed-in", account: accountView(payload, Date.now()) };
  }
  async quota(signal) {
    const account = await this.account();
    if (account === void 0) {
      throw zhipuPlanError("zhipu-plan/not-signed-in", "no Zhipu account is signed in", { reason: "not-signed-in" });
    }
    const now = Date.now();
    const elapsed = now - this.quotaFetchStartedAt;
    if (this.lastQuota !== void 0 && elapsed < QUOTA_MIN_INTERVAL_MS) return this.lastQuota;
    this.quotaFetchStartedAt = now;
    let refused = false;
    try {
      const key = await this.planKeyFor(account);
      const scope = accountScope(account);
      const fetched = await fetchQuota({
        deployment: account.deployment,
        planKey: key,
        monitorOrigin: account.deployment === "zai" ? this.config.zaiApiOrigin : this.config.bigmodelApiOrigin,
        ...scope === void 0 ? {} : { scope },
        requestTimeoutMs: this.config.requestTimeoutMs,
        signal
      });
      const primary = pickPrimaryLimit(fetched.limits);
      this.lastQuota = {
        deployment: account.deployment,
        fetchedAt: now,
        stale: false,
        ...fetched.level === void 0 ? {} : { level: fetched.level },
        limits: fetched.limits,
        ...primary === void 0 ? {} : { primary }
      };
    } catch (error) {
      if (signal.aborted) throw error;
      this.quotaFetchStartedAt = 0;
      refused = true;
    }
    if (this.lastQuota === void 0) {
      return { deployment: account.deployment, fetchedAt: now, stale: true, limits: [] };
    }
    return refused ? { ...this.lastQuota, stale: true } : this.lastQuota;
  }
  async usage(range, timeZone, signal) {
    const account = await this.account();
    if (account === void 0) {
      throw zhipuPlanError("zhipu-plan/not-signed-in", "no Zhipu account is signed in", { reason: "not-signed-in" });
    }
    const scope = accountScope(account);
    const read = {
      deployment: account.deployment,
      planKey: await this.planKeyFor(account),
      monitorOrigin: account.deployment === "zai" ? this.config.zaiApiOrigin : this.config.bigmodelApiOrigin,
      ...scope === void 0 ? {} : { scope },
      requestTimeoutMs: this.config.requestTimeoutMs,
      signal
    };
    const now = Date.now();
    const breakdownRange = range === "all" ? "30d" : range;
    const breakdownWindows = usageWindows(breakdownRange, timeZone, now, USAGE_CHUNK_DAYS);
    const creditWindows = usageWindows(breakdownRange, timeZone, now, CREDIT_CHUNK_DAYS);
    const activityWindow = usageWindows(range, timeZone, now, ACTIVITY_CHUNK_DAYS)[0] ?? usageWindow(range, timeZone, now);
    const warn = (family) => (error) => {
      this.ctx.logger.warn("zhipu-plan: usage family %s unavailable: %s", family, error);
    };
    let activity;
    try {
      activity = await fetchActivity(read, activityWindow);
    } catch (error) {
      if (signal.aborted) throw error;
      throw zhipuPlanError("zhipu-plan/network", "the plan monitor could not be reached", { cause: error });
    }
    const bestEffort = async (family, windows, readWindow) => readBestEffort(windows, readWindow, signal, warn(family));
    const [modelParts, toolParts, decodeParts] = await Promise.all([
      bestEffort("models", breakdownWindows, (window) => fetchModelUsage(read, window, read)),
      bestEffort("tools", breakdownWindows, (window) => fetchToolUsage(read, window, read)),
      bestEffort("decodeSpeed", breakdownWindows, (window) => fetchDecodeSpeed(read, window, read))
    ]);
    const [credits, subscriptions] = await Promise.all([
      fetchCreditSummary(read, creditWindows[0] ?? activityWindow).catch((error) => {
        if (signal.aborted) throw error;
        warn("credits")(error);
        return {};
      }),
      fetchSubscriptionList(read, account.accessToken).catch((error) => {
        if (signal.aborted) throw error;
        warn("subscriptions")(error);
        return [];
      })
    ]);
    return {
      deployment: account.deployment,
      range,
      fetchedAt: Date.now(),
      models: mergeModelUsage(modelParts),
      tools: mergeToolUsage(toolParts),
      activity,
      credits,
      decodeSpeed: mergeDecodeSpeed(decodeParts),
      subscriptions
    };
  }
  async resetStatus(signal) {
    const account = await this.account();
    if (account === void 0) {
      throw zhipuPlanError("zhipu-plan/not-signed-in", "no Zhipu account is signed in", { reason: "not-signed-in" });
    }
    try {
      return await fetchResetStatus(this.resetRead(account, signal));
    } catch (error) {
      if (signal.aborted) throw error;
      throw zhipuPlanError("zhipu-plan/network", "the reset service could not be reached", { cause: error });
    }
  }
  async useReset(kind, idempotencyKey, signal) {
    const account = await this.account();
    if (account === void 0) {
      throw zhipuPlanError("zhipu-plan/not-signed-in", "no Zhipu account is signed in", { reason: "not-signed-in" });
    }
    try {
      await useReset(this.resetRead(account, signal), kind, idempotencyKey);
    } catch (error) {
      if (signal.aborted) throw error;
      throw zhipuPlanError("zhipu-plan/rejected", "the reset service refused the reset", { reason: "reset-refused", cause: error });
    }
  }
  async requestResetOpportunity(idempotencyKey, signal) {
    const account = await this.account();
    if (account === void 0) {
      throw zhipuPlanError("zhipu-plan/not-signed-in", "no Zhipu account is signed in", { reason: "not-signed-in" });
    }
    try {
      return await requestResetOpportunity(this.resetRead(account, signal), idempotencyKey);
    } catch (error) {
      if (signal.aborted) throw error;
      throw zhipuPlanError("zhipu-plan/rejected", "the reset service refused the request", { reason: "reset-refused", cause: error });
    }
  }
  async markResetHistoryRead(signal) {
    const account = await this.account();
    if (account === void 0) {
      throw zhipuPlanError("zhipu-plan/not-signed-in", "no Zhipu account is signed in", { reason: "not-signed-in" });
    }
    try {
      await markResetHistoryRead(this.resetRead(account, signal));
    } catch (error) {
      if (signal.aborted) throw error;
      throw zhipuPlanError("zhipu-plan/rejected", "the reset service refused the request", { reason: "reset-refused", cause: error });
    }
  }
  /** Reset-service addressing for one stored account. */
  resetRead(account, signal) {
    const scope = accountScope(account);
    return {
      zcodeApiOrigin: this.config.zcodeApiOrigin,
      zcodeJwt: account.zcodeJwt,
      accessToken: account.accessToken,
      ...scope === void 0 ? {} : { scope },
      requestTimeoutMs: this.config.requestTimeoutMs,
      signal
    };
  }
  /** The credential reference one deployment's resolved plan key is stored under. */
  planKeyRef(deployment) {
    return credentialRef(this.config.planKeyEnvs[deployment]);
  }
  /** The pi-ai provider route one deployment's GLM models serve through. */
  providerRoute(deployment) {
    return deployment === "bigmodel" ? "zai-coding-cn" : "zai";
  }
  /**
   * Point the shipped pi-ai coding routes at the signed-in deployment's
   * credential reference, or clear both when no account is stored. The
   * routes live in the `llm-pi-ai` entry's settings document — the same
   * document the Models page edits — because a bundle patch row that
   * overrides another bundle's row outlives this bundle and keeps the
   * plugin manager from uninstalling it. Idempotent: only drift writes.
   * @throws when the settings write is refused; the caller owns reporting.
   */
  async syncProviderRoutes() {
    const account = readAccountPayload(await this.ctx.credentials.readRecord(accountRecordKey()));
    const lit = account === void 0 ? void 0 : this.providerRoute(account.deployment);
    const routes = this.providerRoutesInSettings();
    const ops = [];
    for (const route of ["zai", "zai-coding-cn"]) {
      const wanted = route === lit ? this.config.planKeyEnvs[account.deployment] : void 0;
      if (routes[route] === wanted) continue;
      ops.push(wanted === void 0 ? { op: "unset", path: ["providers", route] } : { op: "set", path: ["providers", route], value: { apiKeyEnv: wanted } });
    }
    if (ops.length === 0) return;
    await this.ctx.settings.mutate("llm-pi-ai", ops);
  }
  /** The coding routes' credential references currently in the settings document. */
  providerRoutesInSettings() {
    const settings = this.ctx.settings;
    const form = settings.describe().find((descriptor) => descriptor.ns === "llm-pi-ai");
    const providers = form?.value?.providers ?? {};
    return { zai: providers.zai?.apiKeyEnv, "zai-coding-cn": providers["zai-coding-cn"]?.apiKeyEnv };
  }
  /** The plan key one stored account currently authenticates the monitor with. */
  async planKeyFor(account) {
    if (account.planKind === "start-plan") return account.zcodeJwt;
    return await this.ctx.credentials.resolve(this.planKeyRef(account.deployment)).then((resolved) => resolved?.value).then((value) => {
      if (value === void 0 || value === "") {
        throw zhipuPlanError("zhipu-plan/not-signed-in", "no plan credential is stored; sign in again", { reason: "no-plan-key" });
      }
      return value;
    });
  }
  async refreshCredential() {
    const account = await this.account();
    if (account === void 0) {
      throw zhipuPlanError("zhipu-plan/not-signed-in", "no Zhipu account is signed in", { reason: "not-signed-in" });
    }
    const refreshed = await this.storePlanCredential(account);
    await this.ctx.credentials.modifyRecord(accountRecordKey(), () => {
      return Promise.resolve(accountGrant(refreshed));
    });
    return { accepted: true };
  }
  async beginLogin(deployment, planKind, signal) {
    if (this.ctx.authorization.describe(accountRecordKey()) === void 0) {
      throw zhipuPlanError("zhipu-plan/rejected", "the sign-in flow is not registered", { reason: "no-flow" });
    }
    if (this.currentLoginState.state === "waiting") {
      throw zhipuPlanError("zhipu-plan/rejected", "a sign-in is already running", { reason: "already-waiting" });
    }
    this.requestedDeployment = deployment;
    this.requestedPlanKind = planKind;
    this.currentLoginState = { state: "waiting" };
    const outcome = await this.ctx.authorization.begin({
      key: accountRecordKey(),
      interaction: {
        notify: (notice) => {
          this.currentLoginState = { state: "waiting", ...notice.url === void 0 ? {} : { authorizeUrl: notice.url } };
        },
        // The deployment arrives with the request, so the flow asks nothing;
        // a surface without a prompt seat still renders the whole sign-in.
        prompt: () => Promise.reject(new RemoteError2("zhipu-plan/rejected", "this sign-in asks no questions", { reason: "no-prompt" }))
      },
      signal
    });
    this.currentLoginState = outcome.status === "authorized" ? { state: "signed-in" } : { state: "idle" };
    return { accepted: true };
  }
  loginState() {
    return this.currentLoginState;
  }
  cancelLogin() {
    this.ctx.authorization.cancel(accountRecordKey());
  }
  async logout() {
    await this.ctx.credentials.deleteRecord(accountRecordKey());
    this.onSignedOut();
  }
  /**
   * Read the stored account payload.
   * @returns the account, or undefined when no record is stored.
   * @throws RemoteError when the record does not parse.
   */
  async account() {
    let record;
    try {
      record = await this.ctx.credentials.readRecord(accountRecordKey());
      return readAccountPayload(record);
    } catch (error) {
      throw zhipuPlanError(
        "zhipu-plan/rejected",
        "the stored Zhipu account record is unreadable",
        { reason: "account-record-unreadable", cause: error }
      );
    }
  }
  /** The flow this plugin registers: keyed by the record it writes. */
  loginFlow() {
    return {
      key: accountRecordKey(),
      label: "Zhipu coding plan",
      methods: [{ id: "browser", label: "Sign in with the browser" }],
      run: (session) => this.runLogin(session, this.requestedDeployment, this.requestedPlanKind)
    };
  }
  /** One attempt: open the relay flow, wait for the human, commit the account. */
  async runLogin(session, deployment, planKind) {
    let ready;
    try {
      ready = await runLoginAttempt({
        relay: this.relay,
        deployment,
        pollToken: createPollToken(),
        clock: {
          now: () => Date.now(),
          sleep: (ms) => new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
              resolve();
            }, ms);
            session.signal.addEventListener("abort", () => {
              clearTimeout(timer);
              reject(new Error("authorization cancelled"));
            }, { once: true });
          })
        },
        timeoutMs: this.config.loginTimeoutMs,
        signal: session.signal,
        onAuthorizeUrl: (flow) => {
          session.notify({
            message: "Continue in your browser to finish the Zhipu coding-plan sign-in.",
            url: flow.authorizeUrl
          });
        }
      });
    } catch (error) {
      if (session.signal.aborted) throw error;
      const message = error instanceof LoginError ? error.message : "Authorization failed unexpectedly.";
      this.currentLoginState = { state: "failed", message };
      throw error;
    }
    if (session.signal.aborted) throw new Error("authorization cancelled");
    const account = await this.storePlanCredential(accountPayloadFor(deployment, planKind, ready));
    await this.ctx.credentials.modifyRecord(accountRecordKey(), () => {
      return Promise.resolve(accountGrant(account));
    });
    await this.syncProviderRoutes();
    this.currentLoginState = { state: "signed-in" };
  }
  /**
   * Resolve the account's inference credential and store it under the
   * reference the provider profiles read.
   * @param account - the account payload the attempt is about to commit.
   * @returns that payload with the resolved organization scope, when the plan has one.
   */
  async storePlanCredential(account) {
    let resolution;
    try {
      resolution = await resolvePlanKey({
        deployment: account.deployment,
        planKind: account.planKind,
        account,
        origins: {
          bigmodelApiOrigin: this.config.bigmodelApiOrigin,
          zaiApiOrigin: this.config.zaiApiOrigin
        },
        requestTimeoutMs: this.config.requestTimeoutMs,
        signal: void 0
      });
    } catch (error) {
      if (error instanceof PlanKeyError) {
        throw zhipuPlanError(error.code, error.message, { cause: error });
      }
      throw zhipuPlanError("zhipu-plan/network", "the plan service could not be reached", { cause: error });
    }
    await this.ctx.credentials.set(this.planKeyRef(account.deployment), resolution.key);
    const previous = account.deployment === "bigmodel" ? "zai" : "bigmodel";
    await this.ctx.credentials.unset(this.planKeyRef(previous));
    return resolution.scope === void 0 ? account : { ...account, ...resolution.scope };
  }
  /** Drop the derived plan credential and the attempt state. */
  onSignedOut() {
    void this.ctx.credentials.unset(this.planKeyRef("bigmodel"));
    void this.ctx.credentials.unset(this.planKeyRef("zai"));
    void this.syncProviderRoutes().catch((error) => {
      this.ctx.logger.warn("zhipu-plan: provider route sync failed: %s", error);
    });
    this.currentLoginState = { state: "idle" };
  }
};
_init = __decoratorStart(_b);
__decorateElement(_init, 1, "status", _status_dec, ZhipuPlanService);
__decorateElement(_init, 1, "quota", _quota_dec, ZhipuPlanService);
__decorateElement(_init, 1, "usage", _usage_dec, ZhipuPlanService);
__decorateElement(_init, 1, "resetStatus", _resetStatus_dec, ZhipuPlanService);
__decorateElement(_init, 1, "useReset", _useReset_dec, ZhipuPlanService);
__decorateElement(_init, 1, "requestResetOpportunity", _requestResetOpportunity_dec, ZhipuPlanService);
__decorateElement(_init, 1, "markResetHistoryRead", _markResetHistoryRead_dec, ZhipuPlanService);
__decorateElement(_init, 1, "refreshCredential", _refreshCredential_dec, ZhipuPlanService);
__decorateElement(_init, 1, "beginLogin", _beginLogin_dec, ZhipuPlanService);
__decorateElement(_init, 1, "loginState", _loginState_dec, ZhipuPlanService);
__decorateElement(_init, 1, "cancelLogin", _cancelLogin_dec, ZhipuPlanService);
__decorateElement(_init, 1, "logout", _logout_dec, ZhipuPlanService);
__decoratorMetadata(_init, ZhipuPlanService);
__publicField(ZhipuPlanService, "inject", ["credentials", "authorization", "settings"]);
__publicField(ZhipuPlanService, "Config", Config);
var service_default = ZhipuPlanService;
export {
  ACCOUNT_RECORD_ID,
  Config,
  LoginError,
  PlanKeyError,
  RECORD_SCOPE,
  RelayError,
  ZhipuAuthRelay,
  ZhipuPlanService,
  accountGrant,
  accountRecordKey,
  accountView,
  createPollToken,
  service_default as default,
  fetchQuota,
  fetchResetStatus,
  markResetHistoryRead,
  parseQuotaPayload,
  pickPrimaryLimit,
  readAccountPayload,
  requestResetOpportunity,
  resolvePlanKey,
  runLoginAttempt,
  useReset,
  zhipuPlanError
};
