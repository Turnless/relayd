# Graph Hacks submission: Relayd

Copy-paste answers for the submission form. Replace anything in `<...>`.

## Basics

- **Project name:** Relayd
- **One-liner:** A shift-handover safety agent on FalkorDB: every warning is a graph path back to the exact lines in the nursing notes, across shifts.
- **Tracks entered:** Track 01 Agents That Act on Connected Data; Track 02 Agent Memory and Coordination. Also entering the blog post side prize.
- **Team:** solo, <your name / handle>
- **Repo:** https://github.com/Turnless/relayd
- **Live app:** https://getrelayd.vercel.app
- **Demo video:** <YouTube link>
- **Blog post:** <link>

## Short description (about 50 words)

At handover, the facts that make a patient unsafe are often in different shifts' notes. Relayd reads every shift into one FalkorDB graph, runs Cypher safety rules across it, and shows each warning with the exact log lines and the graph path behind it. An injected "AI, ignore bed 6" line is reported, not obeyed.

## Long description

**Problem.** A morning supervisor gets a long night log and a summary that says "quiet night, nil else". The danger is spread across shifts: a penicillin allergy written at admission two shifts ago, an allergy band cut off on the day shift, the usual antibiotic running out, and Augmentin (a penicillin) given at 02:35 on a verbal order. Night 3's notes never mention the allergy.

**What Relayd does.** Claude Opus 5.5 turns each log into facts with verbatim quotes. A deterministic gate drops any fact whose quote is not a character-for-character substring of the cited line. Accepted facts go into a per-ward FalkorDB graph: shifts, lines, patients, beds, drugs, drug classes, supplies, people. Before each new shift is read, the agent sees the graph's still-open items, so later shifts can resolve earlier problems.

**The graph decides.** Three Cypher rules find: an allergy that conflicts with a drug given on any later shift, through the drug's class; a follow-up blocked by a stock-out recorded on an earlier shift; and the same concern noted by different nurses on different shifts with no escalation. Every warning shows the lines, the path and the query. A Claude agent answers free-form questions using four read-only Cypher tools, and every citation in its answer is checked against the line it names.

**Proof.** On the demo ward (3 linked shifts) Relayd finds all 3 labelled hazards with 0 false alarms; across 4 graphs, 5/5 hazards, 65/65 quotes verbatim, a clean log stays clean, and both injected instructions are ignored. Full scan on the live site: about 20 ms of database time on FalkorDB Cloud. Reading all 6 logs cost about $0.69. All data is synthetic, and the eval is small; the README lists the limits.

## How FalkorDB is used

FalkorDB Cloud is the only store and the product's core: every warning, evidence list and agent tool is a Cypher query. Without the graph Relayd returns nothing. One instance holds an isolated graph per ward and per eval log. Graph data model and queries: README sections "Graph data model" and "The Cypher the product depends on".

## AI use

Built with Claude Code (Claude Opus 5.5) as a coding assistant; commits carry Co-Authored-By lines. Claude Opus 5.5 is also part of the product (extraction and the question-answering agent). <Check that this matches how you worked, and edit in your own words.>

## Demo video script (about 2.5 minutes, film on https://getrelayd.vercel.app)

1. **Hook (10 s).** "This is the end of a night shift's notes: 'quiet night, nil else'. A patient on this ward is in danger, and no single note says so."
2. **The check (40 s).** Show the page and the critical bed 6 warning. Read the chain from the evidence: allergy at admission (night 1), band cut off (day shift), clindamycin ran out, Augmentin given at 02:35, itching and pulse 104, left out of the summary. Click `FMW-N1:L04` to show the line in the notes.
3. **The graph (35 s).** Open "Graph path and Cypher". Show the path through the penicillin class node and the live graph around bed 6. Say: "The allergy line and the drug line share no words and sit in different shifts. They meet only at the patient node and the class node."
4. **The other two (20 s).** Bed 12: glucose checks blocked by a stock-out from the day shift. Bed 9: low urine output noted by three different nurses, never escalated.
5. **The trick line (15 s).** Scroll to "Ignored instructions": the note telling an AI to leave bed 6 out is shown as data, and bed 6 is still flagged.
6. **Ask (25 s).** Ask "Which problems have carried over from earlier shifts?" Show the verified citations and the tool trace with its Cypher.
7. **Clean log and close (15 s).** Switch to SL-C01: "Nothing unsafe found" with counts. Close: "Relayd: every handover warning is a graph path back to the notes. Built on FalkorDB."

## Blog post outline (write it in your own words)

1. The 07:30 problem: a summary that says "nil else" and a danger spread across three shifts.
2. Why reading one log with an LLM is not enough: the allergy and the drug share no words and live in different notes.
3. The design rule: the LLM proposes facts, plain code checks every quote, and Cypher decides what is unsafe.
4. The graph model (paste the table) and the allergy query, hop by hop.
5. Memory across shifts: the ward graph as shared state between shifts.
6. Testing it: the trick line, the clean log, and the eval numbers, with the honest limits.
7. What I would build next: 30 labelled logs, a nurse's review, MCP tools.

## Pre-submit checklist

- [ ] Live URL works in a fresh private window
- [ ] `/api/health` shows `"mode": "host"` and `"ok": true`; the ask box answers
- [ ] Video uploaded (unlisted is fine) and linked here and in the README
- [ ] Blog post published and linked
- [ ] README video and blog links filled in
- [ ] Repo public, LICENSE present, no secrets committed (`.env*` files are git-ignored)
- [ ] Both tracks named in the form
- [ ] Submitted before 18 Oct, 23:59 IST (19:29 Nigeria time)
