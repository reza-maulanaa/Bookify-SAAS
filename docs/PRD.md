# PRD — SaaS-ify Booking System

> Disimpan verbatim dari brief owner (Reza), 2026-07-16. Sumber kebenaran scope MVP.
> Progress & keputusan implementasi: lihat `SECOND-BRAIN/CODE/10 Projects/SaaS-ify Booking/SaaS-ify Booking.md` (vault Obsidian) — ringkasannya juga ada di bagian akhir file ini.

## 1. Overview

[PROJECT NAME] SaaS-ify Booking System · [TYPE] Multi-tenant SaaS Platform · [VERSION] v1.0 (MVP)

SaaS-ify Booking System adalah platform booking berbasis SaaS yang memungkinkan berbagai jenis bisnis (salon, klinik, konsultan, gym, workshop, dll) membuat dan mengelola sistem reservasi online mereka sendiri dalam hitungan menit. Setiap bisnis mendapatkan subdomain atau custom domain, halaman booking publik, dashboard admin, serta fitur manajemen jadwal, karyawan, layanan, dan pembayaran.

Visi: "Shopify untuk booking".

Diferensiasi: setup <5 menit (wizard), halaman booking publik customizable, multi-staff & multi-location sejak MVP, native payment, real-time availability tanpa double-booking.

## 2. Problem Statement

- P1 — Fragmentasi alat: UMKM pakai WhatsApp + spreadsheet + Google Calendar → missed appointment, double-booking.
- P2 — Biaya pengembangan custom Rp 50-200 juta, 2-6 bulan.
- P3 — Platform eksisting (Calendly/Acuity/Square) tidak lokal: tidak ada Bahasa Indonesia, GoPay/OVO, WIB native.

## 3. Target Users

- Persona A "Rina" — solo salon owner, butuh halaman booking simpel + reminder, budget Rp 99-199rb/bln.
- Persona B "Dr. Adi" — klinik 5 dokter, butuh multi-staff calendar + pembayaran, Rp 299-499rb/bln.
- Persona C "Maya" — end customer, butuh lihat jadwal → pilih → bayar → konfirmasi.
- Persona D "Andi" — yoga studio 3 instruktur, butuh class booking + waitlist (→ defer post-MVP, lihat Q3).

## 4. System Architecture

- Client: public booking page (SSR/SSG), admin dashboard, mobile-responsive (satu codebase Next.js).
- API: Next.js API/server actions, webhook receivers (Stripe, email).
- Business logic: auth & multi-tenant resolver, booking engine (availability + conflict detection), schedule engine, payment orchestrator, notification dispatcher.
- Data: PostgreSQL (Supabase), Redis (cache/rate-limit, opsional), object storage (R2/S3).
- External: Stripe, Resend/SendGrid, Twilio/Wablas (WhatsApp), Vercel.

Multi-tenancy: shared database + kolom `tenant_id`, isolasi via RLS Supabase. Tenant resolution by subdomain (rina.saasify.id) atau custom domain. Setiap query WAJIB ter-scope tenant; tenant_id TIDAK PERNAH dari client, selalu dari session.

## 5. Core Features (MVP)

- F1 Auth & onboarding: email/password + magic link + Google OAuth; wizard 5 langkah (business info → working hours → ≥1 service → ≥1 staff → subdomain).
- F2 Service management: CRUD (nama, deskripsi, durasi, harga, kategori), gambar, buffer before/after, min lead time, max horizon, assign staff / any staff, toggle aktif, sort order.
- F3 Staff management: CRUD, working hours PER STAFF, time-off, assign services, staff login (role staff: lihat jadwal sendiri), kapasitas slot (class booking = post-MVP).
- F4 Booking management (admin): tabel filter/sort/search (tanggal, staff, service, status), booking manual, edit/reschedule, cancel + alasan, mark no-show/completed, internal notes, detail view.
- F5 Customer management: auto-create dari booking pertama, list + search, profile + riwayat, edit, manual add.
- F6 Business settings: profil, default working hours, timezone (default Asia/Jakarta), holiday calendar, booking policy, subdomain, custom domain (post-MVP), notification preferences.

## 6. Booking Flow (End Customer)

Landing (subdomain) → pilih service → pilih staff (skip jika 1; opsi "Any Available") → pilih tanggal & jam (kalender, hari tanpa slot di-grey-out; slot dihitung real-time dari working hours staff, booking confirmed/pending, buffer, min lead time) → isi nama/email/phone (auto-fill jika pernah booking) → review & confirm (+ cancellation policy checkbox; pilih payment jika berbayar) → payment (Stripe Checkout; gagal = pending 30 menit lalu auto-cancel) → confirmation page + email/WA + add-to-Google-Calendar.

Edge cases WAJIB: idempotency key (double-click confirm), slot keburu diambil ("Slot no longer available"), pending >30 menit auto-release, link expired → redirect, hari libur terfilter.

## 7. Calendar & Schedule View (Admin)

