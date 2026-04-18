# Product Requirements Document
## Tableset — Potluck Coordination App
**Version 2.0**
**Date:** April 2026

---

## Executive Summary & Vision

Tableset is a lightweight, SMS-first potluck and dinner party coordination platform. It exists to solve the gap between "party confirmed" and "everyone shows up with the right stuff" — a gap that today is filled by group chats, Google Sheets, and a lot of repeated texting.

The vision is a two-sided platform that delights both hosts and guests. Hosts get a clean, organized command center for their event: a guest list, a needs list, and a direct line to their guests. Guests get a frictionless experience — no account required — where they can claim a dish, get recipe ideas, and stay in the loop via the channels they already use (SMS and email).

The product is deliberately narrow. It is not an invitation tool, a full event management suite, or a meal kit service. It is the coordination layer that those tools don't provide: who is bringing what, what still needs to be claimed, and how the host communicates last-minute needs to the group.

The closest competitor, Partiful, handles the social and invitation side of parties extremely well. Tableset is designed to be complementary — deeper on potluck coordination and recipe discovery where Partiful is shallow — and can be used alongside Partiful or independently.

---

## Problem Statement

Hosting a dinner party involves a surprising amount of logistics. For small gatherings (3–6 people), hosts manage it through memory and group texts. For larger events — a backyard BBQ, a holiday potluck, a birthday dinner for 20–30 — the coordination overhead becomes genuinely painful.

**For hosts:**
- No dedicated tool exists to manage a potluck-style needs list (who is bringing what, what is still unclaimed, what was promised but needs a follow-up)
- Last-minute requests ("we need someone to bring ice") require digging through contacts and composing individual or group messages from scratch
- Tracking RSVPs, dish assignments, and dietary restrictions across SMS, email, and memory is error-prone and stressful

**For guests:**
- Being told "bring a dessert" with no further guidance is unhelpful, especially for less confident cooks
- Guests have no easy way to see what others are already bringing to avoid duplicates
- Receiving party communications across multiple channels (one text here, one email there) creates confusion

**The gap in the market:**
Partiful covers the invitation and social layer well but has no meaningful recipe integration and only a basic freeform "what to bring" list with no claim tracking. Meal planning apps like Deglaze are entirely host-facing and have no guest coordination layer. No single product owns the potluck coordination experience.

---

## Tech Stack

All stack decisions are final for the MVP.

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (TypeScript) | App Router, SSR for guest pages |
| Database | PostgreSQL via Supabase | Managed, generous free tier |
| ORM | Prisma | Type-safe queries, pairs with TypeScript |
| Auth | Supabase Auth | Email/password + Google social login for hosts |
| SMS | Twilio | Pay-as-you-go, ~$0.008/msg US |
| Email | Resend | Clean API, React Email for templates |
| Recipe API | Spoonacular | Free tier: 150 req/day; search by dish type |
| Hosting | Vercel | Zero-config Next.js deployment, auto SSL |
| Styling | Tailwind CSS | Utility-first, mobile-first |

**Guest authentication model:** Guests do not have accounts. Each guest record has a UUID `invite_token` generated on creation and embedded in every SMS and email link. All guest-facing API routes are authenticated via this token in the URL — not via session. Guest links follow the pattern `/e/[token]`.

**AI recipe fallback:** If Spoonacular returns poor results, a lightweight Python FastAPI microservice (deployed separately on Vercel or Railway) calls the Anthropic API to generate recipe suggestions. This is a secondary service, not part of the core Next.js app.

---

## Data Model

Six tables. All primary keys are UUIDs. All tables include a `created_at` timestamp.

### `hosts`
Host account table. Managed by Supabase Auth.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | string | |
| email | string | unique |
| password_hash | string | managed by Supabase Auth |
| created_at | timestamp | |

### `events`
One record per party. Belongs to a host.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| host_id | uuid FK → hosts | |
| title | string | e.g. "Summer Backyard BBQ" |
| description | text | optional |
| starts_at | timestamp | single field, not split date/time |
| location | string | plain text address |
| show_guest_list | boolean | host toggle: guests can see who else is attending. Default false. |
| created_at | timestamp | |

### `guests`
One record per invited person per event. No user account.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| event_id | uuid FK → events | |
| name | string | |
| email | string | nullable — host may only have phone |
| phone | string | nullable — host may only have email |
| invite_token | uuid | unique, generated on creation, embedded in all guest links |
| rsvp_status | enum | `pending`, `going`, `maybe`, `declined` — default `pending` |
| rsvp_at | timestamp | nullable — set when guest first responds |
| created_at | timestamp | |

