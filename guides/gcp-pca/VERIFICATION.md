# GCP-PCA content check

Checked on 14 October 2026 against Google's own pages and documents. Everything below is what was compared, what changed
and what could not be confirmed. The study content lives in [`content/`](content/); this file is the audit trail for it.

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

- **"v6.1" label.** Google publishes two different PDFs: the guide linked from its certification page (weights
  25 / 17.5 / 17.5 / 15 / 12.5 / 12.5, no objective 4.3) and a separately named "v6.1" file (about 25 / 18 / 19 / 15 / 11 / 12,
  with 4.3). The syllabus and weights here match the first, which is the one the certification page links, but it was
  labelled "v6.1". Labels now say "current exam guide", and the difference is explained on the Overview and Resources pages.
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
- The default retention of the `_Required` (400 days) and `_Default` (30 days) log buckets: the pages fetched confirm the 1–3,650 day range and that `_Required` cannot be changed, but not those two figures; they match Google's published defaults as far as I know.
- Rename years before 2025 (Cloud DLP 2023, Operations suite 2024, Chronicle 2024 and similar): the new names are current in Google's docs, but the years come from memory and the search results rather than a dated Google statement.
- The "likely Google Cloud answer" columns in the case studies and the study plan are this guide's own recommendations, not Google's.
- Product details change. Check Google's documentation before relying on a limit.
