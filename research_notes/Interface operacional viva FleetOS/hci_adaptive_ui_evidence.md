# HCI evidence on adaptive / self-reorganising interfaces: when they help, when they fail, how to evaluate them (for an all-day dispatcher UI that continuously recomposes itself)

Evidence tags used below:
- **[EMP-lab]**: controlled lab experiment. The setting and N are given.
- **[EMP-field]**: field or longitudinal study.
- **[REVIEW]**: synthesis or review by domain experts.
- **[THEORY]**: framework or model.
- **[OPINION]**: practitioner or author opinion, with no new data.

Most of the adaptive-UI literature tests **menus and toolbars**, not whole-screen recomposition, so every transfer to FleetOS is an inference. The inferences are marked as such.

---

## Q1. Adaptive vs adaptable interfaces: what do the controlled studies actually show (Findlater & McGrenere, Gajos et al., split menus, ephemeral adaptation, Cockburn et al.)?

### Takeaway
Adaptive UIs that **move things** have a poor track record. Static or user-controlled (adaptable) layouts usually match or beat them, and users prefer control. Two designs succeed consistently:
- "Elective" split interfaces that **copy** items into a dedicated adaptive area, leaving the original layout intact.
- Adaptations that **do not move anything**, such as ephemeral or abrupt-onset cues.

