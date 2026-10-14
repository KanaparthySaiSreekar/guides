# GCP-PCA content check

Checked on 14 October 2026 against Google's own pages and documents, then checked again the same day from the primary
sources (see "Second pass" at the end). Everything below is what was compared, what changed and what could not be
confirmed. The study content lives in [`content/`](content/); this file is the audit trail for it.

## What was checked

| Area | How | Result |
|---|---|---|
| Exam facts (length, questions, fee, languages, validity, case-study share, delivery) | [Certification page](https://cloud.google.com/learn/certification/cloud-architect) | All correct |
| Pass mark "not published" | [Certification FAQ](https://support.google.com/cloud-certification/answer/9438208) (pass/fail only) | Correct |
| Syllabus (6 domains, 22 objectives, every bullet) and domain weights | Google's [current exam guide PDF](https://services.google.com/fh/files/misc/professional_cloud_architect_exam_guide_english.pdf), read in full and compared line by line, plus the archived Sep 2025 guide | Matches the current guide |
| Four case studies (company, environment, requirements) | The four official case-study PDFs | Faithful; "likely answer" columns are this guide's own mapping |
| Altostrat and Cymbal "also on the renewal exam" | [Renewal exam guide](https://services.google.com/fh/files/misc/professional_cloud_architect_renewal_exam_guide_eng.pdf) | Correct |
| Dated changes (30 Oct 2025 guide, 2 Mar 2026 Pearson VUE, 31 Mar 2026 Deployment Manager, 22 Apr 2026 Agent Platform, Jul 2026 renewal, Sep 2026 Agentic Architect) | [Pearson notice](https://support.google.com/cloud-certification/answer/16803278), [Deployment Manager deprecation](https://docs.cloud.google.com/deployment-manager/docs/deprecations), [Agent Platform release notes](https://docs.cloud.google.com/gemini-enterprise-agent-platform/release-notes), [renewal blog, 9 Jul 2026](https://cloud.google.com/blog/topics/training-certifications/new-ways-keep-google-cloud-certifications-current), [renewal options](https://support.google.com/cloud-certification/answer/9907853), [Agentic Architect page](https://cloud.google.com/learn/certification/agentic-architect) and [FAQ](https://support.google.com/cloud-certification/answer/18080541) | Correct, with details added (below) |
| Product renames and retirements | [Agent Platform name changes](https://docs.cloud.google.com/gemini-enterprise-agent-platform/vertex-ai-name-changes), Google release notes and product pages | Several were out of date (below) |
| Retake policy, results timing | [Retake policy](https://support.google.com/cloud-certification/answer/9749448), FAQ | Correct; four-attempts cap added |
| Support tiers | [Customer Care](https://cloud.google.com/support) pages | Correct |
| Numbers in the cheat sheet: Cloud Run timeouts, Spot VMs, preemptible limit, sustained and committed use discounts, BigQuery on-demand price, Cloud NGFW tiers, Cloud HSM level, Autopilot restrictions, Migrate to Virtual Machines sources, NCC topologies, log retention range, Pub/Sub exactly-once, flex-start limits | The relevant Google documentation pages | Corrected where noted below |
| All 149 questions: answer keys and explanations | Reviewed one by one for technical correctness against current Google Cloud behaviour | No key changed; names and two explanations updated |
| Links | Every external link requested | All resolve (Reddit and one Skills page block automated requests) |

## What changed

- **"v6.1" label.** Google has two different PDFs online: the guide linked from its certification page (weights
  25 / 17.5 / 17.5 / 15 / 12.5 / 12.5, no objective 4.3) and a separately named "v6.1" file (about 25 / 18 / 19 / 15 / 11 / 12,
  with 4.3). The "v6.1" file opens "This is the new version … on or after October 30", so it is Google's preview of the
  October 2025 guide, which Google left online. The syllabus and weights here match the guide the certification page links,
  but it was labelled "v6.1". Labels now say "current exam guide", and the difference is explained on the Overview and Resources pages.
  Before October 2025 the weights were 24 / 15 / 18 / 18 / 11 / 14 with the older case studies.
- **Resource-based committed use discount**: "up to 57%" is now **55%** (70% for memory-optimized). Flexible CUDs
  (28% / 46%) cover memory-optimized machines only on 3-year terms (63%).
- **Spot VMs**: the shutdown is best effort of up to 30 seconds, and a 120-second preemption notice can now be requested.
- **GKE Autopilot**: privileged containers are blocked except for allowlisted partner workloads (previously "no privileged pods").
- **Migrate to Virtual Machines**: sources are VMware (vSphere and VMware Engine), AWS and Azure. "Physical machines" is removed because Google does not list it.
- **Cloud Run jobs**: the 7-day task limit becomes 1 hour for tasks that use GPUs.
- **Network Connectivity Center**: "VPC spokes are transitive" now says what the docs say: in the default mesh topology every VPC spoke reaches every other; a star topology keeps edge spokes apart.
- **Pub/Sub exactly-once**: pull subscriptions, within one region.
- **Deployment Manager**: added the new-user block (30 Jun 2026) and shutdown (after 30 Jun 2027); Infrastructure Manager is the recommended replacement and DM Convert converts to Terraform or KRM.
- **Pearson VUE**: added that Kryterion's last day was 22 Feb 2026.
- **Agentic Architect**: beta exam 8–30 Sep; general availability planned for mid-November.
- **Renames brought up to date**: Vertex AI Search → Agent Search; Dataplex Universal Catalog → Knowledge Catalog (Apr 2026);
  Customer Engagement Suite → Gemini Enterprise for Customer Experience; Vertex AI Search for commerce → AI Commerce Search (29 Jun 2026);
  NotebookLM Enterprise → Gemini Notebook Enterprise (Jul 2026; the exam guide still says "NotebookLM").
  Questions d2-17, cym-04 and cym-05 and the cheat sheet use the new names with the old ones in brackets.
- **Sample questions**: the claim that they still use retired case studies could not be confirmed, so it now says they "may" refer to earlier ones.
- **Intrusion protection** is described as a Cloud NGFW Enterprise feature rather than as what the guide "means".

## Not independently confirmed

- The exact launch date of the Google Skills renewal route (Google's blog post is dated 9 Jul 2026 and says it is "now available").
- Rename years before 2025 (Cloud DLP 2023, Operations suite 2024, Chronicle 2024 and similar): the new names are current in Google's docs, but the years come from memory and the search results rather than a dated Google statement.
- The "likely Google Cloud answer" columns in the case studies and the study plan are this guide's own recommendations, not Google's.
- Product details change. Check Google's documentation before relying on a limit.

## Second pass (14 October 2026)

An independent re-check, done after the first pass, from the primary sources rather than from the first pass's notes.

**Re-confirmed, no change needed**

- **Syllabus and weights.** The live exam guide PDF, extracted to text and compared line by line, matches `data.json`: six sections at
  25 / 17.5 / 17.5 / 15 / 12.5 / 12.5 and 22 objectives. It is byte-identical to the Wayback Machine copy from 12 Jul 2026. The
  16 Nov 2025 copy differs only in the AI names (Vertex AI → Gemini Enterprise Agent Platform), so the weights and objectives have
  not moved since the October 2025 change.
- **Case studies.** All four official PDFs were extracted and read against the guide's summaries: faithful. The renewal exam links its own
  copies of the Altostrat and Cymbal PDFs, which differ from the standard ones only in capitalisation and page numbers.
- **Exam facts.** Length, questions, fee, languages, validity, 2 case studies at 20–30%, delivery: all match the certification page.
  The page also lists a renewal exam (1 hour, 25 questions, $100, one case study at 90–100%).
- **Pearson VUE.** Kryterion's last day 22 Feb 2026, first Pearson VUE date 2 Mar 2026, content and format unchanged.
- **Retakes.** 14 days, 60 days, 365 days; four attempts in two years; payment each time.
- **Renewal.** PCA exam window opens 60 days before expiry and adds 2 years; Google Skills opens 1 year before and adds 1 year;
  renewal is possible up to 30 days after expiry. The Google Skills route was announced on 9 Jul 2026.
- **Results.** Provisional result on screen, official confirmation in 7–10 days; pass/fail only.
- **Dated changes.** Deployment Manager (new users blocked 30 Jun 2026, shutdown after 30 Jun 2027), Agent Platform rename (22 Apr 2026,
  at Cloud Next, 22–24 April), Knowledge Catalog (10 Apr 2026), Gemini Notebook (16 Jul 2026, consumer and Enterprise),
  Professional Agentic Architect (beta 8–30 Sep, GA mid-November, registration opens 2 Nov).
- **Numbers.** Cloud Run request timeout (60 min), jobs (7 days; 1 hour with GPUs), sustained use discounts (N1 30%; N2, N2D, C2 20%;
  E2 and newer series none), committed use discounts (55% / 70% memory-optimized; flexible 28% / 46% and 63% memory-optimized
  on 3-year terms), BigQuery on-demand $6.25 per TiB, Cloud Shell 5 GB home, Cloud SQL 64 TB, support tiers (Standard P2 4 h;
  Enhanced P1 1 h; Premium P1 15 min with a Technical Account Manager), Cloud HSM FIPS 140-2 Level 3, Cloud NGFW tiers
  (Essentials, Standard, Enterprise), Autopilot privileged containers (verified partners only), Pub/Sub exactly-once (pull, one region),
  Migrate to Virtual Machines sources (vSphere, VMware Engine, AWS, Azure), `_Required` 400 days, `_Default` 30 days, custom
  buckets 1–3,650 days, Container Registry shut down on 18 Mar 2025, GKE is now one offering with the Enterprise features folded in.
- **All 149 answer keys** were read again. None is wrong.

**Changed**

- **Imagen is retired.** Google's Firebase AI Logic migration page says all Imagen models shut down on 17 Aug 2026, on both the
  Gemini Developer API and the Agent Platform Gemini API, and the Agent Platform's own Imagen pages are headed "deprecated". Image
  generation and editing now use Gemini image models ("Nano Banana"). Question cym-02, the Cymbal case-study row and the cheat
  sheet no longer name Imagen as the answer. The names table has a new row.
- **Dialogflow CX / Conversational Agents → CX Agent Studio.** Google's documentation calls CX Agent Studio "the evolution of
  Dialogflow CX" and lists Dialogflow CX and ES under "legacy conversational agents". Updated in the cheat sheet, the Altostrat and
  Cymbal rows, the names table and questions alto-08 and cym-05.
- **Spot discount.** Google says "up to 91%". The "60–91%" range has no 60% floor in Google's documentation (cheat sheet, numbers
  table, question d1-06).
- **Pub/Sub Lite and Deployment Manager are not retired yet.** Pub/Sub Lite is turned down on 31 Jan 2027 (it was
  18 Mar 2026 in older material); Deployment Manager shuts down after 30 Jun 2027. The wording is now "retired or retiring".
- **"v6.1".** Explained as Google's preview of the October 2025 guide (see above).
- **Added** from Google's notices: the 24-hour reschedule rule, the 30-day renewal grace period, the Agentic Architect's lab part
  and one-year validity, and the TPU 8t / 8i announcement.

**Still not confirmed**

- The rename of the Customer Engagement Suite to Gemini Enterprise for Customer Experience: Google's old Customer Engagement Suite
  address now serves the new product and the documentation sits under it, but I found no sentence from Google that states the rename.
- Parallelstore: its documentation address redirects permanently to Managed Lustre. I found no announcement of a retirement.
- The exact Agent Platform shutdown date for Imagen (the 17 Aug 2026 date is from Google's Firebase page, which says it covers the
  Agent Platform).
- TPU 8t / 8i availability ("later in 2026" is Google's wording).
- Whether the exam itself still names Imagen: the exam guide only says "Image" under the Google AI APIs.
