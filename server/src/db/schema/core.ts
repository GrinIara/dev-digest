import { pgTable, uuid, text, jsonb, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core';
import { now } from './_shared';

// ============================================================ Tenancy & core

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Looked up as if unique everywhere (LocalNoAuthProvider, seed's find-or-create) —
  // enforce it at the DB level too, not just by convention.
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  createdAt: now(),
});

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Same as `users.email` — looked up as if unique (LocalNoAuthProvider, seed).
  name: text('name').notNull().unique(),
  createdAt: now(),
});

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'member'] }).notNull().default('member'),
  },
  (t) => ({ pk: primaryKey({ columns: [t.workspaceId, t.userId] }) }),
);

/** Non-secret prefs/config. Secrets go via SecretsProvider, NOT here. */
export const settings = pgTable(
  'settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: jsonb('value'),
  },
  (t) => ({
    uq: uniqueIndex('settings_ws_user_key_uq').on(t.workspaceId, t.userId, t.key),
  }),
);
