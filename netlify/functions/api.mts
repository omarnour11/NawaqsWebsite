import type { Config, Context } from "@netlify/functions";
import { desc, count } from "drizzle-orm";
import { db } from "../../db/index.js";
import { wishlistLeads } from "../../db/schema.js";

const ADMIN_KEY = (process.env.ADMIN_SECRET_KEY || "0102014+omarO").trim();

const CSV_HEADERS = [
  "كود الطلب",
  "تاريخ التسجيل (UTC)",
  "الصفة",
  "الاسم بالكامل",
  "رقم الموبايل",
  "البريد الإلكتروني",
  "المحافظة",
  "المدينة أو المنطقة",
  "طريقة التواصل المفضلة",
  "ملاحظات إضافية",
  "IP العميل"
];

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default async (req: Request, context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  const url = new URL(req.url);
  const pathname = url.pathname;

  try {
    // ── 1. POST /api/wishlist — Save a new lead ──
    if (req.method === "POST" && pathname === "/api/wishlist") {
      let body: any = {};
      try {
        body = await req.json();
      } catch {
        return Response.json(
          { error: "Invalid JSON payload" },
          { status: 400, headers: CORS_HEADERS }
        );
      }

      let clientIp =
        context.ip ||
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
        "127.0.0.1";

      const refId =
        body.id || `NWQ-WL-${Math.floor(1000 + Math.random() * 9000)}`;
      const rawRole = (body.role || "مريض").trim();
      const role =
        rawRole === "patient" || rawRole === "مريض" ? "مريض" : "صيدلية";
      const fullName = (body.fullName || "").trim();
      const phone = (body.phone || "").trim();
      const email = (body.email || "").trim() || null;
      const governorate = (body.governorate || "").trim();
      const cityArea = (body.cityArea || "").trim();
      const contactPreference = (
        body.contactPreference || "whatsapp"
      ).trim();
      const notes = (body.notes || "").trim() || null;
      const createdAt = body.createdAt ? new Date(body.createdAt) : new Date();

      if (!fullName || !phone) {
        return Response.json(
          { error: "الاسم بالكامل ورقم الهاتف مطلوبان" },
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const [saved] = await db
        .insert(wishlistLeads)
        .values({
          id: refId,
          role,
          fullName,
          phone,
          email,
          governorate,
          cityArea,
          contactPreference,
          notes,
          clientIp,
          createdAt,
        })
        .returning();

      return Response.json(
        {
          success: true,
          message:
            "تم تسجيل بياناتك بنجاح في قائمة الوصول المبكر لمنصة Nawaqss",
          lead: {
            id: saved.id,
            createdAt: saved.createdAt.toISOString(),
            role: saved.role,
            fullName: saved.fullName,
            phone: saved.phone,
            email: saved.email || "",
            governorate: saved.governorate,
            cityArea: saved.cityArea,
            contactPreference: saved.contactPreference,
            notes: saved.notes || "",
            clientIp: saved.clientIp || "",
          },
        },
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // ── 2. GET /api/admin/leads — Admin dashboard data ──
    if (req.method === "GET" && pathname === "/api/admin/leads") {
      const key = (url.searchParams.get("key") || "").trim();
      if (key !== ADMIN_KEY) {
        return Response.json(
          { error: "المفتاح السري غير صحيح" },
          { status: 401, headers: CORS_HEADERS }
        );
      }

      const records = await db
        .select()
        .from(wishlistLeads)
        .orderBy(desc(wishlistLeads.createdAt));

      const leads = records.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        role: r.role,
        fullName: r.fullName,
        phone: r.phone,
        email: r.email || "",
        governorate: r.governorate,
        cityArea: r.cityArea,
        contactPreference: r.contactPreference,
        notes: r.notes || "",
        clientIp: r.clientIp || "",
      }));

      return Response.json(
        {
          success: true,
          total: leads.length,
          patients: leads.filter((l) => l.role === "مريض").length,
          pharmacies: leads.filter((l) => l.role === "صيدلية").length,
          leads,
        },
        {
          headers: {
            ...CORS_HEADERS,
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        }
      );
    }

    // ── 3. GET /api/admin/export or /api/wishlist/export — CSV Export ──
    if (
      req.method === "GET" &&
      (pathname === "/api/admin/export" || pathname === "/api/wishlist/export")
    ) {
      const key = (url.searchParams.get("key") || "").trim();
      if (key !== ADMIN_KEY) {
        return Response.json(
          {
            error:
              "غير مصرح: مفتاح الإدارة غير صحيح أو مفقود. استخدم ?key=YOUR_KEY",
          },
          { status: 401, headers: CORS_HEADERS }
        );
      }

      const records = await db
        .select()
        .from(wishlistLeads)
        .orderBy(desc(wishlistLeads.createdAt));

      const headerRow =
        "\uFEFF" + CSV_HEADERS.map((h) => `"${h}"`).join(",") + "\r\n";

      const rows = records.map((r) => {
        return [
          r.id,
          r.createdAt.toISOString(),
          r.role,
          r.fullName,
          r.phone,
          r.email || "",
          r.governorate,
          r.cityArea,
          r.contactPreference,
          r.notes || "",
          r.clientIp || "",
        ]
          .map(escapeCsvField)
          .join(",");
      });

      const csvContent = headerRow + rows.join("\r\n");

      return new Response(csvContent, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="nawaqss_wishlist_leads.csv"',
          "Cache-Control": "no-store",
        },
      });
    }

    // ── 4. GET /api/wishlist/stats — Public stats ──
    if (req.method === "GET" && pathname === "/api/wishlist/stats") {
      const [{ value: totalCount }] = await db
        .select({ value: count() })
        .from(wishlistLeads);

      return Response.json(
        {
          success: true,
          total: Number(totalCount),
        },
        { headers: CORS_HEADERS }
      );
    }

    return Response.json(
      { error: "Endpoint not found" },
      { status: 404, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    console.error("[API Error]", error);
    return Response.json(
      { error: "Internal server error", message: error?.message },
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

export const config: Config = {
  path: "/api/*",
};
