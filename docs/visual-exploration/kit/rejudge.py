# Second, harsher judging pass: rewrites verdict + reason in the study sources.
import re, glob, json
O = {
 "O-01": ("MAYBE", "The micro-journey row is excellent, but as a full composition it is subsumed by O-09, which adds geography at no cost. Keep the row and drop this page."),
 "O-02": ("REJECT", "Map as landscape wallpaper: about 55% of the screen is sea and Spain, and the labels collide where the operation is densest. The attached-label idea survives elsewhere (O-09, R-07)."),
 "O-04": ("REJECT", "Spreadsheet. Facts lose their native form and there is nothing temporal or physical. The glyph vocabulary is worth keeping; the composition is not."),
 "O-06": ("REJECT", "A generic accordion. Expanding one row destroys the comparability that made the list worth having. In-place growth belongs to a transition, not a layout."),
 "O-07": ("MAYBE", "Superb landing sentence, but a workspace can't be built from three sentences. On a calm day it is empty. Use as the attention header above O-09."),
 "O-08": ("REJECT", "Decorative at population scale. Eight silhouettes look lovely and forty would be wallpaper. The load-fill glyph survives as a row micro-object."),
 "D-04": ("REJECT", "Too diagrammatic and static. The monogram stands in for a person, and connector curves carry less information than one sentence would."),
 "D-06": ("REJECT", "Right semantics at the wrong scale: the 49 km legal remainder is a sliver on a regional map. D-05 says the same thing legibly."),
 "D-07": ("REJECT", "A generic activity feed. Equal visual weight for every event buries the one infraction that matters, so it needs significance grouping before it is FleetOS."),
 "D-08": ("MAYBE", "Conflict-as-overlap is exactly right, but the composition is sparse and the days compress. Belongs as a zoom level of the Driver temporal spine, not a page."),
 "V-02": ("MAYBE", "A strong physical argument for multi-drop only. It overlaps V-01 and the existing lab load plan; fold the unload-order arrows into those."),
 "V-03": ("MAYBE", "Correct and honest, but it is a layer of the route axis, not a vehicle view. As its own page it duplicates the route."),
 "V-04": ("REJECT", "Dashboard progress bars by another name. The projected-wear idea should be callouts on the elevation, not a bar stack."),
 "V-05": ("MAYBE", "Native physical comparison with a clear recommendation, but four elevations eat the screen and cost/distance is buried. Pair candidates with a ranked list instead."),
 "V-09": ("MAYBE", "Excellent concept (structures as gates against this truck), but the gates cluster at Porto and the labels collide. It works better as a layer of R-03."),
 "V-11": ("REJECT", "An instruction-manual exploded view. Couplings carry no information and part-swap is better done inside V-05."),
 "R-01": ("MAYBE", "Necessary but not sufficient: the baseline strip already exists in the lab. Without time or geography it can't show slack or context. A component, not a direction."),
 "R-04": ("MAYBE", "Clever N–S alignment, but it breaks for E–W routes and leaves a large empty right column. Keep the alignment trick for portrait layouts only."),
 "R-06": ("MAYBE", "Honest trade-off and a clear recommendation, but half the screen is a map whose only message is 'two lines diverge', and the ledger is a table."),
 "R-07": ("REJECT", "Fullscreen landscape again: Spain and the Atlantic take most of the screen. Embedding km ticks in the line is good; this frame is not."),
 "R-08": ("REJECT", "Decorative: FleetOS has no site-plan data, so this view promises something it can't deliver. Only the arrival-window fragment survives."),
 "R-09": ("MAYBE", "The cleanest 'does the rule hit my transport' picture, but it is the same km×time plane as R-02. Fold restriction rectangles into R-02 rather than a second view."),
 "X-02": ("MAYBE", "Real geometry at the right scale, but without a basemap Porto is abstract, and the right column is a conventional side panel."),
 "X-05": ("REJECT", "Two thin strips repeat each other, and the length difference (+69 km) is the only message. A sentence and R-06 do it better."),
 "X-06": ("MAYBE", "Essential for trust and in correct document form, but it's a rarely-opened page. It should be a fold-out of X-01, not a destination."),
 "X-07": ("REJECT", "Fullscreen landscape for a 40 km object: mostly empty land, with time reduced to labels. Spatial restriction mode must be inset or portrait."),
 "F-01": ("REJECT", "Decorative skeuomorph. Fanned overlap hides the very content the dossier exists to show."),
 "F-03": ("MAYBE", "The canonical document view and the live/frozen distinction are both right, but the generous whitespace and single sheet per screen make it a component rather than a direction."),
 "F-04": ("MAYBE", "The history-ribbon structure is right, but thumbnails at this scale are illegible and only work as recognition glyphs."),
 "F-05": ("MAYBE", "Cause → document → consequence is exactly the question, but the three-column arrow flow reads as a process diagram. Integrate the consequence list into F-02's margin."),
}
for f in glob.glob("studies-*.mjs"):
    s = open(f, encoding="utf8").read()
    for sid, (v, r) in O.items():
        m = re.search(r'\{ id: "%s".*?verdict: "(\w+)"' % sid, s, re.S)
        if not m: continue
        blk_start = m.start(); blk_end = s.find("html:", blk_start)
        blk = s[blk_start:blk_end]
        blk2 = re.sub(r'verdict: "\w+"', f'verdict: "{v}"', blk)
        blk2 = re.sub(r'reason: "[^"]*"', lambda _m: 'reason: ' + json.dumps(r, ensure_ascii=False), blk2)
        s = s[:blk_start] + blk2 + s[blk_end:]
    open(f, "w", encoding="utf8").write(s)
print("ok")