Whether a design succeeds depends mainly on four things: **prediction accuracy**, **predictability**, **frequency of change**, and **locality** (how close the adaptation is to the user's focus). Accuracy has the larger performance effect. Predictability mainly drives satisfaction and the feeling of control.

### Cited Findings

**Findlater & McGrenere (2004), static vs adaptive vs adaptable split menus. [EMP-lab]**
- **Setting:** N=27 undergraduates, within-subjects design. Split menus with 4 top items. The task replayed **20 weeks of real MS Word menu logs from an office administrative assistant** (1,387 menu selections) in 200-selection blocks. — [Findlater & McGrenere 2004, CHI](https://www.cs.ubc.ca/labs/edapt/papers/findlater2004.pdf)
- **Speed:** The static menu was significantly faster than the adaptive menu in all three presentation orders, with pairwise partial η² between .68 and .81. The adaptable menu was faster than the adaptive one and not different from static, except when users met the adaptable menu first. Four of the 5 people who never customised were in that order. — [Findlater & McGrenere 2004](https://www.cs.ubc.ca/labs/edapt/papers/findlater2004.pdf)
- **Block-2 mean time per 200 selections:** static 306.5 s, adaptable 318.8 s (300.7 s for the 22 users who customised), adaptive 331.6 s. That makes adaptive about 8% slower than static. — [Findlater & McGrenere 2004](https://www.cs.ubc.ca/labs/edapt/papers/findlater2004.pdf)
- **Preference:** Adaptable was ranked first by 15 users (55%), adaptive by 8 (30%), static by 4 (15%). "Most frustrating" went to adaptive 15 times, static 10 times and adaptable once. Six users complained specifically about the adaptive menu's inconsistency. — [Findlater & McGrenere 2004](https://www.cs.ubc.ca/labs/edapt/papers/findlater2004.pdf)
- **Perception vs measurement:** Most users *perceived* the adaptable menu as the most efficient, even where it was measurably slower. — [Findlater & McGrenere 2004](https://www.cs.ubc.ca/labs/edapt/papers/findlater2004.pdf)
- **Field study cited in the paper:** McGrenere et al. (2002) ran a longitudinal field study of Word 2000. 65% of users preferred an adaptable interface, 15% adaptive and 20% static. — cited in [Findlater & McGrenere 2004](https://www.cs.ubc.ca/labs/edapt/papers/findlater2004.pdf)
- **Authors' conclusion [OPINION]:** Combining adaptive and adaptable approaches in a mixed-initiative design may suit the widest range of users. One example is a system that *suggests* changes the user then accepts. — [Findlater & McGrenere 2004](https://www.cs.ubc.ca/labs/edapt/papers/findlater2004.pdf)

**Gajos, Everitt, Tan, Czerwinski & Weld (2008), "Predictability and accuracy in adaptive UIs". [EMP-lab]**
- **Setting:** N=23 experienced Office users, aged 21–44. A modified MS Word UI with a split interface: adaptive items were **copied** into a toolbar placed more than 20° of visual angle from the original buttons. The toolbar held 8 slots, and at most 1 button changed per interaction. 2×2 design: accuracy 50% vs 70%, crossed with predictable (most-recently-used) vs random updates. — [Gajos et al. 2008](https://kgajos.seas.harvard.edu/papers/kgajos-chi08-predictability.pdf)
- **Effects of higher accuracy:**
  - Task time fell from 197 s to 177 s (F1,18=62.0, p<.001).
  - Time to acquire a button on the adaptive toolbar fell from 1.86 s to 1.70 s.
  - Use of the adaptive toolbar, when it held the right button, rose from 70.6% to 86.4%.
  - Ratings of usefulness, frustration and efficiency all improved.
  - [Gajos et al. 2008](https://kgajos.seas.harvard.edu/papers/kgajos-chi08-predictability.pdf)
- **Effects of predictability:** No significant effect on performance. It did raise the following ratings (7-point scale):
  - Perceived predictability: 2.70 → 4.12.
  - "I knew when the toolbar would have what I needed": 2.30 → 3.74.
  - Feeling in control: 3.73 → 4.73.
  - [Gajos et al. 2008](https://kgajos.seas.harvard.edu/papers/kgajos-chi08-predictability.pdf)
- **Comments on the random condition:** 11 of 23 users spontaneously called it "random" or "confusing". Users still tended to assume the inscrutable behaviour was purposeful, with the system trying to "help". — [Gajos et al. 2008](https://kgajos.seas.harvard.edu/papers/kgajos-chi08-predictability.pdf)
- **Eye tracking (small sample):** Users glanced at the adaptive area less when accuracy was low (66% vs 79% of trials). They looked there and failed to find the button more often in the random condition (41% vs 34%). — [Gajos et al. 2008](https://kgajos.seas.harvard.edu/papers/kgajos-chi08-predictability.pdf)
- **Locality:** 10 of 23 users wished the adaptive items sat *closer to the buttons' original locations*. In the authors' earlier study, a "moving" interface that put adapted functions next to their original location was frequently praised, although it was not statistically faster. — [Gajos et al. 2008](https://kgajos.seas.harvard.edu/papers/kgajos-chi08-predictability.pdf)
- **Conclusion:** Predictability and accuracy affect different aspects of satisfaction, so gains in one "cannot fully offset the losses to the other". — [Gajos et al. 2008](https://kgajos.seas.harvard.edu/papers/kgajos-chi08-predictability.pdf)

**Findlater & Gajos (2009), AI Magazine review of the adaptive-GUI design space. [REVIEW]**
- **Design space:** Spatial adaptation (move, resize, replicate, hide), graphical adaptation (highlight) and temporal adaptation (ephemeral). — [Findlater & Gajos 2009](https://kgajos.seas.harvard.edu/papers/AIMag09-AUIs.pdf)
- **Overall record:** Results have been "mixed". Adaptations meant to cut motor or visual-search cost often raise cognitive or perceptual cost instead. A frequency-reordered menu (Mitchell & Shneiderman 1989) can slow users down and reduce satisfaction "because of the constantly changing layout". — [Findlater & Gajos 2009](https://kgajos.seas.harvard.edu/papers/AIMag09-AUIs.pdf)
- **Split menus and frequency of change:** The original Sears & Shneiderman (1994) split menu changed only **once** during its study and beat a static menu. When later work changed the split menu as often as after every selection, performance fell. — [Findlater & Gajos 2009](https://kgajos.seas.harvard.edu/papers/AIMag09-AUIs.pdf)
- **Elective vs mandatory adaptation:** When predicted items are *copied* (elective), users can ignore the adaptation and use their known locations. Gajos et al. (2006) found this faster and preferred over the mandatory *move* design. — [Findlater & Gajos 2009](https://kgajos.seas.harvard.edu/papers/AIMag09-AUIs.pdf)
- **Cost of elective adaptation:** Users must check whether a helpful adaptation happened. In a split toolbar placed far from the user's focus, people **ignored helpful adaptations 7–19% of the time**. — [Findlater & Gajos 2009](https://kgajos.seas.harvard.edu/papers/AIMag09-AUIs.pdf)
- **Colour highlighting:** Evaluations show no performance benefit over a non-adaptive UI. — [Findlater & Gajos 2009](https://kgajos.seas.harvard.edu/papers/AIMag09-AUIs.pdf)
- **Expertise:** Adaptation helps novices more than experts (Trevellyan & Browne 1987) and "may even hinder performance for experts". — [Findlater & Gajos 2009](https://kgajos.seas.harvard.edu/papers/AIMag09-AUIs.pdf)
- **Screen size:** Adaptive split menus helped more on a PDA-sized screen than on a desktop, because navigation on the small screen is costly (Findlater & McGrenere 2008). — [Findlater & Gajos 2009](https://kgajos.seas.harvard.edu/papers/AIMag09-AUIs.pdf)
- **Task type:** In an open-ended creative task, users valued keeping related functions spatially grouped. In a mechanical, speeded task they preferred adaptation that reduced movement (Gajos et al. 2006). — [Findlater & Gajos 2009](https://kgajos.seas.harvard.edu/papers/AIMag09-AUIs.pdf)
- **SUPPLE, ability-based adaptation (Gajos, Wobbrock & Weld 2008, N=17):** Interfaces adapted to measured motor ability made motor-impaired users faster and more accurate, and they strongly preferred them. Able-bodied users gained less and preferred the original aesthetics. SUPPLE adapts **once, at the outset**, not continuously. — [Findlater & Gajos 2009](https://kgajos.seas.harvard.edu/papers/AIMag09-AUIs.pdf)
- **Most consistently positive designs:** Elective split interfaces and ephemeral adaptation. — [Findlater & Gajos 2009](https://kgajos.seas.harvard.edu/papers/AIMag09-AUIs.pdf)

**Findlater, Moffatt, McGrenere & Dawson (2009), ephemeral adaptation (CHI Best Paper). [EMP-lab]**
- **Technique:** Predicted items appear instantly, and the other items fade in gradually.
- **Setting:** Two studies, N=24 each, regular computer users aged 19–45. Menus of 16 items, with 3 predicted items.
- **Study 1:** At 79% accuracy, the 500 ms fade-in was faster than a static menu (p=.047, menu×accuracy interaction η²=.253). At 50% accuracy, ephemeral menus were **not slower** than static (p=1.0). A 250 ms fade gave no benefit.
- [Findlater et al. 2009](https://www.cs.ubc.ca/labs/edapt/papers/findlater2009.pdf)
- **Study 2:**
  - The ephemeral menu was faster than both the static menu (p=.001) and adaptive colour highlighting (p=.004), with a main effect of η²=.427.
  - Highlighting was **no faster than static** (p=.581).
  - Satisfaction was 4.3/7 for static and 5.0 for both adaptive variants.
  - 12 users preferred highlighting, 8 ephemeral and 4 static.
  - Distraction was rated neutral (M=3.6/7).
  - [Findlater et al. 2009](https://www.cs.ubc.ca/labs/edapt/papers/findlater2009.pdf)
- **Cost when wrong:** On trials where the prediction was wrong, the static menu was fastest in both studies. Ephemeral adaptation does carry a cost, but it is small because positions never change. It "degrade[s] more gracefully with lower accuracy than a split menu". — [Findlater et al. 2009](https://www.cs.ubc.ca/labs/edapt/papers/findlater2009.pdf)
- **Failed pilot:** A design with two abrupt onsets (predicted items, then the rest after 25–100 ms) gave no speed benefit, and 3 of 4 pilot users preferred static. Timing details matter. — [Findlater et al. 2009](https://www.cs.ubc.ca/labs/edapt/papers/findlater2009.pdf)
- **Earlier highlighting results:** Gajos et al.'s colour highlighting in real applications drew negative feedback. Changes there were *immediately visible*, rather than appearing only when a menu opened, and users called them "disorienting". The authors suggest highlighting competes with other uses of colour in complex real UIs. — [Findlater et al. 2009](https://www.cs.ubc.ca/labs/edapt/papers/findlater2009.pdf)

**Other evidence**
- **Greenberg & Witten (1985):** An adaptive telephone directory that shortened the search path to frequent items was faster than a static one. Spatial adaptation tends to work only when it **removes navigation steps**, for example in deep hierarchies or where scrolling is needed. — cited in [Findlater & McGrenere 2004](https://www.cs.ubc.ca/labs/edapt/papers/findlater2004.pdf) and [Findlater et al. 2009](https://www.cs.ubc.ca/labs/edapt/papers/findlater2009.pdf)
- **Sears & Shneiderman (1994):** In both a controlled experiment and a field study, a static split menu fixed in advance was at least as fast as a traditional menu and "in most cases significantly faster". Their guideline was a maximum of 4 items above the split. — cited in [Findlater & McGrenere 2004](https://www.cs.ubc.ca/labs/edapt/papers/findlater2004.pdf)
- **Lavie & Meyer (2010), in-vehicle telematics. [EMP-lab]**
  - In routine situations, full adaptivity helped all participants, especially older ones.
  - In non-routine situations the interface had not been tuned for, cognitive workload "increased substantially", which hurt performance.
  - Intermediate adaptivity kept users involved but also needs care in non-routine situations.
  - [Lavie & Meyer 2010, IJHCS (abstract via BGU)](https://cris.bgu.ac.il/en/publications/benefits-and-costs-of-adaptive-user-interfaces/)
- **Microsoft Office 2000 "Personalized Menus" (industry case).** Menus first opened as a "short" version and expanded after a hover or click. Items migrated into the short menu with use and dropped out after non-use. Users could not view or change the underlying model; they could only switch it off or reset it. — described in [Findlater & McGrenere 2004](https://www.cs.ubc.ca/labs/edapt/papers/findlater2004.pdf). Microsoft turned the feature off by default in Office 2007, and the Ribbon was designed without it. Harris's verdict was "an experiment whose time has passed". [OPINION/industry decision] — [Jensen Harris 2006, MSDN blog](https://learn.microsoft.com/en-us/archive/blogs/jensenh/the-end-of-personalized-menus). Ed Bott called the feature confusing to both novices and experts. [OPINION] — [Ed Bott 2005](https://edbott.com/2005/05/27/tip-of-the-day-disabling-personalized-office-menus/)

### Inferences
- **No continuous reordering of fixed slots.** A UI that keeps reshuffling *where* things are matches the worst-performing pattern in this literature: mandatory, frequently changing spatial adaptation. Expect dispatchers to be slower and more frustrated with it than with a stable layout, even if the adaptation is "smart".
- **Separate the stable from the adaptive.** The safest analogue for FleetOS is: stable home positions for every core object (trucks, jobs, alerts lanes, map), plus *copies* or *echoes* of predicted-relevant items in a clearly marked adaptive zone, or emphasis applied in place.
- **Accuracy and timing must both be engineered.** Accuracy is the biggest performance lever, but predictability drives the feeling of control. For all-day professional users, feeling in control is likely to drive acceptance.
- **Rare, coarse recomposition is safer.** Both Sears & Shneiderman (one change per study) and SUPPLE (adapt once at the outset) succeeded by changing rarely. This argues for recomposing at shift start or on explicit mode change, rather than continuously.
- **Plan for non-routine situations.** The routine vs non-routine finding (Lavie & Meyer) is directly relevant: dispatch is routine most of the day with sudden non-routine incidents. Adaptation tuned on routine patterns may hurt exactly when stakes are highest.
- **Treat preference data with caution.** Lab users often *prefer* adaptive or highlighted variants that measure as no faster (highlighting) or slower (adaptable menus perceived as fastest). Preference and performance must both be measured.

### Gaps
- The exact speed-up figures for Sears & Shneiderman (1994) split menus were not retrieved this session. Commonly quoted percentages should be checked against the original TOCHI paper before use.
- The full text of Gajos et al. (2006, AVI), giving the effect sizes for split vs moving vs highlighting toolbars, was not read. Its results are reported here only through the 2008 paper and the 2009 review.
- Lavie & Meyer (2010) was read only at abstract level. The effect sizes and the definition of "intermediate" adaptivity were not retrieved.
- Almost all of these studies are short (about 1 hour), use students or general office users, and adapt menus or toolbars. No study was found that tests **whole-workspace recomposition** for professional operators over full shifts.

---

## Q2. Spatial memory and stable anchors: why does moving things harm expert performance, and how can a UI adapt without moving things?

### Takeaway
Expert performance depends on **spatial memory**: knowing *where* something is turns visual search into a quick decision. Spatial adaptation destroys that memory and stops users from improving. Techniques that adapt **without relocation** preserve it. Abrupt onset, or ephemeral adaptation, is the only one with demonstrated speed gains. In-place highlighting preserves location but has shown no speed gain. Copy-to-adaptive-area works when placed near the user's focus.

### Cited Findings
- **Scarr, Cockburn & Gutwin (Foundations & Trends in HCI, 2012/13). [REVIEW]**
  - Interfaces should help users build spatial memory of control locations and then exploit that memory for fast interaction.
  - The monograph reviews psychology and HCI evidence on spatial memory.
  - It analyses designs that support or disrupt spatial memory, including spatial distortion.
  - [Scarr, Cockburn & Gutwin, NOW Publishers](https://nowpublishers.com/article/DownloadSummary/HCI-046)
- **CommandMaps (Scarr et al., CHI 2012, Best Paper). [EMP-lab]** A flat, spatially stable command layout gave **no speed difference for novices**, but experts were **significantly faster** than with menus or the Ribbon. Spatial stability pays off with expertise. — [CommandMaps, U. Manitoba HCI lab](https://hci.cs.umanitoba.ca/publications/details/improving-command-selection-with-commandmaps)
- **Cockburn, Gutwin & Greenberg (2007), predictive model of menu performance. [THEORY + EMP validation]**
  - Selection time is modelled as pointing time (Fitts' law), plus **visual search for novices**, plus **Hick-Hyman decision time for experts**, plus a term for the novice-to-expert transition.
  - The model was validated on traditional menus, recency- and frequency-based split menus, and an adaptive "morphing" menu, and fitted "extremely well".
  - [Cockburn et al. 2007, CHI](https://www.springerprofessional.de/doi/10.1145/1240624.1240723)
  - The 2009 review notes that spatial adaptation "may prevent users from improving the efficiency of their visual search thus directly hurting performance". — [Findlater & Gajos 2009](https://kgajos.seas.harvard.edu/papers/AIMag09-AUIs.pdf)
- **Copying keeps the layout stable.** Copying rather than moving items into the adaptive section of a split interface increases spatial consistency and gives higher user satisfaction. — [Findlater et al. 2009](https://www.cs.ubc.ca/labs/edapt/papers/findlater2009.pdf)
- **Why spatial adaptation rarely wins in practice.** Spatially adaptive interfaces "are not often faster than their static counterparts because the user needs to constantly adapt to the altered layout, wiping out any potential gains". — [Findlater et al. 2009](https://www.cs.ubc.ca/labs/edapt/papers/findlater2009.pdf)
- **Abrupt onset as a cue. [EMP-perception literature, cited]**
  - An item that appears suddenly is processed first, even without an instruction to look for it (Yantis & Jonides 1984).
  - Colour captures attention mainly when the user is told to look for it.
  - Onset capture can occur below conscious awareness.
  - Onset capture is **overridable**: if users know the target's location or know the cue is unreliable, the onset does not distract them.
  - [Findlater et al. 2009](https://www.cs.ubc.ca/labs/edapt/papers/findlater2009.pdf)
- **Resizing ("morphing") menus** that enlarge predicted items in place are part of the design space (Cockburn 2007). — [Findlater & Gajos 2009](https://kgajos.seas.harvard.edu/papers/AIMag09-AUIs.pdf)
- **Locality.** Adaptations at or near the user's point of focus are discovered serendipitously. Distant ones require deliberate checking, and helpful adaptations in a distant split toolbar were ignored 7–19% of the time. — [Findlater & Gajos 2009](https://kgajos.seas.harvard.edu/papers/AIMag09-AUIs.pdf). Users explicitly asked for adaptive items next to the originals (10 of 23). — [Gajos et al. 2008](https://kgajos.seas.harvard.edu/papers/kgajos-chi08-predictability.pdf)
- **Industry anecdote [OPINION].** A comment on the Office decision says personalised menus caused support confusion ("It's the 7th item from the top" / "I only have 6 items") because each user's layout differed. This is anecdotal, from a blog comment. — [Harris 2006 blog comments](https://learn.microsoft.com/en-us/archive/blogs/jensenh/the-end-of-personalized-menus)

### Inferences
- **Fix the anchors.** Give every persistent object class a fixed "home" in the composition: map region, fleet roster, job queue, alerts lane. When something becomes important, it should **grow, gain emphasis or get an abrupt-onset cue in place**, or be **echoed** (copied) into a focus zone. It should not be relocated.
- **Recompose only on demand.** Reserve true recomposition (things moving to new places) for explicit user-triggered mode changes, for example "incident mode" or "planning mode". These are predictable, rare changes, which fit the Sears & Shneiderman / SUPPLE pattern.
- **Expect expert slowdowns.** Dispatchers use the tool all day and will become experts quickly, so the "experts are hurt more" finding is the key risk. A layout that helps on day 1 may slow them by week 3.
- **Keep layouts shareable.** Per-user divergent layouts break shared reference in team settings, such as "look at the third card" or supervisor support. A dispatch office may need **team-stable** anchors.
- **Size-in-place is untested.** Resizing in place sits between highlighting and moving. It changes neighbours' positions slightly, so its effect on spatial memory is plausible but not established here.

### Gaps
- The CommandMaps effect sizes and the full Scarr et al. monograph were not read; the findings above come from abstract-level summaries.
- The performance data for the morphing (resizing) menu in Cockburn et al. (2007) was not retrieved, so whether in-place resizing hurts spatial memory remains unverified.
- No study was found on spatial memory in **map-plus-panels operational dashboards** specifically, where map geography itself provides an anchor.

---

## Q3. Mixed-initiative design, user control (undo, pinning), explainability, trust in automation and automation surprises

### Takeaway
The most-cited guidance converges on a few points:
- The system should act autonomously only when the expected benefit exceeds the expected cost of being wrong.
- When uncertain, it should ask, or do *less* rather than act.
- Invoking or dismissing the automation must be trivial.
- Adaptation should be visible, predictable and correctable.

Human-factors research adds two warnings. Operators need **calibrated** (not maximal) trust. Automation that changes modes or behaviour invisibly produces "automation surprises". Intermediate levels of automation tend to preserve situation awareness best.

### Cited Findings
- **Horvitz (1999), 12 principles for mixed-initiative UIs. [THEORY + system case, LookOut]**
  1. Develop value-added automation.
  2. Consider uncertainty about the user's goals.
  3. Consider the user's attention when timing services.
  4. Infer the ideal action in light of costs, benefits and uncertainty.
  5. Use dialogue to resolve key uncertainties.
  6. Allow efficient direct invocation and termination.
  7. Minimise the cost of poor guesses, using time-outs and natural rejection gestures.
  8. Scope the precision of the service to match uncertainty, preferring "doing less" but doing it correctly.
  9. Support agent–user collaboration to refine results.
  10. Use socially appropriate behaviour.
  11. Keep a working memory of recent interactions.
  12. Keep learning by observing.

  — [Horvitz 1999, CHI](https://www.erichorvitz.com/chi99horvitz.pdf)
- **Decision-theoretic thresholds.** Horvitz frames the choice as expected utility. The system acts if P(goal|evidence) > p*. Between two thresholds it engages in dialogue, and below the lower one it does nothing. — [Horvitz 1999](https://www.erichorvitz.com/chi99horvitz.pdf)
  - **Context moves the thresholds.** Deeper user focus lowers the utility of an unwanted action, which **raises** the threshold for acting. A rushed user raises the cost of a missed action, which lowers the threshold. — [Horvitz 1999](https://www.erichorvitz.com/chi99horvitz.pdf)
  - **Graceful degradation.** When LookOut could not identify a specific time, it showed the relevant *week* view instead of guessing. — [Horvitz 1999](https://www.erichorvitz.com/chi99horvitz.pdf)
- **Timing from logs [EMP, small-sample instrumentation].** LookOut logged how long users dwelt on a message before invoking scheduling themselves. Dwell time followed a **sigmoid of message length**, which was used to defer offers of help. Its time-out before withdrawing an offer scaled with confidence. The design goal was an "intuitive, courteous butler" that gets out of the way. — [Horvitz 1999](https://www.erichorvitz.com/chi99horvitz.pdf)
- **Predictability and control [EMP-lab].** Predictable (most-recently-used) adaptation raised "in control" ratings from 3.73 to 4.73 out of 7. Higher accuracy also raised them. — [Gajos et al. 2008](https://kgajos.seas.harvard.edu/papers/kgajos-chi08-predictability.pdf)
- **Recurring complaints about adaptive UIs.** The most common are lack of user control over the adaptive process and difficulty predicting the system's response (Höök 2000). — [Findlater & Gajos 2009](https://kgajos.seas.harvard.edu/papers/AIMag09-AUIs.pdf)
- **Adaptable control is preferred [EMP-lab].** 55% of users preferred user-controlled menus, and only 1 in 27 found them the most frustrating. — [Findlater & McGrenere 2004](https://www.cs.ubc.ca/labs/edapt/papers/findlater2004.pdf)
- **Suggestions can prompt customisation.** Thomas & Krogsæter (1993) showed that an adaptive component *suggesting* adaptations could motivate users to customise. Jameson & Schwarzkopf (2002) studied controllability, with inconclusive results. Mackay (1991) found real-world customisation is minimal "because of time, difficulty, and lack of interest". — cited in [Findlater & McGrenere 2004](https://www.cs.ubc.ca/labs/edapt/papers/findlater2004.pdf)
- **Model opacity as a design failure.** Office 2000 adaptive menus gave users no way to view or change the underlying user model; the only controls were on/off and reset. — [Findlater & McGrenere 2004](https://www.cs.ubc.ca/labs/edapt/papers/findlater2004.pdf)
- **Lee & See (2004), "Trust in Automation: Designing for Appropriate Reliance". [THEORY/REVIEW]**
  - Automation is often problematic because people fail to rely on it *appropriately*.
  - Trust guides reliance when complexity makes full understanding impractical.
  - Trust rests on the automation's performance, process and purpose.
  - The design goal is **calibrated** trust: reliance matched to actual capability.
  - [Lee & See 2004, Human Factors 46(1)](https://journals.sagepub.com/doi/10.1518/hfes.46.1.50_30392); full text at [OSU CSEL](https://csel.eng.ohio-state.edu/productions/intel/research/trust/Lee%20%26%20See%20Trust%20Review.pdf)
- **Sarter & Woods, automation surprises and mode awareness. [EMP-field corpus + THEORY]**
  - Automation surprises occur when automation takes an unexpected action or fails to act as anticipated. They stem from poor **mode awareness** of the automation's current and future status.
  - A corpus of such surprises from Airbus A-320 pilots showed the problem persists on highly autonomous aircraft.
  - Woods et al. (1995) established the "mode error" vocabulary.
  - [Sarter & Woods 1997 via NASA NTRS](https://ntrs.nasa.gov/citations/20040112190); [Sarter & Woods 1995, Human Factors](https://trid.trb.org/View/426376)
- **Kaber & Endsley (2004), adaptive automation and level of automation (LOA) in a dynamic control task. [EMP-lab]**
  - LOA was the main driver of performance and situation awareness (SA).
  - Low-level automation gave the best performance, and **intermediate LOAs gave higher SA**.
  - Adaptive allocation of control at different cycle times (20/40/60% of task time) was compared against fully manual and fully automated control.
  - [Kaber & Endsley 2004, TIES (abstract)](https://bibbase.org/network/publication/kaber-endsley-theeffectsoflevelofautomationandadaptiveautomationonhumanperformancesituationawarenessandworkloadinadynamiccontroltask)
- **Amershi et al. (2019), Guidelines for Human-AI Interaction (Microsoft, CHI 2019). [REVIEW + validation]**
  - 18 guidelines distilled from more than 160 candidate recommendations and validated through a 4-step process.
  - They are grouped by when they apply: **initially, during regular interaction, when wrong, over time**.
  - [Microsoft Research project page](https://www.microsoft.com/research/project/guidelines-for-human-ai-interaction/)

### Inferences
For FleetOS, mixed-initiative translates into these concrete mechanisms:
- **Explain every change.** Each recomposition event should carry a one-line reason, such as "Truck 14 enlarged: ETA slip 25 min vs promise".
- **Let users pin.** Pinning freezes an element's size and position against adaptation, giving a user override in the adaptable sense.
- **Make reverting easy.** Provide one-step undo of the last recomposition, plus a global "freeze layout / calm mode" control.
- **Use confidence tiers.** Below one confidence level, only suggest (an "echo" in an adaptive zone). Between that and a higher level, ask or offer. Act only above the higher level. This follows the Horvitz thresholds.
- **Defer when the dispatcher is busy.** Raise the action threshold while the dispatcher is mid-task, for example typing a message or editing a route.
- **Show the automation's mode.** "Automation surprise" maps onto a UI that changes *which mode it is in* without saying so. Show the current composition mode persistently, for example "Incident focus: A7 corridor", in the spirit of a mode annunciator.
- **Aim for calibrated trust.** If the adaptation engine is right only about 70% of the time, users should learn that. Visible confidence and occasional "why" disclosures support calibration better than polished, unexplained behaviour.

### Gaps
- Parasuraman & Riley (1997, use/misuse/disuse/abuse) and Parasuraman, Sheridan & Wickens (2000, levels and types of automation) were **not retrieved** this session. They are standard references and should be added from the primary source.
- The individual titles of Amershi et al.'s 18 guidelines were not verifiable from the page fetched (they were in an image). The commonly cited items, which should be checked against the CHI'19 paper, include:
  - "make clear why the system did what it did"
  - "support efficient dismissal/correction"
  - "scope services when in doubt"
  - "update and adapt cautiously"
  - "provide global controls"
  - "notify users about changes"
- No empirical study was found that measures the effect of a "why is this here?" explanation on acceptance of *layout* adaptation specifically. Explainable-AI studies mostly test decision recommendations.
- The full text of Bunt, Conati & McGrenere's mixed-initiative customisation work (AI Magazine 2009) was not read.

---

## Q4. Calm technology, attention and interruption, peripheral awareness, change blindness, and motion and animation

### Takeaway
Attention research gives a clear recipe:
- Keep most information in the **periphery** and let it move to the centre only when it matters.
- **Time** interruptions to task breakpoints, or let the user negotiate them. Breakpoints cut frustration markedly, at the cost of roughly 1.5 minutes' delay.
- Use **motion or onset sparingly**. It is the strongest attention cue, which also makes it the most distracting.
- Protect against change blindness by **animating transitions** (about 1 s, simple, staged) and **keeping changes near the focus**.

Animation helps people follow *transitions between states*. It does not reliably help comprehension of complex content.

### Cited Findings
**Calm technology and peripheral awareness**
- **Weiser & Brown (Xerox PARC, 1995; reprinted 1997). [THEORY/OPINION]** Calm technology "engages both the center and the periphery of our attention, and in fact moves back and forth between the two". Their example: engine noise sits in the periphery while driving, but "an unusual noise is noticed immediately". — [Weiser & Brown, hosted at calmtech.com](https://calmtech.com/papers/designing-calm-technology); background and dating at [Wikipedia: Calm technology](https://en.wikipedia.org/wiki/Calm_technology). Sources differ on the date: usually 1995, with a 1996/97 reprint as "The Coming Age of Calm Technology".
- **Bartram, Ware & Calvert (2003), "Moticons". [EMP-lab]**
  - Simple motion cues ("moticons") were often detected and identified more reliably than colour or shape codes, **especially in peripheral vision**.
  - A second experiment compared motion types for detection vs *distraction* across task conditions.
  - The authors give guidelines for motion that supports awareness without excessive irritation.
  - [Bartram et al. 2003, IJHCS](https://www.interruptions.net/literature/Bartram-IJHCS03.pdf); [abstract record](https://scholars.unh.edu/ccom/979)

**Interruption timing**
- **McFarlane (2002), four coordination methods (immediate, negotiated, mediated, scheduled). [EMP-lab]**
  - N=36, in a representative emergency-response-style task.
  - **Negotiated** interruption (the user decides when to attend) gave the best overall performance.
  - Immediate interruption was slightly better only for timeliness of handling.
  - [McFarlane 2002, HCI journal](https://www.interruptions.net/literature/McFarlane-HCI02_2.pdf); results summary via [Mehrotra & Musolesi survey](https://arxiv.org/pdf/1711.10171)
- **Iqbal & Bailey (2008), OASIS defer-to-breakpoint system. [EMP-lab, authentic 2-hour tasks]** N=16 programmers and diagram editors working on their own open-ended tasks, with 16 notifications in 2 hours.
  - Frustration was lower at breakpoints than with immediate delivery. In diagram editing (7-point scale) it was 2.6 at medium breakpoints, 4.5 for immediate and 5.5 at fine breakpoints.
  - Reaction to relevant notifications was faster at breakpoints: 3.07 s vs 4.08 s (p≈.056). With immediate delivery, users first "externalised" their current thought before responding.
  - Scheduling had no effect on resumption time.
  - Mean deferral cost was 88.6 s.
  - [Iqbal & Bailey 2008, CHI](https://www.interruptions.net/literature/Iqbal-CHI08.pdf)
  - **Content relevance governs timing.** Task-relevant notifications should go at fine or medium breakpoints, and general-interest ones at coarse breakpoints. General-interest items were more frustrating overall (4.98 vs 3.59). — [Iqbal & Bailey 2008](https://www.interruptions.net/literature/Iqbal-CHI08.pdf)
  - **Breakpoint detection is imperfect.** Composite models detected breakpoints in new task sequences with 52–59% recall and 64% precision, and were poor at identifying the *type* of breakpoint. — [Iqbal & Bailey 2008](https://www.interruptions.net/literature/Iqbal-CHI08.pdf)
  - **Earlier work.** Prior studies show that delivering at breakpoints reduces resumption lag, frustration and errors, with coarser breakpoints costing less (Adamczyk & Bailey 2004; Iqbal & Bailey 2006). Task structure can predict interruption cost measured as resumption lag. — [Iqbal & Bailey 2008](https://www.interruptions.net/literature/Iqbal-CHI08.pdf); [Iqbal & Bailey 2006](https://interruptions.net/literature/Iqbal-CHI06-p741-iqbal.pdf). Breakpoint models reached 69–87% accuracy on their training data. — [Iqbal & Bailey 2007](https://www.interruptions.net/literature/Iqbal_Bailey-CHI07.pdf)
- **Horvitz.** Systems should "consider the costs and benefits of deferring action to a time when action will be less distracting". — [Horvitz 1999](https://www.erichorvitz.com/chi99horvitz.pdf)

**Change blindness**
- **NN/g, Budiu (2018), "Change Blindness in UX". [REVIEW/practitioner, grounded in perception research]**
  - Users miss changes far from their focus.
  - Changes go unseen when they happen during screen "flicker" or refresh, when several things change at once, when changes are spread across the screen, or when **motion cues are weak or absent**.
  - Recommended remedies:
    - Make one change at a time.
    - Keep elements that change together near each other and near the triggering control.
    - Animate changes, but limit concurrent animations.
    - Dim areas that do not change.
    - Place floating elements near the focus.
  - [NN/g: Change Blindness in UX](https://www.nngroup.com/articles/change-blindness-definition/)

**Animation**
- **Heer & Robertson (2007), animated transitions in statistical graphics. [EMP-lab]**
  - N=24 professionals who use data graphics in their jobs, aged 26–62.
  - Animated transitions lasted 1.25 s in Experiment 1 (object tracking) and 2 s in Experiment 2 (estimating changing values).
  - Animation significantly reduced tracking error vs static transitions **for every transition type** (F(2,286) ≥ 22.03, p<.001). It also improved value-change estimation for scatter plots, grouped bars and donut charts.
  - **Simple staging** helped, for example doing axis rescaling separately from value change, or staggering items to reduce occlusion.
  - **Heavy multi-stage staging hurt** accuracy and made users laugh.
  - Axis rescaling increased errors and "don't know" responses. Advice: avoid rescaling where possible and keep gridlines as landmarks.
  - Preferences ran staged > plain animation > static.
  - [Heer & Robertson 2007, IEEE TVCG](https://homes.cs.washington.edu/~jheer/files/2007-AnimatedTrans-InfoVis.pdf)
- **Heer & Robertson's design principles.** Keep intermediate states valid graphics. Use consistent syntax-to-semantics mappings. Respect the identity of objects across the transition and avoid ambiguity. Group similar transitions (common fate). Minimise occlusion. Maximise predictability with slow-in/slow-out. Use simple transitions, since translation and expand/contract are easier to follow than rotation. Stage complex transitions. Make them "as long as needed, but no longer". Where two states share no data dimension, use a **dissolve/static cut** instead of motion, to avoid implying false relations. — [Heer & Robertson 2007](https://homes.cs.washington.edu/~jheer/files/2007-AnimatedTrans-InfoVis.pdf)
- **Motion is double-edged.** Motion is "highly effective at attracting attention" and easily perceived in peripheral vision, but "animation's ability to grab attention can be a powerful force for distraction". Animation is also ephemeral, which complicates comparing items while they are in flux. — [Heer & Robertson 2007](https://homes.cs.washington.edu/~jheer/files/2007-AnimatedTrans-InfoVis.pdf)
- **Tversky, Morrison & Bétrancourt (2002), "Animation: can it facilitate?"** As summarised by Heer & Robertson:
  - Found "no benefit for communicating the workings of complex systems", but made an exception for animated transitions.
  - **Congruence principle:** the external representation's structure should match the desired internal representation.
  - **Apprehension principle:** it should be readily perceived and understood.
  - [Heer & Robertson 2007 (secondary)](https://homes.cs.washington.edu/~jheer/files/2007-AnimatedTrans-InfoVis.pdf)
- **Other animation studies (summarised in Heer & Robertson 2007):**
  - Robertson et al. (2002): animated transitions improved task time and satisfaction, and simple transitions of about 1 s performed best.
  - Bederson & Boltman (1999): animation improved users' ability to reconstruct a spatial structure from memory, building a better mental map.
  - StepTree (2005): mixed results for animated transitions.
  - [Heer & Robertson 2007 (secondary)](https://homes.cs.washington.edu/~jheer/files/2007-AnimatedTrans-InfoVis.pdf)
- **Practitioner timing heuristic [OPINION/secondary].** UI micro-animations of 100–500 ms are commonly recommended, with "a good reason" needed above 300 ms. This is loosely derived from NN/g's response-time thresholds of 0.1 s ("instant") and 1 s ("flow of thought"). The heuristic was not retrieved from NN/g directly. — [Fronteers 2024](https://www.fronteers.nl/en/blog/2024/12/microanimations); [Val Head](https://valhead.com/?p=2978)

### Inferences
**Attention budget**
- A continuously recomposing UI spends attention every time it moves something. Under the calm-tech framing, the default state should be **quiet**: changes should be gradual and peripheral unless an "unusual noise" (a true exception) warrants an onset or motion cue.
- Reserve abrupt onset and motion for a small number of genuinely exceptional events. Bartram's and Heer's evidence says motion is the strongest peripheral cue. If many things move, the cue loses meaning and becomes distraction.

**Timing**
- Recomposition is effectively an interruption.
- Low-urgency recompositions should be deferred to dispatcher breakpoints, such as after completing an assignment, closing a call or saving a route.
- Negotiated recompositions are another option: "3 changes suggested — apply?"
- Urgent safety or legal events (for example a driving-time violation or accident) can still interrupt immediately.

**Transitions**
- When a layout *does* change, animate it for about 1 s with slow-in/slow-out and simple translation or scaling.
- Stage it only lightly: at most two stages, for example making space first and then moving.
- Never rescale shared axes or the map zoom unnecessarily.
- Leave a brief **afterglow** or change trace so a dispatcher who was looking elsewhere can see what changed. Baudisch et al.'s "Phosphor" (2006) technique is cited in Heer & Robertson's references, but was not reviewed here.

### Gaps
- Chevalier, Riche, Plaisant et al. ("Animations 25 years later", AVI 2016) could not be retrieved; both searches failed. Its taxonomy of animation roles should be checked directly.
- Amber Case's "Calm Technology" principles (2015 book) were not retrieved.
- McFarlane (2002) and Bartram et al. (2003) were read only via abstracts or secondary summaries, so the effect sizes are missing.
- Phosphor (Baudisch et al., UIST 2006) and other change-awareness techniques were not reviewed.
- No study was found on change blindness or interruption **in dispatch or control-room software UIs** specifically, as opposed to desktop tasks.

---

## Q5. Focus+context, fisheye views and degree-of-interest functions, semantic zoom, adaptive dashboards and responsive visualisation

### Takeaway
Furnas's **degree-of-interest (DOI)** function is the formal precedent for "things grow and shrink with relevance": interest = a-priori importance − distance from the current focus. It gives a principled, explainable rule for which items get space and detail. Responsive-visualisation research (Hoffswell et al.) shows that adapting a visualisation to different spaces needs explicit per-context design control, not purely automatic reflow. Evidence that *adaptive operational dashboards* improve operator outcomes was not found.

### Cited Findings
- **Furnas (1986), Generalized Fisheye Views (CHI'86, pp. 16–23). [THEORY + early demonstrations]**
  - Each item gets a DOI score, and a display of any size shows the top-scoring items.
  - DOI(x | focus y) = API(x) − D(x, y). API is the global a-priori importance and D is the distance from the current focus. Interest rises with importance and falls with distance.
  - Later generalisations use DOI = F(API, D).
  - The motivation is that people know their own neighbourhood in detail but only the major landmarks further away.
  - [Furnas 1986 PDF](https://cspages.ucalgary.ca/~saul/581/exer.eps/4furnas86.pdf)
- **DOITrees and related layouts.** Heer & Card's "DOITrees Revisited" (AVI 2004) applied DOI to space-constrained tree layouts with animated, staged expansion. SpaceTree (Plaisant et al. 2002) likewise staged collapse, pan and expand. — cited in [Heer & Robertson 2007](https://homes.cs.washington.edu/~jheer/files/2007-AnimatedTrans-InfoVis.pdf)
- **Fisheye distortion as a transition type.** Heer & Robertson classify "bifocal and graphical fisheye distortions" as **substrate transformations**, a transition class in which object identity must be preserved for viewers to stay oriented. — [Heer & Robertson 2007](https://homes.cs.washington.edu/~jheer/files/2007-AnimatedTrans-InfoVis.pdf)
- **Hoffswell, Li & Liu (2020), "Techniques for Flexible Responsive Visualization Design" (CHI 2020 Best Paper). [EMP: corpus analysis + interviews + prototype]**
  - Analysed **231 responsive news visualisations** and interviewed **5 journalists**.
  - Found that tools give little support for responsive design.
  - Derived 4 guidelines: cross-device editing, device-specific customisation, simultaneous cross-device previews, and controlled propagation of edits.
  - Their prototype edits several size-specific versions at once.
  - [UW IDL page](https://idl.uw.edu/papers/responsive-vis); [Adobe Research](https://research.adobe.com/publication/techniques-for-flexible-responsive-visualization-design)
- **Ephemeral adaptation for visualisation [OPINION, authors' speculation].** Abrupt onset of the most relevant elements, with others fading in, could guide attention in visually complex pages and visualisations, "briefly providing high-level structure before the remaining visualization appears". This was not tested. — [Findlater et al. 2009](https://www.cs.ubc.ca/labs/edapt/papers/findlater2009.pdf)
- **Interest models from user behaviour.** Heer's earlier work on interest estimation (CHI 2003) appeared in results as a DOI-related lead, but was not read. — [Heer 2003 PDF](https://homes.cs.washington.edu/~jheer/files/2003-InterestEstimation-CHI.pdf)

### Inferences
**A DOI engine for FleetOS.** A DOI-style engine is a natural, *explainable* core for a "living composition":
- Each truck, job or alert gets API: a-priori importance from business rules such as SLA, value, legal risk or hazmat.
- Each item also gets a distance D from the dispatcher's current focus: the selected corridor, customer or time window.
- Size and detail level follow DOI.
- The "why is this big?" explanation falls out directly as "high importance (SLA breach) + near your focus (A7 corridor)".

**Damping.** To respect the spatial-stability evidence (Q1–Q2), DOI should modulate **size and level of detail in place**, not position, wherever possible. DOI recomputation should be **damped**, using hysteresis and minimum dwell times, so items do not flicker between sizes. That damping is the dashboard analogue of "low frequency of change".

**Responsive vs adaptive.** Hoffswell's finding transfers: the *forms* each object takes at each size (for example truck as dot, chip, card or full panel) should be **hand-designed per breakpoint**. They should not be produced by generic automatic reflow. Map-based "semantic zoom" (changing representation by scale) is the same idea applied to geography.

### Gaps
- No empirical study was found in this session on **semantic zoom** (for example Perlin & Fox's Pad, 1993, or Bederson's Pad++/ZUIs) or on zoomable-UI navigation costs. These should be retrieved.
- No controlled study was found on **adaptive or self-reorganising dashboards for operators** (logistics, control rooms) that measures SA or performance. This is a genuine evidence gap; FleetOS would be testing new ground.
- The evaluation results reported in Furnas (1986) were not retrieved; the DOI formula above comes from secondary summaries of the paper.

---

## Q6. Evaluation methods: how to test a self-recomposing UI with real dispatchers

### Takeaway
A credible evaluation must:
1. Control and *report* the adaptation algorithm's accuracy, predictability and frequency of change.
2. Test both **routine and non-routine (incident)** scenarios.
3. Measure **situation awareness** (objective SAGAT-style probes plus subjective SART), **workload** (NASA-TLX, possibly a second instrument), task time and errors, and **awareness of non-surfaced items**.
4. Run long enough for expertise to form, because short lab sessions overstate adaptive benefits for novices and hide expert costs.
5. Combine lab tasks replayed from real logs with Wizard-of-Oz prototypes and field telemetry.

### Cited Findings
**Design and reporting of adaptive-UI studies**
- **Findlater & Gajos (2009). [REVIEW]**
  - Researchers must control or at least **report** accuracy, predictability and frequency of change, because these confound comparisons.
  - Task choice and user expertise strongly change results, so it "may be necessary … to let users develop expertise".
  - Satisfaction items specific to adaptive UIs should be measured: obtrusiveness, predictability and usefulness of the adaptive behaviour.
  - Standard measures miss a cost of adaptation: reduced **awareness of features not surfaced**. This can be measured with a recognition test (Findlater & McGrenere 2007).
  - [Findlater & Gajos 2009](https://kgajos.seas.harvard.edu/papers/AIMag09-AUIs.pdf)
- **The efficiency–awareness trade-off.** Highly accurate adaptive menus were efficient but produced **low awareness of unused features**, and **hurt performance on new tasks** in a follow-up. Less accurate adaptation gave higher awareness (Findlater & McGrenere 2008/2009). — [Findlater & Gajos 2009](https://kgajos.seas.harvard.edu/papers/AIMag09-AUIs.pdf)
- **Holding accuracy at a set level.** A two-step method makes accuracy an experimental variable while keeping the selection sequence constant across conditions. First run a base algorithm (64.5% accurate in their case). Then randomly flip a set number of predictions to reach target accuracies of 50% and 79%. — [Findlater et al. 2009](https://www.cs.ubc.ca/labs/edapt/papers/findlater2009.pdf)

**Task construction and in-study measures**
- **Tasks replayed from real logs.** The experimental task was built from **20 weeks of a real office worker's logs**. Real menus were relabelled ("masked") to avoid prior-knowledge effects, blocks were counterbalanced with Latin squares, and an implicit error penalty was used (participants must select correctly to continue). — [Findlater & McGrenere 2004](https://www.cs.ubc.ca/labs/edapt/papers/findlater2004.pdf)
- **Measures used in Gajos et al. (2008).** Overall task time; median acquisition time, split by static vs adaptive location; **utilisation rate** (how often the adaptive area was used when it held the correct item); perceived accuracy; 8 Likert items including "I felt in control" and "I knew when it would have what I needed"; and eye-tracking transitions between regions of interest. — [Gajos et al. 2008](https://kgajos.seas.harvard.edu/papers/kgajos-chi08-predictability.pdf)
- **Moving beyond the lab.** The authors note that "much future work remains in moving beyond laboratory studies and into the field". — [Gajos et al. 2008](https://kgajos.seas.harvard.edu/papers/kgajos-chi08-predictability.pdf)
- **Authentic-task interruption method (Iqbal & Bailey 2008).**
  - Users worked on their own open-ended tasks for 2 hours.
  - **In-the-moment frustration** was captured on a 7-point scale at each notification.
  - Reaction time and resumption time were logged.
  - Participants then **reviewed their own screen recordings** to confirm or relocate system-chosen moments and explain why.
  - [Iqbal & Bailey 2008](https://www.interruptions.net/literature/Iqbal-CHI08.pdf)

**Wizard-of-Oz and log-based tuning**
- **Wizard-of-Oz precedent.** Hudson et al. (2003) used a Wizard-of-Oz study to test whether sensors could predict human interruptibility before building the system. — cited in [Iqbal & Bailey 2008 references](https://www.interruptions.net/literature/Iqbal-CHI08.pdf)
- **Log-based tuning.** LookOut logged real users' dwell-before-invocation times to fit its timing model, and supported per-user retraining. — [Horvitz 1999](https://www.erichorvitz.com/chi99horvitz.pdf)

**Situation awareness and workload instruments**
- **Combined instruments.**
  - A 2016 evaluation of a safety-critical decision-support system used **SAGAT** (objective, freeze-probe) and **SART** (subjective) for SA, and **NASA-TLX** for workload. — [UTS repository](https://opus.lib.uts.edu.au/handle/10453/43338)
  - An FAA study (1999) of en-route air traffic controllers compared **SART, SAGAT, SPAM** (real-time, no-freeze probe queries) and error detection, with NASA-TLX for workload, as predictors of controller performance. — [FAA OAM report 9903](https://www.faa.gov/data_research/research/med_humanfacs/oamtechreports/1990s/1999/9903)
- **Instrument sensitivity varies.** In simulated petrochemical control-room operation (2014), NASA-TLX did **not** vary across workload levels while SWAT did. SA (measured with SAGAT) fell sharply under high workload for one interface design but held steady for another. Interface design changed SA resilience. — [LSU repository](https://repository.lsu.edu/mechanical_engineering_pubs/1087)
- **SA and workload are related.** SAGAT and 3D-SART scores fell as workload rose, and both correlated moderately and negatively with NASA-TLX (2020). — [JNWPU 2020](https://www.jnwpu.org/articles/jnwpu/abs/2020/03/jnwpu2020383p610/jnwpu2020383p610.html)
- **Nuclear control rooms.** A full-scale simulator study (2023) paired SART and NASA-TLX with **gaze entropy**, and notes that SAGAT and SART rank highest among SA methods. — [MDPI Energies 2023](https://www.mdpi.com/1996-1073/16/15/5601)
- **SA as an outcome measure.** Kaber & Endsley (2004) used SA, workload and performance to compare levels and adaptive scheduling of automation, and found that the *level* of automation dominated the outcomes. — [Kaber & Endsley 2004](https://bibbase.org/network/publication/kaber-endsley-theeffectsoflevelofautomationandadaptiveautomationonhumanperformancesituationawarenessandworkloadinadynamiccontroltask)

**Scenario coverage**
- **Routine vs non-routine.** Adaptive benefits in routine situations reversed into higher workload in non-routine ones. Scenario sets must include both. — [Lavie & Meyer 2010](https://cris.bgu.ac.il/en/publications/benefits-and-costs-of-adaptive-user-interfaces/)

### Inferences
**Proposed protocol for FleetOS** (a synthesis; not taken from any single source):

1. **Replay lab.** Rebuild 1–2-hour scenarios from real dispatch logs, using the Findlater & McGrenere approach of masking real data. Inject scripted incidents such as breakdowns, ETA slips, driving-time limits and customer escalations.
   - Compare **static layout** vs **adaptive-in-place** (size, emphasis, echo) vs **full recomposition**.
   - Run at fixed accuracy levels, for example the engine's real accuracy vs a "perfect" Wizard vs about 50%.
2. **Measures.**
   - Time to detect and act on each incident.
   - Errors, such as wrong truck assigned or missed constraint.
   - SAGAT-style freeze probes: "Which trucks are late? Where is truck 14? Which job is at risk?"
   - SART after each scenario; NASA-TLX, plus a second workload instrument because TLX may be insensitive.
   - Utilisation of adaptive affordances.
   - Number of pins and undos, and "freeze layout" usage, as revealed-preference signals of annoyance.
   - A recognition test for **awareness of items the UI did not surface**.
3. **Wizard-of-Oz before machine learning.** A human "wizard" drives the recomposition in real time. This tests whether the *idea* helps, independent of model accuracy, as in Hudson et al. 2003 and the "perfect accuracy" condition above.
4. **Longitudinal field deployment** with a few dispatchers over 2–4 weeks.
   - Log adaptations, overrides, undo and freeze actions, and time-to-action on alerts.
   - Run in-the-moment micro-surveys at breakpoints ("Was that change helpful? 1–7").
   - Hold retrospective video-review sessions, as in Iqbal & Bailey.
   - Look for expert slowdown over time (the Q2 risk).
5. **A/B or switchback in production.** Compare adaptive vs static per dispatcher-shift, with operational KPIs such as on-time %, exceptions handled and overtime.
   - Treat this as **outcome evidence only**; it cannot explain *why*.
   - Treat the results as synthetic or internal evidence, consistent with the project's own claims policy.

### Gaps
- No published study was found that evaluates an adaptive UI **with truck or freight dispatchers**. The closest operator analogues are air traffic control, process control and nuclear control rooms.
- No source was retrieved on **A/B testing of adaptive layouts in professional software** (as opposed to consumer web).
- No guidance was found on how long a longitudinal adaptive-UI study must run for expert spatial memory to form. CommandMaps-style expertise effects suggest days to weeks, but this was not verified.
- The Findlater & McGrenere (2007, 2008, 2009) awareness papers were cited only via the review; their recognition-test procedure was not read in detail.

---

## Q7. Synthesis: which design principles separate adaptive UIs that succeed from ones that annoy, applied to an all-day dispatcher workspace?

### Takeaway
Across studies, adaptive UIs succeed when four conditions hold:
1. The adaptation is **accurate**.
2. It is **predictable or explainable**.
3. It is **infrequent or coarse-grained**.
4. It is **spatially non-disruptive**: in place, copied rather than moved, or temporal.

It also helps when the adaptation is **elective** (ignorable), **local** to the user's focus, **user-controllable** (pin, undo, freeze, suggest-then-apply), **well-timed** (at breakpoints), and when it **degrades gracefully when wrong**.

Adaptive UIs fail or annoy when they reorder known locations frequently, act invisibly or randomly, interrupt mid-task, hide items, or are tuned only for routine conditions.

### Cited Findings
- **Accuracy** drives speed and use of the adaptive affordance (task time 197 s → 177 s; use 71% → 86%). **Predictability** drives the feeling of control (3.7 → 4.7 out of 7), and neither substitutes for the other. — [Gajos et al. 2008](https://kgajos.seas.harvard.edu/papers/kgajos-chi08-predictability.pdf)
- **Frequent spatial change** made adaptive menus about 8% slower than static and the most frustrating. Users prefer controlling changes themselves (55% preferred adaptable). — [Findlater & McGrenere 2004](https://www.cs.ubc.ca/labs/edapt/papers/findlater2004.pdf)
- **Changing rarely** (once per study) allowed split menus to beat static ones. Changing after every selection hurt. — [Findlater & Gajos 2009](https://kgajos.seas.harvard.edu/papers/AIMag09-AUIs.pdf)
- **Adapting without moving** (temporal onset) beat static by roughly 8% at 79% accuracy and was not worse at 50%. Colour highlighting gave no speed gain. — [Findlater et al. 2009](https://www.cs.ubc.ca/labs/edapt/papers/findlater2009.pdf). The ~8% figure is an approximate reading of the bar charts (about 1.3 s vs 1.2 s per selection in Study 2, Figure 6); the paper reports the effect statistically rather than as a percentage.
- **Elective, copied adaptation** beats mandatory moves. Distance from the user's focus causes helpful adaptations to be ignored 7–19% of the time. — [Findlater & Gajos 2009](https://kgajos.seas.harvard.edu/papers/AIMag09-AUIs.pdf)
- **Mixed-initiative design** means:
  - acting only above expected-utility thresholds
  - asking in the middle band
  - "doing less but correctly" under uncertainty
  - trivial invocation and termination
  - timing based on attention.
  - [Horvitz 1999](https://www.erichorvitz.com/chi99horvitz.pdf)
- **Breakpoint timing** lowers frustration, for example 2.6 vs 4.5 on a 7-point scale, at about 90 s of deferral. — [Iqbal & Bailey 2008](https://www.interruptions.net/literature/Iqbal-CHI08.pdf). **Negotiated** interruptions perform best overall. — [McFarlane 2002](https://www.interruptions.net/literature/McFarlane-HCI02_2.pdf)
- **Animated transitions** (about 1 s, simple, lightly staged) improve object tracking across every transition type tested. Heavy staging and axis rescaling hurt. — [Heer & Robertson 2007](https://homes.cs.washington.edu/~jheer/files/2007-AnimatedTrans-InfoVis.pdf)
- **Change blindness** sets in when changes are distant, simultaneous or lack motion cues. Make one change at a time, near the focus. — [NN/g 2018](https://www.nngroup.com/articles/change-blindness-definition/)
- **Routine-tuned adaptation** raises workload in non-routine situations. — [Lavie & Meyer 2010](https://cris.bgu.ac.il/en/publications/benefits-and-costs-of-adaptive-user-interfaces/). **Intermediate automation** preserves SA. — [Kaber & Endsley 2004](https://bibbase.org/network/publication/kaber-endsley-theeffectsoflevelofautomationandadaptiveautomationonhumanperformancesituationawarenessandworkloadinadynamiccontroltask). **Calibrated trust and mode awareness** prevent automation surprises. — [Lee & See 2004](https://journals.sagepub.com/doi/10.1518/hfes.46.1.50_30392); [Sarter & Woods 1997](https://ntrs.nasa.gov/citations/20040112190)
- **Industry precedent.** A large vendor turned off its flagship adaptive menu by default after years of user complaints. [OPINION/industry] — [Harris 2006](https://learn.microsoft.com/en-us/archive/blogs/jensenh/the-end-of-personalized-menus)

### Inferences
**Candidate design rules for the FleetOS "living composition"** (synthesis by this researcher; each rule traces to the cited findings above):

1. **Stable anchors, adaptive emphasis.** Every object class has a home. Relevance changes **size, level of detail and emphasis in place**, not position. Map geography is itself an anchor and should not be re-projected or re-zoomed without user action.
2. **Echo, don't move.** Predicted-relevant items get a *copy* in a dedicated focus or "attention" lane placed near where the dispatcher is working. The original stays put.
3. **Low frequency, with hysteresis.** Recompute relevance continuously, but **commit layout changes rarely**. Use minimum dwell times, damping, and batching at breakpoints. Full recomposition happens only on explicit mode switches or shift start.
4. **A tiered attention budget.**
   - Peripheral, calm changes, such as gradual size or opacity shifts, are the default.
   - Abrupt onset or motion is reserved for true exceptions.
   - Hard interruptions are allowed only for safety, legal or customer-critical events.
5. **Time it to breakpoints, or negotiate.** Queue non-urgent recompositions until the dispatcher finishes the current action. Alternatively show "N changes ready — apply", which also helps predictability.
6. **Animate every committed change.** About 1 s, slow-in/slow-out, simple translate or scale, at most two light stages, one change at a time near the focus. Leave a short afterglow so changes are noticeable after the fact.
7. **Explain, pin, undo, freeze.** Each adaptation carries a "why" (DOI-style reasons). The user can pin any element, undo the last recomposition and freeze the whole layout. Override counts serve as live annoyance telemetry.
8. **Show the current mode.** A persistent indicator of what the composition is optimising for, to avoid automation surprises.
9. **Degrade gracefully.** When the engine is uncertain, it should do less, for example emphasise a region or time window rather than promote a specific truck, in line with Horvitz's "doing less but correctly".
10. **Protect awareness of the unsurfaced.** Keep a compact, stable overview of *all* trucks and jobs so that adaptation-driven focus does not erode awareness of quiet items. This directly addresses the efficiency–awareness trade-off.
11. **Design for incident conditions, not just routine.** Validate behaviour specifically during non-routine events, where adaptive systems are most likely to add workload.

### Gaps
- None of the rules above has been tested as a package, or on map-centric operational dashboards. They are extrapolations from menu, toolbar, notification and visualisation studies.
- No evidence was found on **team-level effects**, such as shared layouts across dispatchers, supervisor oversight, or verbal reference to on-screen positions. These are likely important in a dispatch office.
- No study was found on **all-day fatigue** effects of a continuously changing UI over an 8–10 hour shift. All the lab studies reviewed lasted about 1–2 hours.
