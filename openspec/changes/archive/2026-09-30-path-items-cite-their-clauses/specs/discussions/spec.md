## MODIFIED Requirements

### Requirement: A discussion belongs to one community, and to at most one subject

A discussion MUST be reachable only from inside the community that owns it. It
MAY name the clause or definition it is about, and MAY name neither — the field
is offered as optional and has to mean it. A clause it names MUST exist in the
standard the community adopted, and MUST be stored by the clause's stable key
whichever of the clause's two names was typed. A discussion started from a Path
item MUST also name that item's section, which MUST be an authored section of
the standard the community adopted; the section it names, or else the owner of
the clause it names, is the section a freeze of it adopts a definition for. When
the clause a member submits is owned by a different section than the one the
discussion was started from, the section MUST NOT be stored and the clause
decides.

#### Scenario: A member opens a discussion on a clause with no definition
- **WHEN** a member starts a discussion from a clause
- **THEN** the discussion is created against that clause
- **AND** it appears in that community's discussion list

#### Scenario: A member types the reference rather than the key
- **WHEN** a member enters the clause reference the standard browser shows them
- **THEN** the discussion is stored against that clause's stable key
- **AND** the community's outstanding work shows the discussion as already open

#### Scenario: A member leaves the clause field empty
- **WHEN** a member starts a discussion without naming a clause
- **THEN** the discussion is created about nothing in the standard
- **AND** it can be discussed and proposed on like any other

#### Scenario: A member names a clause the standard does not have
- **WHEN** a member enters a clause that is in neither name
- **THEN** the discussion is refused at that point, where the typing happened

#### Scenario: A member starts from a Path item whose section owns no clause
- **WHEN** a member starts a discussion from the Path item for "Non-Goals and Exclusions"
- **THEN** the discussion names that section and no clause
- **AND** it can be proposed on and frozen

#### Scenario: A member changes the prefilled clause to another section's
- **WHEN** a member starts from "Voluntary Exit" and replaces §3.6.1 with §3.6.5
- **THEN** the discussion names §3.6.5 and no section, and a freeze adopts for "Asset, Role, and Responsibility Separation"

#### Scenario: A section that is not authored, or not in the standard
- **WHEN** the start form names `purpose-charter.ratification-record` or a key the standard does not have
- **THEN** the discussion is refused at that point, and nothing is created

#### Scenario: A member of another community requests it
- **WHEN** a member of community B requests a discussion belonging to A
- **THEN** the answer is the same as for a discussion that does not exist

## ADDED Requirements

### Requirement: A discussion shows the RCOS text it answers

A discussion that answers a section MUST show, in its header, a reference to
every clause that section cites, owned first. Each reference MUST be a link to
that clause in the standard browser, and MUST, where scripts run, open a sheet
instead, showing the section's requirement: every clause it cites with its
reference, normativity and text in the community's locale; why it matters; what
to define; and what not to define here. "What not to define here" MUST list only
what the standard itself assigns elsewhere — the other authored sections of the
same template, and the owner of each clause this section only references — each
with its question and references. It MUST NOT show text the standard does not
contain. The definition page's requirement column MUST show the same content.

#### Scenario: Opening a reference in a discussion
- **WHEN** a member in the "Voluntary Exit" discussion activates §3.6.2
- **THEN** a sheet opens with §3.6.1, §3.6.2 and §3.6.4, their MUST markers and text, §3.6.2 marked as the one chosen
- **AND** "Why it matters" and "What to define here" come from the standard's Voluntary Exit section
- **AND** "What NOT to define here" lists Forced Exit, Suspension, and Asset, Role, and Responsibility Separation with their references

#### Scenario: On a phone
- **WHEN** a member at 375 pixels wide activates a reference
- **THEN** the requirement opens as a full-width sheet from the bottom, every control at least 44 pixels, and closes with its close control or Escape, returning focus to the reference

#### Scenario: Without scripts
- **WHEN** a member with scripts disabled activates a reference
- **THEN** the standard browser opens at that clause

#### Scenario: A discussion about nothing in the standard
- **WHEN** a member opens a discussion that names no clause, section or definition
- **THEN** the header shows no reference and no sheet is offered

#### Scenario: The same requirement on the definition page
- **WHEN** a member opens the definition for "Voluntary Exit"
- **THEN** its requirement column shows the same clauses, why it matters, what to define and what not to define here as the discussion's sheet
