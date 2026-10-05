import { clerkMiddleware, getAuth } from '@clerk/express';
import type { Request, RequestHandler } from 'express';

export type ReviewerAccessResult =
  | { state: 'allowed'; userId: string }
  | { state: 'unauthenticated' }
  | { state: 'forbidden' }
  | { state: 'unavailable' };

export type ReviewerAuthGateway = {
  configured: boolean;
  authorizationConfigured: boolean;
  accessMode: 'allowlist' | 'authenticated';
  middleware: RequestHandler;
  resolve(request: Request): Promise<ReviewerAccessResult>;
};

const passThrough: RequestHandler = (_request, _response, next) => next();

export const unavailableReviewerAuth: ReviewerAuthGateway = {
  configured: false,
  authorizationConfigured: false,
  accessMode: 'allowlist',
  middleware: passThrough,
  async resolve() {
    return { state: 'unavailable' };
  },
};

export function parseReviewerAccessMode(value?: string): ReviewerAuthGateway['accessMode'] {
  const mode = value?.trim() || 'allowlist';
  if (mode !== 'allowlist' && mode !== 'authenticated')
    throw new Error('CLERK_REVIEWER_ACCESS_MODE must be allowlist or authenticated');
  return mode;
}

function csv(value?: string): string[] {
  return [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

export function normalizeTrustedOrigin(
  value: string,
  production: boolean,
  variableName: string,
): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variableName} must contain an absolute web origin`);
  }

  const localHost = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
  const allowedProtocol =
    url.protocol === 'https:' || (!production && localHost && url.protocol === 'http:');
  const exactOrigin =
    value === url.origin &&
    url.pathname === '/' &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash;
  if (!allowedProtocol || !exactOrigin)
    throw new Error(
      `${variableName} must contain an exact HTTPS origin (HTTP is allowed only for local development)`,
    );
  return url.origin;
}

export function createClerkReviewerAuth(
  environment: NodeJS.ProcessEnv = process.env,
): ReviewerAuthGateway {
  const publishableKey = environment.CLERK_PUBLISHABLE_KEY?.trim();
  const secretKey = environment.CLERK_SECRET_KEY?.trim();
  const production = environment.NODE_ENV === 'production';
  const authorizedParties = csv(environment.CLERK_AUTHORIZED_PARTIES).map((origin) =>
    normalizeTrustedOrigin(origin, production, 'CLERK_AUTHORIZED_PARTIES'),
  );
  const reviewerIds = new Set(csv(environment.CLERK_REVIEWER_USER_IDS));
  const accessMode = parseReviewerAccessMode(environment.CLERK_REVIEWER_ACCESS_MODE);
  const productionDeployment =
    environment.BASIRAH_DEPLOYMENT_ENVIRONMENT === 'production' ||
    environment.RAILWAY_ENVIRONMENT_NAME === 'production';
  if (productionDeployment && accessMode === 'authenticated')
    throw new Error('Production reviewer access requires CLERK_REVIEWER_ACCESS_MODE=allowlist');
  const anyClerkValue = Boolean(
    publishableKey ||
    secretKey ||
    authorizedParties.length ||
    reviewerIds.size ||
    environment.CLERK_REVIEWER_ACCESS_MODE,
  );

  if (!anyClerkValue) return unavailableReviewerAuth;
  if (!publishableKey || !secretKey || authorizedParties.length === 0)
    throw new Error(
      'Clerk reviewer authentication requires CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY and CLERK_AUTHORIZED_PARTIES',
    );

  return {
    configured: true,
    authorizationConfigured: accessMode === 'authenticated' || reviewerIds.size > 0,
    accessMode,
    middleware: clerkMiddleware({ publishableKey, secretKey, authorizedParties }),
    async resolve(request) {
      const auth = getAuth(request);
      if (!auth.isAuthenticated || !auth.userId) return { state: 'unauthenticated' };
      if (accessMode === 'authenticated') return { state: 'allowed', userId: auth.userId };
      if (!reviewerIds.has(auth.userId)) return { state: 'forbidden' };
      return { state: 'allowed', userId: auth.userId };
    },
  };
}
