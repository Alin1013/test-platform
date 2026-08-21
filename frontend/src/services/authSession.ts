/**
 * 当前认证会话快照：供平台服务在非 React 请求层读取令牌与用户 ID。
 */

let currentToken: string | null = null;
let currentUserId: number | null = null;

/** 更新当前会话，保证 API 服务和 Mock 服务使用同一身份。 */
export function setCurrentAuthSession(token: string | null, userId: number | null): void {
  currentToken = token;
  currentUserId = userId;
}

/** 清理已退出的会话，避免后续请求复用旧用户身份。 */
export function clearCurrentAuthSession(): void {
  setCurrentAuthSession(null, null);
}

/** 返回当前登录令牌；未登录时返回 null。 */
export function getCurrentAuthToken(): string | null {
  return currentToken;
}

/** 返回当前登录用户 ID；未登录时返回 null。 */
export function getCurrentUserId(): number | null {
  return currentUserId;
}
