## ADDED Requirements

### Requirement: A community can read back what it asked the standard for

Every member of a community MUST be able to read the feedback on the standard
that the community has recorded, newest first, each entry showing its words, the
standard and version it concerns, the clause ref where one was named, a link to
the definition or clause it came from, who recorded it and when. The list MUST
contain only the reader's own community's entries, MUST NOT contain an entry
whose definition the reader may not see, and MUST name every person through the
same label as every other surface, so an erased author reads as a former member.

#### Scenario: A member opens the list
- **WHEN** a member opens *Feedback on the standard* in their community's settings
- **THEN** every entry the community recorded is listed, newest first, with its words, who recorded it and when
- **AND** each entry links to the definition it came from

#### Scenario: Nothing has been recorded
- **WHEN** a community has recorded no feedback on the standard
- **THEN** the page says so and says how an entry is recorded

#### Scenario: Another community's feedback
- **WHEN** a member of one community reads the list
- **THEN** no entry recorded by another community appears

#### Scenario: A reader without the read permission
- **WHEN** somebody whose role does not hold `community.read` asks for the list
- **THEN** it is refused and nothing is returned

#### Scenario: The definition is restricted from the reader
- **WHEN** an entry's definition is restricted and the reader may not see restricted content
- **THEN** that entry is not listed

#### Scenario: The author has been erased
- **WHEN** the person who recorded an entry has been erased
- **THEN** the entry is still listed and names them as a former member, never by name

#### Scenario: A narrow phone
- **WHEN** the page is opened at 375 pixels wide
- **THEN** every entry is readable without horizontal scrolling
