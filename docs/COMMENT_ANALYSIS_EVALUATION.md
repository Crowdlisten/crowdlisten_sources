# Comment Analysis Inspection and Evaluation

## Purpose

This document describes how to inspect the current comment-analysis pipeline and
how to evaluate its quality with deterministic fixture labels.

The inspection and evaluation flow is split into two layers:

1. human-readable report outputs
2. automatic quality metrics

That separation is intentional:

- reports help us spot bad rewrites, bad clusters, and high-value insights
- metrics help us detect regressions in grounding and clustering behavior

---

## Inspection Runners

### 1. Deterministic fixture report

Command:

```bash
npx tsc
npm run report:comment-analysis -- comment-analysis-report.txt
```

Script:

- `test-comment-analysis-report.cjs`

This runner uses the shared fixture in:

- `test-fixtures/comment-analysis-fixture.cjs`

It writes a stable txt report that includes:

- video context
- generated video anchors
- raw comments
- rewritten comments
- opinion units
- per-video local clusters
- cross-video meta clusters
- insights
- ask-layer index
- fixture expectations

Use this report when you want a repeatable artifact for debugging the current
heuristic pipeline without relying on external APIs.

Note:

- the `Visual text:` line in the report shows raw Gemini output
- the `VIDEO ANCHORS` section shows the filtered visual-text anchors that
  actually participate in grounding and clustering

### 2. Real TikTok inspection report

Command:

```bash
npx tsc
npm run report:tiktok-comment-analysis -- "cooking tips" 3 80 comment-intelligence-report.txt
```

Script:

- `test-comment-intelligence-report.cjs`

This runner executes the real TikTok stack:

1. search TikTok posts
2. fetch comments
3. run video understanding
4. run enrichment
5. build local clusters
6. build meta clusters
7. write a detailed txt report

The report contains the same inspection sections as the fixture runner, but for
real posts and comments.

Use this report when you want to manually inspect:

- what the system thinks the video is about
- how vague comments were grounded and rewritten
- whether local clusters feel coherent
- whether cross-video meta clusters merged the right themes
- which insights are genuinely valuable

Important note:

- this live runner searches TikTok each time, so the selected videos can change
  from run to run
- use it for manual inspection, not strict apples-to-apples regression
  comparisons across commits

### 3. Fixed-video replay report

Command:

```bash
npx tsc
npm run report:tiktok-comment-replay -- comment-intelligence-replay.txt <video-url-1> <video-url-2>
```

Script:

- `test-comment-intelligence-replay.cjs`

This runner skips search and analyzes the exact TikTok URLs / video IDs you
provide.

Use this report when you want:

- stable before/after comparisons on the same videos
- repeated inspection of one known problematic case
- less noise while tuning non-search behavior such as enrichment, clustering,
  insights, and display ranking

---

## Automatic Evaluation

Command:

```bash
npx tsc
npm run eval:comment-analysis -- comment-analysis-eval.txt
```

Script:

- `scripts/evaluate-comment-analysis.cjs`

This evaluator uses the same deterministic fixture and compares current system
outputs against known expectations.

### 1. Grounding quality

Question:

- does the predicted primary anchor match the expected anchor for a comment?

Fixture source:

- `groundingExpectations` in `test-fixtures/comment-analysis-fixture.cjs`

Metric:

- accuracy

Current use:

- validates the effective behavior of `enrichmentModel: 'deterministic-grounding-v1'`
- helps catch regressions where vague comments start mapping to broad entity or
  global-video anchors instead of the intended moment or quote

### 2. Opinion unit quality

Question:

- does one comment split into the right number of opinion units?
- does the extracted span keep the substantive clause instead of a low-signal
  preface?

Fixture source:

- `opinionUnitExpectations` in `test-fixtures/comment-analysis-fixture.cjs`

Metrics:

- expectation accuracy over:
  - unit count
  - required span fragments
  - forbidden span fragments
  - expected stance

Current use:

- protects against regressions like punctuation-only units
- protects against courtesy-preface mistakes such as extracting
  `Very informative` instead of `I won't remember any of them`

### 3. Local cluster purity

Question:

- do the opinion units inside one local cluster actually describe the same
  underlying issue?

Fixture source:

- `expectedUnitLabels` in `test-fixtures/comment-analysis-fixture.cjs`

Metrics:

- weighted purity score
- cosine-distance silhouette score over opinion-unit embeddings

Interpretation:

- purity answers semantic correctness against labeled expectations
- silhouette answers how well-separated the predicted clusters are in embedding
  space

Silhouette is secondary. Purity is the primary metric for this repo because the
goal is not only separation, but correct semantic grouping.

### 4. Meta cluster recurrence quality

Question:

- when the cross-video layer merges local clusters, is it merging the same topic
  or incorrectly collapsing different themes?

Derived labels:

- each predicted local cluster gets a dominant gold label based on its labeled
  opinion units
- meta clusters are then evaluated by the label distribution of their source
  local clusters

Metrics:

- meta merge purity
- incorrect merge count
- recurring-label precision
- recurring-label recall
- recurring-label F1

These metrics help detect errors like:

- merging praise for pan handling into food-safety criticism
- merging unrelated question clusters into a recurring concern theme

---

## Reading the Outputs

### If the grounding section is wrong

Check:

- anchor construction in `CommentEnricher.buildVideoAnchors()`
- anchor matching in `CommentEnricher.matchAnchors()`
- reply inheritance in `CommentEnricher.buildResolvedText()`

Typical failures:

- generic `entity` anchors beat more specific `moment` anchors
- short replies lose their parent context
- broad `global_video` anchors become the default too often

### If local cluster purity is low

Check:

- `coarse bucketing` by `aboutness.aspectKey`
- fine-cluster merge thresholds
- stance compatibility rules
- noise handling rules

Typical failures:

- question units merged into opinion clusters
- reaction-only comments mixed into real criticism clusters
- similar wording from different aspects merged together

### If meta cluster recurrence quality is low

Check:

- cross-video signature text
- stance compatibility
- meta merge threshold
- aspect priors

Typical failures:

- over-merging across videos because the wording is similar
- under-merging recurring themes when wording differs too much

---

## Suggested Workflow

When iterating on the pipeline, use this order:

1. run `npm run report:comment-analysis`
2. read the txt report to inspect rewrites, opinion units, and clusters
3. run `npm run eval:comment-analysis`
4. compare grounding accuracy, local purity, and meta recurrence scores
5. only then run `npm run report:tiktok-comment-analysis` on real data

That workflow keeps debugging cheap and repeatable before spending time on real
TikTok runs.
