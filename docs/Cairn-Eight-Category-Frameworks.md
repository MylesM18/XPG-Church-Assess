# Church Health Assessment
## The Eight Category Frameworks — v0.1

**For:** XP Gathering
**Purpose:** This is the diagnostic core. Each of the eight categories is defined here as a *falsifiable* object the engine can score, benchmark, and reason over. The anchored 1–10 scales are what let a score mean the same thing for every church, which is the entire reason the perception–reality gap and the earliest-constraint logic work.

**Status:** Draft for XPG consultant review (Phase 0). Every anchor below is a structural guess about *how XPG diagnoses*, written to be argued with. The wording is deliberately concrete so a consultant can point at a "5" and say "no, that's a 3" — which is exactly the calibration this document is built to provoke.

---

## How to read a framework

Every category has the same seven parts, so the engine consumes all eight uniformly:

1. **Definition** — one sentence. If you can't fail it, it's not a real category.
2. **Chain position** — Stage or Enabler, and what it depends on / gates.
3. **The questions** — four or five anchored 1–10 items. Each defines its 1, 5, and 10 by *observable fact*, not feeling. The leader locates the church on the spectrum; they do not rate a vibe.
4. **Scoring** — how items roll into a 0–100 category score.
5. **Interpretation rules** — what a low score *means* differently depending on where it sits in the chain. This is what the engine uses to write findings.
6. **Blind-spot trigger** — the specific pattern that produces the "you rated this high, but here's the problem" moment. The hook of the report.
7. **Offer** — the diagnosis-specific call this category surfaces when it's the constraint.

---

## The chain (confirmed with XPG)

```
STAGES  (what happens to a person, in order)

  1. Guest Experience  →  2. Community/Connection  →  3. Discipleship/Leadership  →  4. Volunteer  →  5. Generosity

ENABLERS  (what the organization does to make the chain work — gate everything, never the headline)

  · Governance/Accountability   gates: ALL
  · Communication               gates: Guest Experience, Community/Connection
  · Org Structure/Systems        gates: Volunteer, Discipleship/Leadership
```

