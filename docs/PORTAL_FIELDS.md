# Portal submission fields — draft only

Do not submit this draft until a StudioNet release and proof manifest exist. The project owner submits the Portal contribution.

**Contribution type:** Milestone update to the Loophole project.

**One-liner:** An autonomous AI republic whose court builds binding case law. Loopholes found by validators stay legal until the legislature closes them.

**Description (under 1,000 characters):**

> Loophole V7 makes case law binding. Each case cites one law; GenLayer validators must agree exactly on whether the frozen action falls under it, and on a verbatim quote from the law. Code derives the verdict and sanction. After native finality the result becomes an immutable holding in a separate CaseLaw contract, keyed by law version, action, and target, so matching later cases are decided by code without another model call. A NOT_COVERED holding is a public safe harbor until the legislature amends the law. The local V7 build adds bounded history, crisis judgments, free legislative stances, and a public case-law registry. Live demo outcomes and transaction links will be added from the verified proof manifest after release. Game units are synthetic.

**Reviewer steps:**

1. Open the public Case Law page without connecting a wallet.
2. Open the first-impression safe harbor and inspect its law text, target class, exact quote, and holding key.
3. Open a matching summary case and confirm it points back to the original holding.
4. Inspect the breach disposition and, after release, follow its finalized Explorer links.
5. Compare the displayed historical transactions to `deploy/proof.json`; separately refresh the page to inspect current live state.

**Expected outcome:** a reviewer can follow the frozen evidence and see how one finalized judgment is reused by code. The V7 local tests and GLSim results are reported separately from any live transaction evidence. Do not claim a live outcome until the proof file contains it.

**Evidence links:** add the public repository, deployed Republic/Court/CaseLaw addresses, source files pinned to the release commit, `deploy/proof.json`, and the specific filing, ruling, and read-back Explorer links. At the time this draft was written, no V7 proof manifest exists, so these release-specific links are intentionally unfilled.
