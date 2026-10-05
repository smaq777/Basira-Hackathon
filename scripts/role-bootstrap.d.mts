export type BootstrapRole = {
  oid: number;
  rolname: string;
  rolsuper: boolean;
  rolcreatedb: boolean;
  rolcreaterole: boolean;
  rolinherit: boolean;
  rolcanlogin: boolean;
  rolreplication: boolean;
  rolbypassrls: boolean;
};
type QueryClient = { query(sql: string, values?: unknown[]): Promise<unknown> };
export const bootstrapRoles: string[];
export const historicalCorpusChecksum: string;
export function roleBootstrapMode(value?: string): 'strict' | 'existing-roles-v1';
export function validateBootstrapRoles(
  roles: BootstrapRole[],
  memberships: { member: number }[],
): void;
export function inspectBootstrapRoles(client: QueryClient): Promise<BootstrapRole[]>;
export function executeCopiedRoleBootstrap(
  client: QueryClient,
  migration: { version: string; checksum: string; sql: string },
): Promise<{
  profile: string;
  version: string;
  sourceChecksumSha256: string;
  executionPlanSha256: string;
  runnerSha256: string;
  roleAction: 'created' | 'reused';
}>;