**The rule that makes this a diagnosis and not a scorecard:** the engine walks the stages in order and stops at the *first* one that's broken. Everything downstream of a break will also score badly — but those are symptoms, and prescribing for a symptom wastes a year. An enabler that's badly broken *gates* the fix (it means the repair won't hold) but is never named as the primary constraint, because a leader's rating of "our governance" is opinion with no hard evidence behind it.

---

# STAGE 1 — GUEST EXPERIENCE

### Definition
A first-time guest is noticed, welcomed, captured, and given a clear next step — and the church knows whether they came back.

### Chain position
**Stage 1.** Depends on nothing (it's the front door). Gated by **Communication** (people can't come to what they can't find) and **Governance** (someone has to own it). Everything downstream depends on this working: you cannot connect, disciple, deploy, or grow the generosity of a person you never retained.

### The questions

**G1 — Guest capture.** *When a first-time guest visits, what actually happens to their information?*
- **1** — Nothing. We don't know who visited or how to reach them.
- **5** — We capture some guests (a connection card, a table) but it's inconsistent and no one owns the follow-up.
- **10** — Nearly every first-time guest is captured, and their information reaches a specific person the same week.

**G2 — Follow-up speed and ownership.** *After a guest visits, how fast and how reliably are they contacted?*
- **1** — They aren't, unless they reach out to us first.
- **5** — Sometimes, eventually, by whoever remembers — usually more than a week later.
- **10** — Every captured guest is personally contacted within 48 hours, and one role owns that this happens.

**G3 — The next step is obvious.** *Could a guest who wanted to go deeper figure out how, without asking a staff member?*
- **1** — No. They'd have to know someone or ask.
- **5** — There's a next step (a class, a lunch, an app) but it's easy to miss and we don't point to it clearly.
- **10** — Every guest leaves knowing exactly what to do next, and it's obvious without asking anyone.

**G4 — We measure return.** *Do you know what share of first-time guests come back a second time?*
- **1** — We have no idea. We don't track it.
- **5** — We have a rough sense but no real number.
- **10** — We know our return rate and can see whether it's moving.

**G5 — Assimilation ownership.** *Who is responsible for what happens to a guest in their first 30 days?*
- **1** — No one. It's nobody's job.
- **5** — It's shared across a few people or a team, so it falls through the cracks.
- **10** — One person owns the 30-day guest journey and is accountable for it.

### Scoring
`guest_score = mean(G1..G5) × 10` → 0–100.
G4 is also read as a **measurement signal**: a 1–2 on G4 flags the church as unable to see its own front door, which is a finding in itself (see the Measurement Gap diagnosis in the build spec).

### Interpretation rules
- Guest Experience is Stage 1, so **if it breaks, it is almost always the primary constraint** — there is nothing upstream to blame. A church pouring money into outreach and events while G1–G2 sit below 40 is buying guests it cannot keep. This is the *leaky bucket*, and it's the single most convertible finding in the product.
- Low G4 (can't measure return) upgrades the confidence problem: you may be diagnosing a church that doesn't know it's leaking.
- If Guest Experience scores *high* but Community/Connection (Stage 2) is broken, the diagnosis moves downstream — they get people in the door and lose them at the belonging stage.

### Blind-spot trigger
Leader rates the *category* 7+ (G1–G3 self-perception high) **but** G4 shows they don't measure return, **or** the profile shows high first-time guest volume with flat/declining attendance. The report says: *you rated your guest experience highly, but you can't see your return rate, and your attendance is flat — you don't have a welcome problem, you have a retention problem you can't currently measure.*

### Offer
**Guest Retention Diagnostic** — "You may be paying for guests you aren't keeping."

---

# STAGE 2 — COMMUNITY / CONNECTION

### Definition
People move from attending to *belonging* — they are known by name by someone who isn't on staff, and they're in a relational group where they'd be missed if they vanished.

### Chain position
**Stage 2.** Depends on **Guest Experience** (you can't connect people you didn't retain). Gated by **Communication** (people join what they hear about clearly). Feeds Discipleship (formation happens in relationship) and is one of the two feet **Generosity** stands on — belonging drives *breadth* of giving (strangers don't give).

### The questions

**C1 — Known by name.** *What share of your regular attenders are personally known by someone who is not on paid staff?*
- **1** — Very few. Most people come and go anonymously.
- **5** — Maybe half. There's a committed core, and a large edge of people no one would notice leaving.
- **10** — Nearly everyone is known and cared for by a non-staff person.

**C2 — Groups participation.** *What share of adults are in a group, class, or consistent relational community?*
- **1** — Under 15%. Groups aren't really a thing here.
- **5** — Around a third. We have groups but most people aren't in one.
- **10** — More than half of adults are in a real group.

**C3 — Would they be missed.** *If a regular attender stopped coming for a month, what would happen?*
- **1** — Nothing. No one would notice.
- **5** — Someone might notice eventually, but no one owns reaching out.
- **10** — Someone would notice within a week or two and personally reach out.

**C4 — On-ramp to belonging.** *How does a new person actually get connected into relationship here?*
- **1** — They're on their own. If they don't force their way in, they stay on the edge.
- **5** — We have a path (groups launch, a class) but it's seasonal or easy to miss.
- **10** — There's a clear, always-available on-ramp and we actively walk people onto it.

**C5 — Breadth of the core.** *Is relational life concentrated in a small core, or spread across the body?*
- **1** — Everything runs through the same 20 people who've been here for years.
- **5** — There's a core and a slowly growing second ring, but it's still concentrated.
- **10** — Relationship and ownership are spread widely; new people become insiders regularly.

### Scoring
`connection_score = mean(C1..C5) × 10` → 0–100.

### Interpretation rules
- If Guest Experience is healthy and **Connection is the first break**, this is the constraint — and critically, **it explains weak giving and weak volunteering downstream.** The report explicitly tells the church *not* to run a generosity campaign or a volunteer push yet, because you can't ask strangers to give money or time. Fix belonging first.
- Low C2 (groups) with high C1 (known by name) can mean a small, warm church that hasn't systematized belonging — different prescription than a large anonymous one.
- Low C5 (concentrated core) is the "founder's church" pattern: warm but capped. It gates Volunteer and Leadership downstream.

### Blind-spot trigger
Leader rates connection 7+ **but** C2 (groups %) sits in the bottom quartile for their size, **or** C1 and C3 reveal a large anonymous edge. The report says: *your core feels deeply connected to you, and that's real — but it's masking a large group of people no one would notice leaving. Your "connected" church is smaller than it feels.*

### Offer
**Belonging & Assimilation Review** — "Your church may feel more connected than it is."

---

# STAGE 3 — DISCIPLESHIP / LEADERSHIP

### Definition
People are being formed toward maturity along a path the church can actually name — and that path produces *new leaders*, not just deeper attenders.

### Chain position
**Stage 3.** Depends on **Community/Connection** (formation happens in relationship, not rows). Gated by **Org Structure/Systems** (a discipleship path that lives in one person's head isn't a path). Feeds Volunteer and is the second foot **Generosity** stands on — teaching drives *depth* of giving (people give generously when they understand why).

### The questions

**D1 — The path is nameable.** *Could your staff describe the path a new believer walks here — and would they describe it the same way?*
- **1** — No. There's no defined path; everyone would say something different.
- **5** — There's an implicit path a few leaders could sketch, but it's not written or shared.
- **10** — There's a clear, named path, and our leaders would all describe it consistently.

**D2 — People are actually moving.** *Are people visibly maturing — moving from new to grounded to serving to leading?*
- **1** — Not really. People plateau after they get comfortable.
- **5** — Some are, but it's accidental — the self-motivated ones.
- **10** — We can point to people at every stage and name who's moving.

**D3 — Leaders are multiplying.** *In the last year, how many people moved from being served to leading others?*
- **1** — None that I can name.
- **5** — A handful, but it wasn't intentional.
- **10** — Many, through a deliberate pipeline we run.

**D4 — Depth of teaching on the "why."** *Do your people understand the reasons behind the Christian life, or mostly the behaviors?*
- **1** — Mostly behaviors and attendance. The "why" isn't taught.
- **5** — We teach solid content on Sundays, but it doesn't consistently translate into formed conviction.
- **10** — Our people can articulate *why*, not just *what*, and it shows in how they live.

**D5 — Reproducibility.** *If your best disciple-maker left, would formation continue?*
- **1** — No. It depends on specific gifted individuals.
- **5** — Partly — some of it is systematized, much of it isn't.
- **10** — Yes. Formation runs on a reproducible model, not on heroes.

### Scoring
`discipleship_score = mean(D1..D5) × 10` → 0–100.
**Note:** in v0, Discipleship is scored on perception only (no hard-count evidence stream yet), so per the build-spec rule it can be named as a **contributing** constraint but should be flagged lower-confidence as *primary* unless D3 (leader multiplication, the most observable item) corroborates. XPG may add an evidence stream here later.

### Interpretation rules
- If Connection is healthy and **Discipleship is the first break**, the constraint is formation — and this specifically predicts weak *depth* of giving downstream (people who aren't taught why they give, don't).
- Low D3 (no new leaders) with otherwise okay scores is the **leadership-pipeline** problem: the church's ceiling is the number of people who can lead, and that's capped. This gates Volunteer hard.
- Low D1 (no nameable path) is often the real root when a church "does a lot of discipleship" but can't say what it's for.

### Blind-spot trigger
Leader rates discipleship 7+ (lots of programs, strong preaching) **but** D1 shows no consistent named path **or** D3 shows near-zero new leaders. The report says: *you're producing knowledgeable attenders, not new leaders — activity is high, but multiplication is near zero, and that's your real ceiling.*

### Offer
**Discipleship Pathway & Leadership Pipeline Session** — "Your ceiling isn't your building. It's the number of people who can lead."

---

# STAGE 4 — VOLUNTEER

### Definition
Enough of the body is serving that ministry isn't carried by a burning-out few — and volunteers are developed, not just recruited and used.

### Chain position
**Stage 4.** Depends on **Discipleship/Leadership** (formed people serve; unformed people have to be begged) and on **Community/Connection** (belonging precedes serving). Gated by **Org Structure/Systems** (you can't deploy people at scale without a system) and **Governance** (someone owns the volunteer function). Feeds Generosity — serving is half of it.

### The questions

**V1 — Breadth of serving.** *What share of your regular adults serve at least once a month?*
- **1** — Under 10%. The same few people do everything.
- **5** — Around 20%. A committed group serves; most attend and leave.
- **10** — Over a third serve regularly.

**V2 — The burnout test.** *Are the same people carrying multiple roles because no one else will step up?*
- **1** — Yes. A small group is exhausted and holding everything together.
- **5** — Somewhat — key people are stretched, but it's not yet a crisis.
- **10** — No. Load is spread; no one is carrying three jobs.

**V3 — A clear on-ramp to serve.** *How easy is it for someone who wants to serve to actually start?*
- **1** — Hard. They have to know someone or chase it down.
- **5** — Possible, but clunky — an interested person can slip through the cracks.
- **10** — Easy and obvious. A willing person is serving within two weeks.

**V4 — Volunteers are developed.** *Once someone serves, do they grow — or just fill a slot?*
- **1** — They fill a slot. There's no development.
- **5** — Some team leaders invest; most don't.
- **10** — Serving is a development path; volunteers grow into leaders.

**V5 — Staff multiply vs. do.** *Do your staff primarily do the ministry, or equip others to?*
- **1** — Staff do it themselves; it's faster than training someone.
- **5** — Mixed — some equip, some are the bottleneck.
- **10** — Staff multiply ministry through volunteers as their main job.

### Scoring
`volunteer_score = mean(V1..V5) × 10` → 0–100.

### Interpretation rules
- If the upstream chain is healthy and **Volunteer is the first break**, the constraint is deployment — usually an **Org Structure/Systems** gate (no system to onboard people) or a **staff-as-bottleneck** problem (V5 low). The engine checks the enablers before prescribing.
- Low V1+V2 (few serve, core burning out) with healthy Connection means people belong but aren't being *asked* or *equipped* — a mobilization problem, not a belonging one.
- Low V5 (staff do rather than multiply) is a leverage problem that caps the whole church regardless of size.

### Blind-spot trigger
Leader rates volunteering 7+ ("we have tons of volunteers") **but** V2 reveals the same core in multiple roles and V1 sits low. The report says: *you don't have a strong volunteer culture — you have a small group of heroes about to burn out. Remove any one of them and three ministries stop.*

### Offer
**Volunteer Mobilization Session** — "You may be one burnout away from three ministries stopping."

---

# STAGE 5 — GENEROSITY (SERVING & GIVING)

### Definition
People give of their time and money out of formed conviction — the church is developing generous *disciples*, not just raising funds.

### Chain position
**Stage 5, the end of the chain.** Depends on **both** Community/Connection (belonging → *breadth* of giving) **and** Discipleship (teaching → *depth* of giving). This dual dependency is the most important diagnostic split in the entire instrument. Because it sits last, **a low generosity score is very often a symptom of a break upstream, not a real generosity problem** — and the engine's most valuable move is telling a church exactly that.

### The questions

**GEN1 — Breadth of giving.** *What share of your regular households give anything at all in a year?*
- **1** — Under 25%. A small minority funds the church.
- **5** — Around 40%. A committed minority gives; most don't.
- **10** — More than half of households give.

**GEN2 — Depth / the "why."** *Do your people understand why they give, or mostly where to give?*
- **1** — Mostly logistics. Generosity isn't taught as formation.
- **5** — We teach on it periodically, usually around budget needs.
- **10** — Generosity is discipled as worship; our people know why, not just where.

**GEN3 — Serving generosity.** *Is generosity of time modeled and celebrated, not just money?*
- **1** — We mostly talk about money when we talk about giving.
- **5** — We value both but emphasize financial giving.
- **10** — Time and money are both discipled as generosity; we celebrate both.

**GEN4 — A next step in generosity.** *Does a person have a clear next step to grow in generosity from wherever they are?*
- **1** — No. You're either a giver or you're not; there's no path.
- **5** — There's teaching but no personal next step for different starting points.
- **10** — Everyone has a clear next step, whether they've never given or already tithe.

**GEN5 — Funded for mission, not survival.** *Is your generosity funding vision, or just keeping the lights on?*
- **1** — We're in survival mode; giving barely covers operations.
- **5** — We're stable but have little margin for new mission.
- **10** — Generosity funds vision and mission beyond our own walls.

### Scoring
`generosity_score = mean(GEN1..GEN5) × 10` → 0–100.

**The breadth/depth split (the key diagnostic):** the engine compares GEN1 (breadth) against GEN2/GEN4 (depth):
- **Low breadth, adequate depth** (few give, but those who do are taught and committed) → this is a **belonging problem**, look upstream at Connection. Strangers don't give.
- **Adequate breadth, low depth** (most give a little, but no one's been taught why) → this is a **teaching problem**, and generosity may genuinely be the constraint. Different offer, different fix.
- **Both low** → almost certainly downstream of a chain break. Look upstream first; do not prescribe a giving campaign.

### Interpretation rules
- Generosity is **the last place the engine looks for a *primary* constraint**, precisely because it's the most common *symptom*. If Connection or Discipleship broke upstream, the report attributes the giving weakness there and explicitly warns against a premature campaign.
- Only when the entire upstream chain is healthy AND the breadth/depth split points to a teaching gap does generosity get named as the primary constraint.

### Blind-spot trigger
Leader is worried about giving and rates generosity low, wanting a campaign — **but** the upstream chain shows Connection or Discipleship is the real break. The report says: *your giving isn't your problem, it's your symptom. Running a generosity campaign into a belonging gap raises money once and changes nothing. Fix connection first, and giving follows.* (This is the single highest-credibility, "they'll trust everything after this" moment in the product.)

### Offer
- If **depth** gap with healthy upstream → **Generosity Culture & Discipleship Review** — "Most of your people give. Few have been taught why."
- If **breadth** gap → routes upstream: **Belonging & Assimilation Review** — "Your givers are generous; there just aren't enough of them, and that's a connection problem."

---

# ENABLER — GOVERNANCE / ACCOUNTABILITY

### Definition
Decisions get made cleanly, authority and responsibility are clear, and leaders are accountable — the church isn't run by ambiguity, personality, or a bottleneck at the top.

### Chain position
**Enabler. Gates ALL stages.** Governance never appears as the headline diagnosis (a leader's rating of "our governance" is opinion with no hard evidence), but a badly broken governance score is a **gating condition** on every prescription: it means whatever you fix downstream won't hold, because the church can't make and sustain decisions.

### The questions

**GOV1 — Decision clarity.** *When a real decision needs to be made, is it clear who makes it?*
- **1** — No. Decisions stall, or everything routes to one person.
- **5** — Mostly clear for routine things, murky for anything hard or new.
- **10** — Clear, understood, and followed at every level.

**GOV2 — Role clarity.** *Do staff and key leaders know what they own and what they don't?*
- **1** — No. Roles overlap and things fall through the cracks.
- **5** — Roughly — there are titles, but real ownership is fuzzy.
- **10** — Yes. Everyone knows their lane and their authority.

**GOV3 — Accountability is real.** *When someone (including a leader) underperforms, is it addressed?*
- **1** — No. We avoid it, especially with long-tenured people.
- **5** — Sometimes, inconsistently, depending on who it is.
- **10** — Yes, directly and fairly, at every level.

**GOV4 — The senior leader isn't a bottleneck.** *Can the church function and decide when the senior leader is away?*
- **1** — No. Everything waits for them.
- **5** — Partly — routine things move, big things wait.
- **10** — Yes. Authority is genuinely distributed.

**GOV5 — Healthy board/elder function.** *Does your governing body provide real accountability and wisdom, or rubber-stamp?*
- **1** — It's a rubber stamp, or a source of dysfunction.
- **5** — It functions, but leans passive or overly deferential.
- **10** — It provides genuine accountability, wisdom, and support.

### Scoring
`governance_score = mean(GOV1..GOV5) × 10` → 0–100.

### Interpretation rules
- **Never primary.** Reported as a **gating condition** when it falls below the gate threshold. Example the engine writes: *"Note: your governance score suggests decisions are hard to make and sustain here. Whatever you choose to work on, it will not hold until this is addressed — this is the ground the other fixes stand on."*
- Low GOV4 (bottleneck) is the most common and most consequential: it caps every other improvement, because the church can only move as fast as one person.

### Blind-spot trigger
Leader rates the church healthy across stages **but** governance is quietly low. The report elevates it as the *reason previous improvement efforts didn't stick*: *you've tried to fix these things before and they didn't hold — that's not a discipline problem, it's a governance problem.*

### Offer
Surfaced as a **gating flag on whatever the primary offer is**, not its own call — e.g., "before the pipeline work can stick, we'd start with a short governance conversation."

---

# ENABLER — COMMUNICATION (INTERNAL / EXTERNAL)

### Definition
The right people know the right things at the right time — internally (staff and leaders aligned) and externally (guests and members can find, understand, and act).

### Chain position
**Enabler. Gates Guest Experience and Community/Connection** most directly (people can't come to, or connect into, what they can't find or understand). A communication break makes the front-of-chain stages *look* broken when the real problem is that no one can navigate them.

### The questions

**COM1 — Internal alignment.** *Could every staff member state this season's top priorities the same way, without checking?*
- **1** — No. Everyone's working off a different understanding.
- **5** — Roughly aligned, but it drifts and needs re-stating constantly.
- **10** — Yes. Priorities are clear, shared, and current across the team.

**COM2 — External findability.** *Can a newcomer find service times, location, and how to take a next step in under a minute online?*
- **1** — No. Our digital presence is outdated or confusing.
- **5** — The basics are findable; next steps and depth are not.
- **10** — Yes. Everything a newcomer needs is obvious and current.

**COM3 — Signal vs. noise.** *Do your people know what matters most, or is everything announced with equal weight?*
- **1** — Everything's a headline, so nothing is. People tune out.
- **5** — We prioritize somewhat, but over-communicate and dilute the important things.
- **10** — People clearly know what matters most; we protect the main things.

**COM4 — The message lands without repetition.** *Do you have to say something five times for it to stick?*
- **1** — Yes. Nothing moves unless we exhaust every channel repeatedly.
- **5** — Important things need heavy repetition to land.
- **10** — Clear communication lands the first or second time.

**COM5 — Two-way, not just broadcast.** *Do you actually hear back from your congregation, or only talk at them?*
- **1** — Broadcast only. We don't really know what they're hearing.
- **5** — Some feedback channels, lightly used.
- **10** — Real two-way communication; we know what's landing.

### Scoring
`communication_score = mean(COM1..COM5) × 10` → 0–100.

### Interpretation rules
- **Never primary.** Reported as a **gating condition** on Guest Experience and Connection. If those two stages score low AND communication is low, the engine notes that the front-of-chain problems may be *communication problems wearing a guest-experience mask*: *people may not be failing to connect — they may simply not be able to find how.*
- Low COM1 (internal misalignment) is the quiet killer: a staff that can't state priorities the same way can't execute any fix consistently.

### Blind-spot trigger
Guest Experience and Connection score low, leader assumes those are the problems — **but** communication is the lower and upstream cause. The report reframes: *before you rebuild your guest process, know that people may not be able to find the one you already have.*

### Offer
Surfaced as a **gating flag** on a Guest or Connection offer, occasionally its own **Communication Audit** if it's severely and singularly low.

---

# ENABLER — ORG STRUCTURE / SYSTEMS

### Definition
The church runs on repeatable systems, not on individual memory — ministry can scale and survive the loss of any one person.

### Chain position
**Enabler. Gates Volunteer and Discipleship/Leadership** most directly (you can't deploy people or run a formation pathway at scale without systems). A systems break caps growth: the church hits a ceiling where it can't get bigger without breaking.

### The questions

**SYS1 — Not dependent on memory.** *Do your core processes live in systems, or in specific people's heads?*
- **1** — In heads. If a key person left, we'd lose how things are done.
- **5** — Some documented, much of it tribal knowledge.
- **10** — Core processes are documented and repeatable, independent of any individual.

**SYS2 — The right tools, connected.** *Do your systems (ChMS, giving, communication, scheduling) work together, or is it duct tape?*
- **1** — Fragmented. Nothing talks to anything; lots of manual re-entry.
- **5** — We have tools, but they're siloed and clunky.
- **10** — Our systems are integrated and reduce manual work.

**SYS3 — Onboarding is systematic.** *When someone new joins (staff or volunteer), is there a repeatable way to bring them in?*
- **1** — No. Every onboarding is improvised.
- **5** — There's a rough process, inconsistently followed.
- **10** — Yes. Onboarding is defined and consistent.

**SYS4 — Data you can act on.** *Can leadership see what's actually happening (attendance, giving, serving, groups) without a fire drill?*
- **1** — No. Getting a straight number is a project.
- **5** — We can get some data, with effort.
- **10** — Leadership has current, trustworthy data at hand.

**SYS5 — Built to scale.** *If you doubled in size, would your systems hold?*
- **1** — No. We'd break. We're already strained.
- **5** — We'd struggle and have to rebuild on the fly.
- **10** — Our systems would scale with us.

### Scoring
`systems_score = mean(SYS1..SYS5) × 10` → 0–100.

### Interpretation rules
- **Never primary.** Reported as a **gating condition** on Volunteer and Discipleship. When those stages score low AND systems are low, the engine notes the real bottleneck is infrastructure: *your people problem may be an operations problem — you can't deploy volunteers at scale through a process that lives in one person's memory.*
- Low SYS1 (memory-dependent) + low SYS4 (no data) frequently co-occurs with the church that "can't see its own front door" — and connects directly to XPG's Digital + AI services as a downstream recommendation.

### Blind-spot trigger
Church scores okay on people-stages but has quietly capped its growth. The report says: *nothing here is broken yet — but your systems won't survive the growth you're praying for. This is the ceiling you'll hit next, not the one you're hitting now.*

### Offer
Surfaced as a **gating flag**, and the natural bridge to **XPG Digital + AI Services** when fragmentation is the driver.

---

# HOW THE ENGINE USES ALL EIGHT TOGETHER

The sequence, per the build spec:

1. **Score all eight** categories 0–100 from the anchored answers.
2. **Walk the five stages in order.** Mark a stage *broken* if it falls below the break threshold.
3. **Primary constraint = the first broken stage.** Not the lowest score — the earliest break.
4. **Do-not-work-on list = every broken stage downstream of the primary.** These are named explicitly as symptoms to *not* spend money on.
5. **Check the three enablers.** Any that fall below the gate threshold become **gating conditions** attached to the prescription ("this won't hold until…").
6. **Run the breadth/depth split** on Generosity to route its offer correctly.
7. **Detect blind spots** — any category where self-perception is high but the anchored evidence (especially the observable items: G4, C2, D3, V1/V2, GEN1) is low.
8. **Assemble the report** in the seven-block structure, verdict first, score in the appendix.

The multi-leader invite flow adds one more signal on top: where two leaders answer the same category and **disagree by more than a set margin, that dispersion is itself a finding** — it means the church has an alignment problem in that area, which is often more actionable than the score itself.

---

# WHAT XPG NEEDS TO CONFIRM IN PHASE 0

This document is a structural guess. The consultants' job in the extraction session is to correct four things:

1. **The anchors.** Point at every "5" and "10" and say whether that's really the midpoint and the ideal. The wording must match how XPG actually recognizes health.
2. **The break and gate thresholds.** Below what score is a stage genuinely "broken"? Below what is an enabler "gating"? These numbers don't exist yet and only the consultants can set them.
3. **The blind-spot patterns.** Which high-self-rating / low-evidence combinations do they see most often in real churches? Those are the report's best moments and should be tuned to reality.
4. **The offer mapping.** Confirm each diagnosis routes to the right XPG call, in the right language.

Once those four are set against ten real churches (the calibration test: *does the engine reach the consultant's conclusion?*), the frameworks are done and the engine can be built.
