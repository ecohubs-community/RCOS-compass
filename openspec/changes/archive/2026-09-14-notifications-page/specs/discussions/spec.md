## ADDED Requirements

### Requirement: A post can mention a member

A member MUST be able to mention another current member of the community in a
post, by their membership number. With JavaScript the composer MUST offer current
members by their label and insert the number for the one chosen. A mention MUST be
shown as the member's person label, so an erased member reads as a former member.
A number that does not belong to a current member of this community MUST be shown
as the plain text written and MUST NOT resolve to anyone.

#### Scenario: Choosing a member while writing
- **WHEN** a member types `@` in the composer and chooses Lena
- **THEN** Lena's membership number is inserted, and the post shows "@Lena" once saved

#### Scenario: Without JavaScript
- **WHEN** a member without JavaScript writes `@M-0142` for a current member
- **THEN** the saved post shows that member's label as the mention

#### Scenario: An erased member
- **WHEN** a mentioned member is later erased
- **THEN** the post shows the mention as "Former member (M-0142)"

#### Scenario: A number from another community
- **WHEN** a post mentions a number belonging only to a member of another community
- **THEN** the post shows the text as written, and no member of either community is named

#### Scenario: Mention text is not markup
- **WHEN** a mention is followed by text containing HTML
- **THEN** the HTML renders as words, as for any post
