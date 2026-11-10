import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const wishlistLeads = pgTable("wishlist_leads", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  role: text("role").notNull(),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  governorate: text("governorate").notNull(),
  cityArea: text("city_area").notNull(),
  contactPreference: text("contact_preference").notNull().default("whatsapp"),
  notes: text("notes"),
  clientIp: text("client_ip"),
});