At least one of `email` or `phone` must be present. Both are allowed.

### `needs_list_items`
One record per dish or task slot on the event's needs list.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| event_id | uuid FK → events | |
| label | string | display name, e.g. "Dessert", "A bag of ice" |
| category | string | seeds Spoonacular search, e.g. "dessert", "drinks" |
| is_open | boolean | true = any guest can volunteer; false = host-assigned only |
| created_at | timestamp | |

### `claims`
Join between a guest and a needs list item. Enforces one claim per item via unique constraint on `needs_list_item_id`.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| needs_list_item_id | uuid FK → needs_list_items | UNIQUE — one claim per item enforced at DB level |
| guest_id | uuid FK → guests | |
| confirmed_recipe_name | string | nullable — set when guest confirms a recipe |
| confirmed_recipe_url | string | nullable — Spoonacular URL or guest-entered |
| claimed_at | timestamp | set when guest claims |
| confirmed_at | timestamp | nullable — set when guest confirms a recipe |

**Race condition handling:** The unique constraint on `needs_list_item_id` means only one claim can succeed at the DB level. If a second guest tries to claim the same item, the API returns a 409 and the guest view shows: "Sorry, someone just claimed that — check out what's still open."

### `blasts`
Append-only log of every host-to-guest message sent.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| event_id | uuid FK → events | |
| message | text | the message body |
| channel | enum | `sms`, `email`, `both` |
| recipient_filter | enum | `all`, `going_only`, `unclaimed_only` |
| sent_at | timestamp | |

---

## Project Structure

