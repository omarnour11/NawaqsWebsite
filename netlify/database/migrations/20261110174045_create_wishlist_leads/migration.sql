CREATE TABLE "wishlist_leads" (
	"id" text PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"role" text NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"governorate" text NOT NULL,
	"city_area" text NOT NULL,
	"contact_preference" text DEFAULT 'whatsapp' NOT NULL,
	"notes" text,
	"client_ip" text
);
