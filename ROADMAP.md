# Project Gunpowder Roadmap

## Future Portfolio Structure

Add two primary ways to browse the work:

- `Scenes` - larger environments or assembled compositions. A scene page should show the full scene model and list every individual asset used inside it.
- `Individual Pieces` - standalone props, hard-surface assets, characters, symbols, vehicles, or studies. An individual piece page should show the focused model and reference any scenes where that asset appears.

The goal is a bidirectional portfolio system:

- Scene cards lead to scene detail pages with included asset references.
- Individual asset cards lead to asset detail pages with "Used in" scene references.
- Filters or tabs should let visitors switch between `Scenes` and `Individual Pieces` without losing the dark minimal 3D inspection feel.
- Project data should eventually support relationships, for example `type`, `usedIn`, and `includes` fields.

This should make the portfolio feel more organized as the model library grows.