Day/Week/Month view; navigasi prev/next/today/jump; filter staff & service; color-coded; klik slot kosong = quick create; klik booking = detail panel; drag-drop reschedule (day/week); working hours sebagai shading; break/time-off blok abu-abu.
Schedule config: jam kerja per hari, break, recurring weekly, override per tanggal, time-off (single/range), import libur nasional Indonesia.

## 8. Multi-Tenant System

Resolution: hostname = app domain → landing/login/admin; subdomain/custom domain → cari tenant → set context → serve; tidak ketemu → "Business not found".
Security: middleware set tenant dari session BUKAN request; RLS policy per row; cross-tenant access = critical bug + automated test; super admin panel = out of MVP.
Plans: Free (1 staff, 5 services, 50 booking/bln) · Starter 99rb (2/15/200) · Pro 299rb (10/unlimited/1000, custom domain) · Business 499rb (unlimited, API). MVP: soft limits.

## 9. Payment System

Stripe primary (fallback Midtrans/Xendit — lihat Q1). Payment mode per service: free / full / deposit (%) / pay at venue. Stripe Checkout Session + Connect per tenant, platform fee X%. Webhook: `checkout.session.completed`, `payment_intent.payment_failed` + signature verification MUTLAK. Idempotency key. Session expire 30 menit → auto-cancel booking. Refund MVP: manual dari admin.

## 10. Notification System

Channel MVP: Email (Resend) + WhatsApp (Twilio/Wablas). Events customer: confirmed, reminder 24j & 1j, cancelled, rescheduled, receipt. Events admin: new booking, cancelled, payment received, daily summary. Preferences per tenant per event per channel. Implementasi: queue/background job (JANGAN synchronous di request), React Email template, WA approved templates.

## 11. Dashboard & Analytics

KPI cards (booking bulan ini vs lalu, revenue, new customers, no-show rate), booking trend 30 hari, upcoming hari ini, popular services, revenue by service. Reports: date range, per status/service/staff, new vs returning, no-show analysis, occupancy, export CSV. Teknis: aggregated/materialized view, cache 5 menit, Recharts.

## 12. Public Booking Page

URL: `sub.saasify.id` (landing) · `/book` · `/book/[service-slug]` · `/manage/:booking_id` (self-service reschedule/cancel tanpa login, verifikasi email OTP / booking ID + email, tunduk policy).
Landing sections: hero, about, services grid, team, contact, footer "powered by" (removable Pro+).
Customization: primary color, logo, cover, toggle sections, custom CSS (Business, sanitized), favicon.

## 13. Design System

Clean & minimal, mobile-first (70% customer dari mobile), forgiving (konfirmasi destructive action). Admin: light default + dark mode, sidebar collapsible, card layout, toast. Public: warna tenant, single-column max 640px. shadcn/ui + Tailwind + Lucide + Inter/Manrope; React Hook Form + Zod; TanStack Table; kalender CUSTOM (jangan FullCalendar); Recharts. Breakpoints 640/1024.

## 14. Tech Stack (per PRD; deviasi aktual lihat catatan implementasi)

Next.js 14+ App Router, TS strict, Tailwind, shadcn/ui, Zustand + TanStack Query, RHF + Zod, Framer Motion minimal. Backend: API routes/tRPC, NextAuth v5, Zod shared, Inngest/Trigger.dev, React Email + Resend, Twilio. DB: Supabase/Neon + Drizzle, Upstash Redis, R2, Vercel, Cloudflare DNS. Stripe Checkout + Connect. pnpm, ESLint+Prettier, Vitest + Playwright, Sentry.

## 15. Data Model (Core Tables)

