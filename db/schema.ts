import { sqliteTable, text, integer, real, index, primaryKey, uniqueIndex } from "drizzle-orm/sqlite-core";

export const appUsers = sqliteTable("app_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  lastSeen: integer("last_seen").notNull(),
  password: text("password"),
  verified: integer("verified").notNull().default(0),
  googleSub: text("google_sub").unique(),
}, table => [uniqueIndex("app_users_email").on(table.email)]);

export const userSessions = sqliteTable("user_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull(),
  expires: integer("expires").notNull(),
});
export const accountTokens = sqliteTable("account_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull(),
  purpose: text("purpose").notNull(),
  expires: integer("expires").notNull(),
  verifier: text("verifier"),
});
export const savedRoutes = sqliteTable("saved_routes", {
  userId: text("user_id").notNull(),
  id: text("id").notNull(),
  name: text("name").notNull(),
  distance: real("distance").notNull(),
  createdAt: integer("created_at").notNull(),
  payload: text("payload").notNull(),
}, table => [primaryKey({ columns: [table.userId, table.id] }), index("saved_routes_created").on(table.createdAt)]);

export const feedback = sqliteTable("feedback", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  category: text("category").notNull(),
  message: text("message").notNull(),
  createdAt: integer("created_at").notNull(),
  status: text("status").notNull().default("new"),
  public: integer("public").notNull().default(0),
}, table => [index("feedback_user_created").on(table.userId, table.createdAt), index("feedback_created").on(table.createdAt)]);

export const feedbackVotes = sqliteTable("feedback_votes", {
  feedbackId: text("feedback_id").notNull().references(() => feedback.id),
  userId: text("user_id").notNull(),
}, table => [primaryKey({ columns: [table.feedbackId, table.userId] })]);

export const adminSessions = sqliteTable("admin_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  expires: integer("expires").notNull(),
  credential: text("credential").notNull(),
});
export const adminAttempts = sqliteTable("admin_attempts", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull(),
  expires: integer("expires").notNull(),
});

export const routeHistory = sqliteTable("route_history", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
  distance: real("distance").notNull(),
  payload: text("payload").notNull(),
}, table => [index("route_history_created").on(table.createdAt), index("route_history_user_created").on(table.userId, table.createdAt)]);