```
potluck-app/
├── prisma/
│   ├── schema.prisma           — full data model
│   └── migrations/             — auto-generated by prisma migrate
│
├── src/
│   ├── app/                    — Next.js App Router
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── signup/page.tsx
│   │   │
│   │   ├── (dashboard)/        — host-authenticated experience
│   │   │   ├── layout.tsx      — authenticated shell / nav
│   │   │   ├── page.tsx        — host home: list of all events
│   │   │   └── events/
│   │   │       ├── new/page.tsx
│   │   │       ├── [id]/page.tsx          — main host dashboard
│   │   │       ├── [id]/guests/page.tsx   — manage guest list
│   │   │       ├── [id]/needs/page.tsx    — manage needs list
│   │   │       └── [id]/blast/page.tsx    — compose & send blast
│   │   │
│   │   ├── e/[token]/
│   │   │   └── page.tsx        — guest view (no auth required)
│   │   │
│   │   └── api/
│   │       ├── events/
│   │       │   ├── route.ts                    — POST create event
│   │       │   └── [id]/
│   │       │       ├── route.ts                — GET, PATCH, DELETE
│   │       │       ├── guests/route.ts         — GET, POST guests
│   │       │       ├── needs/route.ts          — GET, POST needs items
│   │       │       └── blast/route.ts          — POST send blast
│   │       │
│   │       ├── guest/[token]/
│   │       │   ├── route.ts                    — GET guest + event by token
│   │       │   ├── rsvp/route.ts               — PATCH rsvp_status
│   │       │   ├── claim/route.ts              — POST claim an item
│   │       │   └── confirm/route.ts            — PATCH confirm a recipe
│   │       │
│   │       └── recipes/
│   │           └── route.ts                    — GET suggestions (Spoonacular proxy)
│   │
│   ├── components/
│   │   ├── host/
│   │   │   ├── EventCard.tsx
│   │   │   ├── NeedsListItem.tsx
│   │   │   ├── GuestRow.tsx
│   │   │   └── BlastComposer.tsx
│   │   ├── guest/
│   │   │   ├── RsvpButtons.tsx
│   │   │   ├── NeedsListClaim.tsx
│   │   │   ├── RecipePanel.tsx
│   │   │   └── ConfirmationBanner.tsx
│   │   └── ui/                 — shared primitives
│   │       ├── Button.tsx
│   │       ├── Badge.tsx
│   │       └── Input.tsx
│   │
│   ├── lib/
│   │   ├── prisma.ts           — singleton Prisma client
│   │   ├── twilio.ts           — SMS send helper
│   │   ├── resend.ts           — email send helper
│   │   ├── spoonacular.ts      — recipe API wrapper
│   │   ├── ical.ts             — .ics file generator
│   │   └── tokens.ts           — invite token generation (UUID v4)
│   │
│   └── types/
│       └── index.ts            — RsvpStatus, Channel, RecipientFilter enums + shared types
│
├── middleware.ts                — auth guard for (dashboard) routes
├── .env.local                  — secrets (never committed)
├── .env.example                — template listing all required env var keys
├── next.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

---

## Core MVP Features

### Host Account & Event Creation
- Hosts sign up via email/password or Google (Supabase Auth handles both)
- Create an event: title, `starts_at` (single timestamp), location (plain text), optional description
- `show_guest_list` toggle on the event — controls whether attending guests can see the full attendee list. Defaults to false.
- Events are editable after creation

### Guest List Management
- Add guests: name + phone and/or email (at least one contact method required)
- Invite is sent immediately on guest creation, or can be queued and sent in bulk
- RSVP status visible per guest: `pending` (grey dot), `going` (green dot), `maybe` (amber dot), `declined` (no dot / muted row)
- Guest list visible in right sidebar of host dashboard with: avatar initials, name, claimed dish (or "nothing claimed yet"), RSVP dot

### Needs List
- Each item: `label` (what the host calls it) + `category` (what to search for in Spoonacular)
- Items are either open (any going guest can volunteer) or directly assigned to one guest
- One claim per item — enforced at DB level with unique constraint
- Host dashboard shows claimed vs. open badge per item (green = claimed, amber = open)
- Host can add new items inline from the dashboard (text input + Add button at the bottom of the list)

### Recipe Suggestions
- Single reusable `RecipePanel` component used in both assigned and volunteer contexts
- Fetches from `/api/recipes?q=[category]` (Spoonacular proxy) on mount
- Shows 3 cards: recipe name, prep time, servings, difficulty
- Selecting a card highlights it (green border) and populates the confirm button: "Confirm: [Recipe name]"
- Confirming calls `PATCH /api/guest/[token]/confirm` — writes `confirmed_recipe_name` and `confirmed_recipe_url` to the claim record
- Assigned flow: panel opens automatically; confirmation is encouraged by copy
- Volunteer flow: panel opens when item is claimed; "I'll figure out my own recipe" option skips recipe confirmation

### Invitations & Calendar
- Initial invite sent via SMS, email, or both depending on guest contact info
- SMS body: short message + `/e/[token]` URL + Google Calendar add link
- Email: event details + RSVP button linking to `/e/[token]` + `.ics` attachment
- `.ics` file fields: `SUMMARY` (event title), `DTSTART` (starts_at), `LOCATION`, `DESCRIPTION`

### Blast Messaging
- Host composes message in the BlastComposer panel on the dashboard
- Recipient filter toggle: all guests / going only / unclaimed only
- Channel toggle: SMS / email / both
- Each sent blast logged in `blasts` table
- Delivery respects per-guest contact info (if a guest has only SMS, they only receive SMS regardless of blast channel setting)

### Host Dashboard Layout
- Two-column layout: left column (main content) + right sidebar (300px)
- Left column top: stat row — "X Going / X Maybe / X Open items"
- Left column main: needs list (dominant element, full remaining height)
- Left column bottom: inline add-item input
- Right sidebar top: event metadata card (date/time, location, guest count)
- Right sidebar bottom: guest list (avatar, name, dish, RSVP dot) — scrollable if long
- Top bar: event name (breadcrumb), "Preview invite" button, "Send blast" button
- "Send blast" expands the BlastComposer inline below the top bar

---

## Guest Experience — Full Flow

The entire guest experience lives at `/e/[token]`. No login required. Mobile-first design.

### Step 1 — Landing (RSVP gate)
Shown to all guests before they RSVP. The needs list is NOT visible at this step.

- Dark header: event title, "Hosted by [host first name]", date/time and location as pills
- Personal message if provided by host
- Three stacked RSVP buttons: "I'm going!" / "Maybe" / "Can't make it"

### Step 2a — Declined
- Icon + heading: "Aw, we'll miss you!"
- Body: "No worries — maybe next time. [Host first name]'s been notified you can't make it."
- Link: "Changed your mind? Update your RSVP" → returns to Step 1

### Step 2b — Maybe
- Icon + heading: "Fingers crossed!"
- Body: "Hope you can make it. We'll send you a reminder the day before — no pressure."
- Link: "Know for sure now? Update your RSVP" → returns to Step 1
- System queues a reminder SMS/email for the day before the event for this guest

### Step 2c — Going (full view)
Revealed only after confirming attendance. Sections in order:

1. **Your assignment** (if host assigned this guest an item)
   - Teal banner: "🎯 [Host first name] assigned you [item label]. Pick one of these or confirm your own idea."
   - `RecipePanel` renders automatically below the banner

2. **Also open — volunteer?**
   - Each unclaimed open item as a tappable card: emoji, label, "Open — tap to volunteer"
   - Tapping claims the item: check appears, text → "You're on it!", `RecipePanel` expands below
   - Guest can claim multiple open items

3. **Already claimed**
   - Non-interactive muted rows: emoji, label, "[First name]" of claimant
   - Prevents duplicate confusion

4. **Who's coming** (only if `show_guest_list = true` on the event)
   - Avatar initials + first name per confirmed guest
   - "and X more" if list is long

### Step 3 — Confirmed
Shown after tapping "Confirm: [Recipe name]":

- Teal banner: "🎉 You're all set! / [Recipe name] — [Host first name]'s been notified."
- Below: "See you [weekday] the [date]! We'll text you if anything changes."
- Open volunteer items remain visible below — guest can still pick up additional items

### Recipe Panel Behavior (both contexts)
- Renders inline, beneath the relevant item card or assignment banner
- Fetches from `/api/recipes?q=[category]` on mount
- 3 recipe cards: name, prep time, servings, difficulty
- Tap to select: green border on selected card, confirm button populates
- "Confirm: [Recipe name]" button → PATCH claim record → transition to confirmed state
- Volunteer context only: secondary option "I'll figure out my own recipe" — claims without recipe

---

## Copy & Tone

Warm, casual, slightly playful. Like a message from a friend. The host's first name is used in all guest-facing copy.

| Avoid | Use instead |
|---|---|
| "RSVP declined" | "Aw, we'll miss you!" |
| "Your RSVP has been recorded as maybe" | "Fingers crossed!" |
| "Confirmation successful" | "You're all set!" |
| "The host has been notified" | "[Host name]'s been notified" |
| "You will receive updates via SMS" | "We'll text you if anything changes" |

---

## Out of Scope (MVP)

- Native mobile app — web-first, mobile-responsive only
- Payment splitting / chip-in
- Full host menu planning mode
- Dietary restriction collection and recipe filtering
- Seating charts
- Public events / event discovery
- Guest-to-guest messaging
- Post-party photo sharing
- Recurring events / guest history
- Budget tracking
- Third-party integrations (Partiful import, etc.)
- Co-host support
- Guest accounts

---

## Post-MVP Growth Plan

### Phase 2 — Coordination Depth
- Dietary restriction collection at RSVP, surfaced to host and used to filter recipe suggestions
- Host-curated recipe suggestions per needs list item
- Automated pre-party reminders for guests who haven't claimed or confirmed
- Last-minute request blast with one-tap SMS reply to claim
- Co-host support

### Phase 3 — Food & Menu Planning
- Full menu planning mode — host plans complete meal, needs list generated automatically
- Party theme support — filters recipe suggestions across all item slots
- Host and guest recipe saves to a personal library
- Post-party recipe recap sent to all guests

### Phase 4 — Host Social Layer
- Host profiles with event history and recurring guest lists
- One-tap re-invite from past events
- Post-party photo album

---

## Revenue Model

Guest experience is always free.

**Primary: Freemium host subscription**
- Free tier: up to 3 events/year, core needs list, basic blast messaging
- Paid tier (~$5–8/month or $30–40/year): unlimited events, full messaging tools, dietary tracking, menu planning, event history, co-host support

**Secondary: Recipe affiliate / ingredient delivery**
- "Get ingredients delivered" CTA (Instacart / Amazon Fresh affiliate) shown after a guest confirms a recipe
- High-intent moment, low friction, no ads required

**Not recommended: Display advertising**

---

## Open Questions

1. **Recipe API volume** — Spoonacular free tier is 150 req/day. Need to validate this against projected usage before launch. If a 20-guest event each load the recipe panel once, that's 20 requests per event. Fine at MVP scale but monitor closely.
2. **Twilio cost at scale** — At ~$0.008/msg, a 25-guest event with 1 invite + 2 blasts = ~75 messages = ~$0.60. Acceptable. Need to validate against actual blast patterns.
3. **Guest token expiry** — Tokens are UUID v4 (unguessable). Decision needed: expire 30 days post-event, or keep active indefinitely. Leaning 30 days post-event.
4. **"Maybe" reminder delivery** — Guests who RSVP maybe get a reminder the day before. Decide: SMS, email, or both? Should reminder include a link to view the needs list and update RSVP? (Likely yes.)
5. **App name & domain** — "Tableset" is the working title. Domain availability and final branding TBD.