tenants(id, name, slug UQ, subdomain UQ, custom_domain UQ NULL, logo_url, primary_color #4ade80, plan enum, status enum, timezone Asia/Jakarta, stripe_account_id, timestamps)
users(id, tenant_id FK, email UQ, name, password_hash NULL, role owner|admin|staff, avatar_url, created_at)
services(id, tenant_id, name, description, duration_min, price int Rupiah, buffer_before/after, min_lead_time menit, max_horizon hari=30, payment_mode enum, deposit_pct, category, image_url, sort_order, is_active, created_at)
staff(id, tenant_id, user_id FK NULL, name, bio, avatar_url, is_active, sort_order, created_at)
staff_services(staff_id, service_id) PK gabungan
staff_schedules(id, staff_id, day_of_week 0=Sen..6=Min, start_time, end_time, break_start/end NULL, is_active)
staff_time_off(id, staff_id, date, start_time/end_time NULL=full day, reason)
tenant_holidays(id, tenant_id, date, name)
customers(id, tenant_id, name, email, phone, notes, created_at, UNIQUE(tenant_id,email))
bookings(id, tenant_id, customer_id, service_id, staff_id, start_time, end_time, status pending|confirmed|cancelled|no_show|completed|payment_failed, payment_mode, total_price, deposit_amount, internal/customer_notes, cancellation_reason, cancelled_by, cancelled_at, idempotency_key UQ, timestamps)
payments(id, booking_id, tenant_id, stripe_session_id, stripe_payment_intent_id, amount, currency idr, status, refunded_at, refund_amount, metadata jsonb, created_at)
notifications(id, tenant_id, booking_id NULL, channel email|whatsapp, recipient, event_type, status sent|failed|pending, error_message, sent_at)

## 16. Key API Endpoints & Availability Algorithm

Public: GET tenant/:subdomain (+services), GET availability?staff_id&service_id&date, POST bookings (idempotency), GET/PATCH bookings/:id (reschedule/cancel dengan verifikasi), POST stripe/webhook.
Admin: CRUD services/staff (+schedule, time-off), bookings (list/manual/update/cancel/no-show/complete), customers, calendar (day/week/month), dashboard stats/chart, reports, settings (+logo, stripe connect).
Staff role: schedule & bookings milik sendiri saja.

Availability algorithm (LOGIKA KRITIS):
1. Ambil schedule staff untuk day-of-week tanggal; tidak ada / inactive → [].
2. staff_time_off full day → []; tenant_holidays → [].
3. Generate slot dari start→end per interval durasi service; skip break; skip < now+min_lead_time; skip > now+max_horizon.
4. Per kandidat: konflik dengan booking status pending/confirmed staff tsb (range overlap `start < slot_end AND end > slot_start`) → buang; hormati buffer_before/after dua arah.
5. Overlap check harus efisien (DB-level constraint sebagai jaring pengaman terakhir).

## 17. Non-Functional Requirements

Perf: public LCP <2.5s; availability <500ms; API p95 <300ms read / <1s write. Reliability: 99.5% uptime, daily backup, graceful degradation notifikasi. Security: HTTPS, RLS (bukan cuma app layer), rate limit 100/min IP, CSRF, parameterized queries, upload max 5MB + MIME check, Stripe webhook signature MUTLAK, mask PII di log. Scale: 10.000 tenant tanpa refactor besar; cache availability TTL 60s invalidate on write. A11y: WCAG 2.1 AA, keyboard nav, kontras 4.5:1. i18n: MVP Bahasa Indonesia; SEMUA string di file terpisah; format Rp XX.XXX, DD MMMM YYYY, HH:mm WIB.

## 18. Development Phases

- Phase 0 (mg 1-2): setup, schema+seed, auth, multi-tenant middleware, RLS, CI/CD. ✅ SELESAI
- Phase 1 (mg 3-5): service/staff CRUD + schedule, availability algorithm + tests, booking manual admin, conflict/idempotency. ✅ SELESAI
- Phase 2 (mg 6-7): public landing + full booking flow + confirmation + self-service manage. ← BERIKUTNYA
- Phase 3 (mg 8-9): Stripe Checkout/Connect + webhook, email + WA notification, reminder jobs.
- Phase 4 (mg 10-11): calendar day/week/month + drag-drop, dashboard KPI + charts, reports.
- Phase 5 (mg 12-13): onboarding wizard, page customization, custom domain, plan limits, E2E, marketing site.

## 19. Success Metrics

100+ tenant bulan 1-3, 50+ aktif, 1.000+ booking; >70% selesaikan wizard; zero double-booking; <1% payment failure; p95 <300ms; 10% free→paid; churn <5%; NPS >40.

## 20. Open Questions (rekomendasi di PRD)

Q1 payment: Stripe primary, Midtrans/Xendit fallback. Q2 WA: Twilio dulu. Q3 class booking: defer post-MVP. Q4 custom domain: bulan ke-2. Q5 mobile app: tidak, PWA cukup. Q6 bahasa: ID saja, arsitektur i18n siap. Q7 pricing: hybrid subscription + 2-3% fee.

## CONSTRAINTS UNTUK DEVELOPER/AI

- JANGAN skip RLS (non-negotiable), idempotency key booking, Stripe webhook signature verification.
- Semua string di file terpisah (siap i18n) — sudah ada: `lib/strings/id.ts`.
- Mobile-first, TS strict tanpa `any`, error message user-friendly, loading states.
- Kerjakan per phase, selesaikan sebelum lanjut.

---

## CATATAN IMPLEMENTASI (status per 2026-07-16, Phase 0+1 selesai)

Deviasi yang SUDAH DIPUTUSKAN owner (jangan re-litigasi):
1. **Supabase Auth**, bukan NextAuth v5 — starter repo sudah punya alur lengkap.
2. **SQL migration murni** (`supabase/migrations/`), bukan Drizzle — RLS/trigger/exclusion constraint wajib SQL. Drizzle boleh masuk nanti jika query bertipe makin banyak.
3. **npm**, bukan pnpm (sudah terlanjur, tidak worth migrasi).
4. React Hook Form belum dipakai — native form + Zod di server action cukup untuk form saat ini.
5. Redis/queue/Zustand/TanStack Query belum ada — tambah saat kebutuhan nyata muncul (Phase 3 pakai background job untuk notifikasi).

Detail lengkap arsitektur, gotchas, dan prompt next-step: lihat vault Obsidian
`~/SECOND-BRAIN/CODE/10 Projects/SaaS-ify Booking/SaaS-ify Booking.md`.
