/**
 * Deterministic drug reference data. The LLM only names the drug it read;
 * class membership comes from this table and is loaded into the graph as
 * (:Drug)-[:IN_CLASS]->(:DrugClass). A drug not listed here gets no class,
 * and the agent reports it as unclear instead of guessing.
 *
 * Small, hand-checked list for the synthetic demo data. Not clinical advice.
 */
export const DRUG_CLASSES: Record<string, string[]> = {
  penicillin: ["penicillin"],
  "amoxicillin-clavulanate": ["penicillin"],
  amoxicillin: ["penicillin"],
  ampicillin: ["penicillin"],
  ampiclox: ["penicillin"],
  cloxacillin: ["penicillin"],
  flucloxacillin: ["penicillin"],
  benzylpenicillin: ["penicillin"],
  "piperacillin-tazobactam": ["penicillin"],
  ceftriaxone: ["cephalosporin"],
  cefuroxime: ["cephalosporin"],
  clindamycin: ["lincosamide"],
  metronidazole: ["nitroimidazole"],
  nitrofurantoin: ["nitrofuran"],
  "co-trimoxazole": ["sulfonamide"],
  sulfonamide: ["sulfonamide"],
  ibuprofen: ["nsaid"],
  diclofenac: ["nsaid"],
  aspirin: ["nsaid", "salicylate"],
  nsaid: ["nsaid"],
  paracetamol: ["analgesic-simple"],
  morphine: ["opioid"],
  pentazocine: ["opioid"],
  tramadol: ["opioid"],
  insulin: ["insulin"],
  furosemide: ["loop-diuretic"],
  amlodipine: ["calcium-channel-blocker"],
  enoxaparin: ["anticoagulant"],
  heparin: ["anticoagulant"],
  warfarin: ["anticoagulant"],
};

export function classesFor(drug: string | null | undefined): string[] {
  if (!drug) return [];
  return DRUG_CLASSES[drug.trim().toLowerCase()] ?? [];
}
