# Page Topology

## Deployed application

1. Shared platform rail — sticky desktop navigation, click-driven collapse.
2. Shared top bar — sticky, 52px high, local workspace actions.
3. Homepage hero — static editorial title, primary canvas CTA, six click-driven creation modes.
4. Creative Agent — local textarea, attachment picker, submit-to-canvas action, click-driven Skill categories.
5. Product features — click-driven horizontal carousel.
6. Recent projects — locally persisted, horizontal scroll row.
7. TV Show — click-driven category filters, explicit search, responsive work-card grid.
8. Local-help footer.

## Reference patterns observed on the public LibLib homepage

1. 68px desktop rail and 50px content header.
2. Promotional/banner area followed by one large canvas entry and compact quick-action cards.
3. Agent region begins at approximately `y=523.5px` on a 1440px desktop viewport.
4. TV Show follows as the primary discovery surface.
5. At 390px the rail is removed from layout and the main content uses 375px of the 390px viewport.

## Intended assembly

Preserve all existing routes and functional sections, but change the homepage order to:

1. compact hero and creation modes;
2. Creative Agent and Skills;
3. product features;
4. recent projects;
5. TV Show;
6. local-help footer.

The desktop rail defaults to the compact state. On small screens it becomes a fixed bottom navigation surface so the content column can use the full viewport width.
