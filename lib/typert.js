// src/wire/typert-host.js
import { z } from "zod";
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_beginLogin_parameter_0$schema$value;
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_beginLogin_parameter_0$schema = () => _deepseek_ai_dsh_zhipu_plan_zhipuPlan_beginLogin_parameter_0$schema$value ??= z.union([z.literal("bigmodel"), z.literal("zai")]);
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_beginLogin_parameter_1$schema$value;
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_beginLogin_parameter_1$schema = () => _deepseek_ai_dsh_zhipu_plan_zhipuPlan_beginLogin_parameter_1$schema$value ??= z.union([z.literal("individual-coding-plan"), z.literal("team-coding-plan"), z.literal("start-plan")]);
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_beginLogin_result$schema$value;
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_beginLogin_result$schema = () => _deepseek_ai_dsh_zhipu_plan_zhipuPlan_beginLogin_result$schema$value ??= z.object({
  "accepted": z.literal(true)
});
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_cancelLogin_result$schema$value;
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_cancelLogin_result$schema = () => _deepseek_ai_dsh_zhipu_plan_zhipuPlan_cancelLogin_result$schema$value ??= z.void();
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_loginState_result$schema$value;
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_loginState_result$schema = () => _deepseek_ai_dsh_zhipu_plan_zhipuPlan_loginState_result$schema$value ??= z.union([z.object({
  "state": z.literal("idle").readonly()
}), z.object({
  "state": z.literal("waiting").readonly(),
  "authorizeUrl": z.string().readonly().optional()
}), z.object({
  "state": z.literal("failed").readonly(),
  "message": z.string().readonly()
}), z.object({
  "state": z.literal("signed-in").readonly()
})]);
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_logout_result$schema$value;
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_logout_result$schema = () => _deepseek_ai_dsh_zhipu_plan_zhipuPlan_logout_result$schema$value ??= z.void();
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_markResetHistoryRead_result$schema$value;
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_markResetHistoryRead_result$schema = () => _deepseek_ai_dsh_zhipu_plan_zhipuPlan_markResetHistoryRead_result$schema$value ??= z.void();
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_quota_result$schema$value;
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_quota_result$schema = () => _deepseek_ai_dsh_zhipu_plan_zhipuPlan_quota_result$schema$value ??= z.object({
  "deployment": z.union([z.literal("bigmodel"), z.literal("zai")]).readonly(),
  "fetchedAt": z.number().readonly(),
  "stale": z.boolean().readonly(),
  "level": z.string().readonly().optional(),
  "limits": z.array(z.object({
    "type": z.string().readonly(),
    "unit": z.number().readonly().optional(),
    "number": z.number().readonly().optional(),
    "usage": z.number().readonly().optional(),
    "currentValue": z.number().readonly().optional(),
    "remaining": z.number().readonly().optional(),
    "percentage": z.number().readonly().optional(),
    "nextResetTime": z.number().readonly().optional(),
    "usageDetails": z.array(z.object({
      "modelCode": z.string().readonly().optional(),
      "displayName": z.string().readonly().optional(),
      "usage": z.number().readonly().optional()
    })).readonly().optional()
  })).readonly(),
  "primary": z.object({
    "type": z.string().readonly(),
    "unit": z.number().readonly().optional(),
    "number": z.number().readonly().optional(),
    "usage": z.number().readonly().optional(),
    "currentValue": z.number().readonly().optional(),
    "remaining": z.number().readonly().optional(),
    "percentage": z.number().readonly().optional(),
    "nextResetTime": z.number().readonly().optional(),
    "usageDetails": z.array(z.object({
      "modelCode": z.string().readonly().optional(),
      "displayName": z.string().readonly().optional(),
      "usage": z.number().readonly().optional()
    })).readonly().optional()
  }).readonly().optional()
});
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_refreshCredential_result$schema$value;
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_refreshCredential_result$schema = () => _deepseek_ai_dsh_zhipu_plan_zhipuPlan_refreshCredential_result$schema$value ??= z.object({
  "accepted": z.literal(true)
});
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_requestResetOpportunity_parameter_0$schema$value;
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_requestResetOpportunity_parameter_0$schema = () => _deepseek_ai_dsh_zhipu_plan_zhipuPlan_requestResetOpportunity_parameter_0$schema$value ??= z.string();
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_requestResetOpportunity_result$schema$value;
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_requestResetOpportunity_result$schema = () => _deepseek_ai_dsh_zhipu_plan_zhipuPlan_requestResetOpportunity_result$schema$value ??= z.union([z.object({
  "granted": z.literal(true).readonly()
}), z.object({
  "granted": z.literal(false).readonly(),
  "nextTryAt": z.number().readonly()
})]);
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_resetStatus_result$schema$value;
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_resetStatus_result$schema = () => _deepseek_ai_dsh_zhipu_plan_zhipuPlan_resetStatus_result$schema$value ??= z.object({
  "fiveHour": z.array(z.object({
    "expireAt": z.number().readonly()
  })).readonly(),
  "week": z.array(z.object({
    "expireAt": z.number().readonly()
  })).readonly(),
  "fiveHourUsedAt": z.number().readonly().optional(),
  "weekUsedAt": z.number().readonly().optional(),
  "hasUnreadHistory": z.boolean().readonly()
});
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_status_result$schema$value;
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_status_result$schema = () => _deepseek_ai_dsh_zhipu_plan_zhipuPlan_status_result$schema$value ??= z.union([z.object({
  "state": z.literal("signed-out").readonly()
}), z.object({
  "state": z.literal("signed-in").readonly(),
  "account": z.object({
    "deployment": z.union([z.literal("bigmodel"), z.literal("zai")]).readonly(),
    "planKind": z.union([z.literal("individual-coding-plan"), z.literal("team-coding-plan"), z.literal("start-plan")]).readonly(),
    "accountId": z.string().readonly(),
    "accountLabel": z.string().readonly(),
    "accessTokenExpiresAt": z.number().readonly().optional(),
    "jwtExpiresAt": z.number().readonly().optional(),
    "jwtExpired": z.boolean().readonly()
  }).readonly()
})]);
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_usage_parameter_0$schema$value;
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_usage_parameter_0$schema = () => _deepseek_ai_dsh_zhipu_plan_zhipuPlan_usage_parameter_0$schema$value ??= z.union([z.literal("7d"), z.literal("30d"), z.literal("all")]);
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_usage_parameter_1$schema$value;
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_usage_parameter_1$schema = () => _deepseek_ai_dsh_zhipu_plan_zhipuPlan_usage_parameter_1$schema$value ??= z.string();
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_usage_result$schema$value;
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_usage_result$schema = () => _deepseek_ai_dsh_zhipu_plan_zhipuPlan_usage_result$schema$value ??= z.object({
  "deployment": z.union([z.literal("bigmodel"), z.literal("zai")]).readonly(),
  "range": z.union([z.literal("7d"), z.literal("30d"), z.literal("all")]).readonly(),
  "fetchedAt": z.number().readonly(),
  "models": z.object({
    "days": z.array(z.string()).readonly(),
    "calls": z.number().readonly(),
    "tokens": z.number().readonly(),
    "models": z.array(z.object({
      "model": z.string().readonly(),
      "tokens": z.number().readonly()
    })).readonly()
  }).readonly(),
  "tools": z.object({
    "searches": z.number().readonly(),
    "webReads": z.number().readonly(),
    "zreads": z.number().readonly(),
    "tools": z.array(z.object({
      "tool": z.string().readonly(),
      "calls": z.number().readonly()
    })).readonly()
  }).readonly(),
  "activity": z.object({
    "days": z.array(z.object({
      "date": z.string().readonly(),
      "tokens": z.number().readonly(),
      "mcpCalls": z.number().readonly()
    })).readonly(),
    "totalTokens": z.number().readonly(),
    "peakDayTokens": z.number().readonly(),
    "peakDay": z.string().readonly().optional(),
    "totalUsageMs": z.number().readonly(),
    "currentStreakDays": z.number().readonly(),
    "longestStreakDays": z.number().readonly()
  }).readonly(),
  "credits": z.object({
    "cacheHitRate": z.number().readonly().optional(),
    "offPeakRate": z.number().readonly().optional(),
    "totalCredits": z.number().readonly().optional()
  }).readonly(),
  "decodeSpeed": z.object({
    "days": z.array(z.string()).readonly(),
    "proMax": z.array(z.number()).readonly(),
    "lite": z.array(z.number()).readonly()
  }).readonly(),
  "subscriptions": z.array(z.object({
    "productName": z.string().readonly(),
    "status": z.string().readonly(),
    "inCurrentPeriod": z.boolean().readonly(),
    "autoRenew": z.boolean().readonly(),
    "renewTime": z.string().readonly().optional(),
    "billingCycle": z.string().readonly().optional(),
    "validRange": z.string().readonly().optional(),
    "period": z.number().readonly().optional()
  })).readonly()
});
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_useReset_parameter_0$schema$value;
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_useReset_parameter_0$schema = () => _deepseek_ai_dsh_zhipu_plan_zhipuPlan_useReset_parameter_0$schema$value ??= z.union([z.literal("five_hour"), z.literal("week")]);
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_useReset_parameter_1$schema$value;
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_useReset_parameter_1$schema = () => _deepseek_ai_dsh_zhipu_plan_zhipuPlan_useReset_parameter_1$schema$value ??= z.string();
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_useReset_result$schema$value;
var _deepseek_ai_dsh_zhipu_plan_zhipuPlan_useReset_result$schema = () => _deepseek_ai_dsh_zhipu_plan_zhipuPlan_useReset_result$schema$value ??= z.void();
var TYPERT = {
  package: "dsh-zhipu-plan",
  face: "host",
  schemas: [],
  invocations: [
    {
      id: "dsh-zhipu-plan#zhipuPlan/beginLogin",
      service: "zhipuPlan",
      namespace: "zhipuPlan",
      method: "beginLogin",
      invocation: { kind: "direct" },
      parameters: [
        {
          name: "deployment",
          wire: "deployment",
          source: "json",
          codec: {
            mode: "strict",
            typeSymbol: "dsh-zhipu-plan/types#ZhipuPlanDeployment",
            create: _deepseek_ai_dsh_zhipu_plan_zhipuPlan_beginLogin_parameter_0$schema
          }
        },
        {
          name: "planKind",
          wire: "planKind",
          source: "json",
          codec: {
            mode: "strict",
            typeSymbol: "dsh-zhipu-plan/types#ZhipuPlanKind",
            create: _deepseek_ai_dsh_zhipu_plan_zhipuPlan_beginLogin_parameter_1$schema
          }
        }
      ],
      cancellation: { parameter: "signal" },
      result: {
        mode: "strict",
        typeSymbol: "dsh-zhipu-plan#zhipuPlan/beginLogin:result",
        create: _deepseek_ai_dsh_zhipu_plan_zhipuPlan_beginLogin_result$schema
      },
      sourceLocation: { "file": "src/host/service.ts", "line": 473, "column": 9 }
    },
    {
      id: "dsh-zhipu-plan#zhipuPlan/cancelLogin",
      service: "zhipuPlan",
      namespace: "zhipuPlan",
      method: "cancelLogin",
      invocation: { kind: "direct" },
      parameters: [],
      result: {
        mode: "strict",
        typeSymbol: "dsh-zhipu-plan#zhipuPlan/cancelLogin:result",
        create: _deepseek_ai_dsh_zhipu_plan_zhipuPlan_cancelLogin_result$schema
      },
      sourceLocation: { "file": "src/host/service.ts", "line": 513, "column": 3 }
    },
    {
      id: "dsh-zhipu-plan#zhipuPlan/loginState",
      service: "zhipuPlan",
      namespace: "zhipuPlan",
      method: "loginState",
      invocation: { kind: "direct" },
      parameters: [],
      result: {
        mode: "strict",
        typeSymbol: "dsh-zhipu-plan/types#ZhipuPlanLoginState",
        create: _deepseek_ai_dsh_zhipu_plan_zhipuPlan_loginState_result$schema
      },
      sourceLocation: { "file": "src/host/service.ts", "line": 504, "column": 3 }
    },
    {
      id: "dsh-zhipu-plan#zhipuPlan/logout",
      service: "zhipuPlan",
      namespace: "zhipuPlan",
      method: "logout",
      invocation: { kind: "direct" },
      parameters: [],
      result: {
        mode: "strict",
        typeSymbol: "dsh-zhipu-plan#zhipuPlan/logout:result",
        create: _deepseek_ai_dsh_zhipu_plan_zhipuPlan_logout_result$schema
      },
      sourceLocation: { "file": "src/host/service.ts", "line": 521, "column": 9 }
    },
    {
      id: "dsh-zhipu-plan#zhipuPlan/markResetHistoryRead",
      service: "zhipuPlan",
      namespace: "zhipuPlan",
      method: "markResetHistoryRead",
      invocation: { kind: "direct" },
      parameters: [],
      cancellation: { parameter: "signal" },
      result: {
        mode: "strict",
        typeSymbol: "dsh-zhipu-plan#zhipuPlan/markResetHistoryRead:result",
        create: _deepseek_ai_dsh_zhipu_plan_zhipuPlan_markResetHistoryRead_result$schema
      },
      sourceLocation: { "file": "src/host/service.ts", "line": 405, "column": 9 }
    },
    {
      id: "dsh-zhipu-plan#zhipuPlan/quota",
      service: "zhipuPlan",
      namespace: "zhipuPlan",
      method: "quota",
      invocation: { kind: "direct" },
      parameters: [],
      cancellation: { parameter: "signal" },
      result: {
        mode: "strict",
        typeSymbol: "dsh-zhipu-plan/types#PlanQuotaSnapshot",
        create: _deepseek_ai_dsh_zhipu_plan_zhipuPlan_quota_result$schema
      },
      sourceLocation: { "file": "src/host/service.ts", "line": 244, "column": 9 }
    },
    {
      id: "dsh-zhipu-plan#zhipuPlan/refreshCredential",
      service: "zhipuPlan",
      namespace: "zhipuPlan",
      method: "refreshCredential",
      invocation: { kind: "direct" },
      parameters: [],
      result: {
        mode: "strict",
        typeSymbol: "dsh-zhipu-plan#zhipuPlan/refreshCredential:result",
        create: _deepseek_ai_dsh_zhipu_plan_zhipuPlan_refreshCredential_result$schema
      },
      sourceLocation: { "file": "src/host/service.ts", "line": 452, "column": 9 }
    },
    {
      id: "dsh-zhipu-plan#zhipuPlan/requestResetOpportunity",
      service: "zhipuPlan",
      namespace: "zhipuPlan",
      method: "requestResetOpportunity",
      invocation: { kind: "direct" },
      parameters: [
        {
          name: "idempotencyKey",
          wire: "idempotencyKey",
          source: "json",
          codec: {
            mode: "strict",
            typeSymbol: "dsh-zhipu-plan#zhipuPlan/requestResetOpportunity:idempotencyKey",
            create: _deepseek_ai_dsh_zhipu_plan_zhipuPlan_requestResetOpportunity_parameter_0$schema
          }
        }
      ],
      cancellation: { parameter: "signal" },
      result: {
        mode: "strict",
        typeSymbol: "dsh-zhipu-plan#zhipuPlan/requestResetOpportunity:result",
        create: _deepseek_ai_dsh_zhipu_plan_zhipuPlan_requestResetOpportunity_result$schema
      },
      sourceLocation: { "file": "src/host/service.ts", "line": 382, "column": 9 }
    },
    {
      id: "dsh-zhipu-plan#zhipuPlan/resetStatus",
      service: "zhipuPlan",
      namespace: "zhipuPlan",
      method: "resetStatus",
      invocation: { kind: "direct" },
      parameters: [],
      cancellation: { parameter: "signal" },
      result: {
        mode: "strict",
        typeSymbol: "dsh-zhipu-plan/types#PlanResetStatus",
        create: _deepseek_ai_dsh_zhipu_plan_zhipuPlan_resetStatus_result$schema
      },
      sourceLocation: { "file": "src/host/service.ts", "line": 339, "column": 9 }
    },
    {
      id: "dsh-zhipu-plan#zhipuPlan/status",
      service: "zhipuPlan",
      namespace: "zhipuPlan",
      method: "status",
      invocation: { kind: "direct" },
      parameters: [],
      result: {
        mode: "strict",
        typeSymbol: "dsh-zhipu-plan/types#ZhipuPlanStatus",
        create: _deepseek_ai_dsh_zhipu_plan_zhipuPlan_status_result$schema
      },
      sourceLocation: { "file": "src/host/service.ts", "line": 228, "column": 9 }
    },
    {
      id: "dsh-zhipu-plan#zhipuPlan/usage",
      service: "zhipuPlan",
      namespace: "zhipuPlan",
      method: "usage",
      invocation: { kind: "direct" },
      parameters: [
        {
          name: "range",
          wire: "range",
          source: "json",
          codec: {
            mode: "strict",
            typeSymbol: "dsh-zhipu-plan/types#PlanUsageRange",
            create: _deepseek_ai_dsh_zhipu_plan_zhipuPlan_usage_parameter_0$schema
          }
        },
        {
          name: "timeZone",
          wire: "timeZone",
          source: "json",
          codec: {
            mode: "strict",
            typeSymbol: "dsh-zhipu-plan#zhipuPlan/usage:timeZone",
            create: _deepseek_ai_dsh_zhipu_plan_zhipuPlan_usage_parameter_1$schema
          }
        }
      ],
      cancellation: { parameter: "signal" },
      result: {
        mode: "strict",
        typeSymbol: "dsh-zhipu-plan/types#PlanUsageReport",
        create: _deepseek_ai_dsh_zhipu_plan_zhipuPlan_usage_result$schema
      },
      sourceLocation: { "file": "src/host/service.ts", "line": 300, "column": 9 }
    },
    {
      id: "dsh-zhipu-plan#zhipuPlan/useReset",
      service: "zhipuPlan",
      namespace: "zhipuPlan",
      method: "useReset",
      invocation: { kind: "direct" },
      parameters: [
        {
          name: "kind",
          wire: "kind",
          source: "json",
          codec: {
            mode: "strict",
            typeSymbol: "dsh-zhipu-plan/types#PlanResetKind",
            create: _deepseek_ai_dsh_zhipu_plan_zhipuPlan_useReset_parameter_0$schema
          }
        },
        {
          name: "idempotencyKey",
          wire: "idempotencyKey",
          source: "json",
          codec: {
            mode: "strict",
            typeSymbol: "dsh-zhipu-plan#zhipuPlan/useReset:idempotencyKey",
            create: _deepseek_ai_dsh_zhipu_plan_zhipuPlan_useReset_parameter_1$schema
          }
        }
      ],
      cancellation: { parameter: "signal" },
      result: {
        mode: "strict",
        typeSymbol: "dsh-zhipu-plan#zhipuPlan/useReset:result",
        create: _deepseek_ai_dsh_zhipu_plan_zhipuPlan_useReset_result$schema
      },
      sourceLocation: { "file": "src/host/service.ts", "line": 361, "column": 9 }
    }
  ],
  model: {
    "services": [
      {
        "description": "Zhipu coding-plan account service.",
        "summary": "Zhipu coding-plan account service.",
        "tags": [],
        "jsDoc": "/** Zhipu coding-plan account service. */",
        "key": "zhipuPlan",
        "exportName": "ZhipuPlanService",
        "members": [
          {
            "kind": "method",
            "name": "status",
            "signature": "@Remote async status(): Promise<ZhipuPlanStatus>",
            "summary": "Report the current sign-in state for a configuration surface.",
            "jsDoc": "/**\n * Report the current sign-in state for a configuration surface.\n * @returns `signed-out`, or the redacted account of the stored grant.\n * @throws RemoteError when no credential provider is mounted or the stored record is unreadable.\n */"
          },
          {
            "kind": "method",
            "name": "quota",
            "signature": "@Remote async quota(signal: AbortSignal): Promise<PlanQuotaSnapshot>",
            "summary": "Read the plan quota: the server-side usage figure this plan tab leads with.",
            "jsDoc": '/**\n * Read the plan quota: the server-side usage figure this plan tab leads\n * with. Reads at most once per minimum interval; a refused or failed read\n * answers with the last snapshot (flagged stale) so a deployment hiccup\n * renders as old data, never as "no plan".\n * @param signal - the caller\'s cancellation.\n * @returns the freshest snapshot this service holds.\n * @throws RemoteError `zhipu-plan/not-signed-in` when no account is stored.\n */'
          },
          {
            "kind": "method",
            "name": "usage",
            "signature": "@Remote async usage(range: PlanUsageRange, timeZone: string, signal: AbortSignal): Promise<PlanUsageReport>",
            "summary": "Read the plan's server-side usage for one window: per-model and per-tool totals, the daily activity series, credit health, decode speed, and the account's subscriptions.",
            "jsDoc": "/**\n * Read the plan's server-side usage for one window: per-model and per-tool\n * totals, the daily activity series, credit health, decode speed, and the\n * account's subscriptions. Every figure comes from the monitor; nothing here\n * is derived locally.\n * @param range - the window the surface chose.\n * @param timeZone - zone the window's day keys are expressed in.\n * @param signal - the caller's cancellation.\n * @returns the window's report.\n * @throws RemoteError `zhipu-plan/not-signed-in` when no account is stored.\n * @throws RemoteError `zhipu-plan/network` when the monitor cannot be reached.\n */"
          },
          {
            "kind": "method",
            "name": "resetStatus",
            "signature": "@Remote async resetStatus(signal: AbortSignal): Promise<PlanResetStatus>",
            "summary": "Read the resets this account holds.",
            "jsDoc": "/**\n * Read the resets this account holds.\n * @param signal - the caller's cancellation.\n * @returns the available resets by kind plus the last one spent.\n * @throws RemoteError `zhipu-plan/not-signed-in` when no account is stored.\n * @throws RemoteError `zhipu-plan/network` when the reset service cannot be reached.\n */"
          },
          {
            "kind": "method",
            "name": "useReset",
            "signature": "@Remote async useReset(kind: PlanResetKind, idempotencyKey: string, signal: AbortSignal): Promise<void>",
            "summary": "Spend one reset of the given kind.",
            "jsDoc": "/**\n * Spend one reset of the given kind. The key makes a retried click idempotent.\n * @param kind - which reset window is being spent.\n * @param idempotencyKey - caller-minted key, at most 64 characters.\n * @param signal - the caller's cancellation.\n * @returns once the service confirms the reset.\n * @throws RemoteError `zhipu-plan/rejected` when the service refuses the reset.\n */"
          },
          {
            "kind": "method",
            "name": "requestResetOpportunity",
            "signature": "@Remote async requestResetOpportunity( idempotencyKey: string, signal: AbortSignal, ): Promise<{ readonly granted: true } | { readonly granted: false; readonly nextTryAt: number }>",
            "summary": "Claim a reset opportunity the service occasionally grants.",
            "jsDoc": "/**\n * Claim a reset opportunity the service occasionally grants.\n * @param idempotencyKey - caller-minted key, at most 64 characters.\n * @param signal - the caller's cancellation.\n * @returns the grant, or the earliest moment worth asking again.\n * @throws RemoteError `zhipu-plan/rejected` when the service throttles or refuses.\n */"
          },
          {
            "kind": "method",
            "name": "markResetHistoryRead",
            "signature": "@Remote async markResetHistoryRead(signal: AbortSignal): Promise<void>",
            "summary": "Mark the reset history as read.",
            "jsDoc": "/**\n * Mark the reset history as read.\n * @param signal - the caller's cancellation.\n * @returns once the service acknowledges.\n * @throws RemoteError `zhipu-plan/rejected` when the service refuses.\n */"
          },
          {
            "kind": "method",
            "name": "refreshCredential",
            "signature": "@Remote('refreshCredential') async refreshCredential(): Promise<{ accepted: true }>",
            "summary": "Re-resolve and store the plan credential for the stored account.",
            "jsDoc": "/**\n * Re-resolve and store the plan credential for the stored account. A login\n * does this itself; a Team deployment re-runs it here because its key is\n * resolved per attempt rather than assumed long-lived.\n * @returns once the credential reference holds a fresh key.\n * @throws RemoteError the plan account's refusal classes.\n */"
          },
          {
            "kind": "method",
            "name": "beginLogin",
            "signature": "@Remote('beginLogin') async beginLogin(deployment: ZhipuPlanDeployment, planKind: ZhipuPlanKind, signal: AbortSignal): Promise<{ accepted: true }>",
            "summary": "Run one sign-in attempt through the authorization seam.",
            "jsDoc": "/**\n * Run one sign-in attempt through the authorization seam.\n * @param deployment - deployment the human authorizes against, chosen on the surface.\n * @param planKind - entitlement the account holds, chosen on the surface.\n * @param signal - the caller's cancellation of the whole attempt.\n * @returns once the attempt has settled; its outcome is in {@link loginState}.\n * @throws RemoteError `zhipu-plan/rejected` when an attempt is already running or no flow is registered.\n */"
          },
          {
            "kind": "method",
            "name": "loginState",
            "signature": "@Remote loginState(): ZhipuPlanLoginState",
            "summary": "What a running sign-in attempt wants the surface to show.",
            "jsDoc": "/**\n * What a running sign-in attempt wants the surface to show.\n * @returns the current login state, retained until the next attempt begins.\n */"
          },
          {
            "kind": "method",
            "name": "cancelLogin",
            "signature": "@Remote cancelLogin(): void",
            "summary": "Withdraw a running sign-in attempt.",
            "jsDoc": "/**\n * Withdraw a running sign-in attempt.\n * @returns once the seam has been asked to cancel; the outcome is in {@link loginState}.\n */"
          },
          {
            "kind": "method",
            "name": "logout",
            "signature": "@Remote async logout(): Promise<void>",
            "summary": "Sign out: delete the stored account and every derived fact with it.",
            "jsDoc": "/**\n * Sign out: delete the stored account and every derived fact with it.\n */"
          },
          {
            "kind": "method",
            "name": "account",
            "signature": "async account(): Promise<ZhipuPlanAccountPayload | undefined>",
            "summary": "Read the stored account payload.",
            "jsDoc": "/**\n * Read the stored account payload.\n * @returns the account, or undefined when no record is stored.\n * @throws RemoteError when the record does not parse.\n */"
          }
        ],
        "types": [
          {
            "name": "PlanActivityDay",
            "declaration": "export interface PlanActivityDay {\n    readonly date: string;\n    readonly tokens: number;\n    readonly mcpCalls: number;\n}"
          },
          {
            "name": "PlanActivitySummary",
            "declaration": "export interface PlanActivitySummary {\n    readonly days: readonly PlanActivityDay[];\n    readonly totalTokens: number;\n    readonly peakDayTokens: number;\n    readonly peakDay?: string;\n    readonly totalUsageMs: number;\n    readonly currentStreakDays: number;\n    readonly longestStreakDays: number;\n}"
          },
          {
            "name": "PlanCreditSummary",
            "declaration": "export interface PlanCreditSummary {\n    readonly cacheHitRate?: number;\n    readonly offPeakRate?: number;\n    readonly totalCredits?: number;\n}"
          },
          {
            "name": "PlanDecodeSpeed",
            "declaration": "export interface PlanDecodeSpeed {\n    readonly days: readonly string[];\n    readonly proMax: readonly number[];\n    readonly lite: readonly number[];\n}"
          },
          {
            "name": "PlanModelShare",
            "declaration": "export interface PlanModelShare {\n    readonly model: string;\n    readonly tokens: number;\n}"
          },
          {
            "name": "PlanModelUsage",
            "declaration": "export interface PlanModelUsage {\n    readonly days: readonly string[];\n    readonly calls: number;\n    readonly tokens: number;\n    readonly models: readonly PlanModelShare[];\n}"
          },
          {
            "name": "PlanQuotaLimit",
            "declaration": "export interface PlanQuotaLimit {\n    readonly type: string;\n    readonly unit?: number;\n    readonly number?: number;\n    readonly usage?: number;\n    readonly currentValue?: number;\n    readonly remaining?: number;\n    readonly percentage?: number;\n    readonly nextResetTime?: number;\n    readonly usageDetails?: readonly { readonly modelCode?: string; readonly displayName?: string; readonly usage?: number; }[];\n}"
          },
          {
            "name": "PlanQuotaSnapshot",
            "declaration": "export interface PlanQuotaSnapshot {\n    readonly deployment: ZhipuPlanDeployment;\n    readonly fetchedAt: number;\n    readonly stale: boolean;\n    readonly level?: string;\n    readonly limits: readonly PlanQuotaLimit[];\n    readonly primary?: PlanQuotaLimit;\n}"
          },
          {
            "name": "PlanResetKind",
            "declaration": "export type PlanResetKind = 'five_hour' | 'week';"
          },
          {
            "name": "PlanResetOpportunity",
            "declaration": "export interface PlanResetOpportunity {\n    readonly expireAt: number;\n}"
          },
          {
            "name": "PlanResetStatus",
            "declaration": "export interface PlanResetStatus {\n    readonly fiveHour: readonly PlanResetOpportunity[];\n    readonly week: readonly PlanResetOpportunity[];\n    readonly fiveHourUsedAt?: number;\n    readonly weekUsedAt?: number;\n    readonly hasUnreadHistory: boolean;\n}"
          },
          {
            "name": "PlanSubscription",
            "declaration": "export interface PlanSubscription {\n    readonly productName: string;\n    readonly status: string;\n    readonly inCurrentPeriod: boolean;\n    readonly autoRenew: boolean;\n    readonly renewTime?: string;\n    readonly billingCycle?: string;\n    readonly validRange?: string;\n    readonly period?: number;\n}"
          },
          {
            "name": "PlanToolShare",
            "declaration": "export interface PlanToolShare {\n    readonly tool: string;\n    readonly calls: number;\n}"
          },
          {
            "name": "PlanToolUsage",
            "declaration": "export interface PlanToolUsage {\n    readonly searches: number;\n    readonly webReads: number;\n    readonly zreads: number;\n    readonly tools: readonly PlanToolShare[];\n}"
          },
          {
            "name": "PlanUsageRange",
            "declaration": "export type PlanUsageRange = '7d' | '30d' | 'all';"
          },
          {
            "name": "PlanUsageReport",
            "declaration": "export interface PlanUsageReport {\n    readonly deployment: ZhipuPlanDeployment;\n    readonly range: PlanUsageRange;\n    readonly fetchedAt: number;\n    readonly models: PlanModelUsage;\n    readonly tools: PlanToolUsage;\n    readonly activity: PlanActivitySummary;\n    readonly credits: PlanCreditSummary;\n    readonly decodeSpeed: PlanDecodeSpeed;\n    readonly subscriptions: readonly PlanSubscription[];\n}"
          },
          {
            "name": "ZhipuPlanAccountPayload",
            "declaration": "export interface ZhipuPlanAccountPayload {\n    readonly deployment: ZhipuPlanDeployment;\n    readonly planKind: ZhipuPlanKind;\n    readonly accountId: string;\n    readonly accountLabel: string;\n    readonly accessToken: string;\n    readonly zcodeJwt: string;\n    readonly accessTokenExpiresAt: number | undefined;\n    readonly jwtExpiresAt: number | undefined;\n    readonly organizationId?: string;\n    readonly projectId?: string;\n    readonly signedInAt: number;\n}"
          },
          {
            "name": "ZhipuPlanAccountView",
            "declaration": "export interface ZhipuPlanAccountView {\n    readonly deployment: ZhipuPlanDeployment;\n    readonly planKind: ZhipuPlanKind;\n    readonly accountId: string;\n    readonly accountLabel: string;\n    readonly accessTokenExpiresAt?: number;\n    readonly jwtExpiresAt?: number;\n    readonly jwtExpired: boolean;\n}"
          },
          {
            "name": "ZhipuPlanDeployment",
            "declaration": "export type ZhipuPlanDeployment = 'bigmodel' | 'zai';"
          },
          {
            "name": "ZhipuPlanKind",
            "declaration": "export type ZhipuPlanKind = 'individual-coding-plan' | 'team-coding-plan' | 'start-plan';"
          },
          {
            "name": "ZhipuPlanLoginState",
            "declaration": "export type ZhipuPlanLoginState = { readonly state: 'idle'; } | { readonly state: 'waiting'; readonly authorizeUrl?: string; } | { readonly state: 'failed'; readonly message: string; } | { readonly state: 'signed-in'; };"
          },
          {
            "name": "ZhipuPlanStatus",
            "declaration": "export type ZhipuPlanStatus = { readonly state: 'signed-out'; } | { readonly state: 'signed-in'; readonly account: ZhipuPlanAccountView; };"
          }
        ]
      }
    ],
    "events": [],
    "objects": []
  }
};
export {
  TYPERT
};
