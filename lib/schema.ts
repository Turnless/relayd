import { z } from "zod";

export const FACT_KINDS = [
  "patient_intro", // bed + patient named for the first time in this log
  "allergy",
  "drug_given",
  "drug_ordered",
  "symptom",
  "obs_abnormal",
  "obs_normal",
  "device_problem",
  "stock_out",
  "task_pending",
  "task_blocked",
  "resolution",
  "escalation",
  "instruction_to_ai",
  "summary_claim",
  "ambiguous_term",
] as const;

export type FactKind = (typeof FACT_KINDS)[number];

/** What the LLM is allowed to propose for one fact. Every field is required; unknowns are null. */
export const ProposedFact = z.strictObject({
  id: z.string().describe("Short id unique within this log: F1, F2, ..."),
  line: z.string().describe("Line tag the fact comes from, e.g. L04"),
  quote: z.string().describe("Exact substring copied character-for-character from that line"),
  kind: z.enum(FACT_KINDS),
  bed: z.string().nullable().describe("Bed tag as written, e.g. B6. Null if the line names no bed"),
  patient: z.string().nullable().describe("Patient as written on this line, e.g. 'Mrs V.A 41F'. Null if not named on this line"),
  drug: z.string().nullable().describe("Canonical lowercase generic drug or allergen class, e.g. amoxicillin-clavulanate, penicillin"),
  supply: z.string().nullable().describe("Canonical lowercase supply item, e.g. glucometer strips"),
  person: z.string().nullable().describe("Staff member named, e.g. 'HO Dr F.'"),
  topic: z.string().nullable().describe("1-3 lowercase words naming the clinical concern, e.g. blood glucose, itch, urine output"),
  resolves: z.string().nullable().describe("Id of an earlier fact (this log, or a prior open item id) that this fact closes"),
  beds_mentioned: z.array(z.string()).describe("summary_claim only: every bed tag the summary line names; else []"),
});

export const Extraction = z.strictObject({
  facts: z.array(ProposedFact),
});

export type ProposedFact = z.infer<typeof ProposedFact>;
export type Extraction = z.infer<typeof Extraction>;

/** A fact after deterministic validation, ready for the graph. */
export type Fact = Omit<ProposedFact, "id" | "line" | "resolves"> & {
  id: string; // global: "<logId>:F3"
  lineKey: string; // "<logId>:L04"
  lineTag: string;
  resolves: string | null; // global id
  t: number; // seq * 1000 + line position, for ordering across shifts
};

export type Rejection = { factId: string; line: string; reason: string; quote: string };

export type ValidatedExtraction = {
  logId: string;
  model: string;
  extractedAt: string;
  facts: Fact[];
  rejected: Rejection[];
  warnings: string[];
};
