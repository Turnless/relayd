import Link from "next/link";
import Logo from "@/components/Logo";

const stars = Array.from({ length: 40 }, (_, i) => {
  const size = i % 6 === 0 ? 3 : 2;
  return {
    left: `${(i * 37 + 11) % 100}%`,
    top: `${((i * 53 + 7) % 92) * 15}px`,
    width: size,
    height: size,
    animationDuration: `${(4 + (i % 6) * 1.2).toFixed(1)}s`,
    animationDelay: `${((i * 0.43) % 6).toFixed(2)}s`,
  };
});

export default function Landing() {
  return (
    <div className="lp">
      <div className="lp-sky" aria-hidden="true">
        {stars.map((s, i) => (
          <span key={i} className="lp-star" style={s} />
        ))}
        <div className="lp-glow" />
      </div>

      <header className="lp-wrap lp-header">
        <Link href="/" className="lp-brand">
          <Logo size={30} />
          Relayd
        </Link>
        <nav aria-label="Page" className="lp-nav">
          <a href="#story">The problem</a>
          <a href="#how">How it works</a>
          <a href="https://github.com/Turnless/relayd">Source code</a>
        </nav>
        <Link href="/ward" className="lp-btn small">
          Open the demo ward
        </Link>
      </header>

      <main>
        <section id="top" className="lp-wrap lp-hero">
          <div style={{ flex: "1 1 460px", minWidth: 0, display: "flex", flexDirection: "column", gap: 22 }}>
            <h1>See what last night&apos;s notes left out.</h1>
            <p className="lp-lede">
              Relayd reads every shift&apos;s nursing notes into one ward graph, then shows the morning team what is unsafe, with the exact
              lines behind each warning.
            </p>
            <div className="lp-row" style={{ paddingTop: 6 }}>
              <Link href="/ward" className="lp-btn">
                Open the demo ward
              </Link>
              <a href="#how" className="lp-btn ghost">
                See how it works
              </a>
            </div>
            <p className="lp-small">Demo ward with made-up patients and notes.</p>
          </div>

          <figure className="lp-card" aria-label="Example: the 07:30 handover and what Relayd found">
            <figcaption className="lp-small">Thursday night, written at 07:30</figcaption>
            <blockquote className="lp-quote">
              &ldquo;quiet night. B2 resited. B10 pain controlled. <span className="lp-nil">nil else.</span>&rdquo;
            </blockquote>
            <div className="lp-found">
              <span />
              Relayd read the last three shifts and found
            </div>
            <ul className="lp-alerts">
              <li className="lp-alert act" style={{ animationDelay: "1800ms" }}>
                <span className="lp-bed">6</span>
                <span>
                  <strong>Augmentin given. Penicillin allergy written on Wednesday.</strong>
                  <span className="lvl">Act now</span>
                </span>
              </li>
              <li className="lp-alert check" style={{ animationDelay: "1960ms" }}>
                <span className="lp-bed">12</span>
                <span>
                  <strong>No blood sugar reading for 16½ hours on an insulin drip.</strong>
                  <span className="lvl">Check this shift</span>
                </span>
              </li>
              <li className="lp-alert check" style={{ animationDelay: "2120ms" }}>
                <span className="lp-bed">9</span>
                <span>
                  <strong>Low urine output on three shifts. No doctor told.</strong>
                  <span className="lvl">Check this shift</span>
                </span>
              </li>
            </ul>
          </figure>
        </section>

        <section id="story" className="lp-wrap lp-story">
          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 760 }}>
            <h2 className="lp-h2">Three nurses wrote it down. No single note shows the danger.</h2>
            <p className="lp-sub">
              Each shift read only its own notes. The allergy was on Wednesday&apos;s page, the missing allergy band on Thursday&apos;s, and
              the swapped antibiotic on Thursday night&apos;s.
            </p>
          </div>
          <ol className="lp-notes">
            <li className="lp-note">
              <span className="who">Wednesday night, N. A.O</span>
              <span className="txt">
                &ldquo;<mark>ALLERGY: PCN - anaphylaxis 2019.</mark> red allergy band on R wrist.&rdquo;
              </span>
              <span className="at">21:30, line 4</span>
            </li>
            <li className="lp-note">
              <span className="who">Thursday day, N. C.U</span>
              <span className="txt">
                &ldquo;<mark>red band cut off R wrist for resite, not replaced yet.</mark>&rdquo;
              </span>
              <span className="at">10:00, line 3</span>
            </li>
            <li className="lp-note">
              <span className="who">Thursday night, N. B.K</span>
              <span className="txt">
                &ldquo;<mark>B6 Augmentin 1.2g IV given.</mark>&rdquo;
              </span>
              <span className="at">02:35, line 12</span>
            </li>
          </ol>
          <p style={{ margin: 0, fontSize: 19, maxWidth: "62ch" }}>
            Augmentin is a penicillin. Relayd joins the three notes through the patient and the drug family, then flags bed 6 before the
            morning ward round.
          </p>
        </section>

        <div className="lp-sunrise" aria-hidden="true">
          <div className="lp-sun" />
          <div className="lp-horizon" />
        </div>

        <section id="how" className="lp-wrap lp-how lp-light">
          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 760 }}>
            <h2 className="lp-h2">How Relayd gets the morning team ready</h2>
            <p className="lp-sub">Nothing to fill in. Nurses keep writing notes the way they already do.</p>
          </div>
          <ol className="lp-steps">
            <li>
              <span className="n">Step 1</span>
              <h3>Reads each shift&apos;s notes</h3>
              <p>Claude turns the shorthand into facts: allergies, drugs given, symptoms, stock-outs, handover summaries.</p>
            </li>
            <li>
              <span className="n">Step 2</span>
              <h3>Checks every quote</h3>
              <p>A fact is kept only if its quote matches the note word for word. Nothing is reworded or made up.</p>
            </li>
            <li>
              <span className="n">Step 3</span>
              <h3>Joins the shifts in one graph</h3>
              <p>Patients, notes, drugs, drug families and supplies are connected in FalkorDB, shift after shift.</p>
            </li>
            <li className="last">
              <span className="n">Step 4</span>
              <h3>Shows the line behind each warning</h3>
              <p>The morning nurse sees who needs attention and taps through to the exact note it came from.</p>
            </li>
          </ol>
        </section>

        <section className="lp-wrap lp-proof lp-light">
          <h2>Tested on a demo ward</h2>
          <div className="body">
            <p className="big">
              On the demo ward and three test logs, Relayd found <strong>all 5</strong> planted problems with <strong>no false alarms</strong>,
              and <strong>all 65</strong> quotes matched the notes word for word. A full safety check takes about{" "}
              <strong>20 milliseconds</strong> on FalkorDB Cloud.
            </p>
            <p className="fine">
              The test set is small and made up, and no nurse has reviewed it yet. A note asking the software to leave a patient out is shown,
              not followed. Relayd points to what the notes say; nurses and doctors decide.
            </p>
          </div>
        </section>

        <section className="lp-wrap lp-cta">
          <div className="lp-cta-box">
            <div style={{ flex: "1 1 420px", display: "flex", flexDirection: "column", gap: 10 }}>
              <h2>Start the shift with the full picture.</h2>
              <p>Open the demo ward and click any patient to see every note written about them.</p>
            </div>
            <div className="lp-row">
              <Link href="/ward" className="lp-btn">
                Open the demo ward
              </Link>
              <a href="https://github.com/Turnless/relayd" className="lp-btn ghost">
                Read the source code
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-wrap lp-footer">
        <span>Built for Graph Hacks 2026 on FalkorDB, with Claude reading the notes.</span>
        <span>All patients and notes on this site are made up.</span>
        <span>Relayd is not a medical device.</span>
      </footer>
    </div>
  );
}
